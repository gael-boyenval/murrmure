import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";
import { clearSseTickets } from "../../../src/sse-ticket.js";

describe("http/journal/subscribe", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;

  beforeAll(async () => {
    clearSseTickets();
    const dir = mkdtempSync(join(tmpdir(), "hub-journal-sse-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000003";
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
  });

  afterAll(() => {
    cleanup?.();
    clearSseTickets();
  });

  const auth = () => ({
    Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
    "Content-Type": "application/json",
  });

  test("POST sse-ticket returns tkt_*", async () => {
    const res = await fetch(`${baseUrl}/v1/auth/sse-ticket`, {
      method: "POST",
      headers: auth(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ticket).toMatch(/^tkt_/);
    expect(body.expires_in).toBe(60);
  });

  test("GET journal/subscribe accepts ticket", async () => {
    const ticketRes = await fetch(`${baseUrl}/v1/auth/sse-ticket`, {
      method: "POST",
      headers: auth(),
    });
    const { ticket } = await ticketRes.json();

    const res = await fetch(`${baseUrl}/v1/journal/subscribe?ticket=${ticket}`, {
      headers: { Accept: "text/event-stream" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    await res.body?.cancel();
  });

  test("space.create broadcasts space.list_changed via SSE", async () => {
    const ticketRes = await fetch(`${baseUrl}/v1/auth/sse-ticket`, {
      method: "POST",
      headers: auth(),
    });
    const { ticket } = await ticketRes.json();

    const events: string[] = [];
    const controller = new AbortController();
    const subscribePromise = (async () => {
      const res = await fetch(`${baseUrl}/v1/journal/subscribe?ticket=${ticket}`, {
        headers: { Accept: "text/event-stream" },
        signal: controller.signal,
      });
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.includes("space.list_changed")) {
          events.push("space.list_changed");
          break;
        }
      }
    })();

    await new Promise((r) => setTimeout(r, 100));

    await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ slug: "sse-test", name: "SSE Test" }),
    });

    await Promise.race([
      subscribePromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
    ]);
    controller.abort();

    expect(events).toContain("space.list_changed");
  });
});
