/** Scratchpad data hooks + mutations (set with an `updated` precondition, append, clear+undo). */
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { describeError } from "@/components/agent/host-safe";
import { hostRestore, hostScratchClear, scratchAppend, scratchGet, scratchListAll, scratchSet } from "@/lib/api";
import { qk, toastWithUndo } from "@/lib/query";
import type { Member, Scratch } from "@/lib/types";

export function useScratchList(opts: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: qk.scratch.list({ all: true }), queryFn: scratchListAll, enabled: opts.enabled });
}

export function useScratch(agent: string | null | undefined, name: string | null | undefined) {
  return useQuery({
    queryKey: qk.scratch.detail(agent ?? "", name ?? ""),
    queryFn: () => scratchGet(name ?? "", agent ?? undefined),
    enabled: !!agent && !!name,
  });
}

/** Bodies for every listed scratchpad (the list payload has none). Capped for big vaults. */
export function useScratchBodies(list: Scratch[] | undefined, cap = 80) {
  const items = (list ?? []).slice(0, cap);
  const results = useQueries({
    queries: items.map((s) => ({
      queryKey: qk.scratch.detail(s.agent, s.name),
      queryFn: () => scratchGet(s.name, s.agent),
      staleTime: 15_000,
    })),
  });
  const map = new Map<string, Scratch>();
  results.forEach((r, i) => {
    if (r.data) map.set(`${items[i].agent}/${items[i].name}`, r.data);
  });
  return map;
}

export class ScratchConflict extends Error {
  latest: Scratch;
  constructor(latest: Scratch) {
    super("The agent wrote to this scratchpad since you opened it");
    this.name = "ScratchConflict";
    this.latest = latest;
  }
}

/**
 * Replace a scratch body. `expectUpdated` is a client-side precondition (G13 stand-in):
 * the file is re-read first and a newer `updated` throws {@link ScratchConflict}.
 */
export function useSetScratch() {
  const client = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: async ({ agent, name, body, expectUpdated }: { agent: string; name: string; body: string; expectUpdated?: string | null }) => {
      if (expectUpdated !== undefined) {
        const latest = await scratchGet(name, agent).catch(() => null);
        if (latest && latest.updated !== expectUpdated) throw new ScratchConflict(latest);
      }
      return scratchSet(name, body, agent);
    },
    onMutate: async ({ agent, name, body }) => {
      const key = qk.scratch.detail(agent, name);
      await client.cancelQueries({ queryKey: key });
      const prev = client.getQueryData<Scratch>(key);
      if (prev) client.setQueryData(key, { ...prev, body });
      return { prev, key };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) client.setQueryData(ctx.key, ctx.prev);
      if (!(e instanceof ScratchConflict)) toast.error(describeError(e, "Saving the scratchpad"));
    },
    onSettled: () => void client.invalidateQueries({ queryKey: qk.scratch.all }),
  });
}

export function useAppendScratch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ agent, name, text, timestamp }: { agent: string; name: string; text: string; timestamp?: boolean }) =>
      scratchAppend(name, text, { agent, timestamp }),
    onSuccess: (_r, v) => {
      const who = client.getQueryData<Member[]>(qk.host.members)?.find((m) => m.id === v.agent)?.name ?? v.agent;
      toast.success(`Note left for ${who}`);
    },
    onSettled: () => void client.invalidateQueries({ queryKey: qk.scratch.all }),
  });
}

/** Clear (delete) via `host_scratch_clear`; Undo restores the raw bytes. */
export function useClearScratch(opts: { onDone?: () => void } = {}) {
  const client = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (s: Pick<Scratch, "agent" | "name">) => hostScratchClear(s.name, s.agent),
    onMutate: async (s) => {
      const key = qk.scratch.list({ all: true });
      await client.cancelQueries({ queryKey: key });
      const prev = client.getQueryData<Scratch[]>(key);
      if (prev) client.setQueryData(key, prev.filter((x) => !(x.agent === s.agent && x.name === s.name)));
      return { prev, key };
    },
    onError: (e, _s, ctx) => {
      if (ctx?.prev) client.setQueryData(ctx.key, ctx.prev);
      toast.error(describeError(e, "Clearing a scratchpad"));
    },
    onSuccess: (file, s) => {
      opts.onDone?.();
      toastWithUndo(`Cleared ${s.agent}/${s.name}`, () => hostRestore(file));
    },
    onSettled: () => void client.invalidateQueries({ queryKey: qk.scratch.all }),
  });
}
