import { type EventDeclaration, HandlerSpecSchema, type HandlerSpec } from "@murrmure/contracts";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import { hookSourceMatches } from "../hooks/matcher.js";

export interface EmittableEventListener {
  space_id: string;
  handler_id: string;
  action?: string;
  flow_id?: string;
}

export interface EmittableEventPayloadSchema {
  required?: string[];
  properties?: Record<string, { type?: string; description?: string }>;
}

export interface EmittableEventEntry {
  event_type: string;
  description?: string;
  listeners: EmittableEventListener[];
  payload_hints: string[];
  payload_schema?: EmittableEventPayloadSchema;
  origins: Array<"handler" | "declaration" | "flow_start">;
}

export interface EmittableEventsCatalog {
  caller_space_id: string;
  caller_source: string;
  events: EmittableEventEntry[];
}

const PARAM_TEMPLATE = /\{\{event\.data\.([^}]+)\}\}/g;

function bareSpaceId(space_id: string): string {
  return space_id.startsWith("spc_") ? space_id.slice(4) : space_id;
}

function prefixedSpaceId(space_id: string): string {
  const bare = bareSpaceId(space_id);
  return bare.startsWith("spc_") ? bare : `spc_${bare}`;
}

function extractPayloadHintsFromHandler(spec: HandlerSpec): string[] {
  const hints = new Set<string>();
  if (spec.type === "view_resolver") return [];
  const json = JSON.stringify({
    prompt: spec.prompt,
    command: spec.command,
    params: spec.params,
  });
  for (const match of json.matchAll(PARAM_TEMPLATE)) {
    hints.add(match[1]!);
  }
  return [...hints].sort();
}

function extractPayloadHintsFromLegacyHook(raw: Record<string, unknown>): string[] {
  const hints = new Set<string>();
  const steps = Array.isArray(raw.do) ? raw.do : [];
  for (const step of steps) {
    if (step && typeof step === "object" && "invoke" in step) {
      const params = (step as { invoke?: { params?: unknown } }).invoke?.params;
      if (!params) continue;
      const json = JSON.stringify(params);
      for (const match of json.matchAll(PARAM_TEMPLATE)) {
        hints.add(match[1]!);
      }
    }
  }
  return [...hints].sort();
}

function listenerActionFromRow(raw: Record<string, unknown>): string | undefined {
  const parsed = HandlerSpecSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data.type === "view_resolver" ? `view:${parsed.data.view}` : parsed.data.type;
  }
  const steps = Array.isArray(raw.do) ? raw.do : [];
  for (const step of steps) {
    if (step && typeof step === "object" && "invoke" in step) {
      return (step as { invoke?: { action?: string } }).invoke?.action;
    }
  }
  return undefined;
}

function eventHandlerFromRow(raw: Record<string, unknown>): {
  handler_id: string;
  event_type: string;
  source?: string | string[];
  hints: string[];
} | null {
  const parsed = HandlerSpecSchema.safeParse(raw);
  if (parsed.success) {
    const on = parsed.data.on;
    if (typeof on === "string" || !on.event?.type) return null;
    return {
      handler_id: parsed.data.id,
      event_type: on.event.type,
      source: on.event.source,
      hints: extractPayloadHintsFromHandler(parsed.data),
    };
  }

  const handler_id = String(raw.name ?? raw.id ?? "");
  const eventType =
    raw.on &&
    typeof raw.on === "object" &&
    (raw.on as { event?: { type?: unknown } }).event &&
    typeof (raw.on as { event: { type?: unknown } }).event.type === "string"
      ? String((raw.on as { event: { type: string } }).event.type)
      : "";
  if (!handler_id || !eventType) return null;
  return {
    handler_id,
    event_type: eventType,
    source:
      raw.on && typeof raw.on === "object"
        ? (raw.on as { event?: { source?: string | string[] } }).event?.source
        : undefined,
    hints: extractPayloadHintsFromLegacyHook(raw),
  };
}

function mergePayloadSchema(
  existing: EmittableEventPayloadSchema | undefined,
  declaration?: EventDeclaration,
): EmittableEventPayloadSchema | undefined {
  if (!declaration?.payload) return existing;
  return {
    required: declaration.payload.required ?? existing?.required,
    properties: { ...existing?.properties, ...declaration.payload.properties },
  };
}

function upsertEntry(
  map: Map<string, EmittableEventEntry>,
  eventType: string,
): EmittableEventEntry {
  let entry = map.get(eventType);
  if (!entry) {
    entry = {
      event_type: eventType,
      listeners: [],
      payload_hints: [],
      origins: [],
    };
    map.set(eventType, entry);
  }
  return entry;
}

