import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";

const settle = page => page.evaluate(async () => {
  await document.fonts.ready;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});

/** Geometry complements screenshots: AA checks cannot detect controls painted over task text. */
async function taskRowGeometry(row) {
  return row.evaluate(root => {
    const controls = [...root.querySelectorAll('button[aria-label="Set due date"], button[aria-label="Priority"], button[aria-label="More actions"]')];
    const rectOf = rect => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
    const visible = element => {
      for (let node = element; node && node !== root.parentElement; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      }
      return true;
    };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const text = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim() || !visible(node.parentElement)) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const raw of range.getClientRects()) {
        let rect = rectOf(raw);
        // Only compare painted text inside clipped labels, not intentionally elided tails.
        for (let parent = node.parentElement; parent && parent !== root; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          if ([style.overflowX, style.overflow].some(value => ["hidden", "clip"].includes(value))) {
            const bounds = parent.getBoundingClientRect();
            rect = { left: Math.max(rect.left, bounds.left), right: Math.min(rect.right, bounds.right), top: Math.max(rect.top, bounds.top), bottom: Math.min(rect.bottom, bounds.bottom) };
          }
        }
        if (rect.right > rect.left && rect.bottom > rect.top) text.push({ value: node.textContent.trim(), rect });
      }
    }
    const bounds = root.getBoundingClientRect();
    const titleRange = document.createRange();
    titleRange.selectNodeContents(root.querySelector("[data-task-title]"));
    const firstLine = [...titleRange.getClientRects()].find(rect => rect.width > 0 && rect.height > 0);
    const checkbox = root.querySelector('[role="checkbox"]').getBoundingClientRect();
    const centerY = rect => (rect.top + rect.bottom) / 2;
    return {
      controls: controls.filter(visible).map(button => ({ name: button.getAttribute("aria-label"), rect: rectOf(button.getBoundingClientRect()) })),
      text, row: rectOf(bounds), viewport: { width: innerWidth, height: innerHeight },
      firstLineCheckboxOffset: firstLine ? Math.abs((firstLine.top + firstLine.bottom) / 2 - (checkbox.top + checkbox.bottom) / 2) : null,
      firstLineCenter: firstLine ? centerY(firstLine) : null,
      checkboxCenter: centerY(checkbox),
      avatarCenters: [...root.querySelectorAll('[data-kind]')].filter(visible).map(element => centerY(element.getBoundingClientRect())),
    };
  });
}

