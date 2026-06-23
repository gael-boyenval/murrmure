import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  ContractV2Schema,
  HubEventSchema,
  PrefixedIdSchema,
  SpaceCreateCommandSchema,
  WaitConditionSchema,
} from "../src/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dir, "../../../fixtures/hub");

describe("ids/prefixed", () => {
  const validUlid = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

  test("accepts valid prefixed ULID", () => {
    const schema = PrefixedIdSchema("spc");
    expect(schema.safeParse(`spc_${validUlid}`).success).toBe(true);
  });

  test("rejects bare ULID", () => {
    const schema = PrefixedIdSchema("spc");
    expect(schema.safeParse(validUlid).success).toBe(false);
  });

  test("rejects wrong prefix", () => {
    const schema = PrefixedIdSchema("spc");
    expect(schema.safeParse(`ins_${validUlid}`).success).toBe(false);
  });
});

describe("contract-v2", () => {
  test("parses linear-demo-v2 fixture", () => {
    const raw = JSON.parse(
      readFileSync(join(FIXTURES, "contracts/linear-demo-v2.json"), "utf-8"),
    );
    const parsed = ContractV2Schema.parse(raw);
    expect(parsed.schemaVersion).toBe("2.0");
    expect(parsed.transitions[0]?.gate?.mode).toBe("any");
  });
});

describe("entities/hub-event", () => {
  test("roundtrips envelope", () => {
    const ulid = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const event = {
      seq: 1,
      space_seq: 1,
      event_id: `evt_${ulid}`,
      type: "state.transitioned",
      outcome: "success" as const,
      space_id: `spc_${ulid}`,
      actor_id: "actor_dev",
      token_id: `tok_${ulid}`,
      ts: "2026-06-20T12:00:00.000Z",
      payload: { event: "submit" },
      blob_refs: [],
    };
    const parsed = HubEventSchema.parse(event);
    expect(HubEventSchema.safeParse(parsed).success).toBe(true);
  });
});

describe("wait-condition", () => {
  test("parses all union arms", () => {
    const arms = [
      { type: "state", state: "review" },
      { type: "gate", resolution: "approved" },
      { type: "event", event_type: "submitted" },
      { type: "contract", capability_id: "linear-demo" },
      { type: "compound", all_of: [{ type: "state", state: "done" }] },
    ];
    for (const arm of arms) {
      expect(WaitConditionSchema.safeParse(arm).success).toBe(true);
    }
  });
});

describe("commands/roundtrip", () => {
  test("space.create golden roundtrip", () => {
    const ulid = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const cmd = {
      kind: "space.create" as const,
      provenance: {
        space_id: `spc_${ulid}`,
        actor_id: "actor_bootstrap",
        token_id: `tok_${ulid}`,
      },
      slug: "review-alpha",
    };
    const parsed = SpaceCreateCommandSchema.parse(cmd);
    expect(SpaceCreateCommandSchema.safeParse(parsed).success).toBe(true);
  });
});
