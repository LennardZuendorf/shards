import { useQueryClient } from "@tanstack/react-query";
import type { MouseEvent, ReactNode } from "react";
import { openTask } from "@/app/detail";
import { qk } from "@/lib/query";
import { navigate, paths } from "@/lib/router";

/** Whether some cached list or detail already holds an entity with this id. */
function cachedTitle(client: ReturnType<typeof useQueryClient>, id: string): string | null | undefined {
  const key = id.startsWith("t-") ? qk.tasks.all : id.startsWith("m-") ? qk.memories.all : qk.notes.all;
  for (const [, data] of client.getQueriesData({ queryKey: key })) {
    const list = Array.isArray(data) ? data : data && typeof data === "object" ? [data] : [];
    for (const e of list as { id?: string; title?: string }[]) if (e?.id === id) return e.title ?? null;
  }
  return undefined;
}

/**
 * A bare id an agent wrote in prose (`t-DPRR`), linked when the app knows it: tasks open in the
 * detail pane, notes and memories navigate. An id nothing knows stays plain text.
 */
export function EntityIdLink({ id, children }: { id: string; children: ReactNode }) {
  const client = useQueryClient();
  const title = cachedTitle(client, id);
  if (title === undefined) return <>{children}</>;
  const href = id.startsWith("t-") ? `?open=task:${id}` : id.startsWith("m-") ? `#${paths.memories(id)}` : `#${paths.notes(id)}`;
  return (
    <a
      href={href}
      title={title ? `${title} · ${id}` : id}
      className="rounded-sm bg-primary/8 px-0.5 font-mono text-[0.92em] no-underline! hover:bg-primary/15"
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        if (e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        if (id.startsWith("t-")) openTask(id);
        else if (id.startsWith("m-")) navigate(paths.memories(id));
        else navigate(paths.notes(id));
      }}
    >
      {children}
    </a>
  );
}
