import assert from "node:assert/strict";
import path from "node:path";
import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const readTools = new Set(["shards_task_list", "shards_task_get", "shards_note_list", "shards_memory_list", "shards_memory_get", "shards_search", "shards_graph", "shards_recent_activity", "host_projects", "host_members", "host_notes_browse", "host_note_read", "host_status", "host_dashboard", "shards_scratch_list", "shards_scratch_get"]);
// The existing capability probe deliberately invokes this tool with no target or fields.
const writes = calls => calls.filter(call => !readTools.has(call.tool) && !["events", "health"].includes(call.tool) && !(call.tool === "host_project_update" && Object.keys(call.args).length === 0));
const waitForLayout = page => page.evaluate(async () => {
  await document.fonts.ready;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});
const routeTo = async (page, hash) => {
  await page.evaluate(hash => { location.hash = hash; }, hash);
  await waitForLayout(page);
};
const modifier = page => page.evaluate(() => /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent) ? "Meta" : "Control");
const emitVaultChange = (page, space) => page.evaluate(space => {
  for (const source of window.__flintEventSources) if (source.readyState === 1) source.dispatchEvent(new MessageEvent("vault-changed", { data: JSON.stringify({ spaces: [space], paths: [], at: new Date().toISOString() }) }));
}, space);

