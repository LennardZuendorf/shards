/**
 * Seven desktop workflows against the real `shards-host`, end to end, with no fixtures.
 *
 *   node e2e/host-workflow.mjs [--readonly-vault] [--readonly-at <workflow>] [--keep]
 *
 * What it does, in order:
 *   1. seeds a disposable vault with `scripts/demo-vault.sh --empty` (first-run state: identity
 *      and members, no tasks) and adds two projects the move workflow can move between;
 *   2. boots the built `shards-host` against it on a free port;
 *   3. serves the built desktop app with `vite preview` — the same Vite config, so the same
 *      `/api` proxy the dev server uses (it injects `x-shards-token` from the token file);
 *   4. drives six workflows through the UI in user order, each on the same vault:
 *        create    — quick-add a task in the Inbox;
 *        edit      — set a due date and a priority on that task;
 *        move      — move it Inbox → one project, then that project → another;
 *        complete  — complete it, then reopen it, from the detail panel;
 *        search    — reload the app, then find the task through search;
 *        completed — seed four finished tasks across two projects (one backdated to 31 days ago),
 *                    open the Completed log and assert exactly the three inside the window,
 *                    newest first, that every vault sha256 is unchanged by reading it, and that
 *                    Reopen takes one row out of the log and back to `status: open` on disk;
 *        waiting   — seed one task per state across an active and an archived project, open the
 *                    Waiting queue and assert exactly the one needs-input task, that reading it
 *                    wrote nothing, and that answering it leaves the row, the tag and a stamped
 *                    reply in the file.
 *   5. after every workflow runs `shards --vault <vault> task list|search --json` on that same
 *      vault and asserts an **id equality** with the id the DOM reported — never a visible label.
 *
 * Step 5 is the point of every workflow: the UI can look right while the mutation never reached
 * the vault. A fixture can fake the row; it cannot fake the file the CLI reads.
 *
 * `--readonly-vault` takes the write bits off the seeded vault (every file and directory) before
 * the UI drives it, so `shards-host` refuses the first write. That run MUST fail, and it fails at
 * `quick-add a task in the UI` with the host's own error in the log.
 *
 * `--readonly-at <workflow>` runs the workflows up to (not including)
 * `create|edit|move|complete|completed|waiting` writable, then locks the vault down just before that
 * workflow, so that workflow's own CLI assertion has to fail. It is the second negative control:
 * without it, a workflow that fakes its state in the browser could pass with the vault unwritable.
 * `search` writes nothing and cannot be a control.
 *
 * Either control exits 2 if the run somehow still passes — a control that cannot go red is not a
 * control. `--keep` leaves the work directory behind.
 *
 * Env: SHARDS_BIN, SHARDS_HOST_BIN (default target/release/{shards,shards-host}), E2E_WORK_DIR,
 * E2E_SCREENSHOT_DIR. Requires `pnpm -C apps/desktop build` first (it serves apps/desktop/dist).
 */
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";

const execFileP = promisify(execFile);
const e2eDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(e2eDir, "..");
const root = path.resolve(desktopDir, "../..");

/** The workflows, in user order. `search` writes nothing, so it cannot be a control target. */
const WORKFLOWS = ["create", "edit", "move", "complete", "search", "completed", "waiting"];
const WRITING_WORKFLOWS = WORKFLOWS.filter((w) => w !== "search");

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const valueOf = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? null : (argv[i + 1] ?? "");
};
const readonlyVault = flag("readonly-vault");
const readonlyAt = valueOf("readonly-at");
const keep = flag("keep");
if (readonlyVault && readonlyAt) throw new Error("--readonly-vault and --readonly-at are exclusive");
if (readonlyAt !== null && !WRITING_WORKFLOWS.includes(readonlyAt)) {
  throw new Error(`--readonly-at takes one of ${WRITING_WORKFLOWS.join("|")}, not “${readonlyAt}”`);
}
const control = readonlyVault || readonlyAt !== null;
const shardsBin = path.resolve(root, process.env.SHARDS_BIN ?? "target/release/shards");
const hostBin = path.resolve(root, process.env.SHARDS_HOST_BIN ?? "target/release/shards-host");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const freePort = async () => {
  const server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  await new Promise((r) => server.close(r));
  return port;
};

const waitForHttp = async (url, what, timeoutMs = 30_000) => {
  const until = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < until) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (r.ok) return;
      last = `HTTP ${r.status}`;
    } catch (e) {
      last = e.message;
    }
    await sleep(150);
  }
  throw new Error(`${what} did not answer ${url} within ${timeoutMs} ms (${last})`);
};

const tail = (lines, n = 25) => lines.slice(-n).join("\n");

/** Take write permission away from every file and directory under `dir` (and `dir` itself). */
const lockDown = async (dir) => {
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const child = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(child);
        await chmod(child, 0o555);
      } else {
        await chmod(child, 0o444).catch(() => {});
      }
    }
    await chmod(current, 0o555);
  }
};

/** Put the write bits back so the work directory can be removed. */
const release = async (dir) => {
  await chmod(dir, 0o755).catch(() => {});
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of await readdir(current, { withFileTypes: true }).catch(() => [])) {
      const child = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await chmod(child, 0o755).catch(() => {});
        stack.push(child);
      } else {
        await chmod(child, 0o644).catch(() => {});
      }
    }
  }
};

/** `YYYY-MM-DD` for a JS date, in the runner's local zone — the form `due:` is written in. */
const dayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * A phrase the app's date box resolves to exactly `target`: the 1st of the month 40 days out,
 * which the parser's forward-date rule always reads as that same calendar day.
 */
const duePhraseFor = (target) => `${target.toLocaleString("en-US", { month: "short" }).toLowerCase()} 1`;

