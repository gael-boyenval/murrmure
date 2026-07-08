import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

const REVIEW_FLOW = {
  actions: {
    digest: "sha256:rv-actions",
    file: {
      version: 1,
      actions: {
        research: { executor: "shell" },
      },
    },
  },
  executors: {
    digest: "sha256:rv-exec",
    file: {
      version: 1,
      executors: {
        shell: { binding: { type: "shell_spawn", executor_id: "shell" } },
      },
    },
  },
  hooks: {
    digest: "sha256:rv-hooks",
    file: { version: 1, hooks: {} },
  },
  flows: [
    {
      flow_id: "flw_review_params",
      rel_path: "flows/review/flow.manifest.yaml",
      digest: "sha256:rv-flow",
      manifest: {
        apiVersion: "murrmure.flow/v1",
        name: "review-params",
        start: { manual: true, requires_view: "review-params" },
        steps: [
          {
            id: "research",
            invoke: {
              space: "{{origin_space}}",
              action: "research",
              params: { topic: "{{input.topic}}" },
            },
          },
        ],
      },
    },
  ],
  views: [
    {
      view_id: "review-params",
      rel_path: "views/review-params/view.manifest.yaml",
      digest: "sha256:rv-view",
      manifest: {
        apiVersion: "murrmure.view/v1",
        id: "review-params",
        shell_route: "murrmure/review-params",
        params_schema: "schemas/params.json",
      },
    },
  ],
};

