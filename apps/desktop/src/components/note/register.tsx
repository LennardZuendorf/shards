/** Detail-pane renderer for `?open=note:<id>` (registered on import): the read-only reader. */
import { registerDetailRenderer, type DetailRendererProps } from "@/app/detail";
import { EmptyState } from "@/components/shared/EmptyState";
import { useNoteFiles } from "@/lib/hooks";
import { FileTextIcon } from "lucide-react";
import { NoteFileReader } from "./NoteFileReader";

function NotePane({ id, onClose }: DetailRendererProps) {
  const files = useNoteFiles();
  const file = files.data?.find((f) => f.id === id);
  if (!file) {
    return files.isLoading ? null : <EmptyState compact icon={FileTextIcon} tone="muted" title="Note not found" description={`${id} may have been deleted.`} />;
  }
  return <NoteFileReader path={file.path} fallback={file} onClose={onClose} />;
}

registerDetailRenderer("note", NotePane);
