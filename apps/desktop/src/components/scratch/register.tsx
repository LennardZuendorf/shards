/** Detail-pane renderer for `?open=scratch:<agent>/<name>` (registered on import). */
import { registerDetailRenderer, type DetailRendererProps } from "@/app/detail";
import { EmptyState } from "@/components/shared/EmptyState";
import { FileTextIcon } from "lucide-react";
import { parseScratchKey } from "./scratch-utils";
import { ScratchViewer } from "./ScratchViewer";

function ScratchPane({ id, onClose }: DetailRendererProps) {
  const key = parseScratchKey(id);
  if (!key) return <EmptyState compact icon={FileTextIcon} tone="muted" title="Bad scratchpad address" description={id} />;
  return <ScratchViewer agent={key.agent} name={key.name} onClose={onClose} />;
}

registerDetailRenderer("scratch", ScratchPane);
