import { describe, expect, test } from "vitest";
import {
  buildEmitEventInputSchema,
  buildEmittableEventsCatalog,
  validateEmitPayload,
  type EmittableEventsCatalog,
} from "../../../src/events/emittable-catalog.js";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import type { FlowIndexEntry } from "@murrmure/contracts";

function mockStudio(input: {
  spaces: Array<{ space_id: string; slug?: string }>;
  hooks: Record<string, Array<Record<string, unknown>>>;
  events?: Record<string, Array<Record<string, unknown>>>;
  flows?: Record<string, FlowIndexEntry[]>;
}): StudioPersistencePort {
  return {
    listSpaces: async () => input.spaces.map((s) => ({ space_id: s.space_id, slug: s.slug ?? s.space_id })),
    listIndexedHooks: async (space_id) => input.hooks[space_id] ?? [],
    listIndexedEvents: async (space_id) => input.events?.[space_id] ?? [],
    listFlowIndex: async (space_id) => input.flows?.[space_id] ?? [],
  } as unknown as StudioPersistencePort;
}

describe("emittable-catalog", () => {
  test("derives events from hooks whose source matches caller", async () => {
    const studio = mockStudio({
      spaces: [
        { space_id: "my_space", slug: "my-space" },
        { space_id: "murrmure", slug: "murrmure" },
      ],
      hooks: {
        murrmure: [
          {
            name: "on-dev-failure",
            on: {
              event: {
                type: "murrmure.feedback.failure",
                source: ["/spaces/spc_my_space"],
              },
            },
            do: [
              {
                invoke: {
                  action: "write_failure_feedback",
                  params: {
                    summary: "{{event.data.summary}}",
                    logs: "{{event.data.logs}}",
                  },
                },
              },
            ],
          },
        ],
      },
      events: {
        murrmure: [
          {
            event_type: "murrmure.feedback.failure",
            description: "Failure feedback",
            payload: { required: ["failure_type", "summary"] },
          },
        ],
      },
    });

    const catalog = await buildEmittableEventsCatalog(studio, "my_space");
    expect(catalog.caller_source).toBe("/spaces/spc_my_space");
    expect(catalog.events).toHaveLength(1);
    expect(catalog.events[0]?.event_type).toBe("murrmure.feedback.failure");
    expect(catalog.events[0]?.payload_hints).toEqual(["logs", "summary"]);
    expect(catalog.events[0]?.description).toBe("Failure feedback");
    expect(catalog.events[0]?.payload_schema?.required).toEqual(["failure_type", "summary"]);
    expect(catalog.events[0]?.listeners[0]?.action).toBe("write_failure_feedback");
  });

  test("buildEmitEventInputSchema uses oneOf when multiple events", () => {
    const catalog: EmittableEventsCatalog = {
      caller_space_id: "spc_my_space",
      caller_source: "/spaces/spc_my_space",
      events: [
        {
          event_type: "a.event",
          listeners: [],
          payload_hints: [],
          origins: ["hook"],
        },
        {
          event_type: "b.event",
          listeners: [],
          payload_hints: [],
          origins: ["hook"],
        },
      ],
    };
    const schema = buildEmitEventInputSchema(catalog);
    expect(schema).toHaveProperty("oneOf");
  });

  test("validateEmitPayload rejects missing required fields", () => {
    const error = validateEmitPayload(
      {
        event_type: "murrmure.feedback.failure",
        listeners: [],
        payload_hints: [],
        origins: ["declaration"],
        payload_schema: { required: ["summary"] },
      },
      {},
    );
    expect(error).toContain("summary");
  });
});
