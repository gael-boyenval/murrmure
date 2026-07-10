import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { SpaceIndexSnapshot } from "@murrmure/contracts";
import {
  bootstrapAuth,
  createSpace,
  startHubTestFixtureAsync,
} from "../../helpers/space-fixture.js";

describe("http/mcp/space-health", () => {
  let baseUrl = "";
  let cleanup: (() => void) | undefined;
  let bootstrapToken = "";
  let spaceId = "";
  let readToken = "";
  let runId = "";
  let fixture:
    | Awaited<ReturnType<typeof startHubTestFixtureAsync>>
    | undefined;

  beforeAll(async () => {
    fixture = await startHubTestFixtureAsync({
      prefix: "mcp-space-health-",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000079",
    });
    baseUrl = fixture.baseUrl;
    cleanup = fixture.cleanup;
    bootstrapToken = fixture.bootstrapToken;

    spaceId = await createSpace(baseUrl, bootstrapToken, {
      slug: "mcp-space-health",
      name: "MCP Space Health",
    });

    const bareSpace = spaceId.startsWith("spc_") ? spaceId.slice(4) : spaceId;
    const persistence = fixture.daemon.ctx.murrmurePersistence;
    const current = await persistence.getSpaceIndexSnapshot(bareSpace);
    const next: SpaceIndexSnapshot = {
      ...current,
      hooks: [
        {
          key: "health-handler",
          digest: "sha256:health-handler",
          payload_json: JSON.stringify({
            id: "health-handler",
            contract_keys: ["preview-review.write_spec"],
            on: "step.opened",
            type: "shell_spawn",
            complete: "explicit",
            command: "cursor agent -p --force {{prompt}}",
          }),
        },
      ],
    };
    await persistence.replaceSpaceIndex(bareSpace, next);

    const sessionRes = await fetch(`${baseUrl}/v1/sessions`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        title: "MCP run context",
        space_id: spaceId,
      }),
    });
    expect(sessionRes.status).toBe(201);
    const session = (await sessionRes.json()) as { session_id: string };

    const runRes = await fetch(`${baseUrl}/v1/sessions/${session.session_id}/runs`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        flow_id: null,
        input: {},
        space_id: spaceId,
      }),
    });
    expect(runRes.status).toBe(201);
    const runBody = (await runRes.json()) as { run: { run_id: string } };
    runId = runBody.run.run_id;

    const grantRes = await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        label: "mcp-space-health-read",
        capabilities: ["space:read"],
      }),
    });
    expect(grantRes.status).toBe(200);
    readToken = ((await grantRes.json()) as { token: string }).token;
  });

  afterAll(() => cleanup?.());

  test("murrmure_space_health returns index and handler summary", async () => {
    const res = await fetch(`${baseUrl}/v1/mcp/tools/call?space_id=${spaceId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${readToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "murrmure_space_health",
        arguments: {},
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: {
        space_id: string;
        healthy: boolean;
        warnings: string[];
        handlers: { count: number; contract_key_count: number };
        index: { counts: { hooks: number } };
      };
    };
    expect(body.result.space_id).toBe(spaceId);
    expect(body.result.index.counts.hooks).toBe(1);
    expect(body.result.handlers.count).toBe(1);
    expect(body.result.handlers.contract_key_count).toBe(1);
    expect(Array.isArray(body.result.warnings)).toBe(true);
  });

  test("murrmure_get_run_context returns run and optional contracts", async () => {
    const res = await fetch(`${baseUrl}/v1/mcp/tools/call?space_id=${spaceId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${readToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "murrmure_get_run_context",
        arguments: {
          run_id: runId,
        },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: {
        run: { run_id: string };
        step_contracts: Record<string, unknown> | null;
      };
    };
    expect(body.result.run.run_id).toBe(runId);
    expect(body.result.step_contracts === null || typeof body.result.step_contracts === "object").toBe(true);
  });
});
