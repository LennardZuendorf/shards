/** Memory data hooks + optimistic mutations (list/detail caches, Undo toasts). */
import { useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  hostMemoryForget,
  hostMemorySetBody,
  hostRestore,
  memoryAppend,
  memoryGet,
  memoryList,
  memoryNew,
  memoryUpdate,
  tagSpec,
  type MemoryNewArgs,
  type MemoryUpdateArgs,
} from "@/lib/api";
import { applyTagSpec, qk, toastWithUndo } from "@/lib/query";
import type { Memory } from "@/lib/types";
import { describeError, isUnknownTool } from "@/components/agent/host-safe";

/** Every memory (expired + superseded included) so filters and counts are client-side. */
export const ALL_MEMORIES_ARGS = { include_expired: true, include_superseded: true, limit: 2000, sort: "updated" } as const;

export function useAllMemories(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.memories.list(ALL_MEMORIES_ARGS),
    queryFn: () => memoryList({ ...ALL_MEMORIES_ARGS }),
    enabled: opts.enabled,
  });
}

export function useMemory(id: string | null | undefined) {
  return useQuery({ queryKey: qk.memories.detail(id ?? ""), queryFn: () => memoryGet(id ?? ""), enabled: !!id });
}

type Snapshot = [QueryKey, unknown][];

async function patchMemoryCaches(client: QueryClient, id: string, fn: (m: Memory) => Memory | null): Promise<Snapshot> {
  await client.cancelQueries({ queryKey: qk.memories.all });
  const snap: Snapshot = client.getQueriesData({ queryKey: qk.memories.all });
  for (const [key, data] of snap) {
    if (Array.isArray(data)) {
      let changed = false;
      const next: Memory[] = [];
      for (const m of data as Memory[]) {
        if (m.id !== id) next.push(m);
        else {
          changed = true;
          const p = fn(m);
          if (p) next.push(p);
        }
      }
      if (changed) client.setQueryData(key, next);
    } else if (data && typeof data === "object" && (data as Memory).id === id) {
      const p = fn(data as Memory);
      client.setQueryData(key, p ?? undefined);
    }
  }
  return snap;
}

function restore(client: QueryClient, snap?: Snapshot) {
  for (const [key, data] of snap ?? []) client.setQueryData(key, data);
}

const settle = (client: QueryClient) => () => void client.invalidateQueries({ queryKey: qk.memories.all });

/** Apply update args locally (optimistic preview). */
export function applyMemoryUpdate(m: Memory, args: MemoryUpdateArgs): Memory {
  const next = { ...m } as Memory & Record<string, unknown>;
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined || k === "tags") continue;
    next[k] = k === "expires" && v === "none" ? null : v;
  }
  if (typeof args.tags === "string") next.tags = applyTagSpec(m.tags, args.tags);
  return next;
}

/** The inverse of an update (what Undo sends). `source`/`project` cannot be cleared (G10). */
export function inverseMemoryUpdate(before: Memory, args: MemoryUpdateArgs): MemoryUpdateArgs {
  const inv: MemoryUpdateArgs = {};
  if (args.title !== undefined) inv.title = before.title;
  if (args.kind !== undefined) inv.kind = before.kind as MemoryUpdateArgs["kind"];
  if (args.scope !== undefined) inv.scope = before.scope as MemoryUpdateArgs["scope"];
  if (args.importance !== undefined) inv.importance = before.importance ?? 3;
  if (args.expires !== undefined) inv.expires = before.expires ?? "none";
  if (args.source !== undefined && before.source) inv.source = before.source;
  if (args.owner !== undefined && before.owner) inv.owner = before.owner;
  if (args.project !== undefined && before.project) inv.project = before.project;
  if (args.tags !== undefined) inv.tags = tagSpec.replace(before.tags);
  return inv;
}

export function useUpdateMemory(opts: { undoable?: boolean } = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ memory, args }: { memory: Memory; args: MemoryUpdateArgs }) => memoryUpdate(memory.id, args),
    onMutate: async ({ memory, args }) => ({ snap: await patchMemoryCaches(client, memory.id, (m) => applyMemoryUpdate(m, args)) }),
    onError: (_e, _v, ctx) => restore(client, ctx?.snap),
    onSuccess: (_r, { memory, args }) => {
      if (!opts.undoable) return;
      const inv = inverseMemoryUpdate(memory, args);
      if (Object.keys(inv).length) toastWithUndo(`Updated “${memory.title}”`, () => memoryUpdate(memory.id, inv));
    },
    onSettled: settle(client),
  });
}

/** Forget (hard delete via host) with Undo → `host_restore` of the raw bytes. */
export function useForgetMemory(opts: { onDone?: () => void } = {}) {
  const client = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (m: Memory) => hostMemoryForget(m.id),
    onMutate: async (m) => ({ snap: await patchMemoryCaches(client, m.id, () => null) }),
    onError: (e, _m, ctx) => {
      restore(client, ctx?.snap);
      toast.error(describeError(e, "Forget"));
    },
    onSuccess: (file, m) => {
      opts.onDone?.();
      toastWithUndo(`Forgot “${m.title}”`, () => hostRestore(file));
    },
    onSettled: settle(client),
  });
}

export function useCreateMemory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: MemoryNewArgs) => memoryNew(args),
    onSuccess: (m) => {
      for (const [key, data] of client.getQueriesData<Memory[]>({ queryKey: ["memories", "list"] })) {
        if (Array.isArray(data) && !data.some((x) => x.id === m.id)) client.setQueryData(key, [m, ...data]);
      }
    },
    onSettled: settle(client),
  });
}

/**
 * Replace the body (`host_memory_set_body`). On a host without it, rethrows a CallError the
 * editor turns into "append-only on this host".
 */
export function useSetMemoryBody() {
  const client = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: ({ memory, body }: { memory: Memory; body: string }) => hostMemorySetBody(memory.id, body),
    onMutate: async ({ memory, body }) => ({ snap: await patchMemoryCaches(client, memory.id, (m) => ({ ...m, body })) }),
    onError: (e, _v, ctx) => {
      restore(client, ctx?.snap);
      if (!isUnknownTool(e)) toast.error(describeError(e, "Saving the body"));
    },
    onSuccess: (_r, { memory, body }) => {
      const before = memory.body ?? "";
      toastWithUndo("Memory body saved", () => hostMemorySetBody(memory.id, before), { description: body.length < before.length ? "Text was removed" : undefined });
    },
    onSettled: settle(client),
  });
}

export function useAppendMemory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ memory, text, timestamp }: { memory: Memory; text: string; timestamp?: boolean }) => memoryAppend(memory.id, text, { timestamp }),
    onSuccess: () => toast.success("Added to memory"),
    onSettled: settle(client),
  });
}
