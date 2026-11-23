/**
 * One desktop workflow against the real `shards-host`, end to end, with no fixtures.
 *
 *   node e2e/host-workflow.mjs [--readonly-vault] [--keep]
 *
 * What it does, in order:
 *   1. seeds a disposable vault with `scripts/demo-vault.sh --empty` (first-run state: identity
 *      and members, no tasks);
 *   2. boots the built `shards-host` against it on a free port;
 *   3. serves the built desktop app with `vite preview` — the same Vite config, so the same
 *      `/api` proxy the dev server uses (it injects `x-shards-token` from the token file);
 *   4. Chromium opens `#/inbox`, presses `q`, types a unique title and clicks "Add task";
 *   5. asserts the new `[data-task-row]` appears in the Inbox and takes its id from the DOM;
 *   6. runs `shards --vault <vault> task list --json --all` on the SAME vault and asserts the
 *      id from the UI is in the CLI's output, with the same title.
 *
 * Step 6 is the point: the UI can look right while the mutation never reached the vault. A
 * fixture can fake the row; it cannot fake the file the CLI reads.
 *
 * `--readonly-vault` takes the write bits off the seeded vault (every file and directory) before
 * the UI drives it, so `shards-host` refuses the write. That run MUST fail, and it fails at step 5
 * with the host's own error in the log — CI runs it as the negative control. `--keep` leaves the
 * work directory behind.
 *
 * Env: SHARDS_BIN, SHARDS_HOST_BIN (default target/release/{shards,shards-host}), E2E_WORK_DIR,
 * E2E_SCREENSHOT_DIR. Requires `pnpm -C apps/desktop build` first (it serves apps/desktop/dist).
 */
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
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

const argv = new Set(process.argv.slice(2));
const readonlyVault = argv.has("--readonly-vault");
const keep = argv.has("--keep");
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
  let host = null;
  let app = null;
  let browser = null;
  let page = null;
  let currentStep = "setup";
  let done = false;

  const vaultDir = path.join(workDir, "demo");
  const vaultPath = path.join(vaultDir, "vault");
  const configPath = path.join(vaultDir, "config.toml");
  const tokenFile = path.join(workDir, "host.token");

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

  try {
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

    if (readonlyVault) {
      await step("make the vault read-only", async () => {
        // Every directory and file: the host creates its space folders at boot, so locking only
        // the vault root would leave `tasks/open/` writable and the control would pass.
        await lockDown(vaultPath);
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
      if (r.status() < 400) return;
      const body = await r.text().catch(() => "");
      failedResponses.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname} ${body.slice(0, 200)}`);
    });

    const title = `E2E real host ${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;

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
      const { stdout } = await execFileP(shardsBin, ["--vault", vaultPath, "task", "list", "--json", "--all"], {
        env: { ...process.env, SHARDS_CONFIG_PATH: configPath, SHARDS_VAULT: vaultPath },
        cwd: workDir,
      });
      const payload = JSON.parse(stdout);
      if (!Array.isArray(payload.tasks)) throw new Error(`task list --json did not answer {tasks: []}: ${stdout.slice(0, 400)}`);
      const matches = payload.tasks.filter((t) => t.id === uiId);
      if (matches.length !== 1) {
        throw new Error(`the UI id ${uiId} is not the one task with that id in the vault (${matches.length} matches; vault has ${payload.tasks.length}: ${payload.tasks.map((t) => t.id).join(", ") || "none"})`);
      }
      if (matches[0].title !== title) {
        throw new Error(`id ${uiId} in the vault is “${matches[0].title}”, not “${title}” — the CLI and the UI disagree`);
      }
      // The CLI reads the configured vault; this proves the file itself is in the disposable one
      // rather than in some other vault a misconfigured host happened to serve.
      const files = (await readdir(vaultPath, { recursive: true })).map(String).filter((f) => f.includes(uiId));
      if (!files.length) throw new Error(`no file under ${vaultPath} names ${uiId}`);
      console.log(`vault file: ${path.join(vaultPath, files[0])}`);
      return matches[0].id;
    });

    await step("the two surfaces name the same id", async () => {
      if (uiId !== cliId) throw new Error(`UI says ${uiId}, CLI says ${cliId}`);
      console.log(`confirmed: ${uiId} “${title}” — UI and CLI agree`);
    });

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
    if (readonlyVault) await release(vaultPath).catch(() => {});
    if (keep) console.log(`work directory kept at ${workDir}`);
    else await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }

  console.log(`\nreal-host desktop workflow passed in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  if (readonlyVault) {
    console.log("WARNING: --readonly-vault run passed — the harness cannot detect a refused mutation");
    process.exitCode = 2;
  }
};

main().catch((e) => {
  console.error(`error: ${e.message}`);
  process.exitCode = 1;
});
