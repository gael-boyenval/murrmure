import type { FlowIr, FlowStepIr, RunLifecycle, RunStepMemo } from "@murrmure/contracts";
import { buildStepDispatch } from "./advance.js";
import type { FlowStepDispatch } from "./types.js";

export interface RunGraphLane {
  step_id: string;
  matrix_index: number;
  run_id: string;
  lifecycle: RunLifecycle;
  label?: string;
}

export interface RunGraphNode {
  id: string;
  step_id: string;
  kind: string;
  status?: RunStepMemo["status"];
  run_id?: string;
  federated?: boolean;
  remote_label?: string;
}

export interface RunGraphEdge {
  id: string;
  source: string;
  target: string;
}

export interface RunGraphResponse {
  run_id: string;
  flow_id?: string | null;
  flow_digest?: string;
  nodes: RunGraphNode[];
  edges: RunGraphEdge[];
  lanes: RunGraphLane[];
  step_memos: RunStepMemo[];
}

export interface RunGraphSibling {
  run_id: string;
  lifecycle: RunLifecycle;
  matrix_index?: number;
  matrix_step_id?: string;
  exec_context: Record<string, unknown>;
}

export function buildRunGraph(input: {
  run_id: string;
  flow_id?: string | null;
  flow_digest?: string;
  ir?: FlowIr;
  step_memos: RunStepMemo[];
  siblings?: RunGraphSibling[];
}): RunGraphResponse {
  const nodes: RunGraphNode[] = [];
  const edges: RunGraphEdge[] = [];
  const lanes: RunGraphLane[] = [];
  const memoByStep = new Map(input.step_memos.map((m) => [m.step_id, m]));

  if (input.ir) {
    let prevId: string | undefined;
    for (const step of input.ir.steps) {
      if (step.kind === "parallel" && step.parallel) {
        const forkId = `fork:${step.id}`;
        nodes.push({ id: forkId, step_id: step.id, kind: "fork", status: memoByStep.get(step.id)?.status });
        if (prevId) edges.push({ id: `${prevId}->${forkId}`, source: prevId, target: forkId });

        const laneNodes = (input.siblings ?? []).filter(
          (s) => s.matrix_step_id === step.id || s.exec_context._matrix_step_id === step.id,
        );
        for (const sibling of laneNodes) {
          const laneId = `lane:${step.id}:${sibling.matrix_index ?? sibling.exec_context._matrix_index ?? 0}`;
          nodes.push({
            id: laneId,
            step_id: step.id,
            kind: "lane",
            status: lifecycleToMemoStatus(sibling.lifecycle),
            run_id: sibling.run_id,
          });
          edges.push({ id: `${forkId}->${laneId}`, source: forkId, target: laneId });
          lanes.push({
            step_id: step.id,
            matrix_index: Number(sibling.matrix_index ?? sibling.exec_context._matrix_index ?? 0),
            run_id: sibling.run_id,
            lifecycle: sibling.lifecycle,
            label: laneLabel(sibling.exec_context.item),
          });
        }

        const joinId = `join:${step.id}`;
        nodes.push({ id: joinId, step_id: step.id, kind: "join", status: memoByStep.get(step.id)?.status });
        for (const lane of lanes.filter((l) => l.step_id === step.id)) {
          edges.push({
            id: `${lane.run_id}->${joinId}`,
            source: `lane:${step.id}:${lane.matrix_index}`,
            target: joinId,
          });
        }
        prevId = joinId;
        continue;
      }

      const nodeId = `step:${step.id}`;
      nodes.push({
        id: nodeId,
        step_id: step.id,
        kind: step.kind,
        status: memoByStep.get(step.id)?.status,
      });
      if (step.kind === "start_flow") {
        const childRun = (input.siblings ?? []).find(
          (s) => s.exec_context._parent_step_id === step.id,
        );
        if (childRun) {
          const childNodeId = `child:${step.id}:${childRun.run_id}`;
          nodes.push({
            id: childNodeId,
            step_id: step.id,
            kind: "child_run",
            status: lifecycleToMemoStatus(childRun.lifecycle),
            run_id: childRun.run_id,
          });
          edges.push({ id: `${nodeId}->${childNodeId}`, source: nodeId, target: childNodeId });
        }
      }
      if (prevId) edges.push({ id: `${prevId}->${nodeId}`, source: prevId, target: nodeId });
      prevId = nodeId;
    }
  } else {
    for (const memo of input.step_memos) {
      const federated = memo.executor_type === "remote_hub";
      nodes.push({
        id: `step:${memo.step_id}`,
        step_id: memo.step_id,
        kind: memo.step_id.startsWith("hook:") ? "hook" : "action",
        status: memo.status,
        federated,
        remote_label: federated ? "Remote space" : undefined,
      });
    }
  }

  return {
    run_id: input.run_id,
    flow_id: input.flow_id,
    flow_digest: input.flow_digest,
    nodes,
    edges,
    lanes,
    step_memos: input.step_memos,
  };
}

function lifecycleToMemoStatus(lifecycle: RunLifecycle): RunStepMemo["status"] {
  switch (lifecycle) {
    case "completed":
      return "completed";
    case "failed":
    case "cancelled":
      return "failed";
    case "input-required":
      return "working";
    default:
      return "working";
  }
}

function laneLabel(item: unknown): string | undefined {
  if (item && typeof item === "object" && "space" in item) {
    return String((item as { space: unknown }).space);
  }
  if (typeof item === "string") return item;
  return undefined;
}

export function planLaneDispatches(
  laneSteps: FlowStepIr[],
  execContext: Record<string, unknown>,
  originSpaceId: string,
): FlowStepDispatch[] {
  const dispatches: FlowStepDispatch[] = [];
  for (let i = 0; i < laneSteps.length; i++) {
    const step = laneSteps[i]!;
    if (step.kind !== "invoke" || !step.invoke) continue;
    const ir = {
      flow_id: "flw_lane",
      name: "lane",
      digest: "lane",
      start: {},
      steps: laneSteps,
    } as FlowIr;
    const dispatch = buildStepDispatch(ir, i, execContext, originSpaceId);
    if (dispatch) dispatches.push(dispatch);
    break;
  }
  return dispatches;
}
