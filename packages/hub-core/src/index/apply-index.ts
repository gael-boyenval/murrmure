import type {
  Capability,
  FlowIndexEntry,
  IndexedAction,
  SpaceApplyBundle,
  ViewManifest,
  SpaceIndexSnapshot,
  ApplyIndexChange,
  ApplyIndexResult,
  FlowIndexRow,
  IndexedResourceRow,
} from "@murrmure/contracts";
import { CapabilitySchema, HandlerSpecSchema } from "@murrmure/contracts";
import { computeContentDigest } from "./digest.js";
import { collectStepSpaces } from "./parse-flow-manifest.js";
import { compileFlowIr } from "../flow-engine/compile.js";
import { detectFlowCallCycles } from "../flow-engine/cycle-detect.js";
import { compileStepContractCatalog } from "../flow-engine/step-contract-compile.js";

function enrichCheckpointViewRefs(
  ir: ReturnType<typeof compileFlowIr>,
  views: SpaceApplyBundle["views"],
  originSpaceId: string,
): void {
  for (const step of ir.steps) {
    if (step.kind !== "gate" || !step.gate?.view_id || step.gate.view_ref) continue;
    const viewId = step.gate.view_id;
    const view = (views ?? []).find((v) => v.view_id === viewId || v.manifest.id === viewId);
    if (!view) continue;
    step.gate.view_ref = {
      view_id: view.view_id,
      origin_space_id: originSpaceId,
      entry_url: view.manifest.entry,
      shell_route: view.manifest.shell_route,
      params_schema: view.manifest.params_schema,
    };
  }
}

function flowIdFromName(name: string): string {
  const slug = name.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `flw_${slug || "unnamed"}`;
}

export function buildFlowIndexEntries(
  bundle: SpaceApplyBundle,
  originSpaceId: string,
): FlowIndexEntry[] {
  return (bundle.flows ?? []).map((flow) => {
    const grants = flow.manifest.grants?.suggested ?? [];
    const grants_required = grants.filter((g): g is Capability => CapabilitySchema.safeParse(g).success);
    const flow_id = flow.flow_id || flowIdFromName(flow.manifest.name);
    const ir = compileFlowIr(flow.manifest, flow_id);
    enrichCheckpointViewRefs(ir, bundle.views, originSpaceId);
    const { catalog } = compileStepContractCatalog(flow.manifest, flow_id);
    return {
      flow_id,
      origin_space_id: originSpaceId,
      digest: flow.digest || ir.digest,
      name: flow.manifest.name,
      triggers: flow.manifest.triggers,
      step_spaces: collectStepSpaces(flow.manifest, originSpaceId),
      grants_required,
      ir,
      step_contract_catalog: catalog ?? undefined,
    };
  });
}

export function buildIndexedActions(
  spaceId: string,
  bundle: SpaceApplyBundle,
): IndexedAction[] {
  if (!bundle.actions) return [];
  return Object.entries(bundle.actions.file.actions).map(([name, action]) => ({
    name,
    space_id: spaceId,
    ...action,
  }));
}

function isHandlerRow(row: IndexedResourceRow): boolean {
  try {
    const payload = JSON.parse(row.payload_json) as unknown;
    return HandlerSpecSchema.safeParse(payload).success;
  } catch {
    return false;
  }
}

function splitHookIndexRows(rows: IndexedResourceRow[]): {
  legacyHooks: IndexedResourceRow[];
  handlers: IndexedResourceRow[];
} {
  const legacyHooks: IndexedResourceRow[] = [];
  const handlers: IndexedResourceRow[] = [];
  for (const row of rows) {
    if (isHandlerRow(row)) handlers.push(row);
    else legacyHooks.push(row);
  }
  return { legacyHooks, handlers };
}

function buildLegacyHookRows(bundle: SpaceApplyBundle): IndexedResourceRow[] {
  if (!bundle.hooks) return [];
  return Object.entries(bundle.hooks.file.hooks).map(([name, hook]) => ({
    key: name,
    digest: bundle.hooks!.digest,
    payload_json: JSON.stringify({ name, ...hook }),
  }));
}

