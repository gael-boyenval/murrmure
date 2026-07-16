import {
  FlowManifestSchema,
  assertSupportedPayloadSchema,
  type FlowManifest,
  type FlowStep,
} from "@murrmure/contracts";
import type { ParseResult } from "./parse-result.js";
import {
  findLegacyStepKinds,
  rejectLegacyStepKinds,
  rejectRemovedFields,
} from "../flow-engine/step-contract-compile.js";

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

/** Reject the removed `start` key (including dual `start` + `triggers`) and `requires_view`. */
export function rejectRemovedStartFields(raw: unknown): ParseResult<unknown> {
  if (!raw || typeof raw !== "object") return { ok: true, value: raw };
  const record = raw as Record<string, unknown>;
  if ("start" in record && record.start !== undefined) {
    return {
      ok: false,
      code: "LEGACY_START_KEY",
      message:
        "Top-level 'start:' is removed — use 'triggers:' as the only start-condition field (see studio-specs/current/bridges/step-contract.md)",
    };
  }
  const triggers = record.triggers;
  if (triggers && typeof triggers === "object" && !Array.isArray(triggers)) {
    if ("requires_view" in (triggers as Record<string, unknown>)) {
      return {
        ok: false,
        code: "LEGACY_REQUIRES_VIEW",
        message:
          "'requires_view' is removed — spaces bind Views through handlers.yaml, not the portable flow",
      };
    }
  }
  return { ok: true, value: raw };
}

/**
 * Reject explicit `branches: {}`. Omission receives `completed` / `failed`
 * defaults; an explicit empty map is invalid (done gate). Walks top-level and
 * nested `steps` (parallel/start_flow steps carry no `branches`).
 */
export function rejectEmptyBranches(raw: unknown): ParseResult<unknown> {
  if (!raw || typeof raw !== "object") return { ok: true, value: raw };
  const steps = (raw as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return { ok: true, value: raw };

  const visit = (step: unknown, idPrefix: string | null): string | null => {
    if (!step || typeof step !== "object") return null;
    const record = step as Record<string, unknown>;
    const stepId = typeof record.id === "string" ? record.id : "(unknown)";
    const qualifiedId = idPrefix ? `${idPrefix}.${stepId}` : stepId;
    const branches = record.branches;
    if (
      branches &&
      typeof branches === "object" &&
      !Array.isArray(branches) &&
      Object.keys(branches as Record<string, unknown>).length === 0
    ) {
      return qualifiedId;
    }
    const children = record.steps;
    if (Array.isArray(children)) {
      for (const child of children) {
        const hit = visit(child, qualifiedId);
        if (hit) return hit;
      }
    }
    return null;
  };

  for (const step of steps) {
    const hit = visit(step, null);
    if (hit) {
      return {
        ok: false,
        code: "EMPTY_BRANCHES",
        message: `Step '${hit}' declares branches: {} — omit branches to receive defaults or declare at least one branch`,
      };
    }
  }
  return { ok: true, value: raw };
}

export function parseFlowManifest(raw: unknown): ParseResult<FlowManifest> {
  const guard = rejectInlineScriptSteps(raw);
  if (!guard.ok) return guard;

  const start = rejectRemovedStartFields(raw);
  if (!start.ok) return start;

  const removed = rejectRemovedFields(raw);
  if (!removed.ok) return removed;

  const legacy = rejectLegacyStepKinds(raw);
  if (!legacy.ok) return legacy;

  const emptyBranches = rejectEmptyBranches(raw);
  if (!emptyBranches.ok) return emptyBranches;

  const parsed = FlowManifestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      code: "INVALID_FLOW_MANIFEST",
      message: "flow.manifest.yaml failed validation",
      details: parsed.error,
    };
  }
  const validateSchemas = (steps: FlowStep[]): ParseResult<FlowManifest> | null => {
    for (const step of steps) {
      for (const [branchName, branch] of Object.entries(step.branches ?? {})) {
        if (branch.schema && typeof branch.schema === "object") {
          try {
            assertSupportedPayloadSchema(branch.schema);
          } catch (error) {
            return {
              ok: false,
              code: "INVALID_BRANCH_SCHEMA",
              message: `Step '${step.id}' branch '${branchName}' schema is invalid: ${error instanceof Error ? error.message : "unsupported schema"}`,
            };
          }
        }
      }
      if (step.steps?.length) {
        const nested = validateSchemas(step.steps);
        if (nested) return nested;
      }
    }
    return null;
  };
  const schemaError = validateSchemas(parsed.data.steps);
  if (schemaError) return schemaError;
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
