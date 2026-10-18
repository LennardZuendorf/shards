/** Project "…" / context menu items and the rename + delete dialogs (see project-actions.ts). */
import { ArchiveIcon, ArchiveRestoreIcon, CheckIcon, PaletteIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useState, type ComponentType, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { entityColor } from "@/lib/color";
import { useProjectMetaSupported } from "@/lib/hooks";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import { NEEDS_HOST, PROJECT_COLORS, useArchiveProject, useDeleteProject, useUpdateProject, type ProjectDialog } from "./project-actions";

/* ------------------------------------------------------------------ menus */

interface Kit {
  Item: ComponentType<{ onSelect?: (e: Event) => void; className?: string; children?: ReactNode; variant?: "default" | "destructive"; disabled?: boolean }>;
  Sep: ComponentType;
  Sub: ComponentType<{ children?: ReactNode }>;
  SubTrigger: ComponentType<{ className?: string; children?: ReactNode; disabled?: boolean }>;
  SubContent: ComponentType<{ className?: string; children?: ReactNode }>;
}

const DROPDOWN: Kit = {
  Item: DropdownMenuItem as Kit["Item"],
  Sep: DropdownMenuSeparator,
  Sub: DropdownMenuSub,
  SubTrigger: DropdownMenuSubTrigger as Kit["SubTrigger"],
  SubContent: DropdownMenuSubContent,
};
const CONTEXT: Kit = {
  Item: ContextMenuItem as Kit["Item"],
  Sep: ContextMenuSeparator,
  Sub: ContextMenuSub,
  SubTrigger: ContextMenuSubTrigger as Kit["SubTrigger"],
  SubContent: ContextMenuSubContent,
};

export function ProjectMenuItems({
  project,
  kind,
  onDialog,
}: {
  project: Project;
  kind: "dropdown" | "context";
  onDialog: (d: ProjectDialog) => void;
}) {
  const K = kind === "dropdown" ? DROPDOWN : CONTEXT;
  const supported = useProjectMetaSupported();
  const update = useUpdateProject();
  const archive = useArchiveProject();
  const current = (project.color ?? "").toLowerCase();
  return (
    <>
      <K.Item className="gap-2" disabled={!supported} onSelect={() => onDialog({ kind: "rename", project })}>
        <PencilIcon /> Rename
      </K.Item>
      <K.Sub>
        <K.SubTrigger className={cn("gap-2", !supported && "pointer-events-none opacity-50")} disabled={!supported}>
          <PaletteIcon /> Color
        </K.SubTrigger>
        <K.SubContent className="w-44">
          {PROJECT_COLORS.map((c) => (
            <K.Item key={c} className="gap-2 capitalize" onSelect={() => update.mutate({ id: project.id, set: { color: c } })}>
              <span className="size-3 rounded-full" style={{ background: entityColor(project.id, c) }} />
              {c}
              {current === c && <CheckIcon className="ml-auto" />}
            </K.Item>
          ))}
        </K.SubContent>
      </K.Sub>
      <K.Item className="gap-2" disabled={!supported} onSelect={() => archive(project, !project.archived)}>
        {project.archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />} {project.archived ? "Unarchive" : "Archive"}
      </K.Item>
      {!supported && <div className="px-2 pb-1 text-[11px] leading-snug text-muted-foreground">{NEEDS_HOST}</div>}
      <K.Sep />
      <K.Item variant="destructive" className="gap-2" onSelect={() => onDialog({ kind: "delete", project })}>
        <Trash2Icon /> Delete project…
      </K.Item>
    </>
  );
}

/** The rename and delete dialogs for a `ProjectDialog` state. */
export function ProjectDialogs({ dialog, onClose }: { dialog: ProjectDialog; onClose: () => void }) {
  return (
    <>
      <RenameProjectDialog project={dialog?.kind === "rename" ? dialog.project : null} onClose={onClose} />
      <DeleteProjectDialog project={dialog?.kind === "delete" ? dialog.project : null} onClose={onClose} />
    </>
  );
}

function RenameProjectDialog({ project, onClose }: { project: Project | null; onClose: () => void }) {
  return (
    <Dialog open={!!project} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename project</DialogTitle>
          <DialogDescription>Changes the title in the project note. Tasks keep their link.</DialogDescription>
        </DialogHeader>
        {project && <RenameForm key={project.id} project={project} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function RenameForm({ project, onClose }: { project: Project; onClose: () => void }) {
  const [title, setTitle] = useState(project.title);
  const update = useUpdateProject();
  const save = () => {
    const t = title.trim();
    if (!t) return;
    if (t !== project.title) update.mutate({ id: project.id, set: { title: t } });
    onClose();
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Project name" className="h-9" />
      <DialogFooter className="mt-4">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!title.trim()}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

function DeleteProjectDialog({ project, onClose }: { project: Project | null; onClose: () => void }) {
  const del = useDeleteProject();
  const n = project?.open_count ?? 0;
  return (
    <AlertDialog open={!!project} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{project?.title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {n ? `Its ${n} open task${n > 1 ? "s" : ""} move to the Inbox. ` : ""}The project note is deleted from the vault. You can undo this for a few seconds.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              if (project) del.mutate(project);
              onClose();
            }}
          >
            Delete project
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
