import { describe, expect, test } from "vitest";
import { ingestFederationEvent } from "@murrmure/hub-core";

describe("federation/ingress-dedup", () => {
  test("dedup on (source_hub_id, event_id)", async () => {
    const seen = new Set<string>();

    const deps = {
      hasDedup: async (source: string, event_id: string) => seen.has(`${source}:${event_id}`),
      recordDedup: async (source: string, event_id: string) => {
        seen.add(`${source}:${event_id}`);
      },
      appendJournal: async () => undefined,
    };

    const envelope = {
      source_hub_id: "hub_a",
      event_id: "evt_01JINGRESSDEDUP000001",
      event_type: "mrmr.action.completed",
      space_id: "spc_target",
      payload: { step_id: "action:echo" },
    };

    const first = await ingestFederationEvent(deps, envelope, { nowIso: () => new Date().toISOString() });
    const second = await ingestFederationEvent(deps, envelope, { nowIso: () => new Date().toISOString() });

    expect(first.accepted).toBe(true);
    expect(first.duplicate).toBe(false);
    expect(second.accepted).toBe(true);
    expect(second.duplicate).toBe(true);
  });
});
