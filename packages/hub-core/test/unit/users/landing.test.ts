import { describe, expect, test } from "vitest";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import { markSpaceLinkForActor, patchUserMe } from "@murrmure/hub-core";

describe("users/landing", () => {
  test("suggest landing only once on first link", async () => {
    const studio = new MemoryStudioPersistence();
    const first = await markSpaceLinkForActor(studio, "actor_alice");
    expect(first.suggest_landing).toBe(true);

    const second = await markSpaceLinkForActor(studio, "actor_alice");
    expect(second.suggest_landing).toBe(false);
  });

  test("patch landing space never auto-sets on link", async () => {
    const studio = new MemoryStudioPersistence();
    await markSpaceLinkForActor(studio, "actor_alice");
    const profile = await patchUserMe(studio, "actor_alice", { landing_space_id: "spc_demo" });
    expect(profile.landing_space_id).toBe("spc_demo");
  });
});