function buildHandlerRows(bundle: SpaceApplyBundle): IndexedResourceRow[] {
  if (!bundle.handlers) return [];
  return bundle.handlers.file.handlers.map((handler) => ({
    key: handler.id,
    digest: bundle.handlers!.digest,
    payload_json: JSON.stringify(handler),
  }));
}

function buildViewRows(bundle: SpaceApplyBundle): IndexedResourceRow[] {
  return (bundle.views ?? []).map((view) => ({
    key: view.view_id,
    digest: view.digest,
    payload_json: JSON.stringify({
      view_id: view.view_id,
      rel_path: view.rel_path,
      manifest: view.manifest,
      build: view.build,
    }),
  }));
}

export function applyIndexDiff(
  current: SpaceIndexSnapshot,
  bundle: SpaceApplyBundle,
  originSpaceId: string,
): ApplyIndexResult {
  const changes: ApplyIndexChange[] = [];
  const next: SpaceIndexSnapshot = {
    actions: [],
    executors: [],
    hooks: [],
    events: [],
    flows: [],
    views: [],
    run_policies: [],
  };

  const diffResource = <TRow extends { digest: string }>(
    resource: ApplyIndexChange["resource"],
    currentRows: TRow[],
    nextRows: TRow[],
    keyOf: (row: TRow) => string,
  ) => {
    const currentByKey = new Map(currentRows.map((r) => [keyOf(r), r]));
    const nextByKey = new Map(nextRows.map((r) => [keyOf(r), r]));

    for (const [key, row] of nextByKey) {
      const prev = currentByKey.get(key);
      if (!prev) {
        changes.push({ resource, key, change: "added", digest: row.digest });
      } else if (prev.digest !== row.digest) {
        changes.push({ resource, key, change: "updated", digest: row.digest });
      } else {
        changes.push({ resource, key, change: "unchanged", digest: row.digest });
      }
    }
    for (const key of currentByKey.keys()) {
      if (!nextByKey.has(key)) {
        changes.push({ resource, key, change: "removed" });
      }
    }
    return nextRows as IndexedResourceRow[] & TRow[];
  };

  if (bundle.actions) {
    const rows = Object.entries(bundle.actions.file.actions).map(([name, action]) => ({
      key: name,
      digest: bundle.actions!.digest,
      payload_json: JSON.stringify({ name, space_id: originSpaceId, ...action }),
    }));
    next.actions = diffResource("actions", current.actions, rows, (r) => r.key);
  } else {
    next.actions = current.actions;
  }

  if (bundle.executors) {
    const rows = Object.entries(bundle.executors.file.executors).map(([name, entry]) => ({
      key: name,
      digest: bundle.executors!.digest,
      payload_json: JSON.stringify({ name, ...entry }),
    }));
    next.executors = diffResource("executors", current.executors, rows, (r) => r.key);
  } else {
    next.executors = current.executors;
  }

  if (bundle.hooks !== undefined || bundle.handlers !== undefined) {
    const currentSplit = splitHookIndexRows(current.hooks);
    const legacyHookRows =
      bundle.hooks !== undefined ? buildLegacyHookRows(bundle) : currentSplit.legacyHooks;
    const handlerRows =
      bundle.handlers !== undefined ? buildHandlerRows(bundle) : currentSplit.handlers;
    const rows = [...legacyHookRows, ...handlerRows];
    next.hooks = diffResource("hooks", current.hooks, rows, (r) => r.key);
  } else {
    next.hooks = current.hooks;
  }

  if (bundle.events) {
    const rows = Object.entries(bundle.events.file.events).map(([event_type, declaration]) => ({
      key: event_type,
      digest: bundle.events!.digest,
      payload_json: JSON.stringify({ event_type, ...declaration }),
    }));
    next.events = diffResource("events", current.events ?? [], rows, (r) => r.key);
  } else {
    next.events = current.events ?? [];
  }

  if (bundle.flows !== undefined) {
    const flowEntries = buildFlowIndexEntries(bundle, originSpaceId);
    const flowRows: FlowIndexRow[] = flowEntries.map((entry) => ({
      ...entry,
      payload_json: JSON.stringify(entry),
    }));
    next.flows = diffResource("flows", current.flows, flowRows, (r) => r.flow_id);
  } else {
    next.flows = current.flows;
  }

  if (bundle.views !== undefined) {
    const viewRows = buildViewRows(bundle);
    next.views = diffResource("views", current.views ?? [], viewRows, (r) => r.key);
  } else {
    next.views = current.views ?? [];
  }

  // Run policies are space-owned and resolved against the fully merged
  // post-apply flow set (local + bound + preserved) by the caller, which has
  // the merged entries. When handlers are applied, reset to empty here and let
  // the caller inject the resolved set; otherwise preserve the prior policies.
  if (bundle.handlers !== undefined) {
    next.run_policies = [];
  } else {
    next.run_policies = current.run_policies ?? [];
  }

  const changed = changes.filter((c) => c.change !== "unchanged").length;
  return {
    changes,
    summary: {
      actions: next.actions.length,
      executors: next.executors.length,
      hooks: next.hooks.length,
      events: next.events.length,
      flows: next.flows.length,
      views: next.views.length,
      run_policies: next.run_policies.length,
      changed,
    },
    next,
  };
}

