import { lazy, Suspense, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toDateKey } from "@/lib/dates";
import { useHotkey } from "@/lib/hotkeys";
import { useRoute } from "@/lib/router";
import { closeQuickAdd, openQuickAdd, useQuickAddState, type QuickAddDefaults } from "./quickadd-store";
import { useNow } from "@/lib/now";

const loadForm = () => import("./QuickAddForm");
const QuickAddForm = lazy(async () => ({ default: (await loadForm()).QuickAddForm }));

/** Defaults inferred from where Quick Add was opened (Todoist behaviour). */
function useRouteDefaults(): QuickAddDefaults {
  const r = useRoute();
  const now = useNow();
  return useMemo(() => {
    if (r.name === "project" && r.params.id) return { project: r.params.id };
    if (r.name === "label" && r.params.name) return { labels: [r.params.name] };
    if (r.name === "today") return { due: toDateKey(now) };
    return {};
  }, [r.name, r.params.id, r.params.name, now]);
}

/** Global Quick Add: `q` anywhere (outside inputs) or the + buttons; Enter adds, ⇧Enter adds and stays open. */
export function QuickAdd() {
  const { open, defaults, nonce } = useQuickAddState();
  const routeDefaults = useRouteDefaults();
  useHotkey("q", () => openQuickAdd(), { description: "Quick add task", group: "Tasks" });
  // Warm the chunk once the app is idle so the first `q` opens instantly.
  useEffect(() => {
    const t = setTimeout(() => void loadForm().catch(() => {}), 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && closeQuickAdd()}>
      <DialogContent
        showCloseButton={false}
        className="top-[16%] translate-y-0 gap-0 overflow-hidden p-0 shadow-elevation-3 sm:max-w-[640px]"
        onOpenAutoFocus={(e) => e.preventDefault()}
        // Escape first closes the autocomplete list (QuickAddForm), then the dialog.
        onEscapeKeyDown={(e) => {
          if (document.querySelector("[data-qa-suggest-open]")) e.preventDefault();
        }}
      >
        <DialogTitle className="sr-only">Quick add task</DialogTitle>
        <DialogDescription className="sr-only">Type a task with natural-language dates, #project, @labels and p1–p4.</DialogDescription>
        {open && (
          <Suspense fallback={<Skeleton className="m-4 h-24" />}>
            <QuickAddForm key={nonce} defaults={defaults ?? routeDefaults} onDone={closeQuickAdd} />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}
