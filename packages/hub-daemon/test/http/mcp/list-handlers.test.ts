import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { SpaceIndexSnapshot } from "@murrmure/contracts";
import {
  bootstrapAuth,
  createSpace,
  startHubTestFixtureAsync,
} from "../../helpers/space-fixture.js";

describe("http/mcp/list-handlers", () => {
  let baseUrl = "";
  let cleanup: (() => void) | undefined;
  let bootstrapToken = "";
  let spaceId = "";
  let readToken = "";
  let fixture:
    | Awaited<ReturnType<typeof startHubTestFixtureAsync>>
    | undefined;

  beforeAll(async () => {
    fixture = await startHubTestFixtureAsync({
      prefix: "mcp-list-handlers-",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000078",
    });
    baseUrl = fixture.baseUrl;
    cleanup = fixture.cleanup;
    bootstrapToken = fixture.bootstrapToken;

    spaceId = await createSpace(baseUrl, bootstrapToken, {
      slug: "mcp-list-handlers",
      name: "MCP List Handlers",
    });

    const bareSpace = spaceId.startsWith("spc_") ? spaceId.slice(4) : spaceId;
    const persistence = fixture.daemon.ctx.murrmurePersistence;
    const current = await persistence.getSpaceIndexSnapshot(bareSpace);
    const next: SpaceIndexSnapshot = {
      ...current,
      hooks: [
        {
          key: "write-spec",
          digest: "sha256:handlers-vs1",
          payload_json: JSON.stringify({
            id: "write-spec",
            contract_keys: ["preview-review.write_spec", "preview-review.intake"],
            on: "step.opened::preview-review.write_spec",
            type: "shell_spawn",
            complete: "explicit",
            command: "cursor agent -p --force {{prompt}}",
          }),
        },
      ],
    };
    await persistence.replaceSpaceIndex(bareSpace, next);

    const grantRes = await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        label: "mcp-read-handlers",
        capabilities: ["space:read"],
      }),
    });
    expect(grantRes.status).toBe(200);
    readToken = ((await grantRes.json()) as { token: string }).token;
  });

  afterAll(() => cleanup?.());

  test("returns indexed handlers with minimal fields", async () => {
    const res = await fetch(`${baseUrl}/v1/mcp/tools/call?space_id=${spaceId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${readToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "murrmure_list_handlers",
        arguments: {},
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: { space_id: string; handlers: Array<{ id: string; contract_keys: string[]; type: string }> };
    };
    expect(body.result.space_id).toBe(spaceId);
    expect(body.result.handlers).toEqual([
      {
        id: "write-spec",
        contract_keys: ["preview-review.write_spec", "preview-review.intake"],
        type: "shell_spawn",
      },
    ]);
  });
});
