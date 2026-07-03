import type { FlowIndexEntry } from "../entities/flow-index.js";

export type IndexedResourceRow = {
  key: string;
  digest: string;
  payload_json: string;
};

export type FlowIndexRow = FlowIndexEntry & { payload_json: string };

export type SpaceIndexSnapshot = {
  actions: IndexedResourceRow[];
  executors: IndexedResourceRow[];
  hooks: IndexedResourceRow[];
  events: IndexedResourceRow[];
  flows: FlowIndexRow[];
};

export type ApplyIndexChange = {
  resource: "actions" | "executors" | "hooks" | "events" | "flows";
  key: string;
  change: "added" | "updated" | "removed" | "unchanged";
  digest?: string;
};

export type ApplyIndexResult = {
  changes: ApplyIndexChange[];
  summary: {
    actions: number;
    executors: number;
    hooks: number;
    events: number;
    flows: number;
    changed: number;
  };
  next: SpaceIndexSnapshot;
};
