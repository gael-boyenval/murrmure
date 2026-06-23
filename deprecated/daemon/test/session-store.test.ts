import { test, expect } from "vitest";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolate the on-disk store before importing modules that read STUDIO_HOME.
process.env.STUDIO_HOME = mkdtempSync(join(tmpdir(), "studio-test-"));

const store = await import("../src/storage/session-store");

test("creates a session and writes session.json atomically", async () => {
  const session = await store.createSession({ view: "app", url: "http://x/" });
  expect(session.session_key).toMatch(/^[0-9a-f]{8}$/);
  expect(session.round_state).toBe("collecting_feedback");
  expect(existsSync(store.reviewFilePath(session.session_key))).toBe(true);
});

test("tracks unresolved comments and finishes a round", async () => {
  const session = await store.createSession({ view: "app", url: "http://x/" });
  const key = session.session_key;

  await store.addComment(key, {
    thread: "/",
    body: "CTA contrast fails AA",
    author: "Human",
    scope: "general",
  });

  expect(store.unresolvedCount(store.getSession(key)!)).toBe(1);

  const finished = await store.finishRound(key);
  expect(finished.approved).toBe(false);
  expect(finished.session.round_state).toBe("awaiting_agent");
});

test("signalRoundComplete is idempotent (safe to retry)", async () => {
  const session = await store.createSession({ view: "app", url: "http://x/" });
  const key = session.session_key;
  await store.addComment(key, { thread: "/", body: "fix", author: "Human", scope: "general" });
  await store.finishRound(key); // -> awaiting_agent

  const advanced = await store.signalRoundComplete(key);
  expect(advanced?.review_round).toBe(2);
  expect(advanced?.round_state).toBe("collecting_feedback");

  // Second call must not double-increment.
  const again = await store.signalRoundComplete(key);
  expect(again).toBeNull();
  expect(store.getSession(key)!.review_round).toBe(2);
});

test("converges when all comments resolved", async () => {
  const session = await store.createSession({ view: "app", url: "http://x/" });
  const key = session.session_key;
  const { comment } = await store.addComment(key, {
    thread: "/",
    body: "fix",
    author: "Human",
    scope: "general",
  });
  await store.patchComment(key, comment.id, { resolved: true });

  const finished = await store.finishRound(key);
  expect(finished.approved).toBe(true);
  expect(finished.session.round_state).toBe("converged");
});
