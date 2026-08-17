import { describe, expect, test } from "vitest";
import {
  FlowManifestSchema,
  MeetingStepFacetSchema,
  MURRMURE_DENIAL_CODES,
  StepContractCatalogEntrySchema,
  StepContractManifestStepSchema,
} from "../src/index.js";

const FACET = {
  participants: [{ space: "{{input.app_space}}", persona: "designer" }],
  chair: { space: "{{input.app_space}}", persona: "designer" },
  goal: "{{input.goal}}",
};

const MANIFEST = {
  apiVersion: "murrmure.flow/v1" as const,
  name: "api-shape",
  triggers: { manual: true },
  steps: [
    { id: "decide", description: "Agree the API shape", meeting: FACET },
    { id: "implement", description: "Build it" },
  ],
};

describe("contracts/step-meeting-facet", () => {
  test("MeetingStepFacetSchema accepts authored space templates", () => {
    expect(MeetingStepFacetSchema.parse(FACET)).toEqual(FACET);
  });

  test("MeetingStepFacetSchema rejects unknown keys", () => {
    const parsed = MeetingStepFacetSchema.safeParse({
      ...FACET,
      view_resolver: "chat",
    });
    expect(parsed.success).toBe(false);
  });

  test("top-level FlowStep accepts meeting:", () => {
    const parsed = FlowManifestSchema.safeParse(MANIFEST);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.steps[0]?.meeting).toEqual(FACET);
  });

  test("nested meeting: is rejected", () => {
    const parsed = StepContractManifestStepSchema.safeParse({
      id: "child",
      meeting: FACET,
    });
    expect(parsed.success).toBe(false);

    const nested = FlowManifestSchema.safeParse({
      ...MANIFEST,
      steps: [
        {
          id: "parent",
          steps: [{ id: "child", meeting: FACET }],
        },
      ],
    });
    expect(nested.success).toBe(false);
  });

  test("catalog entry persists meeting", () => {
    const parsed = StepContractCatalogEntrySchema.parse({
      step_id: "decide",
      parent_id: null,
      description: "Agree",
      branches: {
        completed: {
          payload_required: [],
          artifact_required: [],
          artifact_slots: {},
          routes: [{ engine: "open", step_id: "implement" }],
        },
      },
      meeting: FACET,
    });
    expect(parsed.meeting).toEqual(FACET);
  });

  test("MEETING_STEP_VIEW_RESOLVER denial exists", () => {
    expect(MURRMURE_DENIAL_CODES.MEETING_STEP_VIEW_RESOLVER).toBe("MEETING_STEP_VIEW_RESOLVER");
  });
});
