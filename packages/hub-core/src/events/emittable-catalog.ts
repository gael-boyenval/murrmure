import { type EventDeclaration, type HookSpec } from "@murrmure/contracts";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import { hookSourceMatches } from "../hooks/matcher.js";

export interface EmittableEventListener {
  space_id: string;
  hook_id: string;
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
  origins: Array<"hook" | "declaration" | "flow_start">;
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

function extractPayloadHintsFromHook(spec: HookSpec): string[] {
  const hints = new Set<string>();
  for (const step of spec.do ?? []) {
    if ("invoke" in step && step.invoke.params) {
      const json = JSON.stringify(step.invoke.params);
      for (const match of json.matchAll(PARAM_TEMPLATE)) {
        hints.add(match[1]!);
      }
    }
  }
  return [...hints].sort();
}

function invokeActionFromHook(spec: HookSpec): string | undefined {
  for (const step of spec.do ?? []) {
    if ("invoke" in step) return step.invoke.action;
  }
  return undefined;
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
    },
    required: ["event_type", "payload"],
  }));

  if (branches.length === 1) return branches[0]!;
  return { oneOf: branches };
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

    const rawHooks = await studio.listIndexedHooks(space.space_id);
    for (const raw of rawHooks) {
      const hook_id = String(raw.name ?? "");
      const spec = raw as HookSpec & { name?: string };
      const eventType = spec.on?.event?.type;
      if (!hook_id || !eventType) continue;
      if (!hookSourceMatches(spec.on?.event?.source, callerSource)) continue;

      const entry = upsertEntry(byType, eventType);
      if (!entry.origins.includes("hook")) entry.origins.push("hook");
      entry.listeners.push({
        space_id: listenerSpaceId,
        hook_id,
        action: invokeActionFromHook(spec),
      });
      for (const hint of extractPayloadHintsFromHook(spec)) {
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
      for (const event of flow.start.events ?? []) {
        if (!hookSourceMatches(event.source, callerSource)) continue;
        const entry = upsertEntry(byType, event.type);
        if (!entry.origins.includes("flow_start")) entry.origins.push("flow_start");
        entry.listeners.push({
          space_id: listenerSpaceId,
          hook_id: `flow:${flow.flow_id}`,
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
