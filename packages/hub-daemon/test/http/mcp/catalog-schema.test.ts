import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  applySpaceBundle,
  bootstrapAuth,
  createSpace,
  startHubTestFixtureAsync,
} from "../../helpers/space-fixture.js";

const PLATFORM_TOOL_NAMES = [
  "query_ask",
  "murrmure_apply_space",
  "murrmure_space_status",
  "murrmure_space_health",
  "murrmure_resolve_step",
  "murrmure_open_child_step",
  "murrmure_list_emittable_events",
  "murrmure_list_handlers",
  "murrmure_list_personas",
  "murrmure_list_invitable_spaces",
  "murrmure_list_memory_banks",
  "murrmure_list_directive_eligible",
  "murrmure_start_directive",
  "murrmure_start_meeting",
  "murrmure_meeting_transcript",
  "murrmure_get_artifact",
  "murrmure_put_artifact",
  "murrmure_emit_event",
  "murrmure_create_session",
  "murrmure_list_sessions",
  "murrmure_get_session",
  "murrmure_create_run",
  "murrmure_get_run",
  "murrmure_get_run_context",
  "murrmure_list_step_contracts",
  "murrmure_get_run_graph",
  "murrmure_attach_orchestration",
  "murrmure_cancel_run",
  "murrmure_wait_for_run",
  "murrmure_journal_query",
] as const;

const P0_REQUIRED: Record<string, string[]> = {
  murrmure_resolve_step: ["run_id", "step_id", "branch"],
  murrmure_open_child_step: ["run_id", "parent_step_id", "child_step_id", "idempotency_key"],
  murrmure_get_run: ["run_id"],
  murrmure_get_run_context: ["run_id"],
  murrmure_wait_for_run: ["run_id"],
  murrmure_list_step_contracts: ["run_id"],
  murrmure_get_session: ["session_id"],
  murrmure_create_run: ["session_id"],
  murrmure_journal_query: [],
  murrmure_space_status: [],
  murrmure_space_health: [],
  murrmure_list_handlers: [],
  murrmure_list_personas: [],
  murrmure_list_invitable_spaces: [],
  murrmure_list_memory_banks: [],
  murrmure_list_directive_eligible: [],
  murrmure_start_directive: ["prompt"],
  murrmure_start_meeting: ["participants", "chair"],
  murrmure_meeting_transcript: ["session_id"],
  murrmure_get_artifact: ["transfer_id"],
  murrmure_put_artifact: [],
};

const ALL_PLATFORM_CAPABILITIES = [
  "hub:admin",
  "space:read",
  "space:write",
  "step:resolve",
  "flow:run",
  "flow:read",
  "journal:read",
  "event:emit",
  "space:enter",
  "blob:read",
  "blob:write",
  "memory:read",
  "memory:write",
  "executor:poll",
];

interface CatalogTool {
  name: string;
  inputSchema?: Record<string, unknown>;
}

function requiredKeys(schema: Record<string, unknown> | undefined): string[] {
  if (!schema) return [];
  const value = schema.required;
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

describe("http/mcp/catalog-schema", () => {
  let baseUrl = "";
  let cleanup: (() => void) | undefined;
  let bootstrapToken = "";
  let spaceId = "";
  let fullToken = "";

  beforeAll(async () => {
    const fixture = await startHubTestFixtureAsync({
      prefix: "mcp-catalog-schema-",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000077",
    });
    baseUrl = fixture.baseUrl;
    cleanup = fixture.cleanup;
    bootstrapToken = fixture.bootstrapToken;

    spaceId = await createSpace(baseUrl, bootstrapToken, { slug: "mcp-schema-space" });

    const applyRes = await applySpaceBundle(baseUrl, bootstrapToken, spaceId, {
      actions: {
        digest: "sha256:mcp-schema-action",
        file: {
          version: 1,
          actions: {
            handle_spec_published: { executor: "cursor-mcp" },
          },
        },
      },
      executors: {
        digest: "sha256:mcp-schema-executor",
        file: {
          executors: {
            "cursor-mcp": {
              binding: { type: "mcp_session", executor_id: "cursor-mcp" },
            },
          },
        },
      },
    });
    expect(applyRes.status).toBe(200);

    const grantRes = await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        label: "schema-matrix",
        capabilities: ALL_PLATFORM_CAPABILITIES,
      }),
    });
    expect(grantRes.status).toBe(200);
    fullToken = ((await grantRes.json()) as { token: string }).token;
  });

  afterAll(() => cleanup?.());

  test("catalog returns all platform tools with non-empty inputSchema", async () => {
    const res = await fetch(`${baseUrl}/v1/mcp/catalog?space_id=${spaceId}`, {
      headers: { Authorization: `Bearer ${fullToken}` },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { tools: CatalogTool[] };
    const tools = body.tools ?? [];
    const names = tools.map((tool) => tool.name).sort();
    expect(names).toEqual([...PLATFORM_TOOL_NAMES].sort());

    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    for (const toolName of PLATFORM_TOOL_NAMES) {
      const schema = byName.get(toolName)?.inputSchema;
      expect(schema).toBeTruthy();
      expect(schema?.type).toBe("object");
      expect(Object.keys(schema ?? {}).length).toBeGreaterThan(0);
    }

    for (const [toolName, expectedRequired] of Object.entries(P0_REQUIRED)) {
      const actualRequired = requiredKeys(byName.get(toolName)?.inputSchema).sort();
      expect(actualRequired).toEqual([...expectedRequired].sort());
    }
  });

  test("handshake with a stale last_ack_seq still returns the live catalog", async () => {
    const res = await fetch(`${baseUrl}/v1/mcp/session/handshake`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fullToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        space_id: spaceId,
        client_id: "stale-ack-client",
        last_ack_seq: 99,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      handshake_ack_seq: number;
      server_tools: string[];
      messages: Array<{ method: string }>;
    };
    expect(body.handshake_ack_seq).toBeGreaterThan(0);
    expect(body.server_tools).toContain("murrmure_list_directive_eligible");
    expect(body.server_tools).toContain("murrmure_start_directive");
    expect(body.messages.some((message) => message.method === "murrmure/control.handshake_ack")).toBe(
      true,
    );
  });

  test("removed grant/action MCP paths have no public call surface", async () => {
    const invokeRes = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fullToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "murrmure_invoke_action",
        space_id: spaceId,
        arguments: {
          action_name: "handle_spec_published",
          params: {
            instruction: "Implement schema checks for the new release.",
            spec_key: "ins_catalog_prompt",
          },
        },
      }),
    });
    expect(invokeRes.status).toBe(403);
  });
});
