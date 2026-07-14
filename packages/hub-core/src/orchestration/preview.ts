import type { FlowManifest, FlowStep } from "@murrmure/contracts";
import { buildRunGraph } from "../flow-engine/graph.js";
import { compileFlowIr } from "../flow-engine/compile.js";
import type { RunGraphResponse } from "../flow-engine/graph.js";

export interface OrchestrationStepPreview {
  step_id: string;
  space?: string;
  action?: string;
  param_shape?: Record<string, string>;
  expect?: string;
}

export interface OrchestrationPreview {
  manifest_name: string;
  flow_digest: string;
  steps: OrchestrationStepPreview[];
}

export function paramValueShape(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  return typeof value;
}

export function sanitizeParamShape(params: Record<string, unknown> | undefined): Record<string, string> | undefined {
  if (!params || !Object.keys(params).length) return undefined;
  const shape: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    shape[key] = paramValueShape(value);
  }
  return shape;
}

function walkSteps(steps: FlowStep[], out: OrchestrationStepPreview[]): void {
  for (const step of steps) {
    const legacyExecutor = (
      step as FlowStep & {
        executor?: {
          action?: string;
          space?: string;
          params?: Record<string, unknown>;
          artifacts_in?: string[];
        };
      }
    ).executor;
    if (legacyExecutor?.action) {
      out.push({
        step_id: step.id,
        space: legacyExecutor.space,
        action: legacyExecutor.action,
        param_shape: sanitizeParamShape(legacyExecutor.params),
        expect: legacyExecutor.artifacts_in?.[0],
      });
    }
    if (step.parallel?.lane) walkSteps(step.parallel.lane, out);
  }
}

export function buildOrchestrationPreview(manifest: FlowManifest, flow_id: string): OrchestrationPreview {
  const ir = compileFlowIr(manifest, flow_id);
  const steps: OrchestrationStepPreview[] = [];
  walkSteps(manifest.steps, steps);
  return {
    manifest_name: manifest.name,
    flow_digest: ir.digest,
    steps,
  };
}

export function buildOrchestrationPreviewGraph(
  run_id: string,
  manifest: FlowManifest,
  flow_id: string,
): RunGraphResponse {
  const ir = compileFlowIr(manifest, flow_id);
  return buildRunGraph({
    run_id,
    flow_id,
    flow_digest: ir.digest,
    ir,
    step_memos: [],
  });
}

export function parseOrchestrationPayloadRef(payload_ref?: string): {
  manifest: FlowManifest;
  preview: OrchestrationPreview;
  flow_id: string;
} | null {
  if (!payload_ref) return null;
  try {
    const parsed = JSON.parse(payload_ref) as {
      kind?: string;
      manifest?: FlowManifest;
      flow_id?: string;
      preview?: OrchestrationPreview;
    };
    if (parsed.kind !== "murrmure.orchestration.pending/v1" || !parsed.manifest || !parsed.flow_id) {
      return null;
    }
    return {
      manifest: parsed.manifest,
      flow_id: parsed.flow_id,
      preview: parsed.preview ?? buildOrchestrationPreview(parsed.manifest, parsed.flow_id),
    };
  } catch {
    return null;
  }
}
