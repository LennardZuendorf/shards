import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { runFlintRegressions } from "./flint-regressions.mjs";
import { runFlintVisualQa } from "./flint-visual-qa.mjs";

const a11yDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(a11yDir, "..");
const baselinePath = path.join(root, "a11y-baseline.json");
const fixtures = JSON.parse(await readFile(path.join(a11yDir, "fixtures.json"), "utf8"));
const updateBaseline = process.argv.includes("--update-baseline");
const screenshotDir = process.env.A11Y_SCREENSHOT_DIR;
if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
const rules = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
// Allow one CSS pixel for fractional layout rounding in viewport and clipping checks.
const ZOOM_TOLERANCE_PX = 1;
// Simulate 200% browser zoom by halving the CSS viewport from the existing 1440 × 1000 pass.
const ZOOM_VIEWPORT = { width: 720, height: 500 };
// Tailwind truncate marks intentionally shortened labels; the full value is provided by its surrounding UI.
const ELISION_ALLOWLIST = '[class~="truncate"]';
// Tailwind line-clamp marks intentionally shortened previews; the full note remains available in its detail view.
const ELISION_ALLOWLIST_LINE_CLAMP = '[class*="line-clamp-"]';
// Tailwind sr-only content is intentionally clipped visually and remains available to assistive technology.
const ELISION_ALLOWLIST_SCREEN_READER = '[class~="sr-only"]';
const normalizeTarget = (target) => target
  .map((part) => part.replace(/#radix-[^ ]+/g, "#radix-id").replace(/\[aria-controls="[^"]+"\]/g, '[aria-controls="radix-id"]'))
  .join(" ");
const pressMod = async (page, key) => page.keyboard.press(`${await page.evaluate(() => /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent) ? "Meta" : "Control")}+${key}`);

const server = createServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
const app = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: root,
  stdio: "ignore",
  env: { ...process.env, SHARDS_HOST_URL: "http://127.0.0.1:9" },
});
const baseUrl = `http://127.0.0.1:${port}`;
const waitForApp = async () => {
  const until = Date.now() + 30_000;
  while (Date.now() < until) {
    try { if ((await fetch(baseUrl)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Vite preview did not become ready");
};
const settleForAxe = (page) => page.evaluate(async () => {
  while (document.fonts.status !== "loaded") await document.fonts.ready;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await new Promise((resolve) => setTimeout(resolve, 500));
});
const settleForZoom = (page) => page.evaluate(async () => {
  await document.fonts.ready;
  await new Promise((resolve) => requestAnimationFrame(resolve));
});
const measureTaskRows = (page) => page.evaluate(() => [...document.querySelectorAll("[data-task-row]")]
  .map((element) => ({ selector: `[data-task-row="${CSS.escape(element.getAttribute("data-task-row"))}"]`, height: element.getBoundingClientRect().height })));
const inspectZoom = (page, baselineRows) => page.evaluate(({ tolerance, baselineRows, elisionAllowlist }) => {
  const findings = [];
  const selectorFor = (element) => {
    if (element.id) return `#${CSS.escape(element.id)}`;
    const parts = [];
    let node = element;
    while (node && node !== document.documentElement) {
      let part = node.localName;
      if (node.classList.length) part += `.${[...node.classList].slice(0, 2).map((name) => CSS.escape(name)).join(".")}`;
      const parent = node.parentElement;
      if (parent) part += `:nth-of-type(${[...parent.children].filter((child) => child.localName === node.localName).indexOf(node) + 1})`;
      parts.unshift(part);
      node = parent;
    }
    return parts.join(" > ");
  };
  const add = (check, selector, detail, expected, actual) => findings.push({ check, selector, detail, expected, actual });
  const root = document.documentElement;
  if (root.scrollWidth > root.clientWidth + tolerance) {
    add("document-horizontal-overflow", "html", "document scroll width exceeds viewport", `${root.clientWidth + tolerance} px max`, `${root.scrollWidth} px`);
  }

  const isAllowlistedScroller = (element) => {
    const ancestor = element.closest("[data-zoom-horizontal-scroll-ok]");
    return Boolean(ancestor && ancestor.scrollWidth > ancestor.clientWidth);
  };
  const interactive = [...document.querySelectorAll('a[href], button, input, select, textarea, summary, [contenteditable="true"], [tabindex]:not([tabindex="-1"]), [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="menuitem"]')];
  for (const element of interactive) {
    if (!element.getClientRects().length || isAllowlistedScroller(element)) continue;
    element.scrollIntoView({ block: "nearest", inline: "nearest" });
    const rect = element.getBoundingClientRect();
    let ancestor = element.parentElement;
    while (ancestor && ancestor !== root) {
      const style = getComputedStyle(ancestor);
      const clipsX = ["hidden", "auto", "scroll"].includes(style.overflowX);
      const clipsY = ["hidden", "auto", "scroll"].includes(style.overflowY);
      if (clipsX || clipsY) {
        const box = ancestor.getBoundingClientRect();
        const outside = (clipsX && (rect.left < box.left - tolerance || rect.right > box.right + tolerance)) || (clipsY && (rect.top < box.top - tolerance || rect.bottom > box.bottom + tolerance));
        if (outside) add("interactive-clipped", selectorFor(element), `outside nearest clipping ancestor ${selectorFor(ancestor)}`, `inside ${Math.round(box.width)} × ${Math.round(box.height)} px ancestor`, `${Math.round(rect.width)} × ${Math.round(rect.height)} px element at (${Math.round(rect.left)}, ${Math.round(rect.top)})`);
        break;
      }
      ancestor = ancestor.parentElement;
    }
  }

  for (const baseline of baselineRows) {
    const row = document.querySelector(baseline.selector);
    if (!row) {
      add("target-size", baseline.selector, "100% task row missing at zoom", `${baseline.height.toFixed(1)} px high`, "missing");
      continue;
    }
    const height = row.getBoundingClientRect().height;
    if (height + tolerance < baseline.height) add("target-size", baseline.selector, "task row is smaller than its measured 100% target", `at least ${baseline.height.toFixed(1)} px high`, `${height.toFixed(1)} px high`);
  }

  const isElisionAllowlisted = (element) => element.closest(elisionAllowlist);
  for (const element of document.querySelectorAll("body *")) {
    if (isElisionAllowlisted(element) || element.children.length > 0) continue;
    const style = getComputedStyle(element);
    if ((style.textOverflow === "ellipsis" || style.overflowX === "hidden" || style.overflow === "hidden") && element.scrollWidth > element.clientWidth + tolerance) {
      add("unexpected-text-elision", selectorFor(element), "text content exceeds its clipped width", `${element.clientWidth + tolerance} px max`, `${element.scrollWidth} px`);
    }
  }
  return findings;
}, { tolerance: ZOOM_TOLERANCE_PX, baselineRows, elisionAllowlist: `${ELISION_ALLOWLIST},${ELISION_ALLOWLIST_LINE_CLAMP},${ELISION_ALLOWLIST_SCREEN_READER}` });

const installFixtures = async (page, { data = fixtures, calls = [] } = {}) => page.route("**/api/**", async (intercept) => {
  const fixtures = data;
  const url = new URL(intercept.request().url());
  const tool = url.pathname.split("/").at(-1);
  const args = JSON.parse(intercept.request().postData() ?? "{}");
  calls.push({ tool, args });
  let value = [];
  if (tool === "shards_task_list") value = args.parent ? fixtures.tasks.filter(task => task.parent === args.parent) : fixtures.tasks;
  else if (tool === "shards_task_get") value = fixtures.tasks.find(task => task.id === args.id) ?? null;
  else if (tool === "shards_task_update") {
    const task = fixtures.tasks.find(task => task.id === args.task_id);
    if (task) Object.assign(task, Object.fromEntries(Object.entries(args).filter(([key]) => key !== "task_id")));
    value = task ?? null;
  }
  else if (tool === "shards_note_list") value = [{ id: "n-project1", type: "project", title: fixtures.project.title, tags: [], owner: null, created: null, updated: null, slug: fixtures.project.slug, color: fixtures.project.color }, { id: "n-note1", type: "note", title: "Accessibility plan", tags: ["a11y"], owner: null, created: null, updated: null }];
  else if (tool === "shards_memory_list") value = fixtures.memories;
  else if (tool === "shards_memory_get") value = fixtures.memories.find(memory => memory.id === args.target) ?? null;
  else if (tool === "shards_memory_update") {
    const memory = fixtures.memories.find(memory => memory.id === args.target);
    if (memory) Object.assign(memory, Object.fromEntries(Object.entries(args).filter(([key]) => key !== "target")));
    value = memory ?? null;
  }
  else if (tool === "shards_scratch_list") value = fixtures.scratch ?? [];
  else if (tool === "shards_scratch_get") value = fixtures.scratch?.find(scratch => scratch.name === args.name && (!args.agent || scratch.agent === args.agent)) ?? null;
  else if (tool === "shards_graph") value = { nodes: [], edges: [] };
  else if (tool === "shards_search") value = fixtures.search;
  else if (tool === "host_projects") value = fixtures.projects ?? [fixtures.project];
  else if (tool === "host_members") value = fixtures.members;
  else if (tool === "host_notes_browse") value = fixtures.notes;
  else if (tool === "host_note_read") {
    const path = args.path;
    value = fixtures.notes.find((note) => note.path === path) ?? fixtures.notes[0];
  }
  else if (tool === "host_status") value = { vault: "/fixture", config_path: null, me: fixtures.me ?? "codex", version: "test", spaces: {}, counts: {} };
  else if (tool === "host_dashboard") value = {};
  await intercept.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ value, list: Array.isArray(value) }) });
});

