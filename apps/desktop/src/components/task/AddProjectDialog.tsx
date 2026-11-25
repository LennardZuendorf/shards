/** "Add project" dialog: creates a `type: project` note (with an optional colour), then opens it. */
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ORDER_STEP } from "@/components/task/model";
import { PROJECT_COLORS } from "@/components/task/project-actions";
import { hostProjectUpdate, noteNew } from "@/lib/api";
import { entityColor } from "@/lib/color";
import { qk } from "@/lib/query";
import { navigate, paths } from "@/lib/router";
import type { Project } from "@/lib/types";

export function AddProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [title, setTitle] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const client = useQueryClient();
  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    try {
      const note = await noteNew({ title: t, note_type: "project" });
      // The colour and the sidebar `order` are frontmatter keys, so they land as two more writes.
      // Neither may lose the new project: a host without `host_project_update` keeps it colourless.
      if (color) await hostProjectUpdate(note.id, { color }).catch(() => {});
      // A ranked sidebar sorts unranked rows last, so a new project lands at the bottom of a
      // list somebody has already dragged; an unranked list keeps the host's title order.
      const rows = client.getQueryData<Project[]>(qk.host.projects) ?? [];
      if (rows.some((p) => typeof p.order === "number")) {
        const last = Math.max(0, ...rows.map((p) => (typeof p.order === "number" && Number.isFinite(p.order) ? p.order : 0)));
        await hostProjectUpdate(note.id, { order: last + ORDER_STEP }).catch(() => {});
      }
      await client.invalidateQueries({ queryKey: qk.host.projects });
      toast.success(`Project “${t}” created`);
      onOpenChange(false);
      setTitle("");
      setColor(null);
      navigate(paths.project(note.id));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add project</DialogTitle>
          <DialogDescription>Projects are notes with type “project” in your vault.</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="Project name"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">Colour</legend>
          {PROJECT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              aria-pressed={color === c}
              onClick={() => setColor(color === c ? null : c)}
              className={
                color === c
                  ? "size-5 rounded-full ring-2 ring-ring ring-offset-2 ring-offset-background"
                  : "size-5 rounded-full ring-1 ring-border hover:ring-ring"
              }
              style={{ background: entityColor(title || "project", c) }}
            />
          ))}
        </fieldset>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!title.trim() || busy}>
            Add project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
