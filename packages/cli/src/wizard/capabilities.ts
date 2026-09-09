import { CAPABILITY_STRINGS } from "@murrmure/contracts";

/** Default least-privilege profile for local MCP / tools connections. */
export const LOCAL_TOOLS_PROFILE = {
  name: "local-tools",
  version: 1,
  id: "local-tools/v1",
} as const;

/** Former id still accepted by the hub when minting connections. */
export const LOCAL_TOOLS_PROFILE_LEGACY_IDS = ["tutorial-builder/v1"] as const;

export const LOCAL_TOOLS_CAPABILITIES = [
  "space:read",
  "flow:read",
  "flow:run",
  "step:resolve",
] as const;

/** Local marker for connections minted outside the fixed local-tools profile. */
export const CUSTOM_CONNECTION_PROFILE = "custom" as const;

/** All grantable capabilities (matches hub `CAPABILITY_STRINGS`). */
export const GRANTABLE_CAPABILITIES = CAPABILITY_STRINGS;

/** Least-privilege set for a persistent meeting seat (talk + attach). */
export const MEETING_SEAT_CAPABILITIES = [
  "space:read",
  "flow:read",
  "flow:run",
  "step:resolve",
  "event:emit",
  "journal:read",
  "blob:write",
  "blob:read",
] as const;

export const MEETING_SEAT_CAPABILITIES_CSV = MEETING_SEAT_CAPABILITIES.join(",");

export type GrantableCapability = (typeof GRANTABLE_CAPABILITIES)[number];

export const GRANTABLE_CAPABILITY_OPTIONS: ReadonlyArray<{
  value: GrantableCapability;
  label: string;
  hint: string;
}> = [
  {
    value: "space:read",
    label: "space:read",
    hint: "Read space index, status, and catalogs",
  },
  {
    value: "space:write",
    label: "space:write",
    hint: "Apply space config and mutate space state",
  },
  {
    value: "space:enter",
    label: "space:enter",
    hint: "Enter / select this space",
  },
  {
    value: "flow:read",
    label: "flow:read",
    hint: "Read flows, contracts, and run graphs",
  },
  {
    value: "flow:run",
    label: "flow:run",
    hint: "Start runs and advance orchestration",
  },
  {
    value: "event:emit",
    label: "event:emit",
    hint: "Emit platform events (murrmure_emit_event)",
  },
  {
    value: "step:resolve",
    label: "step:resolve",
    hint: "Resolve assigned flow steps",
  },
  {
    value: "journal:read",
    label: "journal:read",
    hint: "Read journal / event history",
  },
  {
    value: "blob:read",
    label: "blob:read",
    hint: "Read artifact bytes / materialize (HTTP)",
  },
  {
    value: "blob:write",
    label: "blob:write",
    hint: "Upload artifacts (murrmure_put_artifact / PUT /v1/artifacts)",
  },
  {
    value: "memory:read",
    label: "memory:read",
    hint: "Recall / reflect / recent via Hub-proxied memory tools",
  },
  {
    value: "memory:write",
    label: "memory:write",
    hint: "Retain / retire via Hub-proxied memory tools",
  },
  {
    value: "executor:poll",
    label: "executor:poll",
    hint: "Poll the external executor task queue",
  },
  {
    value: "hub:admin",
    label: "hub:admin",
    hint: "Hub-wide administration",
  },
];

const GRANTABLE_SET = new Set<string>(GRANTABLE_CAPABILITIES);

export function isGrantableCapability(value: string): value is GrantableCapability {
  return GRANTABLE_SET.has(value);
}

/** Parse comma-separated capabilities; throws with a message on unknown values. */
export function parseGrantableCapabilities(raw: string | undefined): GrantableCapability[] {
  if (!raw?.trim()) return [];
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const unknown = parts.filter((part) => !isGrantableCapability(part));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown capabilities: ${unknown.join(", ")}. Choose from: ${GRANTABLE_CAPABILITIES.join(", ")}`,
    );
  }
  return [...new Set(parts as GrantableCapability[])];
}

export function isLocalToolsCapabilitySet(capabilities: readonly string[]): boolean {
  if (capabilities.length !== LOCAL_TOOLS_CAPABILITIES.length) return false;
  return LOCAL_TOOLS_CAPABILITIES.every((cap) => capabilities.includes(cap));
}

/** @deprecated Internal compatibility export; public setup uses connection vocabulary. */
export const AGENT_GRANT_CAPABILITIES = LOCAL_TOOLS_CAPABILITIES;
export const AGENT_GRANT_CAPABILITIES_CSV = LOCAL_TOOLS_CAPABILITIES.join(",");
