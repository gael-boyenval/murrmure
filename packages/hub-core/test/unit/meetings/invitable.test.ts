import { describe, expect, test } from "vitest";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import type { Capability, PersonaAd } from "@murrmure/contracts";
import { listInvitableSpaces } from "../../../src/meetings/invitable.js";

const NOW = "2026-09-12T00:00:00.000Z";

function emptySnapshot() {
  return {
    actions: [],
    executors: [],
    hooks: [],
    events: [],
    personas: [],
    flows: [],
    views: [],
    run_policies: [],
  };
}

function personaRow(ad: PersonaAd & { prompt?: string }) {
  return {
    key: ad.id,
    digest: `sha256:${ad.id}`,
    payload_json: JSON.stringify(ad),
  };
}

async function seedSpace(
  studio: MemoryStudioPersistence,
  input: { space_id: string; slug: string; name?: string; personas?: PersonaAd[] },
): Promise<void> {
  await studio.insertSpace(
    {
      space_id: input.space_id,
      slug: input.slug,
      name: input.name,
      status: "active",
    },
    NOW,
  );
  await studio.replaceSpaceIndex(input.space_id, {
    ...emptySnapshot(),
    personas: (input.personas ?? []).map(personaRow),
  });
}

async function seedGrant(
  studio: MemoryStudioPersistence,
  input: {
    grant_id: string;
    space_id: string;
    actor_id: string;
    harness?: string;
    capabilities?: Capability[];
    scopes?: string[];
    status?: "active" | "revoked";
    expires_at?: string;
  },
): Promise<void> {
  await studio.insertGrant(
    {
      grant_id: input.grant_id,
      space_id: input.space_id,
      actor_id: input.actor_id,
      harness: input.harness,
      scopes: input.scopes ?? input.capabilities ?? [],
      capabilities: input.capabilities,
      status: input.status ?? "active",
      expires_at: input.expires_at,
    },
    NOW,
  );
}

describe("listInvitableSpaces", () => {
  test("bootstrap and hub:admin see every active space with ads or empty personas", async () => {
    const studio = new MemoryStudioPersistence();
    await seedSpace(studio, {
      space_id: "app",
      slug: "app",
      name: "App",
      personas: [{ id: "designer", summary: "Product design", asks: ["API shape"] }],
    });
    await seedSpace(studio, { space_id: "empty", slug: "empty", name: "Empty" });

    const bootstrap = await listInvitableSpaces(studio, {
      token_space_id: "bootstrap",
      actor_id: "actor_bootstrap",
      capabilities: ["space:read"],
    });
    expect(bootstrap.map((row) => row.space_id)).toEqual(["spc_app", "spc_empty"]);
    expect(bootstrap[0]?.personas).toEqual([
      { id: "designer", summary: "Product design", asks: ["API shape"], requests: [] },
    ]);
    expect(bootstrap[1]?.personas).toEqual([]);

    const admin = await listInvitableSpaces(studio, {
      token_space_id: "app",
      actor_id: "actor_other",
      capabilities: ["hub:admin"],
    });
    expect(admin.map((row) => row.space_id)).toEqual(["spc_app", "spc_empty"]);
  });

  test("ordinary caller sees own space plus matching space:read grants only", async () => {
    const studio = new MemoryStudioPersistence();
    await seedSpace(studio, {
      space_id: "caller",
      slug: "caller",
      name: "Caller",
      personas: [{ id: "owner", summary: "Home seat" }],
    });
    await seedSpace(studio, {
      space_id: "readable",
      slug: "readable",
      name: "Readable",
      personas: [
        {
          id: "researcher",
          summary: "Prior art",
          requests: ["attach a brief"],
          prompt: "secret prompt",
        } as PersonaAd & { prompt?: string },
      ],
    });
    await seedSpace(studio, { space_id: "ungranted", slug: "ungranted", name: "Ungranted" });
    await seedSpace(studio, { space_id: "other-actor", slug: "other-actor", name: "Other actor" });
    await seedSpace(studio, { space_id: "other-harness", slug: "other-harness", name: "Other harness" });
    await seedSpace(studio, { space_id: "write-only", slug: "write-only", name: "Write only" });
    await seedSpace(studio, { space_id: "expired", slug: "expired", name: "Expired" });

    await seedGrant(studio, {
      grant_id: "g-readable",
      space_id: "readable",
      actor_id: "actor_caller",
      capabilities: ["space:read"],
    });
    await seedGrant(studio, {
      grant_id: "g-other-actor",
      space_id: "other-actor",
      actor_id: "actor_other",
      capabilities: ["space:read"],
    });
    await seedGrant(studio, {
      grant_id: "g-other-harness",
      space_id: "other-harness",
      actor_id: "actor_caller",
      harness: "cursor",
      capabilities: ["space:read"],
    });
    await seedGrant(studio, {
      grant_id: "g-write-only",
      space_id: "write-only",
      actor_id: "actor_caller",
      capabilities: ["flow:run"],
    });
    await seedGrant(studio, {
      grant_id: "g-expired",
      space_id: "expired",
      actor_id: "actor_caller",
      capabilities: ["space:read"],
      expires_at: "2020-01-01T00:00:00.000Z",
    });

    const listed = await listInvitableSpaces(studio, {
      token_space_id: "spc_caller",
      actor_id: "actor_caller",
      capabilities: ["space:read", "flow:run"],
    });

    expect(listed.map((row) => row.space_id)).toEqual(["spc_caller", "spc_readable"]);
    expect(listed[1]?.personas).toEqual([
      { id: "researcher", summary: "Prior art", asks: [], requests: ["attach a brief"] },
    ]);
    expect(JSON.stringify(listed)).not.toContain("secret prompt");
  });
});