const routes = [
  { name: "tasks-list", hash: "#/today", ready: (page) => page.locator('[data-task-row="t-a11y1"]') },
  { name: "tasks-board", hash: "#/project/n-project1", ready: (page) => page.locator('[data-task-row="t-a11y1"]') },
  { name: "memories", hash: "#/memories", ready: "Keyboard navigation notes" },
  { name: "notes", hash: "#/notes", ready: (page) => page.getByRole("textbox", { name: "Filter notes", exact: true }) },
  { name: "agents", hash: "#/agents", ready: (page) => page.getByRole("heading", { name: "Crew", exact: true }) },
  { name: "search", hash: "#/search?q=accessibility", ready: (page) => page.getByText("Review accessibility evidence").first() },
];
const overlays = [
  {
    name: "command-palette",
    open: (page) => pressMod(page, "k"),
    ready: (page) => page.getByRole("dialog", { name: "Command menu" }),
  },
  {
    name: "quick-add",
    open: async (page) => {
      await page.keyboard.press("q");
      await page.getByPlaceholder("e.g. Review PR #project p1 tomorrow 5pm @label +agent").waitFor({ state: "visible" });
    },
    ready: (page) => page.getByRole("dialog", { name: "Quick add task" }),
  },
];
const collected = [];
const zoomCollected = [];
let zoomPassDurationMs = 0;
const a11yStartedAt = performance.now();
const zoomFindingsPath = path.join(a11yDir, "zoom-findings.json");
await writeFile(zoomFindingsPath, `${JSON.stringify({ findings: [] }, null, 2)}\n`);
let browser;
try {
  await waitForApp();
  browser = await chromium.launch({ headless: true, ...(process.env.A11Y_CHROMIUM_PATH ? { executablePath: process.env.A11Y_CHROMIUM_PATH } : {}) });
  try {
    if (!process.argv.includes("--visual-only")) await runFlintRegressions({ browser, baseUrl, fixtures, installFixtures, screenshotDir });
    if (!process.argv.includes("--flint-only")) await runFlintVisualQa({ browser, baseUrl, fixtures, installFixtures, screenshotDir });
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
  for (const theme of process.argv.includes("--flint-only") || process.argv.includes("--visual-only") ? [] : ["light", "dark"]) {
    const zoomContext = await browser.newContext({ colorScheme: theme, viewport: ZOOM_VIEWPORT });
    const zoomPage = await zoomContext.newPage();
    await zoomPage.addInitScript((mode) => { localStorage.setItem("shards-theme", mode); localStorage.setItem("shards.project.n-project1.layout", '"board-section"'); }, theme);
    await installFixtures(zoomPage);
    for (const route of routes) {
      console.log(`Axe scan: ${route.name}/${theme}`);
      const context = await browser.newContext({ colorScheme: theme, viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      await page.addInitScript((mode) => { localStorage.setItem("shards-theme", mode); localStorage.setItem("shards.project.n-project1.layout", '"board-section"'); }, theme);
      await installFixtures(page);
      await page.goto(`${baseUrl}/${route.hash}`);
      const ready = typeof route.ready === "string" ? page.getByText(route.ready, { exact: false }).first() : route.ready(page);
      await ready.waitFor({ state: "visible", timeout: 15_000 });
      await page.getByRole("navigation", { name: "Breadcrumb" }).waitFor({ state: "visible" });
      await settleForAxe(page);
      const baselineRows = await measureTaskRows(page);
      if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, `${route.name}-${theme}.png`), fullPage: true });
      const axe = new AxeBuilder({ page }).withTags(rules);
      const results = await axe.analyze();
      for (const violation of results.violations) {
        for (const node of violation.nodes) collected.push({ view: route.name, theme, rule: violation.id, target: normalizeTarget(node.target), impact: violation.impact, help: violation.help, detail: node.failureSummary, html: node.html });
      }

      const zoomStartedAt = performance.now();
      await zoomPage.goto(`${baseUrl}/${route.hash}`);
      const zoomReady = typeof route.ready === "string" ? zoomPage.getByText(route.ready, { exact: false }).first() : route.ready(zoomPage);
      await zoomReady.waitFor({ state: "visible", timeout: 15_000 });
      await zoomPage.getByRole("navigation", { name: "Breadcrumb" }).waitFor({ state: "visible" });
      await settleForZoom(zoomPage);
      for (const finding of await inspectZoom(zoomPage, baselineRows)) zoomCollected.push({ view: route.name, theme, ...finding });
      zoomPassDurationMs += performance.now() - zoomStartedAt;

      await context.close();
    }
    await zoomContext.close();
    for (const overlay of overlays) {
      const context = await browser.newContext({ colorScheme: theme, viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      await page.addInitScript((mode) => localStorage.setItem("shards-theme", mode), theme);
      await installFixtures(page);
      await page.goto(`${baseUrl}/#/today`);
      await page.getByText("Review accessibility evidence", { exact: false }).first().waitFor({ state: "visible", timeout: 15_000 });
      await page.getByRole("navigation", { name: "Breadcrumb" }).waitFor({ state: "visible" });
      await settleForAxe(page);
      await overlay.open(page);
      await overlay.ready(page).waitFor({ state: "visible" });
      if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, `${overlay.name}-${theme}.png`), fullPage: true });
      const results = await new AxeBuilder({ page }).withTags(rules).analyze();
      for (const violation of results.violations) for (const node of violation.nodes) collected.push({ view: overlay.name, theme, rule: violation.id, target: normalizeTarget(node.target), impact: violation.impact, help: violation.help, detail: node.failureSummary, html: node.html });
      await context.close();
    }
  }
} finally {
  await browser?.close();
  app.kill("SIGTERM");
}

