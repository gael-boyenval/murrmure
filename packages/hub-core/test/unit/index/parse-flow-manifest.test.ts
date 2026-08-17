import { describe, expect, test } from "vitest";
import { parseFlowManifest, rejectInlineScriptSteps } from "../../../src/index/parse-flow-manifest.js";

const VALID_MANIFEST = {
  apiVersion: "murrmure.flow/v1",
  name: "demo",
  description: "demo flow",
  triggers: { manual: true },
  steps: [{ id: "a", description: "do a" }],
};

describe("index/parse-flow-manifest", () => {
  test("parses a clean trigger-only manifest with default branches", () => {
    const result = parseFlowManifest(VALID_MANIFEST);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.triggers).toEqual({ manual: true });
      expect((result.value as { start?: unknown }).start).toBeUndefined();
    }
  });

  test("rejects removed top-level start", () => {
    const result = parseFlowManifest({
      ...VALID_MANIFEST,
      start: { manual: true },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("LEGACY_START_KEY");
  });

  test("rejects dual start + triggers", () => {
    const result = parseFlowManifest({
      ...VALID_MANIFEST,
      start: { manual: true },
      triggers: { manual: true },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("LEGACY_START_KEY");
  });

  test("rejects triggers.requires_view", () => {
    const result = parseFlowManifest({
      ...VALID_MANIFEST,
      triggers: { manual: true, requires_view: "preview-review" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("LEGACY_REQUIRES_VIEW");
  });

  test("rejects unknown manifest fields via strict schema", () => {
    const result = parseFlowManifest({
      ...VALID_MANIFEST,
      bogus: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVALID_FLOW_MANIFEST");
      expect(result.message).toMatch(/flow\.manifest\.yaml failed validation/);
      expect(result.message).toMatch(/bogus|unrecognized/i);
    }
  });

  test("rejects step role/presentation/deriveRole", () => {
    for (const key of ["role", "presentation", "deriveRole"] as const) {
      const result = parseFlowManifest({
        ...VALID_MANIFEST,
        steps: [{ id: "a", [key]: "x" }],
      });
      expect(result.ok, key).toBe(false);
      if (!result.ok) expect(result.code).toBe("REMOVED_FIELD");
    }
  });

  test("rejects legacy invoke at parse time", () => {
    const result = parseFlowManifest({
      ...VALID_MANIFEST,
      steps: [{ id: "a", invoke: { space: "spc_demo", action: "hello" } }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("LEGACY_STEP_KIND");
  });

  test("rejects payload/outcome branch wrappers", () => {
    for (const wrapper of ["payload", "outcome"] as const) {
      const result = parseFlowManifest({
        ...VALID_MANIFEST,
        steps: [
          {
            id: "a",
            branches: { completed: { [wrapper]: { type: "object" } } },
          },
        ],
      });
      expect(result.ok, wrapper).toBe(false);
      if (!result.ok) expect(result.code).toBe("REMOVED_FIELD");
    }
  });

  test("rejects removed branch routing keys (next/fail_run/complete/continue/goto/fail)", () => {
    const result = parseFlowManifest({
      ...VALID_MANIFEST,
      steps: [
        {
          id: "a",
          branches: { completed: { schema: { type: "object" }, next: "b" } },
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("REMOVED_FIELD");
  });

  test("rejects inline script step", () => {
    const result = rejectInlineScriptSteps({
      ...VALID_MANIFEST,
      steps: [{ id: "bad", script: "echo hi" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INLINE_SCRIPT_STEP");
  });

  test("rejects explicit branches: {} with EMPTY_BRANCHES", () => {
    const result = parseFlowManifest({
      ...VALID_MANIFEST,
      steps: [{ id: "a", branches: {} }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("EMPTY_BRANCHES");
  });

  test("rejects explicit branches: {} on a nested step", () => {
    const result = parseFlowManifest({
      ...VALID_MANIFEST,
      steps: [
        {
          id: "build",
          steps: [{ id: "build-loop", branches: {} }],
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("EMPTY_BRANCHES");
      expect(result.message).toContain("build.build-loop");
    }
  });

  test("accepts top-level meeting: facet", () => {
    const result = parseFlowManifest({
      ...VALID_MANIFEST,
      steps: [
        {
          id: "decide",
          meeting: {
            participants: [{ space: "{{input.app_space}}", persona: "designer" }],
            chair: { space: "{{input.app_space}}", persona: "designer" },
            goal: "{{input.goal}}",
          },
        },
        { id: "implement" },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.steps[0]?.meeting?.participants[0]?.space).toBe("{{input.app_space}}");
  });

  test("rejects nested meeting:", () => {
    const result = parseFlowManifest({
      ...VALID_MANIFEST,
      steps: [
        {
          id: "parent",
          steps: [
            {
              id: "child",
              meeting: {
                participants: [{ space: "spc_app", persona: "designer" }],
                chair: { human: true },
              },
            },
          ],
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_FLOW_MANIFEST");
  });

  test("rejects unknown meeting keys", () => {
    const result = parseFlowManifest({
      ...VALID_MANIFEST,
      steps: [
        {
          id: "decide",
          meeting: {
            participants: [{ space: "spc_app" }],
            chair: { human: true },
            turns: 3,
          },
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_FLOW_MANIFEST");
  });

  test("still rejects wait: and gate: step kinds", () => {
    const wait = parseFlowManifest({
      ...VALID_MANIFEST,
      steps: [{ id: "a", wait: { type: "manual" } }],
    });
    expect(wait.ok).toBe(false);
    if (!wait.ok) expect(wait.code).toBe("INVALID_FLOW_MANIFEST");

    const gate = parseFlowManifest({
      ...VALID_MANIFEST,
      steps: [{ id: "a", gate: { form: { id: "x" } } }],
    });
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.code).toBe("LEGACY_STEP_KIND");
  });

  test("accepts omitted branches (defaults injected at compile, not parse)", () => {
    const result = parseFlowManifest({
      ...VALID_MANIFEST,
      steps: [{ id: "a", description: "no branches" }],
    });
    expect(result.ok).toBe(true);
  });

  test("rejects inline script in parallel.lane", () => {
    const result = rejectInlineScriptSteps({
      ...VALID_MANIFEST,
      steps: [
        {
          id: "parallel",
          parallel: {
            lane: [{ id: "bad", run: "echo hi" }],
          },
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INLINE_SCRIPT_STEP");
      expect(result.message).toContain("parallel.lane");
    }
  });
});
