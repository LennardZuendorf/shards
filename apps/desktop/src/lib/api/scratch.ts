/** Typed wrappers for scratch tools. `agent` defaults to the acting identity in the core. */
import type { Scratch } from "../types";
import { invokeTool } from "./util";

export const scratchList = (args: { agent?: string; all_agents?: boolean; since?: string } = {}) =>
  invokeTool<Scratch[]>("shards_scratch_list", args);

/** Every agent's scratchpads (what the UI usually wants). */
export const scratchListAll = () => scratchList({ all_agents: true });

export const scratchGet = (name: string, agent?: string) => invokeTool<Scratch>("shards_scratch_get", { name, agent });

export const scratchSet = (name: string, body: string, agent?: string) =>
  invokeTool<Scratch>("shards_scratch_set", { name, body, agent });

export const scratchAppend = (name: string, text: string, opts: { section?: string; timestamp?: boolean; agent?: string } = {}) =>
  invokeTool<Scratch>("shards_scratch_append", { name, text, ...opts });
