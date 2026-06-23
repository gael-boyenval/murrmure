import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@studio/hub-core";
import { installExampleCapability } from "../../helpers/example-install.js";

describe("feature-spec/happy-path-publish", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let spaceId: string;
  let dataDir: string;
  let token: string;
  let specKey: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "fs-happy-"));
    dataDir = join(dir, "data");
    process.env.STUDIO_SPACE_ID = "";
    const daemon = await startHubDaemon({
      databasePath: join(dir, "studio.db"),
      port: 0,
      dataDir,
      defaultSpaceId: "",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000001",
    });
    const addr = daemon.server.address();
    const port = typeof addr === "object" && addr ? addr.port : 8787;
    baseUrl = `http://127.0.0.1:${port}`;
    cleanup = () => {
      daemon.ctx.workerPool.killAll();
      daemon.server.close();
      rmSync(dir, { recursive: true, force: true });
    };

    const bootstrap = () => ({
      Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000001")}`,
      "Content-Type": "application/json",
    });

    const space = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({ slug: "product-specs", install_policy: "authorized_agents" }),
    });
    spaceId = (await space.json()).space_id;

    await installExampleCapability({
      baseUrl,
      spaceId,
      bootstrapHeaders: bootstrap,
      exampleId: "feature-spec",
      hubDataDir: dataDir,
      config: { skip_review: true, required_approver_role: "spec_approver" },
    });

    const grant = await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        label: "spec-agent",
        scopes: ["space:read", "state:transition", "event:emit", "blob:write"],
        capability_acl: ["feature-spec"],
      }),
    });
    token = (await grant.json()).token;
  });

  afterAll(() => cleanup?.());

  const auth = () => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  });

  test("open_spec → gathering_context", async () => {
    const res = await fetch(`${baseUrl}/v1/mcp/tools/call?space_id=${spaceId}`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        name: "open_spec",
        arguments: { title: "Auth refresh token rotation" },
      }),
    });
    const body = await res.json();
    expect(body.result.state).toBe("gathering_context");
    specKey = body.result.spec_key;
    expect(specKey).toMatch(/^ins_/);
  });

  test("patch sections and transition to draft", async () => {
    await fetch(`${baseUrl}/v1/mcp/tools/call?space_id=${spaceId}`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        name: "patch_spec_section",
        arguments: {
          spec_key: specKey,
          section_id: "goals",
          title: "Goals",
          body: "Rotate refresh tokens on use.",
          order: 1,
        },
      }),
    });
    await fetch(`${baseUrl}/v1/mcp/tools/call?space_id=${spaceId}`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        name: "patch_spec_section",
        arguments: {
          spec_key: specKey,
          section_id: "api",
          title: "API",
          body: "POST /auth/refresh returns new pair.",
          order: 2,
        },
      }),
    });
    const tr = await fetch(`${baseUrl}/v1/mcp/tools/call?space_id=${spaceId}`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        name: "transition_spec",
        arguments: { spec_key: specKey, event: "context_ready" },
      }),
    });
    expect((await tr.json()).result.state).toBe("draft");
  });

  test("publish emits spec.published with body_ref", async () => {
    const pub = await fetch(`${baseUrl}/api/feature-spec/specs/${specKey}/publish`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000001")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event: "publish_direct" }),
    });
    expect(pub.status).toBe(200);
    expect((await pub.json()).state).toBe("published");

    const events = await fetch(`${baseUrl}/v1/spaces/${spaceId}/events?from_seq=0`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const tail = await events.json();
    const published = tail.events.find(
      (e: { payload: { type?: string } }) => e.payload?.type === "spec.published",
    );
    expect(published).toBeDefined();
    expect(published.payload.title).toBe("Auth refresh token rotation");
    expect(published.payload.body_ref).toMatch(/^blob:/);
    expect(published.payload.published_by).toBe("actor_bootstrap");
  });
});
