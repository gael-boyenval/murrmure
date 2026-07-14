import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("http/spaces/apply", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-space-apply-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000002";
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
      body: JSON.stringify({ slug: "minimal", name: "Minimal" }),
    });
    const body = await created.json();
    spaceId = body.space_id;
  });

  afterAll(() => cleanup?.());

  const auth = () => ({
    Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
    "Content-Type": "application/json",
  });

  const applyBundle = {
    actions: {
      digest: "sha256:deadbeef",
      file: {
        version: 1,
        actions: {
          hello: { executor: "shell" },
        },
      },
    },
    hooks: {
      digest: "sha256:hooks1",
      file: {
        version: 1,
        hooks: {},
      },
    },
    flows: [],
    views: [],
  };

  test("POST apply indexes actions", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ bundle: applyBundle }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.actions).toBe(1);
    expect(Array.isArray(body.warnings)).toBe(true);
  });

  test("GET actions returns indexed rows", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/actions`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.actions).toHaveLength(1);
    expect(body.actions[0].name).toBe("hello");
  });

  test("POST apply accepts an unbound single-step flow (no unsupported wait step)", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        bundle: {
          ...applyBundle,
          flows: [
            {
              flow_id: "flw_unbound_single",
              rel_path: "flows/unbound/flow.manifest.yaml",
              digest: "sha256:unboundflow",
              manifest: {
                apiVersion: "murrmure.flow/v1",
                name: "unbound-single",
                triggers: { manual: true },
                steps: [{ id: "hold", description: "hold" }],
              },
            },
          ],
        },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.warnings)).toBe(true);
    expect(body.warnings.some((w: { code: string }) => w.code === "UNSUPPORTED_STEP_KIND")).toBe(false);
  });

  test("second apply is idempotent", async () => {
    const first = await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ bundle: applyBundle }),
    });
    const firstBody = await first.json();
    const second = await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ bundle: applyBundle }),
    });
    const secondBody = await second.json();
    expect(secondBody.summary.changed).toBe(0);
    expect(firstBody.summary.actions).toBe(secondBody.summary.actions);
  });

  test("invalid hooks reject without partial index", async () => {
    const badBundle = {
      ...applyBundle,
      hooks: {
        digest: "sha256:bad",
        file: { version: 1, hooks: { broken: { on: { event: { type: "x" } }, do: [] } } },
      },
    };
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ bundle: badBundle }),
    });
    expect(res.status).toBe(400);
    const still = await fetch(`${baseUrl}/v1/spaces/${spaceId}/actions`, { headers: auth() });
    const body = await still.json();
    expect(body.actions).toHaveLength(1);
  });

  test("triggers.yaml alias accepted via hooks file shape", async () => {
    const aliasBundle = {
      ...applyBundle,
      hooks: {
        digest: "sha256:triggers-alias",
        file: {
          version: 1,
          hooks: {
            on_event: {
              on: { event: { type: "mrmr.spec.published" } },
              do: [{ invoke: { action: "hello" } }],
            },
          },
        },
      },
    };
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ bundle: aliasBundle }),
    });
    expect(res.status).toBe(200);
    const hooks = await fetch(`${baseUrl}/v1/spaces/${spaceId}/hooks`, { headers: auth() });
    const body = await hooks.json();
    expect(body.hooks.some((h: { name: string }) => h.name === "on_event")).toBe(true);
  });

  test("inline script flow rejected", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        bundle: {
          ...applyBundle,
          flows: [
            {
              flow_id: "flw_bad",
              rel_path: "flows/bad/flow.manifest.yaml",
              digest: "sha256:badflow",
              manifest: {
                apiVersion: "murrmure.flow/v1",
                name: "bad",
                triggers: { manual: true },
                steps: [{ id: "x", script: "echo nope" }],
              },
            },
          ],
        },
      }),
    });
    expect(res.status).toBe(400);
  });

  test("link registers binding path", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/link`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ host: "local", path: "/tmp/demo-space", primary: true }),
    });
    expect(res.status).toBe(200);
    const status = await fetch(`${baseUrl}/v1/spaces/${spaceId}/index/status`, { headers: auth() });
    const body = await status.json();
    expect(body.bindings?.[0]?.path).toBe("/tmp/demo-space");
  });

  test("apply with empty actions clears stale index", async () => {
    const clearBundle = {
      actions: {
        digest: "sha256:cleared",
        file: { version: 1, actions: {} },
      },
      hooks: {
        digest: "sha256:cleared-hooks",
        file: { version: 1, hooks: {} },
      },
      flows: [],
      views: [],
    };
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ bundle: clearBundle }),
    });
    expect(res.status).toBe(200);
    const actions = await fetch(`${baseUrl}/v1/spaces/${spaceId}/actions`, { headers: auth() });
    const body = await actions.json();
    expect(body.actions).toHaveLength(0);
  });

  test("GET /v1/flows returns not found for cross-space token", async () => {
    const other = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ slug: "flow-other", name: "Flow Other" }),
    });
    const otherBody = await other.json();
    const otherSpaceId = otherBody.space_id as string;

    const flowBundle = {
      ...applyBundle,
      flows: [
        {
          flow_id: "flw_cross_test",
          rel_path: "flows/cross/flow.manifest.yaml",
          digest: "sha256:crossflow",
          manifest: {
            apiVersion: "murrmure.flow/v1",
            name: "cross",
            triggers: { manual: true },
            steps: [],
          },
        },
      ],
    };
    await fetch(`${baseUrl}/v1/spaces/${otherSpaceId}/apply`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ bundle: flowBundle }),
    });

    const grant = await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ label: "reader", scopes: ["space:read"] }),
    });
    const grantBody = await grant.json();
    const scopedToken = grantBody.token as string;

    const res = await fetch(`${baseUrl}/v1/flows/flw_cross_test`, {
      headers: {
        Authorization: `Bearer ${scopedToken.startsWith("tok_") ? scopedToken : addTokenId(scopedToken)}`,
      },
    });
    expect(res.status).toBe(404);
  });

  test("same flow_id in different spaces indexes independently", async () => {
    const sharedFlowId = "flw_flows_example";
    const other = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ slug: "flow-collision", name: "Flow Collision" }),
    });
    const otherBody = await other.json();
    const otherSpaceId = otherBody.space_id as string;

    const makeFlowBundle = (name: string, digest: string) => ({
      ...applyBundle,
      flows: [
        {
          flow_id: sharedFlowId,
          rel_path: `flows/${name}/flow.manifest.yaml`,
          digest,
          manifest: {
            apiVersion: "murrmure.flow/v1",
            name,
            triggers: { manual: true },
            steps: [],
          },
        },
      ],
    });

    await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ bundle: makeFlowBundle("alpha", "sha256:alpha-flow") }),
    });
    await fetch(`${baseUrl}/v1/spaces/${otherSpaceId}/apply`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ bundle: makeFlowBundle("beta", "sha256:beta-flow") }),
    });

    const alphaFlows = await fetch(`${baseUrl}/v1/spaces/${spaceId}/index/flows`, { headers: auth() });
    const betaFlows = await fetch(`${baseUrl}/v1/spaces/${otherSpaceId}/index/flows`, { headers: auth() });
    const alphaBody = await alphaFlows.json();
    const betaBody = await betaFlows.json();

    expect(alphaBody.flows).toHaveLength(1);
    expect(betaBody.flows).toHaveLength(1);
    expect(alphaBody.flows[0].name).toBe("alpha");
    expect(betaBody.flows[0].name).toBe("beta");
    expect(alphaBody.flows[0].flow_id).toBe(sharedFlowId);
    expect(betaBody.flows[0].flow_id).toBe(sharedFlowId);
  });

  test("apply rejects duplicate flow_id in bundle", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        bundle: {
          ...applyBundle,
          flows: [
            {
              flow_id: "flw_dup",
              rel_path: "flows/a/flow.manifest.yaml",
              digest: "sha256:dup1",
              manifest: {
                apiVersion: "murrmure.flow/v1",
                name: "a",
                triggers: { manual: true },
                steps: [],
              },
            },
            {
              flow_id: "flw_dup",
              rel_path: "flows/b/flow.manifest.yaml",
              digest: "sha256:dup2",
              manifest: {
                apiVersion: "murrmure.flow/v1",
                name: "b",
                triggers: { manual: true },
                steps: [],
              },
            },
          ],
        },
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("DUPLICATE_FLOW_ID");
  });

  test("agent apply on human_only space returns INSTALL_POLICY_VIOLATION", async () => {
    const headers = auth();
    const created = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        slug: "ui-production",
        name: "UI Production",
        install_policy: "human_only",
      }),
    });
    const createdBody = await created.json();
    const prodSpaceId = createdBody.space_id as string;

    const grant = await fetch(`${baseUrl}/v1/spaces/${prodSpaceId}/grants`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        label: "Builder agent",
        harness: "cursor-local",
        template: "worker",
        scopes: ["space:write"],
      }),
    });
    expect(grant.status).toBe(200);
    const grantBody = await grant.json();
    const agentToken = grantBody.token as string;

    const denied = await fetch(`${baseUrl}/v1/spaces/${prodSpaceId}/apply`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${agentToken.startsWith("tok_") ? agentToken : addTokenId(agentToken)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ bundle: applyBundle }),
    });
    expect(denied.status).toBe(403);
    const deniedBody = await denied.json();
    expect(deniedBody.code).toBe("INSTALL_POLICY_VIOLATION");
    expect(deniedBody.message).toContain("human_only");
    expect(deniedBody.hint?.install_policy).toBe("human_only");

    const harnesslessGrant = await fetch(`${baseUrl}/v1/spaces/${prodSpaceId}/grants`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        label: "Harness-less builder",
        template: "worker",
        scopes: ["space:write"],
      }),
    });
    expect(harnesslessGrant.status).toBe(200);
    const harnesslessBody = await harnesslessGrant.json();
    const harnesslessToken = harnesslessBody.token as string;

    const harnesslessDenied = await fetch(`${baseUrl}/v1/spaces/${prodSpaceId}/apply`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${harnesslessToken.startsWith("tok_") ? harnesslessToken : addTokenId(harnesslessToken)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ bundle: applyBundle }),
    });
    expect(harnesslessDenied.status).toBe(403);
    const harnesslessDeniedBody = await harnesslessDenied.json();
    expect(harnesslessDeniedBody.code).toBe("INSTALL_POLICY_VIOLATION");

    const allowed = await fetch(`${baseUrl}/v1/spaces/${prodSpaceId}/apply`, {
      method: "POST",
      headers,
      body: JSON.stringify({ bundle: applyBundle }),
    });
    expect(allowed.status).toBe(200);
  });

  test("apply persists step_contract_catalog on v2-shaped flow", async () => {
    const v2Manifest = {
      apiVersion: "murrmure.flow/v1",
      name: "step-contract-demo",
      triggers: { manual: true },
      steps: [
        {
          id: "intake",
          description: "intake",
          branches: {
            continue: { schema: { type: "object" }, route: { step: "work" } },
            cancel: { schema: { type: "object" }, route: { run: "failed" } },
          },
        },
        { id: "work", description: "work" },
      ],
    };
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        bundle: {
          ...applyBundle,
          flows: [
            {
              flow_id: "flw_step_contract",
              rel_path: "flows/step-contract/flow.manifest.yaml",
              digest: "sha256:stepcontract1",
              manifest: v2Manifest,
              raw: v2Manifest,
            },
          ],
        },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status?.digests?.flows?.[0]?.step_contract_catalog_digest).toMatch(/^sha256:/);
    expect(body.status?.digests?.flows?.[0]?.step_contract_step_count).toBe(2);

    const flowRes = await fetch(`${baseUrl}/v1/flows/flw_step_contract`, { headers: auth() });
    expect(flowRes.status).toBe(200);
    const flow = await flowRes.json();
    expect(flow.step_contract_catalog?.step_ids).toEqual(["intake", "work"]);
    expect(flow.step_contract_catalog?.digest).toMatch(/^sha256:/);
  });

  test("apply rejects invoke/checkpoint manifest at parse (VS-8)", async () => {
    const legacyManifest = {
      apiVersion: "murrmure.flow/v1",
      name: "legacy-flow",
      triggers: { manual: true },
      steps: [
        { id: "write", invoke: { space: "spc_x", action: "hello" } },
        {
          id: "review",
          checkpoint: {
            view: "review-view",
            on_resolve: { default: { goto: "write" }, cancel: { fail: true } },
          },
        },
      ],
    };
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        bundle: {
          ...applyBundle,
          flows: [
            {
              flow_id: "flw_legacy_warn",
              rel_path: "flows/legacy/flow.manifest.yaml",
              digest: "sha256:legacyflow",
              manifest: legacyManifest,
              raw: legacyManifest,
            },
          ],
        },
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("LEGACY_STEP_KIND");
  });
});