export async function runFlintVisualQa({ browser, baseUrl, fixtures, installFixtures, screenshotDir }) {
  const output = screenshotDir ?? "/private/tmp/shards-flint-visual-fixes";
  await mkdir(output, { recursive: true });
  const failures = [];
  let passed = 0;
  const check = async (name, run) => {
    if (process.env.FLINT_VISUAL_FILTER && !name.includes(process.env.FLINT_VISUAL_FILTER)) return;
    try { await run(); passed++; console.log(`Visual PASS: ${name}`); }
    catch (error) { failures.push({ name, error }); console.error(`Visual FAIL: ${name}\n${error.stack ?? error}`); }
  };
  const create = async ({ width = 1280, mode = "light", hash = "#/today", storage = {}, data = structuredClone(fixtures), waitBreadcrumb = true } = {}) => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: mode, reducedMotion: "reduce" });
    const page = await context.newPage(); page.setDefaultTimeout(5_000);
    await page.addInitScript(storage => {
      for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value);
    }, { "shards-theme": mode, "shards-stone": "flint", ...storage });
    await installFixtures(page, { data });
    await page.goto(`${baseUrl}/${hash}`);
    if (waitBreadcrumb) await page.getByRole("navigation", { name: "Breadcrumb" }).waitFor();
    await settle(page);
    return { context, page };
  };

  for (const mode of ["light", "dark"]) for (const width of [1280, 900, 720]) for (const density of ["comfortable", "compact"]) {
    await check(`task hover and keyboard actions preserve metadata · ${mode}/${width}/${density}`, async () => {
      const data = structuredClone(fixtures);
      data.me = "codex";
      data.members = [{ id: "codex", name: "Codex", kind: "human" }, { id: "alex", name: "Alex", kind: "human" }];
      data.tasks = [{ ...data.tasks[0], status: "claimed", owner: "codex", claimed_by: "alex", priority: "normal", tags: ["administration", "planning"], due: "2026-10-28T18:30", deadline: "2026-10-30", recur: "FREQ=DAILY;INTERVAL=1", recur_from: "due", section: "Planning" }];
      data.tasks.push({ ...data.tasks[0], id: "t-domain", title: "Renew the shards.app domain", status: "open", claimed_by: null, tags: ["admin"], project: null, section: null, due: "2026-10-28", recur: null, recur_from: null });
      const { context, page } = await create({ width, mode, data, storage: { "shards.view.today": JSON.stringify({ group: "default", sort: "manual", dir: "asc", density, filters: {} }) } });
      try {
        for (const id of ["t-a11y1", "t-domain"]) {
          const row = page.locator(`[data-task-row="${id}"]`);
          await row.waitFor();
          for (const interaction of ["hover", "keyboard"]) {
            if (interaction === "hover") await row.hover();
            else { await page.mouse.move(0, 0); await row.focus(); await page.keyboard.press("Tab"); }
            await settle(page);
            const action = row.getByRole("button", { name: "More actions", exact: true });
            await expect(action).toBeVisible();
            const geometry = await taskRowGeometry(row);
            assert.ok(geometry.firstLineCheckboxOffset !== null && geometry.firstLineCheckboxOffset <= 4, `title first line must align with its checkbox within 4px; received ${geometry.firstLineCheckboxOffset}px`);
            const actionCenters = geometry.controls.map(control => (control.rect.top + control.rect.bottom) / 2);
            for (const center of [geometry.checkboxCenter, ...actionCenters]) {
              assert.ok(Math.abs(center - geometry.firstLineCenter) <= 2, `first-line content and row actions must share a vertical center within 2px; title=${geometry.firstLineCenter}, item=${center}`);
            }
            const intersections = [];
            const textIntersections = [];
            for (let i = 0; i < geometry.text.length; i++) for (let j = i + 1; j < geometry.text.length; j++) {
              const a = geometry.text[i], b = geometry.text[j];
              const x = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
              const y = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
              if (x > 1 && y > 1) textIntersections.push(`“${a.value}” overlaps “${b.value}” by ${Math.round(x)}×${Math.round(y)}px`);
            }
            for (const control of geometry.controls) {
              assert.ok(control.rect.left >= 0 && control.rect.right <= geometry.viewport.width + 1, `${control.name} must remain horizontally reachable`);
              assert.ok(control.rect.top >= geometry.row.top - 1 && control.rect.bottom <= geometry.row.bottom + 1, `${control.name} must fit within its row`);
              for (const text of geometry.text) {
                const x = Math.min(control.rect.right, text.rect.right) - Math.max(control.rect.left, text.rect.left);
                const y = Math.min(control.rect.bottom, text.rect.bottom) - Math.max(control.rect.top, text.rect.top);
                if (x > 1 && y > 1) intersections.push(`${control.name} overlaps “${text.value}” by ${Math.round(x)}×${Math.round(y)}px`);
              }
            }
            await page.screenshot({ path: path.join(output, `task-${id}-${interaction}-${mode}-${width}-${density}.png`) });
            assert.equal(geometry.controls.length, 3, "date, priority and menu controls must stay reachable");
            assert.deepEqual(intersections, [], "row actions must reserve space rather than paint over readable metadata");
            assert.deepEqual(textIntersections, [], "task titles and metadata must not paint over each other");
          }
        }
      } finally { await context.close(); }
    });
  }

  for (const mode of ["light", "dark"]) for (const width of [1280, 900, 720]) for (const density of ["comfortable", "compact"]) await check(`inline avatar aligns with single-line task · ${mode}/${width}/${density}`, async () => {
    const data = structuredClone(fixtures);
    data.me = "codex";
    data.members = [{ id: "codex", name: "Codex", kind: "human" }, { id: "alex", name: "Alex", kind: "human" }];
    data.tasks = [{ ...data.tasks[0], id: "t-avatar", title: "Review worker avatar alignment", status: "claimed", owner: "codex", claimed_by: "alex", priority: "normal", tags: [], due: null, deadline: null, recur: null, recur_from: null, project: null, section: null }];
    const { context, page } = await create({ width, mode, data, hash: "#/inbox", storage: { "shards.view.inbox": JSON.stringify({ group: "default", sort: "manual", dir: "asc", density, filters: {} }) } });
    try {
      const row = page.locator('[data-task-row="t-avatar"]');
      await row.waitFor(); await row.hover(); await settle(page);
      const geometry = await taskRowGeometry(row);
      assert.equal(geometry.avatarCenters.length, 1, "the focused one-line case must include one owner/delegate avatar");
      assert.ok(Math.abs(geometry.avatarCenters[0] - geometry.firstLineCenter) <= 2, `single-line avatar must align with title within 2px; title=${geometry.firstLineCenter}, avatar=${geometry.avatarCenters[0]}`);
      for (const control of geometry.controls) assert.ok(Math.abs((control.rect.top + control.rect.bottom) / 2 - geometry.firstLineCenter) <= 2, `${control.name} must align with the title first line`);
      if (mode === "dark" && width === 1280 && density === "comfortable") await row.screenshot({ path: path.join(output, "row-after-dark.png") });
    } finally { await context.close(); }
  });

  for (const mode of ["light", "dark"]) for (const width of [1280, 720]) await check(`task detail header keeps even control spacing · ${mode}/${width}`, async () => {
    const data = structuredClone(fixtures);
    data.tasks[0].path = "/fixture/tasks/t-a11y1.md";
      const { context, page } = await create({ width, mode, hash: "#/today?open=task:t-a11y1", data, waitBreadcrumb: false });
    try {
      const detail = page.locator("[data-task-detail]");
      await detail.waitFor();
      const geometry = await detail.locator(":scope > div").first().evaluate(header => {
        const box = selector => {
          const rect = header.querySelector(selector).getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
        };
        const crumb = box('button');
        const more = box('button[aria-label="More actions"]');
        const openIn = box('[data-slot="button-group"]');
        const close = box('button[aria-label="Close details"]');
        const shell = header.getBoundingClientRect();
        const center = rect => (rect.top + rect.bottom) / 2;
        return { insetLeft: crumb.left - shell.left, insetRight: shell.right - close.right, more, openIn, close, centers: [center(more), center(openIn), center(close)] };
      });
      assert.ok(Math.abs(geometry.insetLeft - 16) <= 1, `detail header left inset must be 16px; received ${geometry.insetLeft}px`);
      assert.ok(Math.abs(geometry.insetRight - 16) <= 1, `detail header right inset must be 16px; received ${geometry.insetRight}px`);
      for (const center of geometry.centers) assert.ok(Math.abs(center - geometry.centers[0]) <= 1, `detail header controls must share a center; received ${geometry.centers}`);
      const gaps = [geometry.openIn.left - geometry.more.right, geometry.close.left - geometry.openIn.right];
      for (const gap of gaps) assert.ok(Math.abs(gap - 8) <= 1, `detail header control groups must have an 8px gap; received ${gaps}`);
      await page.screenshot({ path: path.join(output, `task-detail-header-${mode}-${width}.png`) });
      if (mode === "dark" && width === 1280) await detail.locator(":scope > div").first().screenshot({ path: path.join(output, "header-after-dark.png") });
    } finally { await context.close(); }
  });

  const noteData = () => {
    const data = structuredClone(fixtures);
    const note = (path, folder, title, tags) => ({ path, folder, title, tags, abs_path: `/fixture/${path}`, id: null, modified: "2026-10-28T09:00:00Z", body: `${title} body` });
    data.notes = [note("projects/alpha/plan.md", "projects/alpha", "Alpha plan", ["work/launch"]), note("projects/beta/notes.md", "projects/beta", "Beta notes", ["work/research"]), note("personal.md", "", "Personal notes", ["personal"])];
    return data;
  };
  for (const mode of ["light", "dark"]) for (const width of [1280, 900, 720]) await check(`Notes uses keyboard-accessible folder/tag tabs and preserves filters · ${mode}/${width}`, async () => {
    const { context, page } = await create({ width, mode, data: noteData(), hash: "#/notes" });
    try {
      const folders = page.getByRole("tab", { name: "Folders", exact: true });
      const tags = page.getByRole("tab", { name: "Tags", exact: true });
      await expect(folders).toBeVisible(); await expect(tags).toBeVisible();
      await expect(page.getByRole("tabpanel")).toHaveCount(1);
      await expect(folders).toHaveAttribute("aria-selected", "true");
      let panel = page.getByRole("tabpanel");
      await expect(panel.getByRole("tree")).toHaveCount(1);
      await expect(panel.locator('[data-id="f:projects"]')).toContainText("2");
      await panel.locator('[data-id="f:projects"]').click();
      // Selection filters, while Right expands the existing folder keyboard tree.
      await panel.locator('[data-id="f:projects"]').press("ArrowRight");
      await expect(panel.locator('[data-id="f:projects/alpha"]')).toBeVisible();
      await expect(panel.locator('[data-id="f:projects/alpha"]')).toContainText("1");
      await panel.locator('[data-id="f:projects/alpha"]').click();
      await expect(page.getByRole("button", { name: /Alpha plan/ })).toBeVisible();
      await expect(page.getByRole("button", { name: /Beta notes/ })).toHaveCount(0);
      await folders.focus(); await page.keyboard.press("ArrowRight");
      await expect(tags).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("tabpanel")).toHaveCount(1);
      panel = page.getByRole("tabpanel");
      await expect(panel.locator('[data-id="f:projects"]')).toHaveCount(0);
      await expect(panel.locator('[data-id="t:work"]')).toContainText("2");
      await panel.locator('[data-id="t:work"]').press("ArrowRight");
      await expect(panel.locator('[data-id="t:work/launch"]')).toBeVisible();
      await expect(panel.locator('[data-id="t:work/launch"]')).toContainText("1");
      await panel.locator('[data-id="t:work/launch"]').click();
      await expect(page.getByRole("button", { name: /Alpha plan/ })).toBeVisible();
      await expect(page.getByRole("button", { name: /Personal notes/ })).toHaveCount(0);
      await page.screenshot({ path: path.join(output, `notes-tags-${mode}-${width}.png`) });
      await page.reload(); await page.getByRole("tab", { name: "Tags", exact: true }).waitFor();
      await expect(page.getByRole("tab", { name: "Tags", exact: true })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("button", { name: /Alpha plan/ })).toBeVisible();
      await expect(page.getByRole("button", { name: /Beta notes/ })).toHaveCount(0);
      await page.getByRole("tab", { name: "Folders", exact: true }).click();
      await expect(page.getByRole("tabpanel").locator('[data-id="f:projects/alpha"]')).toHaveAttribute("aria-selected", "true");
      await page.screenshot({ path: path.join(output, `notes-folders-${mode}-${width}.png`) });
    } finally { await context.close(); }
  });
  console.log(`Flint visual regressions: ${passed} passed; ${failures.length} failed`);
  if (failures.length) throw new AggregateError(failures.map(item => item.error), "Flint visual regressions failed");
}
