/**
 * Detail-pane renderer for `?open=memory:<id>` (registered on import). Views in this area
 * import this module for its side effect; the shell should import it eagerly too so deep
 * links work before the Memories chunk loads.
 */
import { registerDetailRenderer, type DetailRendererProps } from "@/app/detail";
import { navigate, paths } from "@/lib/router";
import { useAllMemories } from "./hooks";
import { MemoryDetail } from "./MemoryDetail";

function MemoryPane({ id, onClose }: DetailRendererProps) {
  const all = useAllMemories().data ?? [];
  return <MemoryDetail id={id} all={all} onClose={onClose} onNavigate={(next) => navigate(paths.memories(next))} />;
}

registerDetailRenderer("memory", MemoryPane);