/** Tests the assembled React consumers, including cmdk sorting and Radix wrapper changes. */
export async function runFlintRegressions({ browser, baseUrl, fixtures, installFixtures, screenshotDir }) {
  const failures = [];
  let checks = 0;
  const check = async (name, run) => {
    if (process.env.FLINT_CHECK_FILTER && !name.includes(process.env.FLINT_CHECK_FILTER)) return;
    try { await run(); checks++; console.log(`Flint PASS: ${name}`); }
    catch (error) { failures.push({ name, error }); console.error(`Flint FAIL: ${name}\n${error.stack ?? error}`); }
  };
  const create = async ({ width = 1280, storage = {}, data = structuredClone(fixtures), hash = "#/today", platform } = {}) => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
    const page = await context.newPage();
    if (platform) await page.addInitScript(platform => Object.defineProperty(navigator, "platform", { value: platform }), platform);
    page.setDefaultTimeout(10_000);
    const calls = [];
    await page.addInitScript(values => { for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value); }, { "shards-theme": "light", ...storage });
    await page.addInitScript(() => {
      window.__flintEventSources = [];
      window.EventSource = class extends EventTarget {
        static OPEN = 1;
        static CLOSED = 2;
        readyState = 1;
        constructor() {
          super();
          window.__flintEventSources.push(this);
          queueMicrotask(() => this.dispatchEvent(new Event("open")));
        }
        close() { this.readyState = 2; }
      };
    });
    await installFixtures(page, { data, calls });
    await page.goto(`${baseUrl}/${hash}`);
    await page.getByRole("navigation", { name: "Breadcrumb" }).waitFor();
    await waitForLayout(page);
    return { context, page, calls, data };
  };
  const taskData = () => {
    const data = structuredClone(fixtures);
    data.me = "lennard";
    data.members = [{ id: "lennard", name: "Lennard", kind: "human" }, { id: "claude-code", name: "Claude Code", kind: "agent" }, { id: "ops-agent", name: "Operations", kind: "agent" }];
    data.tasks = data.tasks.map((task, index) => ({ ...task, owner: "lennard", claimed_by: null, status: "open", title: index ? "Handbook review" : "Review accessibility evidence", body: "A description kept on disk.\n\n## Comments\n\n2026-10-19T09:00:00Z — lennard\n\nExisting comment." }));
    return data;
  };

  for (const stone of ["flint", "jade", "moonstone", "sandstone"]) for (const mode of ["light", "dark"]) {
    await check(`${stone}/${mode}: local fonts, active tokens and AA`, async () => {
      const data = structuredClone(fixtures);
      data.tasks.push({ ...data.tasks[0], id: "t-neutral", title: "Neutral priority control", priority: "low", status: "open", claimed_by: null });
      const { context, page } = await create({ data, storage: { "shards-theme": mode, "shards-stone": stone } });
      try {
        await page.locator("#main h1").waitFor();
        const appearance = await page.evaluate(() => {
          const root = document.documentElement;
          const style = getComputedStyle(root);
          const heading = document.querySelector("#main h1");
          return { stone: root.dataset.stone, dark: root.classList.contains("dark"), card: style.getPropertyValue("--sh-card").trim(), bodyFont: getComputedStyle(document.body).fontFamily, headingFont: heading && getComputedStyle(heading).fontFamily, loaded: ["Newsreader", "Hanken Grotesk", "JetBrains Mono"].every(font => document.fonts.check(`14px "${font}"`)), fonts: performance.getEntriesByType("resource").filter(entry => /\.woff2(?:\?|$)/.test(entry.name)).map(entry => entry.name) };
        });
        assert.equal(appearance.stone, stone);
        assert.equal(appearance.dark, mode === "dark");
        assert.ok(appearance.card.startsWith("oklch("), "active card color must resolve from the stone tokens");
        assert.match(appearance.bodyFont, /Hanken Grotesk/);
        assert.match(appearance.headingFont, /Newsreader/);
        assert.ok(appearance.loaded, "bundled font families must load");
        assert.ok(appearance.fonts.length >= 2, "the page must request bundled font resources");
        assert.ok(appearance.fonts.every(url => new URL(url).origin === new URL(baseUrl).origin), "fonts must work without a remote origin");
        const neutral = page.locator('[data-task-row="t-neutral"] [role="checkbox"]');
        await neutral.waitFor();
        const boundary = await neutral.evaluate(element => {
          const style = getComputedStyle(element);
          const surface = getComputedStyle(element.closest(".flint-main")).backgroundColor;
          const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          const luminance = color => {
            context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1);
            const [r, g, b] = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map(value => { const s = value / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
          };
          const border = luminance(style.borderTopColor), background = luminance(surface);
          return { width: parseFloat(style.borderTopWidth), contrast: (Math.max(border, background) + 0.05) / (Math.min(border, background) + 0.05) };
        });
        assert.ok(boundary.width > 0 && boundary.contrast >= 3, `rendered neutral checkbox boundary must reach 3:1; received ${boundary.contrast.toFixed(2)}`);
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        assert.deepEqual(results.violations.map(v => ({ rule: v.id, nodes: v.nodes.map(node => ({ target: node.target, detail: node.failureSummary, html: node.html })) })), [], "each stone must pass the actual rendered AA scan");
        if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, `flint-today-${stone}-${mode}.png`), fullPage: true });
      } finally { await context.close(); }
    });
  }

  await check("contextual handoff aliases rank before title hits and only update ownership", async () => {
    const { context, page, calls } = await create({ data: taskData(), hash: "#/today?open=task:t-a11y1" });
    try {
      await page.getByRole("textbox", { name: "Task title", exact: true }).waitFor();
      await page.keyboard.press(`${await modifier(page)}+k`);
      const dialog = page.getByRole("dialog", { name: "Command menu" });
      const input = dialog.getByRole("combobox");
      for (const query of ["hand", "handoff", "assign", "claude-code", "Claude"]) {
        await input.fill(query);
        const targets = dialog.getByRole("option").filter({ hasText: "Hand off to" });
        await expect(targets.first()).toBeVisible();
        if (["hand", "handoff", "assign"].includes(query)) await expect(dialog.getByRole("option").first()).toContainText("Hand off to");
      }
      await input.fill("hand");
      await dialog.getByRole("option").filter({ hasText: "Hand off to Claude Code" }).click();
      await expect(page.getByRole("dialog", { name: "Command menu" })).toHaveCount(0);
      assert.deepEqual(writes(calls).map(({ tool, args }) => ({ tool, args })), [{ tool: "shards_task_update", args: { task_id: "t-a11y1", owner: "claude-code" } }]);
    } finally { await context.close(); }
  });

  for (const contextKind of ["none", "note", "claimed", "terminal"]) await check(`${contextKind} context hides assignment`, async () => {
    const data = taskData();
    if (contextKind === "claimed") Object.assign(data.tasks[0], { status: "claimed", claimed_by: "ops-agent" });
    if (contextKind === "terminal") Object.assign(data.tasks[0], { status: "done", completed: "2026-10-19T12:00:00Z" });
    const hash = contextKind === "note" ? "#/notes?open=note:n-note1" : contextKind === "none" ? "#/memories" : "#/today?open=task:t-a11y1";
    const { context, page } = await create({ data, hash });
    try {
      if (["claimed", "terminal"].includes(contextKind)) await page.getByRole("textbox", { name: "Task title", exact: true }).waitFor();
      await page.keyboard.press(`${await modifier(page)}+k`);
      const dialog = page.getByRole("dialog", { name: "Command menu" });
      await dialog.getByRole("combobox").fill("hand");
      await expect(dialog.getByRole("option").filter({ hasText: "Hand off to" })).toHaveCount(0);
    } finally { await context.close(); }
  });

  for (const destination of ["notes", "filtered"]) await check(`selected task leaving the ${destination === "notes" ? "route" : "visible list"} does not remain a handoff context`, async () => {
    const { context, page } = await create({ data: taskData() });
    try {
      const row = page.locator('[data-task-row="t-a11y1"]');
      await row.focus();
      await expect(row).toHaveAttribute("data-selected", "true");
      if (destination === "notes") await routeTo(page, "#/notes");
      else {
        await page.getByRole("button", { name: "Filter tasks", exact: true }).click();
        await page.getByRole("checkbox", { name: "Normal", exact: true }).check();
        await page.keyboard.press("Escape");
        await expect(row).toHaveCount(0);
      }
      await page.keyboard.press(`${await modifier(page)}+k`);
      const dialog = page.getByRole("dialog", { name: "Command menu" });
      await dialog.getByRole("combobox").fill("hand");
      await expect(dialog.getByRole("option").filter({ hasText: "Hand off to" })).toHaveCount(0);
    } finally { await context.close(); }
  });

  for (const platform of ["MacIntel", "Linux x86_64"]) await check(`Focus button labels match visible text on ${platform}`, async () => {
    const { context, page } = await create({ data: taskData(), platform });
    try {
      const toggle = page.locator('button[aria-pressed]').filter({ hasText: /Focus|Quiet/ });
      await expect(toggle).toHaveCount(1);
      for (const width of [1280, 720, 480]) {
        await page.setViewportSize({ width, height: 900 });
        for (const active of [false, true]) {
          await expect(toggle).toHaveAttribute("aria-pressed", String(active));
          await expect(toggle).toHaveAccessibleName(active ? /^Quiet/ : /^Focus/);
          if (width === 1280) await expect(toggle.locator("kbd").first()).toHaveText(platform === "MacIntel" ? "⌘" : "Ctrl");
          const results = await new AxeBuilder({ page }).include('button[aria-pressed]').withRules(["label-content-name-mismatch", "button-name"]).analyze();
          assert.deepEqual(results.violations.map(v => ({ rule: v.id, nodes: v.nodes.map(node => node.html) })), [], "Focus and Quiet must retain accessible names that include their visible labels");
          await toggle.click();
        }
      }
    } finally { await context.close(); }
  });

  await check("Focus UI, shortcut, palette and route destinations share guarded state", async () => {
    const { context, page, calls } = await create({ data: taskData() });
    try {
      const mod = await modifier(page);
      await page.getByRole("button", { name: /^Focus/ }).click();
      await expect(page.locator(".flint-focus")).toHaveCount(1);
      await page.keyboard.press(`${mod}+\\`);
      await expect(page.locator(".flint-focus")).toHaveCount(0);
      await page.keyboard.press(`${mod}+k`);
      const dialog = page.getByRole("dialog", { name: "Command menu" });
      await dialog.getByRole("combobox").fill("focus");
      await dialog.getByRole("option", { name: /Toggle Focus/ }).click();
      await expect(page.locator(".flint-focus")).toHaveCount(1);
      await routeTo(page, "#/today?open=task:t-a11y1");
      await expect(page.locator(".flint-focus")).toHaveCount(1);
      await routeTo(page, "#/today?q=unchanged-destination");
      await expect(page.locator(".flint-focus")).toHaveCount(1);
      await routeTo(page, "#/project/n-project1");
      await expect(page.locator(".flint-focus")).toHaveCount(0);
      await page.getByRole("button", { name: /^Focus/ }).click();
      await page.getByLabel("Board by section", { exact: true }).click();
      await expect(page.locator(".flint-focus")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Focus/ })).toHaveCount(0);
      await page.getByLabel("List", { exact: true }).click();
      await page.getByRole("button", { name: /^Focus/ }).click();
      await routeTo(page, "#/project/n-project2");
      await expect(page.locator(".flint-focus")).toHaveCount(0);
      await routeTo(page, "#/label/a11y");
      await page.getByRole("button", { name: /^Focus/ }).click();
      await routeTo(page, "#/label/test");
      await expect(page.locator(".flint-focus")).toHaveCount(0);
      await routeTo(page, "#/today?open=task:t-a11y1");
      const title = page.getByRole("textbox", { name: "Task title", exact: true });
      await title.focus();
      await page.keyboard.press(`${mod}+\\`);
      await expect(page.locator(".flint-focus")).toHaveCount(0);
      assert.deepEqual(writes(calls), [], "Focus and navigation must not mutate vault data");
    } finally { await context.close(); }
  });

  for (const layout of ["board-section", "board-status"]) await check(`saved ${layout} rejects Focus through every entry point`, async () => {
    const { context, page, calls } = await create({ data: taskData(), hash: "#/project/n-project1", storage: { "shards.project.n-project1.layout": JSON.stringify(layout) } });
    try {
      await page.getByLabel(layout === "board-section" ? "Board by section" : "Board by status", { exact: true }).waitFor();
      await expect(page.getByRole("button", { name: /^Focus/ })).toHaveCount(0);
      const mod = await modifier(page);
      await page.keyboard.press(`${mod}+\\`);
      await expect(page.locator(".flint-focus")).toHaveCount(0);
      await page.keyboard.press(`${mod}+k`);
      const dialog = page.getByRole("dialog", { name: "Command menu" });
      await dialog.getByRole("combobox").fill("focus");
      await expect(dialog.getByRole("option", { name: /Toggle Focus/ })).toHaveCount(0);
      assert.deepEqual(writes(calls), []);
    } finally { await context.close(); }
  });

  for (const field of ["title", "description", "comment"]) await check(`dirty ${field} survives 1280 → 1000 → 720 → 1280 without saves`, async () => {
    const data = taskData();
    data.tasks.push(...Array.from({ length: 35 }, (_, index) => ({ ...data.tasks[1], id: `t-scroll${index}`, title: `Scroll fixture ${index}`, order: index + 3 })));
    data.tasks.push(...Array.from({ length: 6 }, (_, index) => ({ ...data.tasks[1], id: `t-child${index}`, parent: "t-a11y1", title: `Detail scroll child ${index}`, order: index + 50 })));
    const { context, page, calls } = await create({ data, hash: "#/today?open=task:t-a11y1" });
    try {
      await page.getByRole("textbox", { name: "Task title", exact: true }).waitFor();
      await page.locator('[data-detail-root] [data-task-row="t-child5"]').waitFor();
      await page.waitForFunction(() => {
        const main = document.getElementById("main");
        return main && main.scrollHeight > main.clientHeight + 100;
      });
      if (field === "description") await page.locator('[data-detail-root] [role="button"][title="Click to edit"]').click();
      // Let the editor's initial focus/caret placement finish before simulating a user selection.
      await waitForLayout(page);
      const editor = page.locator(`[data-detail-field="${field}"]`);
      const draft = `Unsaved ${field} stays across the responsive boundary`;
      await editor.fill(draft);
      const before = await editor.evaluate(el => {
        el.focus({ preventScroll: true }); el.setSelectionRange(8, 17);
        const scroller = el.closest("[data-detail-root]").querySelector("[data-detail-scroll]");
        scroller.scrollTop = 40;
        const main = document.getElementById("main"); main.scrollTop = 90;
        return { detail: scroller.scrollTop, main: main.scrollTop };
      });
      assert.ok(before.detail > 0 && before.main > 0, `both detail and task-list scroll restoration must be exercised; received ${JSON.stringify(before)}`);
      for (const width of [1000, 900, 720, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await waitForLayout(page);
        await expect(editor).toHaveValue(draft);
        await expect(editor, `${field} must retain focus at width ${width}`).toBeFocused();
        if (width === 900 || width === 720) {
          const sheet = await page.locator("[data-detail-root]").boundingBox();
          assert.ok(sheet, "responsive detail sheet must have bounds");
          assert.ok(Math.abs(sheet.width - (width === 720 ? 720 : 372)) <= 1, `detail width at ${width}: expected ${width === 720 ? 720 : 372}, received ${sheet.width}`);
        }
        const state = await editor.evaluate(el => ({ start: el.selectionStart, end: el.selectionEnd, detail: el.closest("[data-detail-root]").querySelector("[data-detail-scroll]").scrollTop, main: document.getElementById("main").scrollTop }));
        assert.deepEqual(state, { start: 8, end: 17, ...before }, `selection and scroll must survive width ${width}`);
      }
      assert.deepEqual(writes(calls), [], "responsive layout must not save or mutate task data");
    } finally { await context.close(); }
  });

  await check("pending comment survives responsive remount without duplicate send or lost new draft", async () => {
    const { context, page, calls, data } = await create({ data: taskData(), hash: "#/today?open=task:t-a11y1" });
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const appends = [];
    await page.route("**/api/call/shards_task_append", async route => {
      appends.push(JSON.parse(route.request().postData()));
      await pending;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ value: data.tasks[0], list: false }) });
    });
    try {
      const editor = page.locator('[data-detail-field="comment"]');
      await editor.fill("First comment awaiting acknowledgement");
      await page.getByRole("button", { name: "Send comment", exact: true }).click();
      await expect.poll(() => appends.length).toBe(1);
      await page.setViewportSize({ width: 1000, height: 900 });
      await waitForLayout(page);
      await editor.press("Enter");
      // Flush the user action through the browser without releasing the original request.
      await waitForLayout(page);
      const appendRequests = appends.length;
      const nextDraft = "A different comment composed while the first sends";
      await editor.fill(nextDraft);
      const completed = page.waitForResponse("**/api/call/shards_task_append");
      const readsBefore = calls.filter(call => call.tool === "shards_task_get").length;
      release();
      await completed;
      await expect.poll(() => calls.filter(call => call.tool === "shards_task_get").length).toBeGreaterThan(readsBefore);
      await waitForLayout(page);
      assert.deepEqual({ appendRequests, draft: await editor.inputValue() }, { appendRequests: 1, draft: nextDraft }, "one pending send must survive the remount and must only clear the submitted text");
    } finally { release(); await context.close(); }
  });

  for (const kind of ["memory", "scratch"]) for (const edited of [false, true]) await check(`pending ${kind} append survives responsive remount and ${edited ? "preserves new text" : "clears submitted text"}`, async () => {
    const data = taskData();
    data.scratch = [{ agent: "codex", name: "session", created: "2026-10-18T09:00:00Z", updated: "2026-10-19T09:00:00Z", body: "Scratch base" }];
    const { context, page, calls } = await create({ data, hash: `#/today?open=${kind}:${kind === "memory" ? "m-a11y1" : "codex/session"}` });
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const appends = [];
    const tool = `shards_${kind}_append`;
    await page.route(`**/api/call/${tool}`, async route => {
      appends.push(JSON.parse(route.request().postData()));
      await pending;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ value: kind === "memory" ? data.memories[0] : data.scratch[0], list: false }) });
    });
    try {
      const root = page.locator("[data-detail-root]");
      if (kind === "memory") await root.getByRole("button", { name: "Append", exact: true }).click();
      const editor = root.locator(`[data-detail-field="${kind === "memory" ? "memory-body" : "scratch-note"}"]`);
      await editor.fill("Submitted text awaiting acknowledgement");
      await root.getByRole("button", { name: "Append", exact: true }).click();
      await expect.poll(() => appends.length).toBe(1);
      await page.setViewportSize({ width: 1000, height: 900 });
      await waitForLayout(page);
      await editor.press(`${await modifier(page)}+Enter`);
      await waitForLayout(page);
      const appendRequests = appends.length;
      const nextDraft = "New text composed while the append sends";
      if (edited) await editor.fill(nextDraft);
      const readsBefore = calls.filter(call => call.tool === `shards_${kind}_get`).length;
      const completed = page.waitForResponse(`**/api/call/${tool}`);
      release();
      await completed;
      await expect.poll(() => calls.filter(call => call.tool === `shards_${kind}_get`).length).toBeGreaterThan(readsBefore);
      await waitForLayout(page);
      if (edited) await expect(editor).toHaveValue(nextDraft);
      else if (kind === "memory") await expect(editor).toHaveCount(0);
      else await expect(editor).toHaveValue("");
      assert.equal(appendRequests, 1, "responsive remount must not permit another append while the first is pending");
    } finally { release(); await context.close(); }
  });

  for (const kind of ["task", "memory", "scratch"]) await check(`pending ${kind} body save survives responsive remount and preserves newer draft`, async () => {
    const data = taskData();
    data.scratch = [{ agent: "codex", name: "session", created: "2026-10-18T09:00:00Z", updated: "2026-10-19T09:00:00Z", body: "Scratch base" }];
    const { context, page, calls } = await create({ data, hash: `#/today?open=${kind}:${kind === "task" ? "t-a11y1" : kind === "memory" ? "m-a11y1" : "codex/session"}` });
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const saves = [];
    const tool = kind === "scratch" ? "shards_scratch_set" : `host_${kind}_set_body`;
    await page.route(`**/api/call/${tool}`, async route => {
      const args = JSON.parse(route.request().postData());
      saves.push(args);
      await pending;
      const entity = kind === "task" ? data.tasks[0] : kind === "memory" ? data.memories[0] : data.scratch[0];
      entity.body = args.body;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ value: entity, list: false }) });
    });
    try {
      const root = page.locator("[data-detail-root]");
      if (kind === "task") await root.locator('[role="button"][title="Click to edit"]').click();
      else if (kind === "memory") await root.locator("#memory-edit-body").click();
      else await root.getByRole("button", { name: "Edit (E)", exact: true }).click();
      const editor = root.locator(`[data-detail-field="${kind === "task" ? "description" : `${kind}-body`}"]`);
      await editor.fill("Submitted body awaiting acknowledgement");
      await root.getByRole("button", { name: "Save", exact: true }).click();
      await expect.poll(() => saves.length).toBe(1);
      await page.setViewportSize({ width: 1000, height: 900 });
      await waitForLayout(page);
      await editor.press(`${await modifier(page)}+Enter`);
      await waitForLayout(page);
      const saveRequests = saves.length;
      const nextDraft = "New body composed while the first save sends";
      await editor.fill(nextDraft);
      const readsBefore = calls.filter(call => call.tool === `shards_${kind}_get`).length;
      const completed = page.waitForResponse(`**/api/call/${tool}`);
      release();
      await completed;
      await expect.poll(() => calls.filter(call => call.tool === `shards_${kind}_get`).length).toBeGreaterThan(readsBefore);
      await expect(editor).toHaveValue(nextDraft);
      assert.equal(saveRequests, 1, "responsive remount must not permit another body save while the first is pending");
    } finally { release(); await context.close(); }
  });

  for (const presentation of ["pane", "route"]) for (const kind of ["memory", "scratch"]) await check(`dirty ${kind} body survives responsive ${presentation} layout without saves`, async () => {
    const data = structuredClone(fixtures);
    data.scratch = [{ agent: "codex", name: "session", created: "2026-10-18T09:00:00Z", updated: "2026-10-19T09:00:00Z", body: "Scratch base" }];
    const entity = kind === "memory" ? "m-a11y1" : "codex/session";
    const hash = presentation === "pane" ? `#/today?open=${kind}:${entity}` : kind === "memory" ? `#/memories/${entity}` : `#/scratch/${entity}`;
    const { context, page, calls } = await create({ data, hash });
    try {
      const root = page.locator(presentation === "pane" ? "[data-detail-root]" : "#main");
      if (kind === "memory") await root.locator("#memory-edit-body").click();
      else await root.getByRole("button", { name: "Edit (E)", exact: true }).click();
      const editor = root.locator(`[data-detail-field="${kind}-body"]`);
      const draft = `${kind} unsaved draft`;
      await editor.fill(draft);
      await editor.evaluate(element => { element.focus(); element.setSelectionRange(2, 8); });
      for (const width of [1000, 720, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await waitForLayout(page);
        await expect(editor).toHaveValue(draft);
        await expect(editor, `${kind} must retain focus at width ${width}`).toBeFocused();
        assert.deepEqual(await editor.evaluate(element => [element.selectionStart, element.selectionEnd]), [2, 8], `${kind} selection at ${width}`);
      }
      assert.deepEqual(writes(calls), [], `${kind} resize must not save`);
    } finally { await context.close(); }
  });

  for (const kind of ["task", "memory"]) await check(`external title refresh preserves dirty ${kind} title until an explicit conflict choice`, async () => {
    const { context, page, calls, data } = await create({ data: taskData(), hash: `#/today?open=${kind}:${kind === "task" ? "t-a11y1" : "m-a11y1"}` });
    try {
      const root = page.locator("[data-detail-root]");
      if (kind === "memory") await root.getByRole("heading", { name: "Keyboard navigation notes", exact: true }).click();
      const editor = root.locator(`[data-detail-field="${kind === "task" ? "title" : "memory-title"}"]`);
      const draft = `My retained ${kind} title`;
      await editor.fill(draft);
      const refresh = async title => {
        (kind === "task" ? data.tasks[0] : data.memories[0]).title = title;
        await emitVaultChange(page, kind === "task" ? "tasks" : "memories");
      };
      await refresh(`External ${kind} title`);
      await expect(root.getByText("The title changed on disk. Your draft is kept.", { exact: true })).toBeVisible();
      await expect(editor).toHaveValue(draft);
      await editor.blur();
      await expect(editor).toHaveValue(draft);
      assert.deepEqual(writes(calls), [], "ordinary conflict blur must not write");
      await root.getByRole("button", { name: "Use latest", exact: true }).click();
      await expect(root.getByText("The title changed on disk. Your draft is kept.", { exact: true })).toHaveCount(0);
      if (kind === "task") await expect(editor).toHaveValue("External task title");
      else await expect(root.getByRole("heading", { name: "External memory title", exact: true })).toBeVisible();
      assert.deepEqual(writes(calls), [], "reloading the source must not write");
      if (kind === "memory") await root.getByRole("heading", { name: "External memory title", exact: true }).click();
      await editor.fill(draft);
      await refresh(`Second external ${kind} title`);
      await root.getByRole("button", { name: "Use my title", exact: true }).click();
      await expect.poll(() => writes(calls).length).toBe(1);
      assert.deepEqual(writes(calls), [{ tool: kind === "task" ? "shards_task_update" : "shards_memory_update", args: kind === "task" ? { task_id: "t-a11y1", title: draft } : { target: "m-a11y1", title: draft } }]);
    } finally { await context.close(); }
  });

  for (const kind of ["task", "memory"]) await check(`external title refresh does not turn an untouched ${kind} editor into a stale write`, async () => {
    const { context, page, calls, data } = await create({ data: taskData(), hash: `#/today?open=${kind}:${kind === "task" ? "t-a11y1" : "m-a11y1"}` });
    try {
      const root = page.locator("[data-detail-root]");
      if (kind === "memory") await root.getByRole("heading", { name: "Keyboard navigation notes", exact: true }).click();
      const editor = root.locator(`[data-detail-field="${kind === "task" ? "title" : "memory-title"}"]`);
      await editor.focus();
      const getTool = kind === "task" ? "shards_task_get" : "shards_memory_get";
      const readsBefore = calls.filter(call => call.tool === getTool).length;
      const latest = `External untouched ${kind} title`;
      (kind === "task" ? data.tasks[0] : data.memories[0]).title = latest;
      await emitVaultChange(page, kind === "task" ? "tasks" : "memories");
      await expect.poll(() => calls.filter(call => call.tool === getTool).length).toBeGreaterThan(readsBefore);
      await waitForLayout(page);
      await editor.blur();
      if (kind === "task") await expect(editor).toHaveValue(latest);
      else await expect(root.getByRole("heading", { name: latest, exact: true })).toBeVisible();
      assert.deepEqual(writes(calls), [], "focusing and blurring untouched text must not overwrite an external edit");
    } finally { await context.close(); }
  });

  if (screenshotDir) await check("review screenshots at 1280, 900 and 720 in both modes", async () => {
    for (const mode of ["light", "dark"]) {
      const { context, page } = await create({ data: taskData(), storage: { "shards-theme": mode } });
      try {
        const capture = async (name, hash, width, open) => {
          await page.setViewportSize({ width, height: 900 });
          await routeTo(page, hash);
          await page.getByRole("navigation", { name: "Breadcrumb" }).waitFor();
          await open?.();
          await waitForLayout(page);
          await page.screenshot({ path: path.join(screenshotDir, `flint-${name}-${mode}-${width}.png`), fullPage: true });
        };
        await capture("today", "#/today", 1280);
        await capture("focus", "#/today", 1280, () => page.getByRole("button", { name: /^Focus/ }).click());
        await capture("project-detail", "#/project/n-project1?open=task:t-a11y1", 1280, () => page.getByRole("textbox", { name: "Task title", exact: true }).waitFor());
        await capture("agents", "#/agents", 1280, () => page.getByRole("heading", { name: "Crew", exact: true }).waitFor());
        await capture("notes", "#/notes", 1280, () => page.getByText("Accessibility plan", { exact: true }).first().waitFor());
        await capture("palette", "#/today?open=task:t-a11y1", 1280, async () => {
          await page.getByRole("textbox", { name: "Task title", exact: true }).waitFor();
          await page.keyboard.press(`${await modifier(page)}+k`);
          await page.getByRole("dialog", { name: "Command menu" }).getByRole("combobox").fill("hand");
        });
        await page.keyboard.press("Escape");
        for (const width of [900, 720]) for (const [name, hash] of [["today", "#/today"], ["agents", "#/agents"], ["notes", "#/notes"], ["memories", "#/memories"], ["scratch", "#/scratch"], ["settings", "#/settings"], ["upcoming", "#/upcoming"], ["search", "#/search?q=accessibility"]]) await capture(name, hash, width);
      } finally { await context.close(); }
    }
  });

  console.log(`Flint browser regressions: ${checks} passed; ${failures.length} failed`);
  if (failures.length) throw new AggregateError(failures.map(failure => failure.error), `Flint browser regressions failed: ${failures.map(failure => failure.name).join("; ")}`);
}
