import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("federation/invoke", () => {
  let hubA: { baseUrl: string; cleanup: () => void; token: string };
  let hubB: { baseUrl: string; cleanup: () => void; token: string; spaceId: string };

  beforeAll(async () => {
    const dirA = mkdtempSync(join(tmpdir(), "fed-hub-a-"));
    const dirB = mkdtempSync(join(tmpdir(), "fed-hub-b-"));
    const tokenA = "01JBOOTSTRAPTOKEN00000001";
    const tokenB = "01JBOOTSTRAPTOKEN00000002";

    const daemonA = await startHubDaemon({
      databasePath: join(dirA, "murrmure.db"),
      port: 0,
      dataDir: join(dirA, "data"),
      defaultSpaceId: "",
      bootstrapToken: tokenA,
    });
    const daemonB = await startHubDaemon({
      databasePath: join(dirB, "murrmure.db"),
      port: 0,
      dataDir: join(dirB, "data"),
      defaultSpaceId: "",
      bootstrapToken: tokenB,
    });

    const portA = (daemonA.server.address() as { port: number }).port;
    const portB = (daemonB.server.address() as { port: number }).port;

    hubA = {
      baseUrl: `http://127.0.0.1:${portA}`,
      token: tokenA,
      cleanup: () => {
        daemonA.server.close();
        rmSync(dirA, { recursive: true, force: true });
      },
    };
    hubB = {
      baseUrl: `http://127.0.0.1:${portB}`,
      token: tokenB,
      cleanup: () => {
        daemonB.server.close();
        rmSync(dirB, { recursive: true, force: true });
      },
      spaceId: "",
    };

    const authB = () => ({
      Authorization: `Bearer ${addTokenId(tokenB)}`,
      "Content-Type": "application/json",
    });

    const created = await fetch(`${hubB.baseUrl}/v1/spaces`, {
      method: "POST",
      headers: authB(),
      body: JSON.stringify({ slug: "remote-worker", name: "Remote Worker" }),
    });
    hubB.spaceId = (await created.json()).space_id as string;

    await fetch(`${hubB.baseUrl}/v1/spaces/${hubB.spaceId}/link`, {
      method: "POST",
      headers: authB(),
      body: JSON.stringify({ host: "test", path: dirB, primary: true }),
    });

    await fetch(`${hubB.baseUrl}/v1/spaces/${hubB.spaceId}/apply`, {
      method: "POST",
      headers: authB(),
      body: JSON.stringify({
        bundle: {
          actions: {
            digest: "sha256:remote-echo",
            file: {
              version: 1,
              actions: {
                echo: { executor: "shell-local", command: "echo", delivery: "fail_fast" },
              },
            },
          },
          executors: {
            digest: "sha256:remote-exec",
            file: {
              executors: {
                "shell-local": { binding: { type: "shell_spawn", executor_id: "shell-local" } },
              },
            },
          },
          flows: [],
          views: [],
        },
      }),
    });

    const authA = () => ({
      Authorization: `Bearer ${addTokenId(tokenA)}`,
      "Content-Type": "application/json",
    });

    await fetch(`${hubA.baseUrl}/v1/ops/federation/peers`, {
      method: "POST",
      headers: authA(),
      body: JSON.stringify({
        hub_id: "hub_b",
        url: hubB.baseUrl,
        auth_token: addTokenId(tokenB),
      }),
    });

    const virtual = await fetch(`${hubA.baseUrl}/v1/spaces`, {
      method: "POST",
      headers: authA(),
      body: JSON.stringify({ slug: "virtual-remote", name: "Virtual Remote" }),
    });
    const virtualSpaceId = (await virtual.json()).space_id as string;

    await fetch(`${hubA.baseUrl}/v1/spaces/${virtualSpaceId}/link/remote`, {
      method: "POST",
      headers: authA(),
      body: JSON.stringify({ peer_hub_id: "hub_b", remote_space_id: hubB.spaceId }),
    });

    await fetch(`${hubA.baseUrl}/v1/spaces/${virtualSpaceId}/apply`, {
      method: "POST",
      headers: authA(),
      body: JSON.stringify({
        bundle: {
          actions: {
            digest: "sha256:virtual-echo",
            file: {
              version: 1,
              actions: {
                echo: { executor: "remote-exec", delivery: "fail_fast" },
              },
            },
          },
          executors: {
            digest: "sha256:virtual-exec",
            file: {
              executors: {
                "remote-exec": {
                  binding: {
                    type: "remote_hub",
                    executor_id: "remote-exec",
                    remote_hub_id: "hub_b",
                    remote_space_id: hubB.spaceId,
                  },
                },
              },
            },
          },
          flows: [],
          views: [],
        },
      }),
    });

    hubA = { ...hubA, virtualSpaceId } as typeof hubA & { virtualSpaceId: string };
  }, 60_000);

  afterAll(() => {
    hubA?.cleanup?.();
    hubB?.cleanup?.();
  });

  test("action invoke route is removed — remote relay not reachable via public route (404)", async () => {
    const virtualSpaceId = (hubA as typeof hubA & { virtualSpaceId: string }).virtualSpaceId;
    const res = await fetch(`${hubA.baseUrl}/v1/spaces/${virtualSpaceId}/actions/echo/invoke`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${addTokenId(hubA.token)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ params: { message: "hello-federation" } }),
    });

    expect(res.status).toBe(404);
  });
});
