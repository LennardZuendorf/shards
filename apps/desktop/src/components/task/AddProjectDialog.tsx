/** "New project" dialog: creates a `type: project` note, then opens it. */
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { noteNew } from "@/lib/api";
import { qk } from "@/lib/query";
import { navigate, paths } from "@/lib/router";

export function AddProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const client = useQueryClient();
  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    try {
      const note = await noteNew({ title: t, note_type: "project" });
      await client.invalidateQueries({ queryKey: qk.host.projects });
      toast.success(`Project “${t}” created`);
      onOpenChange(false);
      setTitle("");
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
          <DialogTitle>New project</DialogTitle>
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
