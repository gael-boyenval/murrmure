import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@studio/hub-core";
import { installExampleCapability } from "../../helpers/example-install.js";

describe("capability-runtime/install-policy-violation", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let prodId: string;
  let installId: string;
  let agentToken: string;
  let dataDir: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "cr-install-policy-"));
    dataDir = join(dir, "data");
    const daemon = await startHubDaemon({
      databasePath: join(dir, "studio.db"),
      port: 0,
      dataDir: join(dir, "data"),
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

    const prod = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({ slug: "ui-production", name: "UI Production", install_policy: "human_only" }),
    });
    prodId = (await prod.json()).space_id;

    const { install_id } = await installExampleCapability({
      baseUrl,
      spaceId: prodId,
      bootstrapHeaders: bootstrap,
      exampleId: "review-loop",
      hubDataDir: dataDir,
      apply: false,
    });
    installId = install_id;

    const grant = await fetch(`${baseUrl}/v1/spaces/${prodId}/grants`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        label: "agent-installer",
        harness: "cloud-worker",
        scopes: ["flow:install", "space:read"],
        capability_acl: ["review-loop"],
      }),
    });
    agentToken = (await grant.json()).token;
  });

  afterAll(() => cleanup?.());

  test("agent apply on human_only prod → 403 INSTALL_POLICY_VIOLATION", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${prodId}/flows/${installId}/apply`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${agentToken}`,
        "Content-Type": "application/json",
      },
    });
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.code).toBe("INSTALL_POLICY_VIOLATION");
  });

  test("human apply succeeds", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${prodId}/flows/${installId}/apply`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000001")}`,
        "Content-Type": "application/json",
      },
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.evolution_state).toBe("live");
  });
});
