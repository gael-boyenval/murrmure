import {
  buildEmitEventInputSchema,
  type EmittableEventsCatalog,
} from "@murrmure/hub-core";

type JsonSchema = Record<string, unknown>;

function stringSchema(description?: string): JsonSchema {
  return description ? { type: "string", description } : { type: "string" };
}

function objectSchema(
  properties: Record<string, JsonSchema>,
  options?: {
    required?: string[];
    description?: string;
    additionalProperties?: boolean | JsonSchema;
  },
): JsonSchema {
  const schema: JsonSchema = {
    type: "object",
    properties,
    additionalProperties: options?.additionalProperties ?? false,
  };
  if (options?.required?.length) {
    schema.required = options.required;
  }
  if (options?.description) {
    schema.description = options.description;
  }
  return schema;
}

function stringArraySchema(description?: string): JsonSchema {
  return {
    type: "array",
    items: { type: "string" },
    ...(description ? { description } : {}),
  };
}

const PLATFORM_TOOL_INPUT_SCHEMAS: Record<string, JsonSchema> = {
  query_ask: objectSchema(
    {
      target_space_id: stringSchema("Target space id for the query"),
      query_type: stringSchema("Typed query identifier"),
      params: {
        type: "object",
        additionalProperties: true,
        description: "Query parameters payload",
      },
      timeout_ms: {
        type: "integer",
        minimum: 1,
        description: "Optional timeout in milliseconds",
      },
    },
    { required: ["target_space_id", "query_type"] },
  ),
  murrmure_apply_space: objectSchema(
    {
      space_id: stringSchema("Optional target space id override"),
      bundle: {
        type: "object",
        additionalProperties: true,
        description: "Space bundle containing actions/flows/views/hooks",
      },
    },
    { required: ["bundle"] },
  ),
  murrmure_space_status: objectSchema({
    space_id: stringSchema("Optional target space id override"),
  }),
  murrmure_space_health: objectSchema({
    space_id: stringSchema("Optional target space id override"),
  }),
  murrmure_grant_mint: objectSchema({
    space_id: stringSchema("Optional target space id override"),
    label: stringSchema("Grant label"),
    harness: stringSchema("Optional harness id"),
    scopes: stringArraySchema("Scope strings to attach to the grant"),
    capabilities: stringArraySchema("Capability strings to attach to the grant"),
    flow_acl: stringArraySchema("Allowed flow ids for this grant"),
  }),
  murrmure_invoke_action: objectSchema(
    {
      action_name: stringSchema("Indexed action name"),
      space_id: stringSchema("Optional target space id override"),
      session_id: stringSchema("Optional existing session id"),
      run_id: stringSchema("Optional existing run id"),
      step_id: stringSchema("Optional step id for journaling"),
      params: {
        type: "object",
        additionalProperties: true,
        description: "Action parameter payload",
      },
      expect: {
        type: "object",
        additionalProperties: true,
        description: "Optional expected outcome contract",
      },
      artifacts_in: stringArraySchema("Optional artifact transfer ids"),
      delivery: {
        type: "string",
        enum: ["fail_fast", "queue_until_executor"],
        description: "Dispatch mode when executor is unavailable",
      },
    },
    { required: ["action_name"] },
  ),
  murrmure_resolve_step: objectSchema(
    {
      run_id: stringSchema("Run identifier"),
      step_id: stringSchema("Step identifier"),
      branch: stringSchema("Selected branch id"),
      payload: {
        type: "object",
        additionalProperties: true,
        description: "Step resolution payload",
      },
      artifacts_out: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            slot: stringSchema("Artifact slot name"),
            path: stringSchema("Relative path on disk"),
          },
          required: ["slot", "path"],
        },
        description: "Optional artifacts to register from workspace outputs",
      },
      upload_intent_id: stringSchema(
        "Authorized artifact upload reference for remote/federated resolution",
      ),
      idempotency_key: stringSchema("Optional idempotency key"),
    },
    { required: ["run_id", "step_id", "branch"] },
  ),
  murrmure_list_emittable_events: objectSchema({
    space_id: stringSchema("Optional target space id override"),
  }),
  murrmure_list_handlers: objectSchema({
    space_id: stringSchema("Optional target space id override"),
  }),
  murrmure_create_session: objectSchema({
    title: stringSchema("Session title"),
    subject: {
      oneOf: [
        { type: "string" },
        { type: "object", additionalProperties: true },
      ],
      description: "Optional session subject metadata",
    },
    space_id: stringSchema("Optional target space id override"),
  }),
  murrmure_list_sessions: objectSchema({
    status: stringSchema("Optional session status filter"),
    space_id: stringSchema("Optional space filter"),
  }),
  murrmure_get_session: objectSchema(
    {
      session_id: stringSchema("Session identifier"),
    },
    { required: ["session_id"] },
  ),
  murrmure_create_run: objectSchema(
    {
      session_id: stringSchema("Session identifier"),
      flow_id: stringSchema("Optional flow id"),
      input: {
        type: "object",
        additionalProperties: true,
        description: "Flow run input payload",
      },
      params: {
        type: "object",
        additionalProperties: true,
        description: "Alias of input",
      },
      space_id: stringSchema("Optional target space id override"),
      reference_run_ids: stringArraySchema("Optional reference run ids"),
    },
    { required: ["session_id"] },
  ),
  murrmure_get_run: objectSchema(
    {
      run_id: stringSchema("Run identifier"),
      instance_id: stringSchema("Legacy alias for run_id"),
    },
    { required: ["run_id"] },
  ),
  murrmure_get_run_context: objectSchema(
    {
      run_id: stringSchema("Run identifier"),
      instance_id: stringSchema("Legacy alias for run_id"),
    },
    { required: ["run_id"] },
  ),
  murrmure_list_step_contracts: objectSchema(
    {
      run_id: stringSchema("Run identifier"),
    },
    { required: ["run_id"] },
  ),
  murrmure_get_run_graph: objectSchema(
    {
      run_id: stringSchema("Run identifier"),
      instance_id: stringSchema("Legacy alias for run_id"),
    },
    { required: ["run_id"] },
  ),
  murrmure_attach_orchestration: objectSchema(
    {
      session_id: stringSchema("Session identifier"),
      manifest: {
        type: "object",
        additionalProperties: true,
        description: "Flow manifest payload",
      },
      kind: stringSchema("Optional orchestration payload kind"),
      space_id: stringSchema("Optional target space id override"),
      breakglass: { type: "boolean", description: "Bypass orchestration guardrails" },
    },
    { required: ["session_id"] },
  ),
  murrmure_cancel_run: objectSchema(
    {
      run_id: stringSchema("Run identifier"),
      space_id: stringSchema("Optional space override for audit"),
      instance_id: stringSchema("Legacy alias for run_id"),
    },
    { required: ["run_id"] },
  ),
  murrmure_wait_for_run: objectSchema(
    {
      run_id: stringSchema("Run identifier"),
      instance_id: stringSchema("Legacy alias for run_id"),
      timeout_ms: {
        type: "integer",
        minimum: 1,
        description: "Maximum wait duration in milliseconds",
      },
    },
    { required: ["run_id"] },
  ),
  murrmure_journal_query: objectSchema({
    subject: stringSchema("Filter by journal subject"),
    type: stringSchema("Filter by event type"),
    session: stringSchema("Filter by session id (legacy alias)"),
    session_id: stringSchema("Filter by session id"),
    space_id: stringSchema("Filter by space id"),
    since: stringSchema("ISO timestamp lower bound"),
    until: stringSchema("ISO timestamp upper bound"),
    limit: { type: "integer", minimum: 1, description: "Maximum number of entries" },
  }),
};

const FALLBACK_EMIT_CATALOG: EmittableEventsCatalog = {
  caller_space_id: "",
  caller_source: "",
  events: [],
};

export function buildPlatformToolInputSchema(
  toolName: string,
  options?: { emitCatalog?: EmittableEventsCatalog },
): JsonSchema | undefined {
  if (toolName === "murrmure_emit_event") {
    return buildEmitEventInputSchema(options?.emitCatalog ?? FALLBACK_EMIT_CATALOG);
  }
  return PLATFORM_TOOL_INPUT_SCHEMAS[toolName];
}
