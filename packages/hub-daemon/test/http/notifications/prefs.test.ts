import { describe, expect, test } from "vitest";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import { patchUserMe, getUserMe } from "@murrmure/hub-core";

describe("http/notifications/prefs", () => {
  test("user opt-out respected via PATCH /v1/me fields", async () => {
    const studio = new MemoryStudioPersistence();

    await patchUserMe(studio, "actor_alice", { notify_email: false, notify_desktop: true });
    let profile = await getUserMe(studio, "actor_alice");
    expect(profile.notify_email).toBe(false);
    expect(profile.notify_desktop).toBe(true);

    await patchUserMe(studio, "actor_alice", { notify_desktop: false });
    profile = await getUserMe(studio, "actor_alice");
    expect(profile.notify_desktop).toBe(false);
  });
});
