/** Label "…" menu items and the rename/merge + delete dialogs (see label-actions.ts). */
import { PencilIcon, StarIcon, StarOffIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useLabels } from "@/lib/hooks";
import { navigate, paths } from "@/lib/router";
import { cleanLabel, setFavoriteLabel, useFavoriteLabels, useLabelActions } from "./label-actions";

export type LabelDialog = { kind: "rename" | "delete"; name: string } | null;

export function LabelMenuItems({ name, onDialog }: { name: string; onDialog: (d: LabelDialog) => void }) {
  const fav = useFavoriteLabels().includes(name);
  return (
    <>
      <DropdownMenuItem onSelect={() => setFavoriteLabel(name, !fav)} className="gap-2">
        {fav ? <StarOffIcon /> : <StarIcon />} {fav ? "Remove from favourites" : "Add to favourites"}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onDialog({ kind: "rename", name })} className="gap-2">
        <PencilIcon /> Rename or merge…
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onSelect={() => onDialog({ kind: "delete", name })} className="gap-2">
        <Trash2Icon /> Delete label…
      </DropdownMenuItem>
    </>
  );
}

export function LabelDialogs({ dialog, onClose, onRenamed }: { dialog: LabelDialog; onClose: () => void; onRenamed?: (from: string, to: string) => void }) {
  return (
    <>
      <RenameLabelDialog name={dialog?.kind === "rename" ? dialog.name : null} onClose={onClose} onRenamed={onRenamed} />
      <DeleteLabelDialog name={dialog?.kind === "delete" ? dialog.name : null} onClose={onClose} />
    </>
  );
}

function RenameLabelDialog({ name, onClose, onRenamed }: { name: string | null; onClose: () => void; onRenamed?: (from: string, to: string) => void }) {
  const labels = useLabels();
  const favs = useFavoriteLabels();
  const actions = useLabelActions();
  const [value, setValue] = useState<{ for: string | null; text: string }>({ for: null, text: "" });
  const text = value.for === name ? value.text : (name ?? "");
  const to = cleanLabel(text);
  const merge = !!to && to !== name && labels.some((l) => l.name === to);
  const count = labels.find((l) => l.name === name)?.count ?? 0;
  const submit = async () => {
    if (!name || !to || to === name) return onClose();
    onClose();
    if (await actions.rename(name, to, merge)) {
      if (favs.includes(name)) {
        setFavoriteLabel(name, false);
        setFavoriteLabel(to, true);
      }
      onRenamed?.(name, to);
    }
  };
  return (
    <Dialog open={!!name} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename @{name}</DialogTitle>
            <DialogDescription>
              Renames the label on every task that carries it ({count} open). Type an existing label to merge the two.
            </DialogDescription>
          </DialogHeader>
          <Input autoFocus className="my-4" value={text} onChange={(e) => setValue({ for: name, text: e.target.value })} aria-label="New label name" />
          {merge && <p className="-mt-2 mb-3 text-xs text-warning">@{to} already exists: the two labels merge into @{to}.</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!to || to === name}>
              {merge ? "Merge" : "Rename"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteLabelDialog({ name, onClose }: { name: string | null; onClose: () => void }) {
  const labels = useLabels();
  const actions = useLabelActions();
  const count = labels.find((l) => l.name === name)?.count ?? 0;
  return (
    <AlertDialog open={!!name} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete @{name}?</AlertDialogTitle>
          <AlertDialogDescription>
            The label is removed from every task that carries it ({count} open). The tasks stay. You can undo this for a few seconds.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              const n = name;
              onClose();
              if (!n) return;
              void actions.remove(n).then((ok) => {
                if (ok) setFavoriteLabel(n, false);
                if (ok && location.hash.startsWith(`#${paths.label(n)}`)) navigate(paths.inbox());
              });
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
