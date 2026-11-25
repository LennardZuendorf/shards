/**
 * R38 — Upcoming's week columns follow the week-start setting, asserted on the rendered headers.
 *
 * The view has no host here, so the data hooks, the list and the toolbars are stubbed and the
 * assertions read the strip's own `data-day` buttons and weekday labels: what an operator sees.
 * The negative control for this file is a temporary `weekStartsOn: 1` in the view — the Sunday
 * case below then fails, which is what proves the override is wired rather than the default.
 */
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/hooks", () => ({
  useTasks: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useMe: () => null,
  useProjects: () => ({ data: [], isLoading: false, error: null }),
}));

// Thursday: from it, a Sunday week and a Monday week begin on different days.
vi.mock("@/lib/now", () => ({ useTodayKey: () => "2026-10-15" }));

vi.mock("@/lib/scope", () => ({ useTaskScope: () => ["everyone", vi.fn()] }));
vi.mock("@/components/task/hooks", () => ({
  useViewOptions: () => ({ options: { filters: [] }, ctx: {}, set: vi.fn(), setFilters: vi.fn() }),
}));
vi.mock("@/lib/view-options", () => ({ applyViewOptions: (groups: unknown) => groups, isStaticGrouping: () => false }));
vi.mock("@/components/task/others-group", () => ({ useOthersGroup: () => null }));
vi.mock("@/components/task/DisplayMenu", () => ({ DisplayMenu: () => null }));
vi.mock("@/components/task/FilterMenu", () => ({ FilterMenu: () => null }));
vi.mock("@/components/task/ScopeToggle", () => ({ ScopeToggle: () => null }));
vi.mock("@/components/task/FilterChips", () => ({ FilterChips: () => null, FilteredToZero: () => null }));
vi.mock("@/components/task/TaskList", () => ({ TaskList: () => null }));
vi.mock("@/components/task/TaskView", () => ({
  TaskView: ({ title, below, toolbar, children }: { title: ReactNode; below?: ReactNode; toolbar?: ReactNode; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      <div>{below}</div>
      <div>{toolbar}</div>
      {children}
    </div>
  ),
  TaskListSkeleton: () => null,
  TaskQueryError: () => null,
}));

import { resetLocalePrefs, setWeekStart } from "@/lib/locale";
import { UpcomingView } from "./UpcomingView";

/** The strip's day headers, in render order. */
const columnDays = (html: string) => [...html.matchAll(/data-day="([\d-]+)"/g)].map((m) => m[1]);
/** The strip's weekday labels, in render order. */
const columnWeekdays = (html: string) => [...html.matchAll(/uppercase opacity-80">(\w{3})</g)].map((m) => m[1]);

const render = () => renderToStaticMarkup(<UpcomingView />);

beforeEach(() => {
  resetLocalePrefs();
});

describe("Upcoming's week columns follow the week start (R38)", () => {
  it("begins the week on Sunday when the setting says Sunday", () => {
    setWeekStart(0);
    const html = render();
    expect(columnDays(html)).toEqual([
      "2026-10-11",
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
    ]);
    expect(columnWeekdays(html)).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  });

  it("begins it on Monday when the setting says Monday", () => {
    setWeekStart(1);
    const html = render();
    expect(columnDays(html)).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
    expect(columnWeekdays(html)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });
});