export function buildIndexStatus(snapshot: SpaceIndexSnapshot) {
  return {
    counts: {
      actions: snapshot.actions.length,
      executors: snapshot.executors.length,
      hooks: snapshot.hooks.length,
      events: (snapshot.events ?? []).length,
      flows: snapshot.flows.length,
      views: (snapshot.views ?? []).length,
      run_policies: (snapshot.run_policies ?? []).length,
    },
    digests: {
      actions: snapshot.actions[0]?.digest,
      executors: snapshot.executors[0]?.digest,
      hooks: snapshot.hooks[0]?.digest,
      events: snapshot.events?.[0]?.digest,
      flows: snapshot.flows.map((f) => ({
        flow_id: f.flow_id,
        digest: f.digest,
        step_contract_catalog_digest: f.step_contract_catalog?.digest,
        step_contract_step_count: f.step_contract_catalog?.step_ids.length,
      })),
      run_policies: (snapshot.run_policies ?? []).map((row) => {
        const policy = JSON.parse(row.payload_json) as { flow: string; max_concurrent_runs: number; flow_id: string };
        return {
          flow: policy.flow,
          flow_id: policy.flow_id,
          max_concurrent_runs: policy.max_concurrent_runs,
        };
      }),
    },
  };
}

export function validateApplyBundle(bundle: SpaceApplyBundle): { ok: true } | { ok: false; code: string; message: string } {
  if (bundle.hooks) {
    for (const [name, hook] of Object.entries(bundle.hooks.file.hooks)) {
      if (!hook.do?.length) {
        return { ok: false, code: "INVALID_HOOKS", message: `Hook '${name}' must declare at least one action` };
      }
    }
  }

  if (bundle.flows) {
    const seen = new Set<string>();
    for (const flow of bundle.flows) {
      const flowId = flow.flow_id || flowIdFromName(flow.manifest.name);
      if (seen.has(flowId)) {
        return {
          ok: false,
          code: "DUPLICATE_FLOW_ID",
          message: `Multiple flows resolve to '${flowId}'`,
        };
      }
      seen.add(flowId);
      const invalidControl = compileStepContractCatalog(flow.manifest, flowId).warnings.find((warning) =>
        warning.code === "RESUME_TARGET_NOT_ANCESTOR" ||
        warning.code === "ROUTE_TARGET_NOT_FOUND" ||
        warning.code === "CUSTOM_BRANCH_REQUIRES_ROUTE"
      );
      if (invalidControl) {
        return {
          ok: false,
          code: invalidControl.code,
          message: invalidControl.message,
        };
      }
    }

    const cycleCheck = detectFlowCallCycles(bundle);
    if (!cycleCheck.ok) {
      return { ok: false, code: cycleCheck.code, message: cycleCheck.message };
    }
  }

  return { ok: true };
}

export type { ViewManifest };

export type {
  ApplyIndexChange,
  ApplyIndexResult,
  FlowIndexRow,
  IndexedResourceRow,
  SpaceIndexSnapshot,
} from "@murrmure/contracts";