describe("http/flows/requires-view", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-requires-view-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000011";
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
      body: JSON.stringify({ slug: "views", name: "Views" }),
    });
    spaceId = (await created.json()).space_id;

    await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ bundle: REVIEW_FLOW }),
    });
  });

  afterAll(() => cleanup?.());

  const auth = () => ({
    Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
    "Content-Type": "application/json",
  });

  test("apply denormalizes view_ref on flow index", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/home`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    const flow = body.your_flows.find((f: { flow_id: string }) => f.flow_id === "flw_review_params");
    expect(flow?.view_ref?.view_id).toBe("review-params");
    expect(flow?.view_ref?.shell_route).toBe("murrmure/review-params");
    expect(flow?.start?.requires_view).toBe("review-params");
  });

  test("POST run with collected params creates session and run", async () => {
    const res = await fetch(`${baseUrl}/v1/flows/flw_review_params/run`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ space_id: spaceId, input: { topic: "security review", depth: "deep" } }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.session.session_id).toMatch(/^ses_/);
    expect(body.run_id).toMatch(/^run_/);
  });

  test("form fallback: flow keeps requires_view when view bundle removed from apply", async () => {
    const withoutView = { ...REVIEW_FLOW, views: [] };
    const applyRes = await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ bundle: withoutView }),
    });
    expect(applyRes.status).toBe(200);

    const homeRes = await fetch(`${baseUrl}/v1/spaces/${spaceId}/home`, { headers: auth() });
    const home = await homeRes.json();
    const flow = home.your_flows.find((f: { flow_id: string }) => f.flow_id === "flw_review_params");
    expect(flow?.view_ref).toBeUndefined();
    expect(flow?.start?.requires_view).toBe("review-params");

    const runRes = await fetch(`${baseUrl}/v1/flows/flw_review_params/run`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ space_id: spaceId, input: { topic: "fallback topic" } }),
    });
    expect(runRes.status).toBe(201);
  });

  test("view asset route serves linked space files", async () => {
    const spaceRoot = mkdtempSync(join(tmpdir(), "view-assets-"));
    const viewDir = join(spaceRoot, "murrmure", "views", "review-params", "dist");
    mkdirSync(viewDir, { recursive: true });
    writeFileSync(join(viewDir, "index.html"), "<html>view ok</html>", "utf-8");

    await fetch(`${baseUrl}/v1/spaces/${spaceId}/link`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ path: spaceRoot, host: "local" }),
    });

    const assetRes = await fetch(
      `${baseUrl}/v1/spaces/${spaceId}/views/review-params/dist/index.html`,
      { headers: auth() },
    );
    expect(assetRes.status).toBe(200);
    expect(await assetRes.text()).toContain("view ok");

    const cookieOnlyRes = await fetch(
      `${baseUrl}/v1/spaces/${spaceId}/views/review-params/dist/index.html`,
      { headers: { Cookie: `murrmure_token=${addTokenId(bootstrapToken)}` } },
    );
    expect(cookieOnlyRes.status).toBe(200);
    expect(await cookieOnlyRes.text()).toContain("view ok");

    rmSync(spaceRoot, { recursive: true, force: true });
  });
});

const STEP_CONTRACT_VIEWS_FLOW = {
  actions: {
    digest: "sha256:sc-actions",
    file: { version: 1, actions: { noop: { executor: "shell" } } },
  },
  executors: {
    digest: "sha256:sc-exec",
    file: {
      version: 1,
      executors: {
        shell: { binding: { type: "shell_spawn", executor_id: "shell" } },
      },
    },
  },
  hooks: { digest: "sha256:sc-hooks", file: { version: 1, hooks: {} } },
  flows: [
    {
      flow_id: "flw_step_views",
      rel_path: "flows/step-views/flow.manifest.yaml",
      digest: "sha256:sc-flow",
      manifest: {
        apiVersion: "murrmure.flow/v1",
        name: "step-views",
        start: { manual: true },
        steps: [
          {
            id: "intake",
            presentation: { view: "intake-view" },
            branches: {
              continue: { schema: { type: "object", required: ["topic"] }, next: "review" },
              cancel: { schema: { type: "object" }, fail_run: true },
            },
          },
          {
            id: "review",
            presentation: { view: "review-view" },
            branches: {
              validated: { schema: { type: "object" }, next: null },
              cancel: { schema: { type: "object" }, fail_run: true },
            },
          },
        ],
      },
    },
  ],
  views: [
    {
      view_id: "intake-view",
      rel_path: "views/intake/view.manifest.yaml",
      digest: "sha256:intake-view",
      manifest: {
        apiVersion: "murrmure.view/v1",
        id: "intake-view",
        shell_route: "murrmure/intake",
        entry: "./dist/index.html",
      },
    },
    {
      view_id: "review-view",
      rel_path: "views/review/view.manifest.yaml",
      digest: "sha256:review-view",
      manifest: {
        apiVersion: "murrmure.view/v1",
        id: "review-view",
        shell_route: "murrmure/review",
        entry: "./dist/index.html",
      },
    },
  ],
};

describe("http/flows/requires-view step memos", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceId: string;
  let resolveToken: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-step-views-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000022";
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
      body: JSON.stringify({ slug: "step-views", name: "Step Views" }),
    });
    spaceId = (await created.json()).space_id;

    await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ bundle: STEP_CONTRACT_VIEWS_FLOW }),
    });

    const grantRes = await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        label: "human",
        capabilities: ["space:read", "flow:run", "step:resolve"],
      }),
    });
    resolveToken = (await grantRes.json()).token;
  });

  afterAll(() => cleanup?.());

  const agentAuth = () => ({
    Authorization: `Bearer ${resolveToken}`,
    "Content-Type": "application/json",
  });

  test("run exposes active_human_step with intake view_ref (no gate)", async () => {
    const sessionRes = await fetch(`${baseUrl}/v1/sessions`, {
      method: "POST",
      headers: agentAuth(),
      body: JSON.stringify({ title: "step views", space_id: spaceId }),
    });
    const session = await sessionRes.json();

    const runRes = await fetch(`${baseUrl}/v1/flows/flw_step_views/run`, {
      method: "POST",
      headers: agentAuth(),
      body: JSON.stringify({ session_id: session.session_id, space_id: spaceId, input: {} }),
    });
    const { run_id } = await runRes.json();

    const getRun = await fetch(`${baseUrl}/v1/runs/${encodeURIComponent(run_id)}`, {
      headers: agentAuth(),
    });
    const runBody = await getRun.json();
    expect(runBody.active_human_step?.step_id).toBe("intake");
    expect(runBody.active_human_step?.view_ref?.view_id).toBe("intake-view");
    expect(runBody.steps?.find((s: { step_id: string }) => s.step_id === "intake")?.status).toBe(
      "awaiting_human",
    );

    const gatesRes = await fetch(`${baseUrl}/v1/runs/${encodeURIComponent(run_id)}/gates`, {
      headers: agentAuth(),
    });
    const gatesBody = await gatesRes.json();
    expect(gatesBody.gates.filter((g: { status: string }) => g.status === "pending")).toHaveLength(0);
  });

  test("resolve intake advances to review awaiting_human", async () => {
    const sessionRes = await fetch(`${baseUrl}/v1/sessions`, {
      method: "POST",
      headers: agentAuth(),
      body: JSON.stringify({ title: "review step", space_id: spaceId }),
    });
    const session = await sessionRes.json();

    const runRes = await fetch(`${baseUrl}/v1/flows/flw_step_views/run`, {
      method: "POST",
      headers: agentAuth(),
      body: JSON.stringify({ session_id: session.session_id, space_id: spaceId, input: {} }),
    });
    const { run_id } = await runRes.json();

    const resolveRes = await fetch(
      `${baseUrl}/v1/runs/${encodeURIComponent(run_id)}/steps/intake/resolve`,
      {
        method: "POST",
        headers: agentAuth(),
        body: JSON.stringify({ branch: "continue", payload: { topic: "ai" } }),
      },
    );
    expect(resolveRes.status).toBe(200);

    const getRun = await fetch(`${baseUrl}/v1/runs/${encodeURIComponent(run_id)}`, {
      headers: agentAuth(),
    });
    const runBody = await getRun.json();
    expect(runBody.active_human_step?.step_id).toBe("review");
    expect(runBody.active_human_step?.view_ref?.view_id).toBe("review-view");
  });
});
