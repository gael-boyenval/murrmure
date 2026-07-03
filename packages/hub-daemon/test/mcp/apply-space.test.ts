import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("mcp/murrmure_apply_space", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-mcp-apply-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000003";
    const daemon = await startHubDaemon({
      databasePath: join(dir, "murrmure.db"),
      port: 0,
      dataDir: join(dir, "data"),
      defaultSpaceId: "",
      bootstrapToken,
    });
    const addr = daemon.server.address();
    const port = typeof addr === "object" && addr ? addr.port : 8787;
    baseUrl = `http://127.0.0.1:${port}`;
    cleanup = () => {
      daemon.server.close();
      rmSync(dir, { recursive: true, force: true });
    };

    const auth = {
      Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
      "Content-Type": "application/json",
    };
    const created = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ slug: "mcp-apply", name: "MCP Apply" }),
    });
    const body = await created.json();
    spaceId = body.space_id;
  });

  afterAll(() => cleanup?.());

  const auth = () => ({
    Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
    "Content-Type": "application/json",
  });

  const callApply = (bundle: Record<string, unknown>, targetSpaceId = spaceId) =>
    fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        name: "murrmure_apply_space",
        space_id: targetSpaceId,
        arguments: { space_id: targetSpaceId, bundle },
      }),
    });

  const applyBundle = {
    actions: {
      digest: "sha256:mcpapply",
      file: {
        version: 1,
        actions: {
          hello: { executor: "shell" },
        },
      },
    },
    flows: [],
    views: [],
  };

  test("murrmure_apply_space indexes actions", async () => {
    const res = await callApply(applyBundle);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.summary.actions).toBe(1);
  });

  test("murrmure_apply_space rejects inline script flows", async () => {
    const res = await callApply({
      ...applyBundle,
      flows: [
        {
          flow_id: "flw_bad",
          rel_path: "flows/bad/flow.manifest.yaml",
          digest: "sha256:badflow",
          manifest: {
            apiVersion: "murrmure.flow/v1",
            name: "bad",
            start: { manual: true },
            steps: [{ id: "x", script: "echo nope" }],
          },
        },
      ],
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toContain("inline script");
  });

  test("murrmure_apply_space rejects missing space", async () => {
    const res = await callApply(applyBundle, "spc_does_not_exist");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe("Space not found");
  });

  test("murrmure_apply_space rejects cross-space arguments.space_id bypass", async () => {
    const other = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ slug: "mcp-other", name: "MCP Other" }),
    });
    const otherBody = await other.json();
    const otherSpaceId = otherBody.space_id as string;

    const grant = await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        label: "scoped-writer",
        scopes: ["space:read", "space:write"],
      }),
    });
    expect(grant.status).toBe(200);
    const grantBody = await grant.json();
    const scopedToken = grantBody.token as string;

    const res = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${scopedToken.startsWith("tok_") ? scopedToken : addTokenId(scopedToken)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "murrmure_apply_space",
        space_id: spaceId,
        arguments: { space_id: otherSpaceId, bundle: applyBundle },
      }),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toContain("Token not valid for this space");
  });
});
