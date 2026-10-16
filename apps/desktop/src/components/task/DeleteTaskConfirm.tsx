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
import { usePendingDelete } from "./actions";

/**
 * "Delete task and its N sub-tasks?" (Todoist). Rendered once by the app shell; any delete of
 * a parent with open subtasks waits here. Deleting the parent alone would leave the children
 * pointing at a missing parent, so the default deletes them too.
 */
export function DeleteTaskConfirm() {
  const [req, setReq] = usePendingDelete();
  const n = req?.kids.length ?? 0;
  const close = () => setReq(null);
  return (
    <AlertDialog open={!!req} onOpenChange={(o) => !o && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete “{req?.task.title}” and its {n === 1 ? "sub-task" : `${n} sub-tasks`}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {n === 1 ? `“${req?.kids[0]?.title}” is still open.` : `${n} sub-tasks are still open.`} Undo restores every deleted file for a few seconds.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="outline"
            onClick={() => {
              req?.run(false);
              close();
            }}
          >
            Delete only the task
          </AlertDialogAction>
          <AlertDialogAction
            variant="destructive"
            autoFocus
            onClick={() => {
              req?.run(true);
              close();
            }}
          >
            Delete all
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
