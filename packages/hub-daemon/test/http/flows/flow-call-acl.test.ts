import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("http/flows/flow-call-acl", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let spaceId: string;
  let restrictedToken: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-flow-call-acl-"));
    const bootstrapToken = "01JBOOTSTRAPTOKEN00000061";
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
          body: JSON.stringify({ slug: "acl", name: "ACL" }),
        })
      ).json()
    ).space_id;

    await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        bundle: {
          actions: {
            digest: "sha256:acl-actions",
            file: { version: 1, actions: { noop: { executor: "shell" } } },
          },
          executors: {
            digest: "sha256:acl-exec",
            file: {
              version: 1,
              executors: { shell: { binding: { type: "shell_spawn", executor_id: "shell" } } },
            },
          },
          hooks: { digest: "sha256:acl-hooks", file: { version: 1, hooks: {} } },
          flows: [
            {
              flow_id: "flw_child",
              rel_path: "flows/child/flow.manifest.yaml",
              digest: "sha256:acl-child",
              manifest: {
                apiVersion: "murrmure.flow/v1",
                name: "child",
                start: { manual: false, flow_call: true },
                steps: [{ id: "work", invoke: { space: "{{origin_space}}", action: "noop" } }],
              },
            },
            {
              flow_id: "flw_parent",
              rel_path: "flows/parent/flow.manifest.yaml",
              digest: "sha256:acl-parent",
              manifest: {
                apiVersion: "murrmure.flow/v1",
                name: "parent",
                start: { manual: true },
                steps: [
                  {
                    id: "call",
                    start_flow: { flow_id: "flw_child", input: {}, wait: true },
                  },
                ],
              },
            },
          ],
          views: [],
        },
      }),
    });

    restrictedToken = (
      await (
        await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
          method: "POST",
          headers: bootstrap(),
          body: JSON.stringify({
            label: "parent-only",
            scopes: ["space:read", "flow:run", "action:invoke"],
            flow_acl: ["flw_parent"],
          }),
        })
      ).json()
    ).token;
  });

  afterAll(() => cleanup?.());

  test("start_flow denied when grant lacks flow:run on child", async () => {
    const res = await fetch(`${baseUrl}/v1/flows/flw_parent/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${restrictedToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ space_id: spaceId, input: {} }),
    });
    expect(res.status).toBe(201);
    const { run_id } = (await res.json()) as { run_id: string };

    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const detail = (await (
        await fetch(`${baseUrl}/v1/runs/${run_id}`, {
          headers: { Authorization: `Bearer ${restrictedToken}` },
        })
      ).json()) as { lifecycle: string };
      if (detail.lifecycle === "failed" || detail.lifecycle === "completed") {
        expect(detail.lifecycle).toBe("failed");
        return;
      }
    }
    throw new Error("expected parent run to fail on ACL deny");
  });
});
