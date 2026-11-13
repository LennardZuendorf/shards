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
import { usePendingTakeBack } from "./actions";

/**
 * "Take back from claude? It stops working on it." Rendered once by the app shell; dropping an
 * agent-held card on To do waits here before the agent's claim is released.
 */
export function TakeBackConfirm() {
  const [req, setReq] = usePendingTakeBack();
  const close = () => setReq(null);
  return (
    <AlertDialog open={!!req} onOpenChange={(o) => !o && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Take back from {req?.task.claimed_by}?</AlertDialogTitle>
          <AlertDialogDescription>It stops working on it.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              req?.run();
              close();
            }}
          >
            Take back
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
