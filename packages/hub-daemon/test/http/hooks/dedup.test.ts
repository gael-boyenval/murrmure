import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";
import { createHash } from "node:crypto";

describe("hooks/dedup", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let backendId: string;
  let frontendId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hook-dedup-"));
    const daemon = await startHubDaemon({
      databasePath: join(dir, "murrmure.db"),
      port: 0,
      dataDir: join(dir, "data"),
      defaultSpaceId: "",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000001",
    });
    const port = (daemon.server.address() as { port: number }).port;
    baseUrl = `http://127.0.0.1:${port}`;
    cleanup = () => {
      daemon.server.close();
      rmSync(dir, { recursive: true, force: true });
    };

    const bootstrap = () => ({
      Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000001")}`,
      "Content-Type": "application/json",
    });

    backendId = (await (
      await fetch(`${baseUrl}/v1/spaces`, {
        method: "POST",
        headers: bootstrap(),
        body: JSON.stringify({ slug: "backend", name: "Backend" }),
      })
    ).json()).space_id;

    frontendId = (await (
      await fetch(`${baseUrl}/v1/spaces`, {
        method: "POST",
        headers: bootstrap(),
        body: JSON.stringify({ slug: "frontend", name: "Frontend" }),
      })
    ).json()).space_id;

    await fetch(`${baseUrl}/v1/spaces/${frontendId}/apply`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        bundle: {
          hooks: {
            digest: "sha256:hooks-dedup",
            file: {
              version: 1,
              hooks: {
                "on-spec-published": {
                  on: { event: { type: "mrmr.spec.published" } },
                  do: [{ ensure_session: { title: "Hook chain" } }],
                },
              },
            },
          },
        },
      }),
    });
  });

  afterAll(() => cleanup?.());

  test("redelivered duplicate event does not create second run", async () => {
    const bootstrap = () => ({
      Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000001")}`,
      "Content-Type": "application/json",
    });

    const eventId = "evt_duplicate_test";
    const dedupKey = createHash("sha256")
      .update(`/spaces/${backendId}|${eventId}|on-spec-published`)
      .digest("hex");

    const payload = { spec_key: "spec_1", version: 1 };
    for (let i = 0; i < 2; i++) {
      await fetch(`${baseUrl}/v1/spaces/${backendId}/events`, {
        method: "POST",
        headers: bootstrap(),
        body: JSON.stringify({
          event_id: eventId,
          event_type: "mrmr.spec.published",
          payload,
        }),
      });
    }

    const sessions = await fetch(`${baseUrl}/v1/sessions`, { headers: bootstrap() }).then((r) => r.json());
    const hookSessions = (sessions.sessions as Array<{ title: string }>).filter((s) => s.title === "Hook chain");
    expect(hookSessions.length).toBe(1);

    const runsRes = await fetch(`${baseUrl}/v1/sessions/${hookSessions[0]!.session_id}/runs`, {
      headers: bootstrap(),
    });
    const runsBody = await runsRes.json();
    expect(runsBody.runs.length).toBe(1);
    expect(runsBody.runs[0].exec_context?.idempotency_key ?? dedupKey).toBeTruthy();
  });
});
