import type { FlowIndexEntry, HookSpec } from "@murrmure/contracts";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import { buildIndexStatus } from "../index/apply-index.js";

export interface SpaceHomeHookActionRow {
  kind: "ensure_session" | "invoke" | "start_flow";
  label: string;
}

export interface SpaceHomeHookRow {
  hook_id: string;
  event_type: string;
  source?: string | string[];
  actions: SpaceHomeHookActionRow[];
}

export interface SpaceHomeActionRow {
  name: string;
  executor: string;
}

export interface SpaceHomeEventRow {
  event_type: string;
  kind: "hook_listener" | "flow_start";
  hook_id?: string;
  flow_id?: string;
  source?: string | string[];
}

export interface SpaceHomeIndexSection {
  counts: {
    actions: number;
    executors: number;
    hooks: number;
    events: number;
    flows: number;
    declared_events: number;
  };
  actions: SpaceHomeActionRow[];
  hooks: SpaceHomeHookRow[];
  events: SpaceHomeEventRow[];
}

function bareSpaceId(space_id: string): string {
  return space_id.startsWith("spc_") ? space_id.slice(4) : space_id;
}

function summarizeHookAction(action: Record<string, unknown>): SpaceHomeHookActionRow {
  if ("ensure_session" in action) {
    const cfg = action.ensure_session as { title?: string };
    return { kind: "ensure_session", label: cfg.title ?? "session" };
  }
  if ("invoke" in action) {
    const cfg = action.invoke as { action?: string; space?: string };
    const target = cfg.space ? ` → ${cfg.space}` : "";
    return { kind: "invoke", label: `${cfg.action ?? "action"}${target}` };
  }
  if ("start_flow" in action) {
    const cfg = action.start_flow as { flow_id?: string };
    return { kind: "start_flow", label: cfg.flow_id ?? "flow" };
  }
  return { kind: "invoke", label: "unknown" };
}

export function parseHookRow(raw: Record<string, unknown>): SpaceHomeHookRow | null {
  const hook_id = String(raw.name ?? "");
  const spec = raw as HookSpec & { name?: string };
  const eventType = spec.on?.event?.type;
  if (!hook_id || !eventType) return null;

  return {
    hook_id,
    event_type: eventType,
    source: spec.on?.event?.source,
    actions: (spec.do ?? []).map((step) => summarizeHookAction(step as Record<string, unknown>)),
  };
}

export function collectFlowStartEvents(flows: FlowIndexEntry[]): SpaceHomeEventRow[] {
  const rows: SpaceHomeEventRow[] = [];
  for (const flow of flows) {
    for (const event of flow.triggers?.events ?? []) {
      rows.push({
        event_type: event.type,
        kind: "flow_start",
        flow_id: flow.flow_id,
        source: event.source,
      });
    }
  }
  return rows;
}

export async function buildSpaceHomeIndex(
  studio: StudioPersistencePort,
  space_id: string,
): Promise<SpaceHomeIndexSection> {
  const bare = bareSpaceId(space_id);
  const snapshot = await studio.getSpaceIndexSnapshot(bare);
  const status = buildIndexStatus(snapshot);

  const rawHooks = await studio.listIndexedHooks(bare);
  const hooks = rawHooks
    .map((row) => parseHookRow(row))
    .filter((row): row is SpaceHomeHookRow => row != null);

  const rawActions = await studio.listIndexedActions(bare);
  const actions = rawActions.map((row) => ({
    name: String(row.name ?? ""),
    executor: String(row.executor ?? "unknown"),
  }));

  const flows = await studio.listFlowIndex(bare);
  const events: SpaceHomeEventRow[] = [
    ...hooks.map((hook) => ({
      event_type: hook.event_type,
      kind: "hook_listener" as const,
      hook_id: hook.hook_id,
      source: hook.source,
    })),
    ...collectFlowStartEvents(flows),
  ];

  return {
    counts: {
      ...status.counts,
      events: events.length,
      declared_events: (snapshot.events ?? []).length,
    },
    actions,
    hooks,
    events,
  };
}
