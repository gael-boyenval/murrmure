import type { FlowIr, FlowManifest, FlowStep, FlowStepIr } from "@murrmure/contracts";
import { computeContentDigest } from "../index/digest.js";

function stepToIr(step: FlowStep): FlowStepIr {
  if (step.invoke) {
    return {
      id: step.id,
      kind: "invoke",
      invoke: {
        space: step.invoke.space,
        action: step.invoke.action,
        params: step.invoke.params,
        artifacts_in: step.invoke.artifacts_in,
      },
    };
  }
  if (step.gate) {
    return {
      id: step.id,
      kind: "gate",
      gate: {
        form: step.gate.form?.id,
        assignees: step.gate.assignees,
      },
    };
  }
  if (step.checkpoint) {
    return {
      id: step.id,
      kind: "gate",
      gate: {
        assignees: step.checkpoint.assignees,
        view_id: step.checkpoint.view,
        on_resolve: step.checkpoint.on_resolve,
        merge_input: step.checkpoint.merge_input,
        payload_ref: step.checkpoint.payload_ref,
      },
    };
  }
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
  return { id: step.id, kind: "wait" };
}

export function compileFlowIr(manifest: FlowManifest, flow_id: string): FlowIr {
  const steps = manifest.steps.map(stepToIr);
  const body = {
    flow_id,
    name: manifest.name,
    start: manifest.start,
    steps,
  };
  return {
    ...body,
    digest: computeContentDigest(body),
  };
}