const main = async () => {
  const started = Date.now();
  for (const [name, bin] of [["shards", shardsBin], ["shards-host", hostBin]]) {
    if (!existsSync(bin)) throw new Error(`${name} binary missing at ${bin} — build it first: cargo build --release -p shards -p shards-host`);
  }
  if (!existsSync(path.join(desktopDir, "dist/index.html"))) {
    throw new Error(`apps/desktop/dist/index.html is missing — build the app first: pnpm -C apps/desktop build`);
  }

  const workDir = process.env.E2E_WORK_DIR
    ? path.resolve(process.env.E2E_WORK_DIR)
    : await mkdtemp(path.join(os.tmpdir(), "shards-e2e-"));
  if (process.env.E2E_WORK_DIR) {
    await rm(workDir, { recursive: true, force: true });
    await mkdir(workDir, { recursive: true });
  }
  const screenshotDir = path.resolve(process.env.E2E_SCREENSHOT_DIR ?? path.join(workDir, "screenshots"));
  await mkdir(screenshotDir, { recursive: true });
  const hostLog = [];
  const appLog = [];
  const failedResponses = [];
  const probes = [];
  const calls = [];
  const rows = [];
  let host = null;
  let app = null;
  let browser = null;
  let page = null;
  let currentStep = "setup";
  let done = false;
  let vaultLocked = false;
  let reloaded = false;

  const vaultDir = path.join(workDir, "demo");
  const vaultPath = path.join(vaultDir, "vault");
  const configPath = path.join(vaultDir, "config.toml");
  const tokenFile = path.join(workDir, "host.token");
  const cliEnv = { ...process.env, SHARDS_CONFIG_PATH: configPath, SHARDS_VAULT: vaultPath };

  const screenshot = async (name) => {
    if (!page) return;
    const file = path.join(screenshotDir, `${name}.png`);
    try {
      await page.screenshot({ path: file, fullPage: true });
      console.log(`screenshot: ${file}`);
    } catch {
      /* the page may already be gone */
    }
  };

  const step = async (name, fn) => {
    currentStep = name;
    const t0 = Date.now();
    const value = await fn();
    console.log(`ok    ${name} (${Date.now() - t0} ms)`);
    return value;
  };

  /* ------------------------------------------------------------ the CLI side */

  const cli = async (...args) => {
    const { stdout } = await execFileP(shardsBin, ["--vault", vaultPath, ...args], { env: cliEnv, cwd: workDir });
    return stdout;
  };

  const cliTasks = async (extra = []) => {
    const stdout = await cli("task", "list", "--json", "--all", ...extra);
    const payload = JSON.parse(stdout);
    if (!Array.isArray(payload.tasks)) throw new Error(`task list --json did not answer {tasks: []}: ${stdout.slice(0, 400)}`);
    return payload.tasks;
  };

  const cliTask = async (id) => {
    const matches = (await cliTasks()).filter((t) => t.id === id);
    if (matches.length !== 1) throw new Error(`the vault holds ${matches.length} tasks with id ${id}, not one`);
    return matches[0];
  };

  /**
   * Poll `fn` until it stops throwing. A refused write never lands, so the last mismatch is the
   * error the run reports — with the value the vault actually holds.
   */
  const poll = async (what, fn, timeoutMs = 15_000) => {
    const until = Date.now() + timeoutMs;
    for (;;) {
      try {
        return await fn();
      } catch (e) {
        if (Date.now() > until) throw new Error(`${what}: ${e.message}`);
        await sleep(200);
      }
    }
  };

  /** The one Markdown file under the vault that names `id`, and its text. */
  const vaultFile = async (id) => {
    const files = (await readdir(vaultPath, { recursive: true })).map(String).filter((f) => f.split(path.sep).some((s) => s.includes(id)));
    if (files.length !== 1) throw new Error(`the vault has ${files.length} files naming ${id}, not one: ${files.join(", ") || "none"}`);
    const file = path.join(vaultPath, files[0]);
    return { file, text: await readFile(file, "utf8") };
  };

  /** A frontmatter field's raw value (`null` when the line is absent). */
  const front = (text, key) => {
    const m = text.match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"));
    return m ? m[1].trim() : null;
  };

  /* ------------------------------------------------------------- the UI side */

  const rowOf = (id) => page.locator(`[data-task-row="${id}"]`).first();

  /** Open the row's `⋯` menu and pick a project (optionally filtering the picker first). */
  const moveToProject = async (id, projectId, title) => {
    const row = rowOf(id);
    await row.hover();
    await row.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Move to…" }).hover();
    const picker = page.getByPlaceholder("Move to project…");
    await picker.waitFor({ timeout: 10_000 });
    await picker.fill(title);
    await page.getByRole("option", { name: new RegExp(`^${title}`) }).click();
    // A closing menu portal lingers a frame and can sit over the list; wait it out so the next
    // click is not intercepted by it.
    await page.waitForFunction(() => !document.querySelector("[data-radix-popper-content-wrapper]"), null, { timeout: 5_000 }).catch(() => {});
    return projectId;
  };

  /** Lock the vault just before a workflow, for `--readonly-at <workflow>`. */
  const beforeWorkflow = async (name) => {
    if (readonlyAt !== name) return;
    await step(`make the vault read-only before ${name}`, async () => {
      await lockDown(vaultPath);
      vaultLocked = true;
      console.log(`vault ${vaultPath} is now read-only — “${name}” must fail at the vault, not the UI`);
    });
  };

  try {
    let alphaId = "";
    let betaId = "";
    await step("seed a disposable vault", async () => {
      const env = { ...process.env, SHARDS_BIN: shardsBin };
      for (const key of Object.keys(env)) if (key.startsWith("SHARDS_") && key !== "SHARDS_BIN") delete env[key];
      const { stdout, stderr } = await execFileP(path.join(root, "scripts/demo-vault.sh"), ["--empty", vaultDir], { env, cwd: root });
      if (stdout.trim()) console.log(stdout.trim());
      if (stderr.trim()) console.log(stderr.trim());
    });

    const hostPort = await freePort();
    const hostUrl = `http://127.0.0.1:${hostPort}`;

    await step("boot shards-host on that vault", async () => {
      host = spawn(hostBin, ["--config", configPath, "--port", String(hostPort)], {
        env: { ...process.env, SHARDS_HOST_TOKEN_FILE: tokenFile },
        stdio: ["ignore", "pipe", "pipe"],
      });
      const collect = (chunk) => {
        for (const line of String(chunk).split("\n")) if (line.trim()) hostLog.push(line);
      };
      host.stdout.on("data", collect);
      host.stderr.on("data", collect);
      host.on("exit", (code) => hostLog.push(`[host exited with ${code}]`));
      await waitForHttp(`${hostUrl}/api/health`, "shards-host");
    });

    await step("add two projects for the move workflow", async () => {
      // Setup data, written by the CLI before the UI exists: the harness seeds a vault, it never
      // stubs one. The project notes are real files the app and the CLI both read.
      alphaId = (await cli("note", "new", "E2E Alpha", "--type", "project", "--body", "A project the move workflow can file a task under.", "--quiet")).trim();
      betaId = (await cli("note", "new", "E2E Beta", "--type", "project", "--body", "A second project, so the task can move between two.", "--quiet")).trim();
      for (const [name, id] of [["E2E Alpha", alphaId], ["E2E Beta", betaId]]) {
        if (!/^n-[0-9A-Z]{4,}$/.test(id)) throw new Error(`the project “${name}” got no note id: ${JSON.stringify(id)}`);
      }
      console.log(`projects: E2E Alpha ${alphaId}, E2E Beta ${betaId}`);
    });

    if (readonlyVault) {
      await step("make the vault read-only", async () => {
        // Every directory and file: the host creates its space folders at boot, so locking only
        // the vault root would leave `tasks/open/` writable and the control would pass.
        await lockDown(vaultPath);
        vaultLocked = true;
        console.log(`vault ${vaultPath} is now read-only — the host must refuse every write`);
      });
    }

    const appPort = await freePort();
    const appUrl = `http://127.0.0.1:${appPort}`;

    await step("serve the built desktop through vite preview", async () => {
      app = spawn(process.execPath, [path.join(desktopDir, "node_modules/vite/bin/vite.js"), "preview", "--host", "127.0.0.1", "--port", String(appPort), "--strictPort"], {
        cwd: desktopDir,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, SHARDS_HOST_URL: hostUrl, SHARDS_HOST_TOKEN_FILE: tokenFile },
      });
      const collect = (chunk) => {
        for (const line of String(chunk).split("\n")) if (line.trim()) appLog.push(line);
      };
      app.stdout.on("data", collect);
      app.stderr.on("data", collect);
      await waitForHttp(appUrl, "vite preview");
    });

    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const consoleErrors = [];
    page.on("pageerror", (e) => consoleErrors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("response", async (r) => {
      const url = new URL(r.url());
      const entry = { method: r.request().method(), path: url.pathname, status: r.status(), afterReload: reloaded, body: null };
      if (entry.path.includes("shards_search")) entry.body = await r.text().catch(() => "");
      calls.push(entry);
      if (r.status() < 400) return;
      const body = entry.body ?? (await r.text().catch(() => ""));
      const sent = r.request().postData()?.slice(0, 300) ?? "";
      // `hostProjectUpdateSupported` probes the tool with no arguments on purpose: the host's
      // rejection is its way of saying "yes, I have it". A refused call with a real payload is
      // what deserves a line here.
      if (entry.path.endsWith("/host_project_update") && sent === "{}") {
        probes.push(`${r.status()} ${entry.path}`);
        return;
      }
      failedResponses.push(`${r.status()} ${entry.method} ${entry.path} ${String(body).slice(0, 200)}${sent ? ` ← ${sent}` : ""}`);
    });

    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    const title = `E2E real host ${stamp}`;
    const needle = `real host ${stamp}`;

    /* ------------------------------------------------------------ 1. create */

    await beforeWorkflow("create");

    await step("open the Inbox against the real host", async () => {
      await page.goto(`${appUrl}/#/inbox`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Inbox" }).waitFor({ timeout: 20_000 });
      // Quick add is bound to `q` on the document, ignored while a field has focus.
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    });

    const dialog = page.getByRole("dialog", { name: "Quick add task" });

    await step("quick-add a task in the UI", async () => {
      await page.keyboard.press("q");
      await dialog.waitFor({ timeout: 10_000 });
      await dialog.getByRole("combobox", { name: "Task name" }).fill(title);
      await dialog.getByRole("button", { name: "Add task" }).click();
      // The dialog closes only after shards_task_new came back from the host; a refused
      // mutation leaves it open with the host's error toast.
      await dialog.waitFor({ state: "detached", timeout: 12_000 }).catch(async () => {
        const toasts = (await page.locator("[data-sonner-toast]").allTextContents().catch(() => [])).filter(Boolean);
        throw new Error(`the quick add dialog stayed open after “Add task” — the host refused the write${toasts.length ? `: ${toasts.join(" | ")}` : ""}`);
      });
    });

    const uiId = await step("the task appears in the Inbox", async () => {
      const row = page.locator("[data-task-row]").filter({ hasText: title });
      await row.first().waitFor({ timeout: 20_000 });
      const id = await row.first().getAttribute("data-task-row");
      if (!id) throw new Error("the new task row carries no data-task-row id");
      if (!/^t-[0-9A-Z]{4,}$/.test(id)) throw new Error(`the new task id ${id} is not a task id`);
      await screenshot("inbox-after-quick-add");
      return id;
    });

    const cliId = await step("the CLI confirms the same task in the vault", async () => {
      const created = await poll("quick-add a task in the UI", async () => {
        const t = await cliTask(uiId);
        if (t.title !== title) throw new Error(`the vault's ${uiId} is “${t.title}”, not “${title}”`);
        return t;
      });
      const { file } = await vaultFile(uiId);
      console.log(`vault file: ${file}`);
      return created.id;
    });

    await step("the two surfaces name the same id", async () => {
      if (uiId !== cliId) throw new Error(`UI says ${uiId}, CLI says ${cliId}`);
      console.log(`confirmed: ${uiId} “${title}” — UI and CLI agree`);
    });
    rows.push({ workflow: "create", uiId, cliId, detail: "task created" });

    /* -------------------------------------------------------------- 2. edit */

    await beforeWorkflow("edit");

    const dueTarget = new Date();
    dueTarget.setDate(dueTarget.getDate() + 40);
    const dueExpected = dayKey(new Date(dueTarget.getFullYear(), dueTarget.getMonth(), 1));
    const duePhrase = duePhraseFor(dueTarget);

    await step("set a due date from the row's date popover", async () => {
      const row = rowOf(uiId);
      await row.hover();
      await row.getByRole("button", { name: "Set due date" }).click();
      const field = page.getByPlaceholder(/Type a date/);
      await field.waitFor({ timeout: 10_000 });
      await field.fill(duePhrase);
      await field.press("Enter");
      await screenshot("edit-due-picked");
    });

    await step("set the priority from the row's priority menu", async () => {
      const row = rowOf(uiId);
      await row.hover();
      await row.getByRole("button", { name: "Priority" }).click();
      await page.getByRole("menu").getByRole("menuitem", { name: /High/ }).click();
    });

    const edited = await step("the CLI shows the new due date and priority", async () => {
      const t = await poll("edit the due date and priority", async () => {
        const got = await cliTask(uiId);
        if (got.due !== dueExpected) throw new Error(`the vault has due ${got.due ?? "null"} for ${uiId}, the UI picked ${dueExpected} (from “${duePhrase}”)`);
        if (got.priority !== "high") throw new Error(`the vault has priority ${got.priority ?? "null"} for ${uiId}, the UI picked high`);
        return got;
      });
      const { file, text } = await vaultFile(uiId);
      if (front(text, "due") !== dueExpected) throw new Error(`${file} does not carry “due: ${dueExpected}” (has ${front(text, "due") ?? "nothing"})`);
      if (front(text, "priority") !== "high") throw new Error(`${file} does not carry “priority: high” (has ${front(text, "priority") ?? "nothing"})`);
      console.log(`vault: ${file} — due: ${dueExpected}, priority: high`);
      return t;
    });
    if (edited.id !== uiId) throw new Error(`edit: CLI says ${edited.id}, the UI row says ${uiId}`);
    rows.push({ workflow: "edit", uiId, cliId: edited.id, detail: `due ${dueExpected}, priority high` });

    /* -------------------------------------------------------------- 3. move */

    await beforeWorkflow("move");

    await step("move the task into E2E Alpha from the row menu", async () => {
      await moveToProject(uiId, alphaId, "E2E Alpha");
    });

    await step("the vault files the task under E2E Alpha", async () => {
      const t = await poll("move the task to the first project", async () => {
        const got = await cliTask(uiId);
        if (got.project !== alphaId) throw new Error(`the vault has project ${got.project ?? "null"} for ${uiId}, wanted ${alphaId}`);
        return got;
      });
      const { file, text } = await vaultFile(uiId);
      if (front(text, "project") !== alphaId) throw new Error(`${file} does not carry “project: ${alphaId}” (has ${front(text, "project") ?? "nothing"})`);
      const scoped = (await cliTasks(["--project", alphaId])).map((x) => x.id);
      if (!scoped.includes(uiId)) throw new Error(`task list --project ${alphaId} lists ${scoped.join(", ") || "nothing"}, not ${uiId}`);
      const projectFile = (await readdir(vaultPath, { recursive: true })).map(String).find((f) => f.includes(alphaId));
      if (!projectFile) throw new Error(`no project file under ${vaultPath} names ${alphaId}`);
      console.log(`vault: ${file} — project: ${alphaId} (${projectFile})`);
      return t;
    });

    await step("move the task from E2E Alpha to E2E Beta in its project view", async () => {
      await page.goto(`${appUrl}/#/project/${alphaId}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: /E2E Alpha/ }).waitFor({ timeout: 20_000 });
      await rowOf(uiId).waitFor({ timeout: 20_000 });
      await moveToProject(uiId, betaId, "E2E Beta");
    });

    const moved = await step("the vault carries the task in E2E Beta, not E2E Alpha", async () => {
      const t = await poll("move the task to the second project", async () => {
        const got = await cliTask(uiId);
        if (got.project !== betaId) throw new Error(`the vault has project ${got.project ?? "null"} for ${uiId}, wanted ${betaId}`);
        return got;
      });
      const { file, text } = await vaultFile(uiId);
      if (front(text, "project") !== betaId) throw new Error(`${file} does not carry “project: ${betaId}” (has ${front(text, "project") ?? "nothing"})`);
      const inBeta = (await cliTasks(["--project", betaId])).map((x) => x.id);
      if (!inBeta.includes(uiId)) throw new Error(`task list --project ${betaId} lists ${inBeta.join(", ") || "nothing"}, not ${uiId}`);
      const inAlpha = (await cliTasks(["--project", alphaId])).map((x) => x.id);
      if (inAlpha.includes(uiId)) throw new Error(`task list --project ${alphaId} still lists ${uiId}`);
      console.log(`vault: ${file} — project: ${betaId}; E2E Alpha no longer lists it`);
      return t;
    });
    if (moved.id !== uiId) throw new Error(`move: CLI says ${moved.id}, the UI row says ${uiId}`);
    rows.push({ workflow: "move", uiId, cliId: moved.id, detail: `project ${alphaId} → ${betaId}` });

    /* ---------------------------------------------------------- 4. complete */

    await beforeWorkflow("complete");

    await step("open the task's details in its project", async () => {
      await page.goto(`${appUrl}/#/project/${betaId}`, { waitUntil: "domcontentloaded" });
      await rowOf(uiId).waitFor({ timeout: 20_000 });
      // Space on a focused row is the list's own open shortcut (a click does the same); the
      // keyboard path survives a closing menu portal that can still cover the row.
      await rowOf(uiId).focus();
      await page.keyboard.press(" ");
      await page.locator("[data-task-detail]").waitFor({ timeout: 10_000 });
    });

    await step("complete the task from the detail panel", async () => {
      const panel = page.locator("[data-task-detail]");
      await panel.getByRole("checkbox", { name: "Complete task" }).click();
      await panel.getByRole("button", { name: "Reopen" }).waitFor({ timeout: 15_000 });
      await screenshot("completed");
    });

    await step("the vault says status: done", async () => {
      await poll("complete the task", async () => {
        const got = await cliTask(uiId);
        if (got.status !== "done") throw new Error(`the vault has status ${got.status} for ${uiId}, not done`);
        return got;
      });
      const { file, text } = await vaultFile(uiId);
      if (front(text, "status") !== "done") throw new Error(`${file} does not carry “status: done” (has ${front(text, "status") ?? "nothing"})`);
      console.log(`vault: ${file} — status: done`);
    });

    await step("reopen the task from the detail panel", async () => {
      const panel = page.locator("[data-task-detail]");
      await panel.getByRole("button", { name: "Reopen" }).click();
      await panel.getByRole("checkbox", { name: "Complete task" }).waitFor({ timeout: 15_000 });
    });

    const reopened = await step("the vault says status: open again", async () => {
      const t = await poll("reopen the task", async () => {
        const got = await cliTask(uiId);
        if (got.status !== "open") throw new Error(`the vault has status ${got.status} for ${uiId}, not open`);
        return got;
      });
      const { file, text } = await vaultFile(uiId);
      if (front(text, "status") !== "open") throw new Error(`${file} does not carry “status: open” (has ${front(text, "status") ?? "nothing"})`);
      console.log(`vault: ${file} — status: open`);
      return t;
    });
    if (reopened.id !== uiId) throw new Error(`complete: CLI says ${reopened.id}, the UI row says ${uiId}`);
    rows.push({ workflow: "complete", uiId, cliId: reopened.id, detail: "done → open, read from the frontmatter" });

    /* ------------------------------------------------------------ 5. search */

    await step("reload the app, discarding every in-memory state", async () => {
      await page.evaluate(() => {
        window.__SHARDS_E2E_MARKER = "before-reload";
      });
      await page.reload({ waitUntil: "domcontentloaded" });
      const survives = await page.evaluate(() => window.__SHARDS_E2E_MARKER ?? null);
      if (survives) throw new Error("the page did not actually reload — search below could read an in-memory task");
      reloaded = true;
      const beforeReload = calls.filter((c) => c.afterReload === false).length;
      console.log(`reloaded: a fresh document answered as fresh (requests before the reload: ${beforeReload})`);
    });

    await step("search for the task after the reload", async () => {
      await page.goto(`${appUrl}/#/search?q=${encodeURIComponent(needle)}`, { waitUntil: "domcontentloaded" });
      const field = page.getByRole("textbox", { name: "Search" });
      await field.waitFor({ timeout: 20_000 });
      await field.fill(needle);
      await rowOf(uiId).waitFor({ timeout: 20_000 });
      // The DOM is the UI-side source of truth in every workflow: the id comes off the row.
      const id = await rowOf(uiId).getAttribute("data-task-row");
      if (id !== uiId) throw new Error(`the search result row carries ${id}, not ${uiId}`);
      // The row also renders from the client-side pool, which lands before the ranked query
      // returns — wait for the host's own answer rather than racing it.
      await poll(
        "search after the reload",
        async () => {
          const hit = calls.find((c) => c.afterReload && c.path.includes("shards_search") && c.status === 200 && String(c.body).includes(uiId));
          if (!hit) throw new Error(`no /api/call/shards_search has answered “${needle}” with ${uiId} yet`);
          return hit;
        },
        20_000,
      );
      await screenshot("search-after-reload");
    });

    const found = await step("the CLI finds the same id for the same query", async () => {
      const stdout = await cli("search", needle, "--json");
      const hits = JSON.parse(stdout);
      if (!Array.isArray(hits)) throw new Error(`search --json did not answer an array: ${stdout.slice(0, 400)}`);
      const ids = hits.map((h) => h.id).filter(Boolean);
      if (!ids.includes(uiId)) throw new Error(`shards search “${needle}” returned ${ids.join(", ") || "nothing"}, not ${uiId}`);
      return { id: uiId, hits: ids.length };
    });
    rows.push({ workflow: "search", uiId, cliId: found.id, detail: `“${needle}” → ${found.id} after a reload` });

    /* ------------------------------------------------------ 6. completed log (R34) */

    await beforeWorkflow("completed");

    const log = await step("seed two projects and four finished tasks for the Completed log", async () => {
      const newProject = async (name) =>
        (await cli("--quiet", "note", "new", name, "--type", "project", "--body", `${name} project.`)).trim();
      const home = await newProject("E2E Home");
      const launch = await newProject("E2E Launch");
      /** Create and finish a task; the gap keeps `completed` distinct to the second, so “newest
       *  first” is an assertion rather than a coin toss. */
      const finished = async (name, projectId, who) => {
        const id = (await cli("--quiet", "task", "new", name, "--project", projectId)).trim();
        await cli(...(who ? ["--owner", who] : []), "--quiet", "task", "finish", id);
        await sleep(1_100);
        return id;
      };
      // Finished oldest first, so newest-first is a, b, c.
      const old = await finished("Filed the taxes", home, "maya");
      const c = await finished("Book flights", home, null);
      const b = await finished("Write changelog", launch, "maya");
      const a = await finished("Pay invoice", home, "claude-code");

      // Backdate the fourth one out of the window: no CLI verb stamps a past `completed`, so the
      // file the CLI produced is edited in those two fields only and stays a valid format-A task.
      const { file, text } = await vaultFile(old);
      const at = new Date(Date.now() - 31 * 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z");
      const backdated = text.replace(/^completed: .*$/m, `completed: ${at}`).replace(/^updated: .*$/m, `updated: ${at}`);
      if (backdated === text) throw new Error(`no completed:/updated: line to backdate in ${file}`);
      await writeFile(file, backdated);
      console.log(`seeded ${a}, ${b}, ${c} inside the window; ${old} completed ${at} (outside)`);
      return { a, b, c, old };
    });

    /** sha256 of every file in the vault, keyed by its relative path. */
    const vaultSnapshot = async () => {
      const out = new Map();
      for (const rel of (await readdir(vaultPath, { recursive: true })).map(String).sort()) {
        const bytes = await readFile(path.join(vaultPath, rel)).catch(() => null);
        if (bytes) out.set(rel, createHash("sha256").update(bytes).digest("hex"));
      }
      return out;
    };

    const beforeLog = await step("snapshot every vault file before opening the log", vaultSnapshot);

    await step("open #/completed: the three inside the window, newest first, the fourth absent", async () => {
      await page.goto(`${appUrl}/#/completed`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Completed" }).waitFor({ timeout: 20_000 });
      await rowOf(log.a).waitFor({ timeout: 20_000 });
      const ids = await page.locator("[data-task-row]").evaluateAll((all) => all.map((r) => r.getAttribute("data-task-row")));
      const want = [log.a, log.b, log.c];
      if (JSON.stringify(ids) !== JSON.stringify(want)) {
        throw new Error(`the log lists ${JSON.stringify(ids)}, expected ${JSON.stringify(want)} newest first`);
      }
      if (ids.includes(log.old)) throw new Error(`the 31-day-old task ${log.old} is in the log`);
      console.log(`log: ${ids.join(", ")} — the 31-day-old ${log.old} is absent`);
      await screenshot("completed-log");
    });

    await step("opening the log wrote nothing to the vault", async () => {
      const afterLog = await vaultSnapshot();
      const changed = [];
      for (const [rel, hash] of beforeLog) if (afterLog.get(rel) !== hash) changed.push(`${rel} (changed or removed)`);
      for (const rel of afterLog.keys()) if (!beforeLog.has(rel)) changed.push(`${rel} (added)`);
      if (changed.length) throw new Error(`the vault changed while the log was open: ${changed.join(", ")}`);
      console.log(`read-only: ${afterLog.size} files, identical sha256 before and after`);
    });

    const fromLog = await step("reopen a row from the log: it leaves, and the file says open", async () => {
      await rowOf(log.c).getByRole("checkbox", { name: `Reopen “Book flights”` }).click();
      // The UI updates optimistically, so the row leaving is not proof; the vault is.
      await page.waitForFunction((id) => !document.querySelector(`[data-task-row="${id}"]`), log.c, { timeout: 15_000 });
      const reopenedTask = await poll("reopen from the log", async () => {
        const got = await cliTask(log.c);
        if (got.status !== "open") throw new Error(`the vault has status ${got.status} for ${log.c}, not open`);
        return got;
      });
      const { file, text } = await vaultFile(log.c);
      if (front(text, "status") !== "open") throw new Error(`${file} does not carry “status: open” (has ${front(text, "status") ?? "nothing"})`);
      if (front(text, "completed") !== null) throw new Error(`${file} still carries completed: ${front(text, "completed")}`);
      await screenshot("completed-after-reopen");
      console.log(`reopened ${log.c}: gone from the log, open in the CLI, no completed: in ${file}`);
      return reopenedTask;
    });
    rows.push({
      workflow: "completed",
      uiId: log.c,
      cliId: fromLog.id,
      detail: `${log.a} ${log.b} ${log.c} newest first, ${log.old} absent; reopen → open`,
    });

    /* --------------------------------------------------- 7. waiting on me (R39) */

    await beforeWorkflow("waiting");

    const queue = await step("seed an active and an archived project with one task per wait state", async () => {
      const newProject = async (name) =>
        (await cli("--quiet", "note", "new", name, "--type", "project", "--body", `${name} project.`)).trim();
      const triage = await newProject("E2E Triage");
      // The archived project is created normally; it is archived below, the way `host_project_update`
      // would, because no CLI verb writes `archived` (see the frontmatter edit and its CLI check).
      const shelved = await newProject("E2E Shelved");
      const title = "Publish the pricing page";
      const question = "Which vault should the demo link to?";
      const reply = "The public one — staging first, then prod once it is green.";

      // One task per state the queue has to judge: open, claimed, needs-input, done.
      const open = (await cli("--quiet", "task", "new", "Refill the toner", "--project", triage)).trim();
      const claimed = (await cli("--owner", "claude-code", "--quiet", "task", "new", "Draft the release note", "--project", triage)).trim();
      await cli("--owner", "claude-code", "--quiet", "task", "claim", claimed);
      const ask = (await cli("--owner", "claude-code", "--quiet", "task", "new", title, "--project", triage)).trim();
      await cli("--owner", "claude-code", "--quiet", "task", "claim", ask);
      // Stamped as the agent, not the operator: `waitStart` skips the operator's own stamps, so a
      // question written as “lennard” would leave the row without a message.
      await cli("--owner", "claude-code", "task", "append", ask, question, "--section", "Comments", "--timestamp");
      await cli("task", "update", ask, "--tags", "+needs-input");
      const done = (await cli("--quiet", "task", "new", "File the Q3 receipts", "--project", triage)).trim();
      await cli("--quiet", "task", "finish", done);

      // The same wait inside an archived project: it exists, it is open, and it must never show.
      const archived = (await cli("--owner", "claude-code", "--quiet", "task", "new", "Renew the domain", "--project", shelved)).trim();
      await cli("--owner", "claude-code", "--quiet", "task", "claim", archived);
      await cli("--owner", "claude-code", "task", "append", archived, "Renew it or let it lapse?", "--section", "Comments", "--timestamp");
      await cli("task", "update", archived, "--tags", "+needs-input");

      for (const [what, id, re] of [
        ["project", triage, /^n-[0-9A-Z]{4,}$/],
        ["archived project", shelved, /^n-[0-9A-Z]{4,}$/],
        ["task", open, /^t-[0-9A-Z]{4,}$/],
        ["claimed task", claimed, /^t-[0-9A-Z]{4,}$/],
        ["needs-input task", ask, /^t-[0-9A-Z]{4,}$/],
        ["done task", done, /^t-[0-9A-Z]{4,}$/],
        ["archived-project task", archived, /^t-[0-9A-Z]{4,}$/],
      ]) {
        if (!re.test(id)) throw new Error(`the ${what} got no id: ${JSON.stringify(id)}`);
      }

      // `archived` is written only by `host_project_update`, and the archive must be real: the
      // project note the CLI made is edited in its frontmatter alone, every other line untouched.
      const { file, text } = await vaultFile(shelved);
      const lines = text.split("\n");
      if (lines[0] !== "---") throw new Error(`${file} has no frontmatter to archive`);
      const close = lines.indexOf("---", 1);
      if (close === -1) throw new Error(`${file} has no closing frontmatter fence`);
      if (lines.some((l) => /^archived:/.test(l))) throw new Error(`${file} already carries an archived: line`);
      lines.splice(close, 0, "archived: true");
      await writeFile(file, lines.join("\n"));

      const notes = JSON.parse(await cli("note", "list", "--type", "project", "--json", "--limit", "500"));
      if (!Array.isArray(notes)) throw new Error(`note list --json did not answer an array: ${JSON.stringify(notes).slice(0, 300)}`);
      const noted = notes.find((n) => n.id === shelved);
      if (!noted) throw new Error(`note list --json does not list ${shelved}`);
      if (noted.archived !== true) {
        throw new Error(`note list --json reports archived ${JSON.stringify(noted.archived)} for ${shelved} — the archive edit did not take`);
      }
      console.log(`seeded ${ask} (needs-input) of ${triage}; ${archived} waits inside ${shelved}, archived: ${noted.archived}`);
      return { triage, shelved, open, claimed, ask, done, archived, title, question, reply };
    });

    const beforeQueue = await step("snapshot every vault file before opening the waiting queue", vaultSnapshot);

    await step("open #/waiting: exactly the one needs-input task of the active project", async () => {
      await page.goto(`${appUrl}/#/waiting`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Waiting on me" }).waitFor({ timeout: 20_000 });
      // The archived-leak test: the open, claimed, done and archived-project tasks are all absent.
      // The negative control for the archive filter lives in apps/desktop/src/lib/status.test.ts:
      // “never lists a task inside an archived project, and does without the filter”.
      await poll(
        "open the waiting queue",
        async () => {
          const ids = await page.locator("[data-task-row]").evaluateAll((all) => all.map((r) => r.getAttribute("data-task-row")));
          if (JSON.stringify(ids) !== JSON.stringify([queue.ask])) {
            throw new Error(
              `the queue lists ${JSON.stringify(ids)}, expected exactly [${queue.ask}]: ` +
                `${queue.open} (open), ${queue.claimed} (claimed), ${queue.done} (done) and ${queue.archived} (archived project) must all be absent`,
            );
          }
          return ids;
        },
        20_000,
      );
      await screenshot("waiting-queue");
    });

    await step("the row names the agent, the question it asked and how long it waited", async () => {
      const text = await rowOf(queue.ask).innerText();
      if (!text.includes(queue.title)) throw new Error(`the waiting row does not name “${queue.title}”: ${text}`);
      if (!text.includes(queue.question)) throw new Error(`the waiting row does not carry the question “${queue.question}”: ${text}`);
      if (!text.includes("Claude Code")) throw new Error(`the waiting row does not name the agent that asked (Claude Code): ${text}`);
      if (!/waiting (just now|\d+[mhd] ago)/.test(text)) throw new Error(`the waiting row carries no wait age: ${text}`);
      // The archived project's question is nowhere on the page, not merely absent from the rows.
      const body = await page.locator("body").innerText();
      if (body.includes("Renew it or let it lapse?")) throw new Error("the archived project's question reached the page");
    });

    await step("opening the queue wrote nothing to the vault", async () => {
      const afterQueue = await vaultSnapshot();
      const changed = [];
      for (const [rel, hash] of beforeQueue) if (afterQueue.get(rel) !== hash) changed.push(`${rel} (changed or removed)`);
      for (const rel of afterQueue.keys()) if (!beforeQueue.has(rel)) changed.push(`${rel} (added)`);
      if (changed.length) throw new Error(`the vault changed while the queue was open: ${changed.join(", ")}`);
      console.log(`read-only: ${afterQueue.size} files, identical sha256 before and after`);
    });

    const answered = await step("answer from the queue: the row leaves and the file carries the reply", async () => {
      await page.getByRole("textbox", { name: `Answer ${queue.title}` }).fill(queue.reply);
      await page.getByRole("button", { name: "Answer & resume" }).click();
      // The UI drops the row optimistically, so the row leaving is not proof; the CLI and the
      // file are.
      await page.waitForFunction((id) => !document.querySelector(`[data-task-row="${id}"]`), queue.ask, { timeout: 15_000 });
      const got = await poll("answer from the waiting queue", async () => {
        const t = JSON.parse(await cli("task", "get", queue.ask, "--json"));
        if (t.tags.includes("needs-input")) throw new Error(`the vault still tags ${queue.ask} needs-input: ${JSON.stringify(t.tags)}`);
        if (!String(t.body ?? "").includes(queue.reply)) throw new Error(`the vault's ${queue.ask} body does not carry the reply yet: ${JSON.stringify(t.body)}`);
        return t;
      });

      const { file, text } = await vaultFile(queue.ask);
      const fm = text.slice(0, text.indexOf("\n---", 4));
      if (fm.includes("needs-input")) throw new Error(`${file} still tags needs-input in its frontmatter:\n${fm}`);
      const stamps = [...text.matchAll(/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ) — (\S+)\n(.*)$/gm)].map((m) => ({ at: m[1], actor: m[2], line: m[3].trim() }));
      const asked = stamps.find((s) => s.line === queue.question);
      if (!asked) throw new Error(`no stamp in ${file} carries the question “${queue.question}”: ${JSON.stringify(stamps)}`);
      const reply = stamps.find((s) => s.line === queue.reply);
      if (!reply) throw new Error(`no stamp in ${file} carries the reply “${queue.reply}”`);
      if (reply.actor === asked.actor) throw new Error(`${file} stamps the operator's reply as ${reply.actor}, the agent that asked`);
      if (reply.actor !== got.updated_by) throw new Error(`${file} stamps the reply as ${reply.actor}, the vault records updated_by ${got.updated_by}`);
      await screenshot("waiting-after-answer");
      console.log(`answered ${queue.ask}: gone from the queue, no needs-input tag, ${file} stamps “${reply.actor}” at ${reply.at}`);
      return got;
    });
    if (answered.id !== queue.ask) throw new Error(`waiting: CLI says ${answered.id}, the UI row says ${queue.ask}`);
    rows.push({
      workflow: "waiting",
      uiId: queue.ask,
      cliId: answered.id,
      detail: `queue listed only ${queue.ask}; answered, tag cleared, stamped in the file`,
    });

    /* ------------------------------------------------------------ the tally */

    await step("all seven workflows ran, each confirmed by an id equality", async () => {
      if (rows.length !== WORKFLOWS.length) throw new Error(`${rows.length}/${WORKFLOWS.length} workflows ran — one was skipped, so the job proves less than it claims`);
      for (const r of rows) {
        if (r.uiId !== r.cliId) throw new Error(`${r.workflow}: UI says ${r.uiId}, CLI says ${r.cliId}`);
      }
      console.log("\nworkflow  ui id      cli id     evidence");
      for (const r of rows) console.log(`${r.workflow.padEnd(9)} ${r.uiId}  ${r.cliId}  ${r.detail}`);
    });

    if (probes.length) console.log(`capability probe answered as designed: ${probes.join(", ")}`);
    if (failedResponses.length) console.log(`refused calls seen (not fatal): ${failedResponses.join(" | ")}`);
    if (consoleErrors.length) console.log(`page errors seen (not fatal): ${consoleErrors.join(" | ")}`);
    done = true;
  } finally {
    if (!done) {
      console.error(`FAILED STEP: ${currentStep}`);
      if (failedResponses.length) console.error(`--- refused calls ---\n${failedResponses.join("\n")}`);
      if (hostLog.length) console.error(`--- shards-host ---\n${tail(hostLog)}`);
      if (appLog.length) console.error(`--- vite preview ---\n${tail(appLog, 10)}`);
      await screenshot(`failure-${currentStep.replace(/[^a-z0-9]+/gi, "-").slice(0, 60)}`);
      await writeFile(path.join(workDir, "host.log"), `${hostLog.join("\n")}\n`).catch(() => {});
      await writeFile(path.join(workDir, "app.log"), `${appLog.join("\n")}\n`).catch(() => {});
    }
    if (browser) await browser.close().catch(() => {});
    if (app) {
      app.kill("SIGTERM");
      await sleep(200);
    }
    if (host) {
      host.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          host.kill("SIGKILL");
          resolve();
        }, 3_000);
        host.on("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    if (vaultLocked) await release(vaultPath).catch(() => {});
    if (keep) console.log(`work directory kept at ${workDir}`);
    else await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }

  console.log(`\nreal-host desktop workflows passed in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  if (control) {
    console.log(`WARNING: ${readonlyVault ? "--readonly-vault" : `--readonly-at ${readonlyAt}`} run passed — the harness cannot detect a refused mutation`);
    process.exitCode = 2;
  }
};

main().catch((e) => {
  console.error(`error: ${e.message}`);
  process.exitCode = 1;
});
