import type { FlowIndexEntry, HandlerSpec } from "@murrmure/contracts";
import { HandlerSpecSchema } from "@murrmure/contracts";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import { buildIndexStatus } from "../index/apply-index.js";

export interface SpaceHomeHandlerRow {
  handler_id: string;
  event_type: string;
  source?: string | string[];
  type: string;
  summary: string;
  description?: string;
}

export interface SpaceHomeActionRow {
  name: string;
  executor: string;
}

export interface SpaceHomeEventRow {
  event_type: string;
  kind: "handler_listener" | "flow_start";
  handler_id?: string;
  flow_id?: string;
  source?: string | string[];
}

export interface SpaceHomeIndexSection {
  counts: {
    actions: number;
    executors: number;
    handlers: number;
    events: number;
    flows: number;
    declared_events: number;
  };
  actions: SpaceHomeActionRow[];
  handlers: SpaceHomeHandlerRow[];
  events: SpaceHomeEventRow[];
}

function bareSpaceId(space_id: string): string {
  return space_id.startsWith("spc_") ? space_id.slice(4) : space_id;
}

function summarizeHandler(spec: HandlerSpec): string {
  if (spec.type === "view_resolver") {
    return `view:${spec.view}`;
  }
  if (spec.command?.trim()) {
    return spec.command.trim();
  }
  if (spec.prompt?.trim()) {
    return "prompt";
  }
  return spec.type;
}

/** Parse an indexed row as an event handler (HandlerSpec) or legacy hook shape. */
export function parseHandlerRow(raw: Record<string, unknown>): SpaceHomeHandlerRow | null {
  const parsed = HandlerSpecSchema.safeParse(raw);
  if (parsed.success) {
    const on = parsed.data.on;
    if (typeof on === "string" || !on.event?.type) {
      return null;
    }
    return {
      handler_id: parsed.data.id,
      event_type: on.event.type,
      source: on.event.source,
      type: parsed.data.type,
      summary: summarizeHandler(parsed.data),
      description: parsed.data.description,
    };
  }

  // Legacy hooks.yaml rows (name + on.event + do[]) — display only until purged.
  const handler_id = String(raw.name ?? raw.id ?? "");
  const eventType =
    raw.on &&
    typeof raw.on === "object" &&
    (raw.on as { event?: { type?: unknown } }).event &&
    typeof (raw.on as { event: { type?: unknown } }).event.type === "string"
      ? String((raw.on as { event: { type: string } }).event.type)
      : "";
  if (!handler_id || !eventType) return null;

  const steps = Array.isArray(raw.do) ? raw.do : [];
  let summary = "legacy-hook";
  for (const step of steps) {
    if (step && typeof step === "object" && "invoke" in step) {
      const invoke = (step as { invoke?: { action?: string } }).invoke;
      summary = invoke?.action ?? "invoke";
      break;
    }
  }

  return {
    handler_id,
    event_type: eventType,
    source:
      raw.on && typeof raw.on === "object"
        ? (raw.on as { event?: { source?: string | string[] } }).event?.source
        : undefined,
    type: "legacy_hook",
    summary,
    description: typeof raw.description === "string" ? raw.description : undefined,
  };
}

/** @deprecated Use parseHandlerRow. */
export const parseHookRow = parseHandlerRow;

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

  const rawRows = await studio.listIndexedHooks(bare);
  const handlers = rawRows
    .map((row) => parseHandlerRow(row))
    .filter((row): row is SpaceHomeHandlerRow => row != null);

  const rawActions = await studio.listIndexedActions(bare);
  const actions = rawActions.map((row) => ({
    name: String(row.name ?? ""),
    executor: String(row.executor ?? "unknown"),
  }));

  const flows = await studio.listFlowIndex(bare);
  const events: SpaceHomeEventRow[] = [
    ...handlers.map((handler) => ({
      event_type: handler.event_type,
      kind: "handler_listener" as const,
      handler_id: handler.handler_id,
      source: handler.source,
    })),
    ...collectFlowStartEvents(flows),
  ];

  return {
    counts: {
      actions: status.counts.actions,
      executors: status.counts.executors,
      handlers: status.counts.handlers,
      events: events.length,
      flows: status.counts.flows,
      declared_events: (snapshot.events ?? []).length,
    },
    actions,
    handlers,
    events,
  };
}
