import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@studio/hub-core";

describe("cross-space/xs0-policy", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let sourceId: string;
  let deniedTargetId: string;
  let openTargetId: string;

  const bootstrap = () => ({
    Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000001")}`,
    "Content-Type": "application/json",
  });

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "xs0-policy-"));
    const daemon = await startHubDaemon({
      databasePath: join(dir, "studio.db"),
      port: 0,
      dataDir: join(dir, "data"),
      defaultSpaceId: "",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000001",
    });
    const port = (daemon.server.address() as { port: number }).port;
    baseUrl = `http://127.0.0.1:${port}`;
    cleanup = () => {
      daemon.server.close();
      rmSync(dir, { recursive: true, force: true });
    };

    const mk = async (slug: string) => {
      const r = await fetch(`${baseUrl}/v1/spaces`, {
        method: "POST",
        headers: bootstrap(),
        body: JSON.stringify({ slug, install_policy: "authorized_agents" }),
      });
      return (await r.json()).space_id as string;
    };
    sourceId = await mk("xs0-source");
    deniedTargetId = await mk("xs0-denied");
    openTargetId = await mk("xs0-open");

    // Denied target: inbound allowlist excludes the source space.
    await fetch(`${baseUrl}/v1/spaces/${deniedTargetId}`, {
      method: "PATCH",
      headers: bootstrap(),
      body: JSON.stringify({ query_policy: { inbound_allowlist: ["spc_unrelated"] } }),
    });
  });

  afterAll(() => cleanup?.());

  test("disallowed source → QUERY_POLICY_DENIED", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${sourceId}/queries/ask`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({ target_space_id: deniedTargetId, query_type: "spec_summary@1", params: {} }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.status).toBe("failed");
    expect(body.reason).toBe("QUERY_POLICY_DENIED");
  });

  test("unsupported query type (openapi_diff_ref@1 is XS1) → 400", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${sourceId}/queries/ask`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({ target_space_id: openTargetId, query_type: "openapi_diff_ref@1", params: {} }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toBe("UNKNOWN_QUERY_TYPE");
  });
});
