import type { ContractV2 } from "@murrmure/contracts";

export interface McpWakeAction {
  type: "mcp_wake";
  target_space_id: string;
  wake_label: string;
  payload_map: Record<string, string>;
  session_hint?: "wake";
}

/**
 * Strict error raised at the register/apply boundaries when a trigger action
 * uses the retired `mcp_wake` wire (or its legacy aliases). The `mcp_wake`
 * trigger-action model is retired (Task 15 Lane C): the `POST /v1/mcp/wake`
 * wire returns 404 and `mcpWake(...)` is not a runtime primitive. New spaces
 * declare event reactions with `on: event:` handlers in `.mrmr/space/handlers.yaml`
 * and emit via `murrmure_emit_event`. Registration must reject, not silently
 * normalize to `mcp_wake`.
 */
export class TriggerActionRejectedError extends Error {
  readonly code = "TRIGGER_ACTION_RETIRED" as const;
  constructor(reason: string) {
    super(reason);
    this.name = "TriggerActionRejectedError";
  }
}

const RETIRED_ACTION_TYPES = new Set(["mcp_wake", "wake_mcp_agent"]);

/**
 * Reject retired `mcp_wake` trigger actions at the register/apply boundary.
 * Throws `TriggerActionRejectedError` (strict, not silent) for `mcp_wake`, the
 * legacy `wake_mcp_agent` alias, or the legacy `tool` shorthand — all gone with
 * the retired wire.
 */
export function assertTriggerActionAccepted(action: Record<string, unknown>): void {
  const type = String(action.type ?? "");
  if (RETIRED_ACTION_TYPES.has(type) || action.tool !== undefined) {
    throw new TriggerActionRejectedError(
      "mcp_wake trigger actions are retired (Task 15 Lane C); use an on: event: handler in .mrmr/space/handlers.yaml + murrmure_emit_event",
    );
  }
}

export interface TriggerDedup {
  key_jsonpaths: string[];
  window_seconds: number;
}

export interface TriggerFilter {
  event_types: string[];
  source_space_id?: string;
  payload_match?: Record<string, unknown>;
}

export interface TriggerTemplate {
  template_id: string;
  name: string;
  description: string;
  filter: TriggerFilter;
  action: McpWakeAction;
  dedup: TriggerDedup;
  /**
   * Retired templates are retained as historical/removal records only. They are
   * still listed by `GET /triggers/templates` for traceability, but registration
   * via `from-template` is rejected (the `mcp_wake` wire is retired, 404).
   */
  retired?: boolean;
}

export const TRIGGER_TEMPLATES: Record<string, TriggerTemplate> = {
  "spec-published-wake-dev": {
    template_id: "spec-published-wake-dev",
    name: "Spec published → wake dev agent (retired)",
    description:
      "Retired (Task 15 Lane C): mcp_wake wire is 404. Historical preset only — register an on: event: handler for spec.published in .mrmr/space/handlers.yaml instead.",
    retired: true,
    filter: {
      event_types: ["spec.published"],
    },
    action: {
      type: "mcp_wake",
      target_space_id: "{{target_space_id}}",
      wake_label: "handle_spec_published",
      payload_map: {
        spec_key: "$.payload.spec_key",
        title: "$.payload.title",
        version: "$.payload.version",
        summary: "$.payload.summary",
        source_space_id: "$.space_id",
      },
      session_hint: "wake",
    },
    dedup: {
      key_jsonpaths: ["$.payload.spec_key", "$.payload.version"],
      window_seconds: 86400,
    },
  },
  "work-ready-wake-frontend": {
    template_id: "work-ready-wake-frontend",
    name: "Backend work.ready → wake frontend (retired)",
    description:
      "Retired (Task 15 Lane C): mcp_wake wire is 404. Historical preset only — register an on: event: handler for work.ready in .mrmr/space/handlers.yaml instead.",
    retired: true,
    filter: {
      event_types: ["work.ready"],
      payload_match: { type: "api_change" },
    },
    action: {
      type: "mcp_wake",
      target_space_id: "{{target_space_id}}",
      wake_label: "handle_work_ready",
      payload_map: {
        type: "$.payload.type",
        summary: "$.payload.summary",
        openapi_diff_ref: "$.payload.openapi_diff_ref",
      },
      session_hint: "wake",
    },
    dedup: {
      key_jsonpaths: ["$.payload.openapi_diff_ref"],
      window_seconds: 86400,
    },
  },
};

export function listTemplates(): TriggerTemplate[] {
  return Object.values(TRIGGER_TEMPLATES);
}

