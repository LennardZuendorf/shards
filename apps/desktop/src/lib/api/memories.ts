/** Typed wrappers for memory + asset tools. Memory verbs take `target` (id or title). */
import type { Asset, JsonObject, Memory, MemoryKind, MemoryScope } from "../types";
import { invokeTool } from "./util";

export interface MemoryListArgs {
  kind?: MemoryKind;
  scope?: MemoryScope;
  tags?: string[];
  any_tag?: boolean;
  owner?: string;
  mine?: boolean;
  min_importance?: number;
  since?: string;
  include_expired?: boolean;
  include_superseded?: boolean;
  sort?: string;
  limit?: number;
}

export const memoryList = (args: MemoryListArgs = {}) => invokeTool<Memory[]>("shards_memory_list", { limit: 500, ...args });

export const memoryGet = (target: string) => invokeTool<Memory>("shards_memory_get", { target });

export interface MemoryNewArgs {
  title: string;
  kind?: MemoryKind;
  scope?: MemoryScope;
  importance?: number;
  source?: string;
  project?: string;
  expires?: string;
  supersedes?: string;
  tags?: string[];
  owner?: string;
  body?: string;
}

export const memoryNew = (args: MemoryNewArgs) => invokeTool<Memory>("shards_memory_new", args);

export const memoryAppend = (target: string, text: string, opts: { section?: string; timestamp?: boolean } = {}) =>
  invokeTool<Memory>("shards_memory_append", { target, text, ...opts });

export interface MemoryUpdateArgs {
  /** Tag-spec string (see `tagSpec`). */
  tags?: string;
  title?: string;
  kind?: MemoryKind;
  scope?: MemoryScope;
  importance?: number;
  source?: string;
  project?: string;
  expires?: string;
  owner?: string;
}

export const memoryUpdate = (target: string, args: MemoryUpdateArgs) =>
  invokeTool<Memory>("shards_memory_update", { target, ...args });

export interface MemoryRecallArgs {
  kind?: MemoryKind;
  tags?: string[];
  owner?: string;
  mine?: boolean;
  project?: string;
  min_importance?: number;
  limit?: number;
  threshold?: number;
  no_decay?: boolean;
  include_expired?: boolean;
  meta_only?: boolean;
  full?: boolean;
}

export const memoryRecall = (query: string, args: MemoryRecallArgs = {}) =>
  invokeTool<Memory[]>("shards_memory_recall", { query, limit: 30, ...args });

/* ----------------------------------------------------------------- assets */

export const assetGet = (asset_id: string) => invokeTool<Asset>("shards_asset_get", { asset_id });

export const assetList = (
  args: { tags?: string[]; any_tag?: boolean; owner?: string; mine?: boolean; media_type?: string; since?: string; sort?: string; limit?: number } = {},
) => invokeTool<Asset[]>("shards_asset_list", { limit: 500, ...args });

export const assetAttach = (asset_id: string, target: string, section?: string) =>
  invokeTool<JsonObject>("shards_asset_attach", { asset_id, target, section });
