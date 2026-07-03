import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("hooks/delivery", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let spaceId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hook-delivery-"));
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

    spaceId = (await (
      await fetch(`${baseUrl}/v1/spaces`, {
        method: "POST",
        headers: bootstrap(),
        body: JSON.stringify({ slug: "hook-space", name: "Hook Space" }),
      })
    ).json()).space_id;

    await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        bundle: {
          hooks: {
            digest: "sha256:hooks-delivery",
            file: {
              version: 1,
              hooks: {
                "on-work-ready": {
                  on: { event: { type: "mrmr.work.ready" } },
                  do: [{ ensure_session: { title: "Delivery invariant" } }],
                },
              },
            },
          },
        },
      }),
    });
  });

  afterAll(() => cleanup?.());

  test("hook delivery creates session, run, and journal event", async () => {
    const bootstrap = () => ({
      Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000001")}`,
      "Content-Type": "application/json",
    });

    await fetch(`${baseUrl}/v1/spaces/${spaceId}/events`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({ event_type: "mrmr.work.ready", payload: { task: "demo" } }),
    });

    const sessions = await fetch(`${baseUrl}/v1/sessions`, { headers: bootstrap() }).then((r) => r.json());
    const session = (sessions.sessions as Array<{ session_id: string; title: string }>).find(
      (s) => s.title === "Delivery invariant",
    );
    expect(session).toBeTruthy();

    const runs = await fetch(`${baseUrl}/v1/sessions/${session!.session_id}/runs`, {
      headers: bootstrap(),
    }).then((r) => r.json());
    expect(runs.runs.length).toBeGreaterThanOrEqual(1);

    const journal = await fetch(`${baseUrl}/v1/journal?type=mrmr.hook.delivered`, {
      headers: bootstrap(),
    }).then((r) => r.json());
    expect(journal.entries?.length ?? 0).toBeGreaterThanOrEqual(1);
  });
});
