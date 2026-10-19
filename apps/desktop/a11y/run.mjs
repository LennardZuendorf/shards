import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const a11yDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(a11yDir, "..");
const baselinePath = path.join(root, "a11y-baseline.json");
const fixtures = JSON.parse(await readFile(path.join(a11yDir, "fixtures.json"), "utf8"));
const updateBaseline = process.argv.includes("--update-baseline");
const screenshotDir = process.env.A11Y_SCREENSHOT_DIR;
if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
const rules = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const normalizeTarget = (target) => target
  .map((part) => part.replace(/#radix-[^ ]+/g, "#radix-id").replace(/\[aria-controls="[^"]+"\]/g, '[aria-controls="radix-id"]'))
  .join(" ");

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
});

const routes = [
  { name: "tasks-list", hash: "#/today", ready: "Review accessibility evidence" },
  { name: "tasks-board", hash: "#/project/n-project1", ready: "Review accessibility evidence" },
  { name: "memories", hash: "#/memories", ready: "Keyboard navigation notes" },
];
const collected = [];
let browser;
try {
  await waitForApp();
  browser = await chromium.launch({ headless: true });
  for (const theme of ["light", "dark"]) {
    for (const route of routes) {
      const context = await browser.newContext({ colorScheme: theme, viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      await page.addInitScript((mode) => localStorage.setItem("shards-theme", mode), theme);
      await page.route("**/api/**", async (intercept) => {
        const url = new URL(intercept.request().url());
        const tool = url.pathname.split("/").at(-1);
        let value = [];
        if (tool === "shards_task_list") value = fixtures.tasks;
        else if (tool === "shards_note_list") value = [{ id: "n-project1", type: "project", title: fixtures.project.title, tags: [], owner: null, created: null, updated: null, slug: fixtures.project.slug, color: fixtures.project.color }, { id: "n-note1", type: "note", title: "Accessibility plan", tags: ["a11y"], owner: null, created: null, updated: null }];
        else if (tool === "shards_memory_list") value = fixtures.memories;
        else if (tool === "shards_search") value = fixtures.search;
        else if (tool === "host_projects") value = [fixtures.project];
        else if (tool === "host_members") value = fixtures.members;
        else if (tool === "host_notes_browse") value = fixtures.notes;
        else if (tool === "host_status") value = { vault: "/fixture", config_path: null, me: "codex", version: "test", spaces: {}, counts: {} };
        else if (tool === "host_dashboard") value = {};
        await intercept.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ value, list: Array.isArray(value) }) });
      });
      await page.goto(`${baseUrl}/${route.hash}`);
      await page.getByText(route.ready, { exact: false }).first().waitFor({ state: "visible", timeout: 15_000 });
      await page.getByRole("navigation", { name: "Breadcrumb" }).waitFor({ state: "visible" });
      await settleForAxe(page);
      if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, `${route.name}-${theme}.png`), fullPage: true });
      const axe = new AxeBuilder({ page }).withTags(rules);
      const results = await axe.analyze();
      for (const violation of results.violations) {
        for (const node of violation.nodes) collected.push({ view: route.name, theme, rule: violation.id, target: normalizeTarget(node.target), impact: violation.impact, help: violation.help, detail: node.failureSummary, html: node.html });
      }

      // Exercise the command palette in both themes with its documented shortcut.
      await context.close();
    }
    for (const overlay of ["command-palette"]) {
      const context = await browser.newContext({ colorScheme: theme, viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      await page.addInitScript((mode) => localStorage.setItem("shards-theme", mode), theme);
      await page.route("**/api/**", async (intercept) => {
        const tool = new URL(intercept.request().url()).pathname.split("/").at(-1);
        const value = tool === "shards_task_list" ? fixtures.tasks : tool === "host_projects" ? [fixtures.project] : tool === "host_members" ? fixtures.members : [];
        await intercept.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ value, list: Array.isArray(value) }) });
      });
      await page.goto(`${baseUrl}/#/today`);
      await page.getByText("Review accessibility evidence", { exact: false }).first().waitFor({ state: "visible", timeout: 15_000 });
      await page.getByRole("navigation", { name: "Breadcrumb" }).waitFor({ state: "visible" });
      await settleForAxe(page);
      await page.keyboard.press("Control+k");
      await page.getByRole("dialog", { name: "Command menu" }).waitFor({ state: "visible" });
      if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, `${overlay}-${theme}.png`), fullPage: true });
      const results = await new AxeBuilder({ page }).withTags(rules).analyze();
      for (const violation of results.violations) for (const node of violation.nodes) collected.push({ view: overlay, theme, rule: violation.id, target: normalizeTarget(node.target), impact: violation.impact, help: violation.help, detail: node.failureSummary, html: node.html });
      await context.close();
    }
  }
} finally {
  await browser?.close();
  app.kill("SIGTERM");
}

const key = (x) => `${x.view}\t${x.theme}\t${x.rule}\t${x.target}`;
const current = [...new Map(collected.map((x) => [key(x), x])).values()].sort((a, b) => key(a).localeCompare(key(b), "en"));
let baseline = [];
if (!updateBaseline) {
  try { baseline = JSON.parse(await readFile(baselinePath, "utf8")).violations ?? []; } catch {}
}
if (updateBaseline) {
  await writeFile(baselinePath, `${JSON.stringify({ violations: current.map(({ detail, html, ...entry }) => entry) }, null, 2)}\n`);
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
if (current.length) {
  console.log("Current accessibility violations:");
  for (const hit of current) console.log(`${hit.view} / ${hit.theme} / ${hit.rule}: ${hit.target} — ${hit.help}; ${hit.detail}; ${hit.html}`);
}
if (newHits.length) {
  console.error("New accessibility violations:");
  for (const hit of newHits) console.error(`${hit.view} / ${hit.theme} / ${hit.rule}: ${hit.target} — ${hit.help}`);
  process.exitCode = 1;
}
