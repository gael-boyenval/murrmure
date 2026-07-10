import { FlowManifestSchema, type FlowManifest, type FlowStep } from "@murrmure/contracts";
import type { ParseResult } from "./parse-result.js";
import { findLegacyStepKinds, rejectLegacyStepKinds } from "../flow-engine/step-contract-compile.js";

export { findLegacyStepKinds as detectLegacyStepKinds, rejectLegacyStepKinds };

const INLINE_SCRIPT_KEYS = ["script", "run", "shell", "command"] as const;

function findInlineScriptStep(steps: unknown[], path = "steps"): string | null {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step || typeof step !== "object") continue;
    const record = step as Record<string, unknown>;
    for (const key of INLINE_SCRIPT_KEYS) {
      if (key in record) {
        return `${path}[${i}].${key}`;
      }
    }
    if (Array.isArray(record.lane)) {
      const nested = findInlineScriptStep(record.lane, `${path}[${i}].lane`);
      if (nested) return nested;
    }
    const parallelLane = (record.parallel as { lane?: unknown[] } | undefined)?.lane;
    if (Array.isArray(parallelLane)) {
      const nested = findInlineScriptStep(parallelLane, `${path}[${i}].parallel.lane`);
      if (nested) return nested;
    }
  }
  return null;
}

export function rejectInlineScriptSteps(raw: unknown): ParseResult<unknown> {
  if (!raw || typeof raw !== "object") {
    return { ok: true, value: raw };
  }
  const steps = (raw as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) {
    return { ok: true, value: raw };
  }
  const violation = findInlineScriptStep(steps);
  if (violation) {
    return {
      ok: false,
      code: "INLINE_SCRIPT_STEP",
      message: `Flow manifest rejects inline script steps (found ${violation})`,
    };
  }
  return { ok: true, value: raw };
}

export function parseFlowManifest(raw: unknown): ParseResult<FlowManifest> {
  const guard = rejectInlineScriptSteps(raw);
  if (!guard.ok) return guard;

  const legacy = rejectLegacyStepKinds(raw);
  if (!legacy.ok) return legacy;

  const parsed = FlowManifestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      code: "INVALID_FLOW_MANIFEST",
      message: "flow.manifest.yaml failed validation",
      details: parsed.error,
    };
  }
  return { ok: true, value: parsed.data };
}

export function collectStepSpaces(manifest: FlowManifest, originSpaceId: string): string[] {
  const spaces = new Set<string>([originSpaceId]);
  const walk = (steps: FlowStep[]) => {
    for (const step of steps) {
      if (step.parallel?.lane) walk(step.parallel.lane as FlowStep[]);
      if (step.steps) walk(step.steps as FlowStep[]);
    }
  };
  walk(manifest.steps);
  return [...spaces];
}