await writeFile(zoomFindingsPath, `${JSON.stringify({ findings: zoomCollected }, null, 2)}\n`);

const key = (x) => `${x.view}\t${x.theme}\t${x.rule}\t${x.target}`;
const current = [...new Map(collected.map((x) => [key(x), x])).values()].sort((a, b) => key(a).localeCompare(key(b), "en"));
let baseline = [];
if (!updateBaseline) {
  try { baseline = JSON.parse(await readFile(baselinePath, "utf8")).violations ?? []; } catch {}
}
if (updateBaseline) {
  await writeFile(baselinePath, `${JSON.stringify({ violations: current.map(({ detail: _detail, html: _html, ...entry }) => entry) }, null, 2)}\n`);
  baseline = current;
}
const known = new Set(baseline.map(key));
const newHits = current.filter((x) => !known.has(key(x)));
const currentKeys = new Set(current.map(key));
const stale = baseline.filter((x) => !currentKeys.has(key(x)));
const summary = new Map();
for (const row of current) summary.set(row.rule, (summary.get(row.rule) ?? 0) + 1);
console.log("\nAxe violations by rule");
console.log("Rule                         Count");
for (const [rule, count] of [...summary].sort(([a], [b]) => a.localeCompare(b, "en"))) console.log(`${rule.padEnd(28)} ${count}`);
const worst = [...summary].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en")).slice(0, 3);
if (worst.length) console.log(`Worst rules: ${worst.map(([rule, count]) => `${rule} (${count})`).join(", ")}`);
console.log(`Total known violations: ${current.length}; new violations: ${newHits.length}`);
console.log(`stale baseline entries: ${stale.length}`);
console.log(`zoom findings: ${zoomCollected.length}`);
console.log(`zoom pass duration: ${(zoomPassDurationMs / 1000).toFixed(2)} s`);
console.log(`a11y scan duration: ${((performance.now() - a11yStartedAt) / 1000).toFixed(2)} s`);
if (current.length) {
  console.log("Current accessibility violations:");
  for (const hit of current) console.log(`${hit.view} / ${hit.theme} / ${hit.rule}: ${hit.target} — ${hit.help}; ${hit.detail}; ${hit.html}`);
}
if (newHits.length) {
  console.error("New accessibility violations:");
  for (const hit of newHits) console.error(`${hit.view} / ${hit.theme} / ${hit.rule}: ${hit.target} — ${hit.help}`);
  process.exitCode = 1;
}
if (zoomCollected.length) {
  console.error("Zoom findings:");
  for (const hit of zoomCollected) console.error(`${hit.view} / ${hit.theme} / ${hit.check} / ${hit.selector}: expected ${hit.expected}, actual ${hit.actual} — ${hit.detail}`);
  process.exitCode = 1;
}
