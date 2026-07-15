import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("http/sessions/phase05-regressions", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceA: string;
  let spaceB: string;
  let projectDir: string;
  let readOnlyToken: string;
  let workerToken: string;

  beforeAll(async () => {
    projectDir = mkdtempSync(join(tmpdir(), "phase05-project-"));
    const binDir = join(projectDir, "bin");
    mkdirSync(binDir, { recursive: true });
    const script = join(binDir, "echo.sh");
    writeFileSync(script, '#!/bin/sh\necho \'{"ok":true}\'\n');
    chmodSync(script, 0o755);

    const dir = mkdtempSync(join(tmpdir(), "hub-phase05-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000020";
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
      rmSync(projectDir, { recursive: true, force: true });
    };

    const bootstrap = () => ({
      Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
      "Content-Type": "application/json",
    });

    const createSpace = async (slug: string) => {
      const res = await fetch(`${baseUrl}/v1/spaces`, {
        method: "POST",
        headers: bootstrap(),
        body: JSON.stringify({ slug, name: slug }),
      });
      return (await res.json()).space_id as string;
    };

    spaceA = await createSpace("phase05-space-a");
    spaceB = await createSpace("phase05-space-b");

    await fetch(`${baseUrl}/v1/spaces/${spaceA}/link`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({ path: projectDir, primary: true }),
    });

    await fetch(`${baseUrl}/v1/spaces/${spaceA}/apply`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        bundle: {
          actions: {
            digest: "sha256:phase05-actions",
            file: {
              version: 1,
              actions: {
                ping: { executor: "shell", command: "./bin/echo.sh" },
              },
            },
          },
          executors: {
            digest: "sha256:phase05-exec",
            file: {
              executors: {
                shell: { binding: { type: "shell_spawn", executor_id: "shell" } },
              },
            },
          },
          flows: [],
          views: [],
        },
      }),
    });

    const readOnlyGrant = await fetch(`${baseUrl}/v1/spaces/${spaceA}/grants`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        label: "read-only",
        scopes: ["space:read"],
      }),
    });
    readOnlyToken = (await readOnlyGrant.json()).token as string;

    const workerGrant = await fetch(`${baseUrl}/v1/spaces/${spaceA}/grants`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        label: "worker",
        scopes: ["space:read", "flow:run", "action:invoke"],
      }),
    });
    workerToken = (await workerGrant.json()).token as string;
  });

  afterAll(() => cleanup?.());

  const bootstrapAuth = () => ({
    Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
    "Content-Type": "application/json",
  });

  test("MCP catalog includes murrmure_create_run for flow:run grant", async () => {
    const res = await fetch(`${baseUrl}/v1/mcp/catalog?space_id=${spaceA}`, {
      headers: { Authorization: `Bearer ${workerToken}` },
    });
    expect(res.status).toBe(200);
    const { tools } = (await res.json()) as { tools: Array<{ name: string }> };
    const names = tools.map((t) => t.name);
    expect(names).toContain("murrmure_create_run");
    expect(names).not.toContain("murrmure_grant_mint");
  });

  test("session list filters to spaces token can read", async () => {
    await fetch(`${baseUrl}/v1/sessions`, {
      method: "POST",
      headers: bootstrapAuth(),
      body: JSON.stringify({ title: "Space A session", space_id: spaceA }),
    });

    await fetch(`${baseUrl}/v1/sessions`, {
      method: "POST",
      headers: bootstrapAuth(),
      body: JSON.stringify({ title: "Space B session", space_id: spaceB }),
    });

    const listB = await fetch(`${baseUrl}/v1/sessions`, {
      headers: { Authorization: `Bearer ${readOnlyToken}` },
    });
    expect(listB.status).toBe(200);
    const bodyB = (await listB.json()) as { sessions: Array<{ title: string }> };
    expect(bodyB.sessions.some((s) => s.title === "Space A session")).toBe(true);
    expect(bodyB.sessions.some((s) => s.title === "Space B session")).toBe(false);
  });

  test("removed instance shim returns 404", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceA}/instances`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${readOnlyToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contract_ref_id: "cref_linear_demo",
        metadata: { title: "Denied instance" },
      }),
    });
    expect(res.status).toBe(404);
  });

  test("GET run returns ins_ instance_id and action invoke route is removed", async () => {
    const sessionRes = await fetch(`${baseUrl}/v1/sessions`, {
      method: "POST",
      headers: bootstrapAuth(),
      body: JSON.stringify({ title: "Replay session", space_id: spaceA }),
    });
    const session = (await sessionRes.json()) as { session_id: string };

    const runRes = await fetch(`${baseUrl}/v1/sessions/${session.session_id}/runs`, {
      method: "POST",
      headers: bootstrapAuth(),
      body: JSON.stringify({ flow_id: null, space_id: spaceA }),
    });
    const { run } = (await runRes.json()) as { run: { run_id: string } };

    const invokeRes = await fetch(`${baseUrl}/v1/spaces/${spaceA}/actions/ping/invoke`, {
      method: "POST",
      headers: bootstrapAuth(),
      body: JSON.stringify({
        session_id: session.session_id,
        run_id: run.run_id,
        step_id: "action:ping",
        params: {},
      }),
    });
    expect(invokeRes.status).toBe(404);

    const getRun = await fetch(`${baseUrl}/v1/runs/${run.run_id}`, {
      headers: bootstrapAuth(),
    });
    expect(getRun.status).toBe(200);
    const body = (await getRun.json()) as {
      run_id: string;
      instance_id: string;
      journal_replay?: Array<{ step_id: string; status: string }>;
    };

    expect(body.instance_id).toMatch(/^ins_/);
    expect(body.instance_id).toBe(`ins_${body.run_id.slice(4)}`);
    expect(Array.isArray(body.journal_replay)).toBe(true);
  });
});