export interface FromTemplateInput {
  template_id: string;
  name?: string;
  source_space_id: string;
  target_space_id: string;
  wake_label?: string;
}

export function expandFromTemplate(input: FromTemplateInput): {
  name: string;
  filter: TriggerFilter;
  action: McpWakeAction;
  dedup: TriggerDedup;
} {
  const template = TRIGGER_TEMPLATES[input.template_id];
  if (!template) {
    throw new Error(`UNKNOWN_TEMPLATE:${input.template_id}`);
  }
  // Retired mcp_wake templates are historical/removal records only — reject
  // registration (strict, not silent). The wire is 404; new spaces use an
  // on: event: handler in .mrmr/space/handlers.yaml + murrmure_emit_event.
  if (template.retired || template.action.type === "mcp_wake") {
    throw new TriggerActionRejectedError(
      `trigger template '${input.template_id}' is retired (mcp_wake wire is 404); declare an on: event: handler in .mrmr/space/handlers.yaml instead`,
    );
  }

  const target = input.target_space_id.startsWith("spc_")
    ? input.target_space_id
    : `spc_${input.target_space_id}`;

  const source = input.source_space_id.startsWith("spc_")
    ? input.source_space_id
    : `spc_${input.source_space_id}`;

  return {
    name: input.name ?? template.name,
    filter: {
      ...template.filter,
      source_space_id: source,
    },
    action: {
      ...template.action,
      target_space_id: target,
      wake_label: input.wake_label ?? template.action.wake_label,
    },
    dedup: { ...template.dedup },
  };
}

export interface NormalizedTriggerAction {
  type: string;
  target_space_id: string;
  wake_label: string;
  payload_map: Record<string, string>;
  session_hint?: string;
}

/**
 * Dispatch-time shaper for legacy trigger rows already in the store.
 * Registration rejects `mcp_wake` (see `assertTriggerActionAccepted`), so this
 * only shapes legacy rows for the retired-dispatch failure payload. It does NOT
 * default to `mcp_wake` and does NOT map legacy aliases (`wake_mcp_agent` /
 * `tool`) — the silent normalize-on-register was removed (Task 15 Lane C).
 */
export function normalizeTriggerAction(action: Record<string, unknown>): NormalizedTriggerAction {
  return {
    type: action.type !== undefined ? String(action.type) : "",
    target_space_id: String(action.target_space_id ?? ""),
    wake_label: String(action.wake_label ?? ""),
    payload_map: (action.payload_map as Record<string, string>) ?? {},
    session_hint: action.session_hint !== undefined ? String(action.session_hint) : undefined,
  };
}

export function normalizeTriggerDedup(dedup: Record<string, unknown> | undefined): TriggerDedup {
  if (!dedup) {
    return { key_jsonpaths: ["$.event_id"], window_seconds: 86400 };
  }
  if (Array.isArray(dedup.key_jsonpaths)) {
    return {
      key_jsonpaths: dedup.key_jsonpaths as string[],
      window_seconds: Number(dedup.window_seconds ?? dedup.ttl_seconds ?? 86400),
    };
  }
  if (dedup.key_jsonpath) {
    return {
      key_jsonpaths: [String(dedup.key_jsonpath)],
      window_seconds: Number(dedup.window_seconds ?? dedup.ttl_seconds ?? 86400),
    };
  }
  return { key_jsonpaths: ["$.event_id"], window_seconds: 86400 };
}

export interface CatalogEventEntry {
  type: string;
  package_id: string | null;
  contract_version?: string;
  source?: string;
  payload_schema_summary?: { required?: string[] };
}

export function buildEventCatalog(
  mounts: Array<{ package_id: string; semver: string; contract_ref_id?: string }>,
  contracts: Array<{ contract_ref_id: string; contract: ContractV2 }>,
): CatalogEventEntry[] {
  const events: CatalogEventEntry[] = [{ type: "work.ready", package_id: null, source: "custom" }];

  for (const mount of mounts) {
    const contractDoc =
      contracts.find((c) => c.contract_ref_id === mount.contract_ref_id)?.contract ??
      contracts.find((c) => c.contract.id === mount.package_id)?.contract;
    if (!contractDoc?.events?.declarations) continue;

    for (const decl of contractDoc.events.declarations) {
      const schema = decl.schema ?? decl.payload_schema;
      const required = (schema?.required as string[] | undefined) ?? [];
      events.push({
        type: decl.type,
        package_id: mount.package_id,
        contract_version: mount.semver,
        payload_schema_summary: required.length ? { required } : undefined,
      });
    }
  }

  return events;
}
