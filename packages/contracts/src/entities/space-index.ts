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
  views: IndexedResourceRow[];
  /** Canonical run policies (`ResolvedRunPolicy` rows keyed by `flow_id`). */
  run_policies: IndexedResourceRow[];
};

export type ApplyIndexChange = {
  resource: "actions" | "executors" | "hooks" | "events" | "flows" | "views" | "run_policies";
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
    views: number;
    run_policies: number;
    changed: number;
  };
  next: SpaceIndexSnapshot;
};
