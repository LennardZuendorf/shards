import { Kbd } from "@/components/shared/Kbd";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useHotkeyList } from "@/lib/hotkeys";
import { shortcutsStore } from "./ui-store";

/** `?` — every registered shortcut with a description, grouped. */
export function ShortcutsDialog() {
  const open = shortcutsStore.use();
  const list = useHotkeyList();
  const groups = new Map<string, typeof list>();
  for (const h of list) {
    const g = h.group ?? "General";
    groups.set(g, [...(groups.get(g) ?? []), h]);
  }
  return (
    <Dialog open={open} onOpenChange={shortcutsStore.set}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Shards is built to be driven from the keyboard.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[60vh] gap-5 overflow-y-auto pr-1 sm:grid-cols-2">
          {[...groups.entries()].map(([g, items]) => (
            <section key={g}>
              <h3 className="mb-1.5 text-micro font-semibold tracking-wide text-muted-foreground uppercase">{g}</h3>
              <ul className="space-y-1">
                {items.map((h) => (
                  <li key={h.keys} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-foreground/90">{h.description}</span>
                    <Kbd keys={h.keys} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
