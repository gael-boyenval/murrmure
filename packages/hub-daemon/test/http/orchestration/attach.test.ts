import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";

const VALID_MANIFEST = {
  apiVersion: "murrmure.flow/v1" as const,
  name: "agent-proposed",
  start: { manual: true },
  steps: [
    {
      id: "research",
      role: "agent" as const,
      branches: {
        completed: {
          schema: {
            type: "object",
            properties: { api_key: { type: "string" }, count: { type: "number" } },
          },
          next: "finish",
        },
      },
    },
    {
      id: "finish",
      presentation: { view: "done-view" },
      branches: {
        validated: { schema: { type: "object" }, next: null },
        cancel: { schema: { type: "object" }, next: null, fail_run: true },
      },
    },
  ],
};

describe("http/orchestration/attach", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceId: string;
  let agentToken: string;
  let resolveToken: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "orch-attach-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000010";
    const daemon = await startHubDaemon({
      databasePath: join(dir, "murrmure.db"),
      port: 0,
      dataDir: join(dir, "data"),
      defaultSpaceId: "",
      bootstrapToken,
    });
    const port = (daemon.server.address() as { port: number }).port;
    baseUrl = `http://127.0.0.1:${port}`;
    cleanup = () => {
      daemon.server.close();
      rmSync(dir, { recursive: true, force: true });
    };

    const bootstrap = () => ({
      Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
      "Content-Type": "application/json",
    });

    spaceId = (
      await (
        await fetch(`${baseUrl}/v1/spaces`, {
          method: "POST",
          headers: bootstrap(),
          body: JSON.stringify({ slug: "orch-space", name: "Orch" }),
        })
      ).json()
    ).space_id;

    await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        bundle: {
          actions: {
            digest: "sha256:orch-action",
            file: { version: 1, actions: { noop: { executor: "shell" } } },
          },
          executors: {
            digest: "sha256:orch-exec",
            file: {
              version: 1,
              executors: { shell: { binding: { type: "shell_spawn", executor_id: "shell" } } },
            },
          },
          hooks: { digest: "sha256:orch-hooks", file: { version: 1, hooks: {} } },
          flows: [],
          views: [],
        },
      }),
    });

    agentToken = (
      await (
        await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
          method: "POST",
          headers: bootstrap(),
          body: JSON.stringify({
            label: "orch-agent",
            scopes: ["space:read", "flow:run", "action:invoke", "flow:read"],
          }),
        })
      ).json()
    ).token;

    resolveToken = (
      await (
        await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
          method: "POST",
          headers: bootstrap(),
          body: JSON.stringify({
            label: "orch-human",
            scopes: ["space:read", "flow:run", "gate:resolve", "journal:read", "flow:read"],
          }),
        })
      ).json()
    ).token;
  });

  afterAll(() => cleanup?.());

  async function createSession(token: string) {
    const res = await fetch(`${baseUrl}/v1/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "Orch session", space_id: spaceId }),
    });
    return (await res.json()) as { session_id: string };
  }

  async function attach(session_id: string, token: string, payload: unknown) {
    return fetch(`${baseUrl}/v1/sessions/${session_id}/orchestration/attach`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ space_id: spaceId, ...(payload as object) }),
    });
  }

  test("rejects invalid manifest", async () => {
    const session = await createSession(agentToken);
    const res = await attach(session.session_id, agentToken, {
      kind: "murrmure.flow.attach/v1",
      manifest: { apiVersion: "wrong", steps: [] },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_ATTACH_PAYLOAD");
  });

  test("attach creates orchestration.validate gate and sanitized preview", async () => {
    const session = await createSession(agentToken);
    const res = await attach(session.session_id, agentToken, {
      kind: "murrmure.flow.attach/v1",
      manifest: VALID_MANIFEST,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      run_id: string;
      gate_id: string;
      preview: { steps: Array<{ param_shape?: Record<string, string> }> };
    };
    expect(body.gate_id).toMatch(/^chk_|^gate_/);
    expect(body.preview.steps.map((step) => step.action)).toContain("presentation");

    const gatesRes = await fetch(`${baseUrl}/v1/runs/${body.run_id}/gates`, {
      headers: { Authorization: `Bearer ${agentToken}` },
    });
    const gates = (await gatesRes.json()) as { gates: Array<{ step_id: string; orchestration_preview?: unknown }> };
    expect(gates.gates[0]?.step_id).toBe("orchestration:proposed");
    expect(gates.gates[0]?.orchestration_preview).toBeTruthy();

    const graphRes = await fetch(`${baseUrl}/v1/runs/${body.run_id}/graph`, {
      headers: { Authorization: `Bearer ${agentToken}` },
    });
    expect(graphRes.status).toBe(200);
    const graph = await graphRes.json();
    expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
  });
});

describe("http/orchestration/attach-reject", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let spaceId: string;
  let agentToken: string;
  let resolveToken: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "orch-reject-"));
    const bootstrapToken = "01JBOOTSTRAPTOKEN00000011";
    const daemon = await startHubDaemon({
      databasePath: join(dir, "murrmure.db"),
      port: 0,
      dataDir: join(dir, "data"),
      defaultSpaceId: "",
      bootstrapToken,
    });
    const port = (daemon.server.address() as { port: number }).port;
    baseUrl = `http://127.0.0.1:${port}`;
    cleanup = () => {
      daemon.server.close();
      rmSync(dir, { recursive: true, force: true });
    };

    const bootstrap = () => ({
      Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
      "Content-Type": "application/json",
    });

    spaceId = (await (await fetch(`${baseUrl}/v1/spaces`, { method: "POST", headers: bootstrap(), body: JSON.stringify({ slug: "reject-space", name: "Reject" }) })).json()).space_id;

    await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        bundle: {
          actions: { digest: "sha256:a", file: { version: 1, actions: { noop: { executor: "shell" } } } },
          executors: { digest: "sha256:e", file: { version: 1, executors: { shell: { binding: { type: "shell_spawn", executor_id: "shell" } } } } },
          hooks: { digest: "sha256:h", file: { version: 1, hooks: {} } },
          flows: [],
          views: [],
        },
      }),
    });

    agentToken = (await (await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, { method: "POST", headers: bootstrap(), body: JSON.stringify({ label: "agent", scopes: ["space:read", "flow:run", "action:invoke"] }) })).json()).token;
    resolveToken = (await (await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, { method: "POST", headers: bootstrap(), body: JSON.stringify({ label: "human", scopes: ["space:read", "gate:resolve", "journal:read"] }) })).json()).token;
  });

  afterAll(() => cleanup?.());

  test("reject does not bind flow", async () => {
    const session = await (
      await fetch(`${baseUrl}/v1/sessions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${agentToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Reject", space_id: spaceId }),
      })
    ).json();

    const attached = await (
      await fetch(`${baseUrl}/v1/sessions/${session.session_id}/orchestration/attach`, {
        method: "POST",
        headers: { Authorization: `Bearer ${agentToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ space_id: spaceId, kind: "murrmure.flow.attach/v1", manifest: VALID_MANIFEST }),
      })
    ).json();

    const resolveRes = await fetch(`${baseUrl}/v1/gates/${attached.gate_id}/resolve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${resolveToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "rejected" }),
    });
    expect(resolveRes.status).toBe(200);

    const runRes = await fetch(`${baseUrl}/v1/runs/${attached.run_id}`, {
      headers: { Authorization: `Bearer ${resolveToken}` },
    });
    const run = await runRes.json();
    expect(run.flow_id).toBeNull();
    expect(run.lifecycle).toBe("cancelled");

    const journal = await fetch(`${baseUrl}/v1/journal?type=${encodeURIComponent(JOURNAL_EVENT_TYPES.FLOW_ATTACHED)}`, {
      headers: { Authorization: `Bearer ${resolveToken}` },
    });
    const journalBody = await journal.json();
    expect(journalBody.entries.some((e: { run_id?: string }) => e.run_id === attached.run_id)).toBe(false);
  });
});

describe("http/orchestration/attach-approve", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let spaceId: string;
  let agentToken: string;
  let resolveToken: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "orch-approve-"));
    const bootstrapToken = "01JBOOTSTRAPTOKEN00000012";
    const daemon = await startHubDaemon({
      databasePath: join(dir, "murrmure.db"),
      port: 0,
      dataDir: join(dir, "data"),
      defaultSpaceId: "",
      bootstrapToken,
    });
    const port = (daemon.server.address() as { port: number }).port;
    baseUrl = `http://127.0.0.1:${port}`;
    cleanup = () => {
      daemon.server.close();
      rmSync(dir, { recursive: true, force: true });
    };

    const bootstrap = () => ({
      Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
      "Content-Type": "application/json",
    });

    spaceId = (await (await fetch(`${baseUrl}/v1/spaces`, { method: "POST", headers: bootstrap(), body: JSON.stringify({ slug: "approve-space", name: "Approve" }) })).json()).space_id;

    await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        bundle: {
          actions: { digest: "sha256:a2", file: { version: 1, actions: { noop: { executor: "shell" } } } },
          executors: { digest: "sha256:e2", file: { version: 1, executors: { shell: { binding: { type: "shell_spawn", executor_id: "shell" } } } } },
          hooks: { digest: "sha256:h2", file: { version: 1, hooks: {} } },
          flows: [],
          views: [],
        },
      }),
    });

    agentToken = (await (await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, { method: "POST", headers: bootstrap(), body: JSON.stringify({ label: "agent", scopes: ["space:read", "flow:run", "action:invoke"] }) })).json()).token;
    resolveToken = (await (await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, { method: "POST", headers: bootstrap(), body: JSON.stringify({ label: "human", scopes: ["space:read", "gate:resolve", "journal:read", "flow:run"] }) })).json()).token;
  });

  afterAll(() => cleanup?.());

  test("approve binds graph and journals flow.attached", async () => {
    const session = await (
      await fetch(`${baseUrl}/v1/sessions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${agentToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Approve", space_id: spaceId }),
      })
    ).json();

    const attached = await (
      await fetch(`${baseUrl}/v1/sessions/${session.session_id}/orchestration/attach`, {
        method: "POST",
        headers: { Authorization: `Bearer ${agentToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ space_id: spaceId, kind: "murrmure.flow.attach/v1", manifest: VALID_MANIFEST }),
      })
    ).json();

    const resolveRes = await fetch(`${baseUrl}/v1/gates/${attached.gate_id}/resolve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${resolveToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approved", form_values: { notes: "LGTM" } }),
    });
    expect(resolveRes.status).toBe(200);

    const runRes = await fetch(`${baseUrl}/v1/runs/${attached.run_id}`, {
      headers: { Authorization: `Bearer ${resolveToken}` },
    });
    const run = await runRes.json();
    expect(run.flow_id).toMatch(/^flw_orch_/);
    expect(run.lifecycle).not.toBe("cancelled");

    const journal = await fetch(`${baseUrl}/v1/journal?type=${encodeURIComponent(JOURNAL_EVENT_TYPES.FLOW_ATTACHED)}`, {
      headers: { Authorization: `Bearer ${resolveToken}` },
    });
    const journalBody = await journal.json();
    expect(journalBody.entries.some((e: { run_id?: string }) => e.run_id === attached.run_id)).toBe(true);
  });
});
