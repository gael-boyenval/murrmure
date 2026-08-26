import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  applySpaceBundle,
  bootstrapAuth,
  createSpace,
  startHubTestFixtureAsync,
} from "../../helpers/space-fixture.js";

const LOCAL_TOOLS_CAPS = ["space:read", "flow:read", "flow:run", "step:resolve"];

function emptyApply() {
  return {
    actions: { digest: "sha256:mcp-dir-actions", file: { version: 1, actions: {} } },
    hooks: { digest: "sha256:mcp-dir-hooks", file: { version: 1, hooks: {} } },
    handlers: { digest: "sha256:mcp-dir-handlers-empty", file: { version: 1, handlers: [] } },
    flows: [],
    views: [],
  };
}

function directiveHandlerApply() {
  return {
    ...emptyApply(),
    handlers: {
      digest: "sha256:mcp-dir-handlers",
      file: {
        version: 1,
        handlers: [
          {
            id: "directive",
            contract_keys: ["directive.execute"],
            on: "step.opened::directive.execute",
            type: "shell_spawn",
            complete: "explicit",
            prompt: "{{input.prompt}}",
            command: "true",
          },
        ],
      },
    },
  };
}

describe("http/mcp/directives", () => {
  let baseUrl = "";
  let cleanup: (() => void) | undefined;
  let bootstrapToken = "";
  let callerSpace = "";
  let eligibleSpace = "";
  let localToken = "";
  let adminToken = "";

  beforeAll(async () => {
    const fixture = await startHubTestFixtureAsync({
      prefix: "mcp-directives-",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000092",
    });
    baseUrl = fixture.baseUrl;
    bootstrapToken = fixture.bootstrapToken;
    cleanup = fixture.cleanup;

    callerSpace = await createSpace(baseUrl, bootstrapToken, {
      slug: "mcp-dir-caller",
      name: "MCP Directive Caller",
    });
    eligibleSpace = await createSpace(baseUrl, bootstrapToken, {
      slug: "mcp-dir-eligible",
      name: "MCP Directive Eligible",
    });

    const linked = await fetch(`${baseUrl}/v1/spaces/${eligibleSpace}/link`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({ path: fixture.dataDir, primary: true }),
    });
    expect(linked.status).toBe(200);

    const bound = await applySpaceBundle(
      baseUrl,
      bootstrapToken,
      eligibleSpace,
      directiveHandlerApply(),
    );
    expect(bound.status).toBe(200);
    const unbound = await applySpaceBundle(baseUrl, bootstrapToken, callerSpace, emptyApply());
    expect(unbound.status).toBe(200);

    const localGrant = await fetch(`${baseUrl}/v1/spaces/${callerSpace}/grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({ label: "local-tools", capabilities: LOCAL_TOOLS_CAPS }),
    });
    expect(localGrant.status).toBe(200);
    localToken = ((await localGrant.json()) as { token: string }).token;

    const adminGrant = await fetch(`${baseUrl}/v1/spaces/${callerSpace}/grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({ label: "hub-admin", capabilities: ["hub:admin"] }),
    });
    expect(adminGrant.status).toBe(200);
    adminToken = ((await adminGrant.json()) as { token: string }).token;
  });

  afterAll(() => cleanup?.());

  function catalog(token: string) {
    return fetch(`${baseUrl}/v1/mcp/catalog?space_id=${callerSpace}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  function call(token: string, name: string, args: Record<string, unknown> = {}) {
    return fetch(`${baseUrl}/v1/mcp/tools/call?space_id=${callerSpace}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, arguments: args }),
    });
  }

  test("local-tools catalog hides directive tools", async () => {
    const res = await catalog(localToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tools: Array<{ name: string }> };
    const names = body.tools.map((tool) => tool.name);
    expect(names).not.toContain("murrmure_list_directive_eligible");
    expect(names).not.toContain("murrmure_start_directive");
    expect(names).toContain("murrmure_create_run");
  });

  test("hub:admin catalog includes directive tools", async () => {
    const res = await catalog(adminToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tools: Array<{ name: string }> };
    const names = body.tools.map((tool) => tool.name);
    expect(names).toContain("murrmure_list_directive_eligible");
    expect(names).toContain("murrmure_start_directive");
  });

  test("local-tools call is 403", async () => {
    const res = await call(localToken, "murrmure_list_directive_eligible");
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string; hint?: { required_scope?: string } };
    expect(body.code).toBe("TOOL_NOT_AUTHORIZED");
    expect(body.hint?.required_scope).toBe("hub:admin");
  });

  test("hub:admin lists eligible spaces across the hub", async () => {
    const res = await call(adminToken, "murrmure_list_directive_eligible");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: { spaces: Array<{ space_id: string; handler_id: string }> };
    };
    expect(body.result.spaces.map((space) => space.space_id)).toEqual([eligibleSpace]);
    expect(body.result.spaces[0]?.handler_id).toBe("directive");
  });

  test("hub:admin starts a directive on an eligible space", async () => {
    const res = await call(adminToken, "murrmure_start_directive", {
      prompt: "Refine the space description",
      space_ids: [eligibleSpace],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: {
        starts: Array<{ space_id: string; ok: boolean; run_id?: string; session_id?: string }>;
      };
    };
    expect(body.result.starts).toHaveLength(1);
    expect(body.result.starts[0]?.ok).toBe(true);
    expect(body.result.starts[0]?.space_id).toBe(eligibleSpace);
    expect(body.result.starts[0]?.run_id).toMatch(/^run_/);
    expect(body.result.starts[0]?.session_id).toMatch(/^ses_/);
  });
});
