import type { ContractV2 } from "@studio/contracts";

export interface McpWakeAction {
  type: "mcp_wake";
  target_space_id: string;
  wake_label: string;
  payload_map: Record<string, string>;
  session_hint?: "wake";
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
}

export const TRIGGER_TEMPLATES: Record<string, TriggerTemplate> = {
  "spec-published-wake-dev": {
    template_id: "spec-published-wake-dev",
    name: "Spec published → wake dev agent",
    description: "When a spec is published, mcp_wake the dev agent with summary fields only (no body_ref).",
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
    name: "Backend work.ready → wake frontend",
    description: "When backend emits work.ready for an API change, wake the frontend agent.",
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

export function normalizeTriggerAction(action: Record<string, unknown>): McpWakeAction {
  const type = String(action.type ?? "mcp_wake");
  if (type === "wake_mcp_agent" || action.tool) {
    return {
      type: "mcp_wake",
      target_space_id: String(action.target_space_id ?? ""),
      wake_label: String(action.wake_label ?? action.tool ?? ""),
      payload_map: (action.payload_map as Record<string, string>) ?? {},
      session_hint: "wake",
    };
  }
  return {
    type: "mcp_wake",
    target_space_id: String(action.target_space_id ?? ""),
    wake_label: String(action.wake_label ?? ""),
    payload_map: (action.payload_map as Record<string, string>) ?? {},
    session_hint: (action.session_hint as "wake") ?? "wake",
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
