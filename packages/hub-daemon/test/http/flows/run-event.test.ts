import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("http/flows/run-event", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-flow-event-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000004";
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
      body: JSON.stringify({ slug: "events", name: "Events" }),
    });
    spaceId = (await created.json()).space_id;

    await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        bundle: {
          actions: {
            digest: "sha256:ev-actions",
            file: { version: 1, actions: { wake: { executor: "shell" } } },
          },
          executors: {
            digest: "sha256:ev-exec",
            file: {
              version: 1,
              executors: { shell: { binding: { type: "shell_spawn", executor_id: "shell" } } },
            },
          },
          hooks: { digest: "sha256:ev-hooks", file: { version: 1, hooks: {} } },
          flows: [
            {
              flow_id: "flw_on_spec",
              rel_path: "flows/on-spec/flow.manifest.yaml",
              digest: "sha256:ev-flow",
              manifest: {
                apiVersion: "murrmure.flow/v1",
                name: "on-spec",
                start: {
                  manual: false,
                  events: [{ type: "mrmr.spec.published", source: `/spaces/${spaceId}` }],
                },
                steps: [
                  { id: "wake", invoke: { space: "{{origin_space}}", action: "wake" } },
                ],
              },
            },
          ],
          views: [],
        },
      }),
    });
  });

  afterAll(() => cleanup?.());

  const auth = () => ({
    Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
    "Content-Type": "application/json",
  });

  test("event start creates run when event matches", async () => {
    const sessionsBefore = await fetch(`${baseUrl}/v1/sessions?space_id=${spaceId}`, {
      headers: auth(),
    });
    const beforeBody = await sessionsBefore.json();
    const countBefore = beforeBody.sessions?.length ?? 0;

    await fetch(`${baseUrl}/v1/spaces/${spaceId}/events`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ event_type: "mrmr.spec.published", payload: {} }),
    });

    const sessionsAfter = await fetch(`${baseUrl}/v1/sessions?space_id=${spaceId}`, {
      headers: auth(),
    });
    const afterBody = await sessionsAfter.json();
    expect(afterBody.sessions.length).toBeGreaterThan(countBefore);
  });

  test("manual run rejected when manual: false", async () => {
    const res = await fetch(`${baseUrl}/v1/flows/flw_on_spec/run`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ space_id: spaceId, input: {} }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("MANUAL_START_DISABLED");
  });
});