export function buildEmitEventInputSchema(catalog: EmittableEventsCatalog): Record<string, unknown> {
  if (catalog.events.length === 0) {
    return {
      type: "object",
      properties: {
        event_type: { type: "string", description: "Event type to emit" },
        payload: { type: "object", additionalProperties: true },
        event_id: { type: "string" },
        space_id: { type: "string" },
        session_id: {
          type: "string",
          description: "Existing session to attach (required for mrmr.meeting.*)",
        },
      },
      required: ["event_type", "payload"],
    };
  }

  const branches = catalog.events.map((entry) => ({
    type: "object",
    properties: {
      event_type: {
        const: entry.event_type,
        description: entry.description ?? `Emit ${entry.event_type}`,
      },
      payload: entry.payload_schema
        ? {
            type: "object",
            required: entry.payload_schema.required ?? [],
            properties: entry.payload_schema.properties ?? {},
            additionalProperties: true,
          }
        : {
            type: "object",
            description: entry.payload_hints.length
              ? `Suggested fields: ${entry.payload_hints.join(", ")}`
              : "Event payload",
            additionalProperties: true,
          },
      event_id: { type: "string" },
      space_id: { type: "string" },
      session_id: {
        type: "string",
        description: "Existing session to attach (required for mrmr.meeting.*)",
      },
    },
    required: ["event_type", "payload"],
  }));

  if (branches.length === 1) return branches[0]!;
  // Cursor's tools/list validator requires inputSchema.type === "object".
  // A bare `{ oneOf }` is dropped and the whole catalog shows as 0 tools.
  return { type: "object", oneOf: branches };
}

export function validateEmitPayload(
  entry: EmittableEventEntry | undefined,
  payload: Record<string, unknown>,
): string | null {
  if (!entry?.payload_schema?.required?.length) return null;
  const missing = entry.payload_schema.required.filter(
    (key) => payload[key] === undefined || payload[key] === null,
  );
  if (missing.length === 0) return null;
  return `Missing required payload fields for ${entry.event_type}: ${missing.join(", ")}`;
}

export async function buildEmittableEventsCatalog(
  studio: StudioPersistencePort,
  callerSpaceId: string,
): Promise<EmittableEventsCatalog> {
  const callerPrefixed = prefixedSpaceId(callerSpaceId);
  const callerSource = `/spaces/${callerPrefixed}`;
  const byType = new Map<string, EmittableEventEntry>();

  const spaces = await studio.listSpaces();
  for (const space of spaces) {
    const listenerSpaceId = prefixedSpaceId(space.space_id);

    const rawRows = await studio.listIndexedHooks(space.space_id);
    for (const raw of rawRows) {
      const handler = eventHandlerFromRow(raw);
      if (!handler) continue;
      if (!hookSourceMatches(handler.source, callerSource)) continue;

      const entry = upsertEntry(byType, handler.event_type);
      if (!entry.origins.includes("handler")) entry.origins.push("handler");
      entry.listeners.push({
        space_id: listenerSpaceId,
        handler_id: handler.handler_id,
        action: listenerActionFromRow(raw),
      });
      for (const hint of handler.hints) {
        if (!entry.payload_hints.includes(hint)) entry.payload_hints.push(hint);
      }
      entry.payload_hints.sort();
    }

    const rawEvents = await studio.listIndexedEvents(space.space_id);
    for (const raw of rawEvents) {
      const eventType = String(raw.event_type ?? raw.name ?? "");
      if (!eventType) continue;
      const entry = byType.get(eventType);
      if (!entry) continue;
      if (!entry.listeners.some((listener) => listener.space_id === listenerSpaceId)) continue;

      const declaration = raw as EventDeclaration & { event_type?: string; name?: string };
      if (!entry.origins.includes("declaration")) entry.origins.push("declaration");
      if (declaration.description) entry.description = declaration.description;
      entry.payload_schema = mergePayloadSchema(entry.payload_schema, declaration);
    }

    const flows = await studio.listFlowIndex(space.space_id);
    for (const flow of flows) {
      for (const event of flow.triggers.events ?? []) {
        if (!hookSourceMatches(event.source, callerSource)) continue;
        const entry = upsertEntry(byType, event.type);
        if (!entry.origins.includes("flow_start")) entry.origins.push("flow_start");
        entry.listeners.push({
          space_id: listenerSpaceId,
          handler_id: `flow:${flow.flow_id}`,
          flow_id: flow.flow_id,
        });
      }
    }
  }

  const events = [...byType.values()].sort((a, b) => a.event_type.localeCompare(b.event_type));
  return {
    caller_space_id: callerPrefixed,
    caller_source: callerSource,
    events,
  };
}
