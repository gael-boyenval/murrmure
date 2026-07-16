import type { FlowIr, FlowManifest, FlowStep, FlowStepIr } from "@murrmure/contracts";
import { computeContentDigest } from "../index/digest.js";
import { isStepContractStep } from "./step-contract-compile.js";

function stepContractToIr(
  step: FlowStep,
  qualifiedId: string,
  parentId: string | null,
): FlowStepIr {
  return {
    id: qualifiedId,
    kind: "step_contract",
    step_contract: {
      qualified_id: qualifiedId,
      parent_id: parentId,
    },
  };
}

function flattenStepContractIr(step: FlowStep, parentId: string | null, prefix: string | null): FlowStepIr[] {
  if (!isStepContractStep(step)) return [];
  const qualifiedId = prefix ? `${prefix}.${step.id}` : step.id;
  const out: FlowStepIr[] = [stepContractToIr(step, qualifiedId, parentId)];
  for (const child of step.steps ?? []) {
    out.push(...flattenStepContractIr(child as FlowStep, qualifiedId, qualifiedId));
  }
  return out;
}

function stepToIr(step: FlowStep): FlowStepIr {
  if (step.parallel) {
    return {
      id: step.id,
      kind: "parallel",
      parallel: {
        matrix: step.parallel.matrix,
        lane: step.parallel.lane.map((lane) => {
          if (lane.invoke) {
            return {
              id: lane.id,
              kind: "invoke" as const,
              invoke: {
                space: lane.invoke.space,
                action: lane.invoke.action,
                params: lane.invoke.params,
                artifacts_in: lane.invoke.artifacts_in,
              },
            };
          }
          return {
            id: lane.id,
            kind: "gate" as const,
            gate: {
              form: lane.gate?.form?.id,
              assignees: lane.gate?.assignees,
            },
          };
        }),
      },
    };
  }
  if (step.start_flow) {
    return {
      id: step.id,
      kind: "start_flow",
      start_flow: {
        flow_id: step.start_flow.flow_id,
        input: step.start_flow.input,
        wait: step.start_flow.wait ?? true,
        continue_on_error: step.start_flow.continue_on_error ?? false,
      },
    };
  }
  // Every other step is a step contract (defaults injected at compile).
  return stepContractToIr(step, step.id, null);
}

export function compileFlowIr(manifest: FlowManifest, flow_id: string): FlowIr {
  const steps: FlowStepIr[] = [];
  for (const step of manifest.steps) {
    if (isStepContractStep(step)) {
      steps.push(...flattenStepContractIr(step, null, null));
    } else {
      steps.push(stepToIr(step));
    }
  }
  const body = {
    flow_id,
    name: manifest.name,
    triggers: manifest.triggers,
    steps,
  };
  return {
    ...body,
    digest: computeContentDigest(body),
  };
}
