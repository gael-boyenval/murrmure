import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("http/spaces/phase06-regressions", () => {
  let baseUrl: string;
  let closeServer: () => void;
  let finalCleanup: () => void;
  let bootstrapToken: string;
  let spaceId: string;
  let projectDir: string;
  let dataDir: string;
  let databasePath: string;
  let emitOnlyToken: string;
  let installOnlyToken: string;

  beforeAll(async () => {
    projectDir = mkdtempSync(join(tmpdir(), "phase06-project-"));
    const binDir = join(projectDir, "bin");
    mkdirSync(binDir, { recursive: true });
    const script = join(binDir, "echo.sh");
    writeFileSync(script, '#!/bin/sh\necho \'{"ok":true}\'\n');
    chmodSync(script, 0o755);

    dataDir = mkdtempSync(join(tmpdir(), "hub-phase06-"));
    databasePath = join(dataDir, "murrmure.db");
    bootstrapToken = "01JBOOTSTRAPTOKEN00000021";

    const daemon = await startHubDaemon({
      databasePath,
      port: 0,
      dataDir: join(dataDir, "data"),
      defaultSpaceId: "",
      bootstrapToken,
    });
    const addr = daemon.server.address();
    const port = typeof addr === "object" && addr ? addr.port : 8787;
    baseUrl = `http://127.0.0.1:${port}`;
    closeServer = () => daemon.server.close();
    finalCleanup = () => {
      closeServer();
      rmSync(dataDir, { recursive: true, force: true });
      rmSync(projectDir, { recursive: true, force: true });
    };

    const bootstrap = () => ({
      Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
      "Content-Type": "application/json",
    });

    const created = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        slug: "phase06-space",
        name: "Phase 06",
        install_policy: "authorized_agents",
      }),
    });
    spaceId = (await created.json()).space_id;

    await fetch(`${baseUrl}/v1/spaces/${spaceId}/link`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({ path: projectDir, primary: true }),
    });

    await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        bundle: {
          actions: {
            digest: "sha256:phase06-actions",
            file: {
              version: 1,
              actions: {
                ping: { executor: "shell", command: "./bin/echo.sh" },
              },
            },
          },
          executors: {
            digest: "sha256:phase06-exec",
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

    const emitGrant = await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        label: "emit-only",
        capabilities: ["event:emit"],
      }),
    });
    emitOnlyToken = (await emitGrant.json()).token as string;

    const installGrant = await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        label: "install-only",
        capabilities: ["space:write"],
      }),
    });
    installOnlyToken = (await installGrant.json()).token as string;
  });

  afterAll(() => finalCleanup?.());

  const bootstrapAuth = () => ({
    Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
    "Content-Type": "application/json",
  });

  test("action invoke route is removed (404) regardless of grant", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/actions/ping/invoke`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${emitOnlyToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ params: {} }),
    });
    expect(res.status).toBe(404);
  });

  test("space:write grant can apply space index", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${installOnlyToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        bundle: {
          actions: {
            digest: "sha256:phase06-actions",
            file: {
              version: 1,
              actions: {
                ping: { executor: "shell", command: "./bin/echo.sh" },
              },
            },
          },
          executors: {
            digest: "sha256:phase06-exec",
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
    expect(res.status).toBe(200);
  });

  test("removed instance shim returns 404", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/instances`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${emitOnlyToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        flow_id: "flow_test",
        metadata: { title: "Denied flow run" },
      }),
    });
    expect(res.status).toBe(404);
  });

  test("MCP HTTP proxy surfaces non-OK responses as tool errors", async () => {
    const readOnlyGrant = await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
      method: "POST",
      headers: bootstrapAuth(),
      body: JSON.stringify({
        label: "read-only-mcp",
        scopes: ["space:read"],
      }),
    });
    const readOnlyToken = (await readOnlyGrant.json()).token as string;

    const res = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${readOnlyToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "murrmure_get_run",
        space_id: spaceId,
        arguments: { run_id: "run_does_not_exist" },
      }),
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { message: string };
    expect(body.message.length).toBeGreaterThan(0);
  });

  test("MCP batch-2 wait tools surface HTTP errors", async () => {
    const readOnlyGrant = await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
      method: "POST",
      headers: bootstrapAuth(),
      body: JSON.stringify({
        label: "read-only-wait",
        scopes: ["space:read"],
      }),
    });
    const readOnlyToken = (await readOnlyGrant.json()).token as string;

    const res = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${readOnlyToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "murrmure_journal_query",
        space_id: spaceId,
        arguments: {},
      }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/journal:read|SCOPE|scope|not authorized/i);
  });

  test("action invoke route is removed — idempotent replay path unreachable (404)", async () => {
    const sessionRes = await fetch(`${baseUrl}/v1/sessions`, {
      method: "POST",
      headers: bootstrapAuth(),
      body: JSON.stringify({ title: "Idem session", space_id: spaceId }),
    });
    const session = (await sessionRes.json()) as { session_id: string };

    const runRes = await fetch(`${baseUrl}/v1/sessions/${session.session_id}/runs`, {
      method: "POST",
      headers: bootstrapAuth(),
      body: JSON.stringify({ flow_id: null, space_id: spaceId }),
    });
    const { run } = (await runRes.json()) as { run: { run_id: string } };

    const invokeHeaders = {
      ...bootstrapAuth(),
      "Idempotency-Key": "phase06-idem-key",
    };

    const first = await fetch(`${baseUrl}/v1/spaces/${spaceId}/actions/ping/invoke`, {
      method: "POST",
      headers: invokeHeaders,
      body: JSON.stringify({
        session_id: session.session_id,
        run_id: run.run_id,
        step_id: "action:ping",
        params: {},
      }),
    });
    expect(first.status).toBe(404);

    const second = await fetch(`${baseUrl}/v1/spaces/${spaceId}/actions/ping/invoke`, {
      method: "POST",
      headers: invokeHeaders,
      body: JSON.stringify({
        session_id: session.session_id,
        run_id: run.run_id,
        step_id: "action:ping",
        params: {},
      }),
    });
    expect(second.status).toBe(404);
  });
});
