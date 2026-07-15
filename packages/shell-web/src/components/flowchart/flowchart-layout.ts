import type { BuiltInEdge } from "@xyflow/react";
import type { RunGraphNode, RunGraphPayload } from "@murrmure/shell-client";
import { formatDateTimeCompact } from "../../lib/format-display.js";

export const CHILD_NODE_W = 176;
export const CHILD_NODE_MIN_H = 52;
export const GROUP_PAD_X = 16;
export const GROUP_PAD_TOP = 44;
export const GROUP_PAD_BOTTOM = 36;
export const GROUP_GAP_X = 20;
export const TOP_LEVEL_GAP_Y = 80;
export const TOP_LEVEL_NODE_W = 240;
export const TOP_LEVEL_NODE_MIN_H = 68;
export const FLOW_CENTER_X = 24;

const STEP_META_LINE_H = 15;
const STEP_KIND_LINE_H = 16;
const STEP_HEADER_H = 38;

export function estimateStepNodeHeight(input: {
  subtitle?: string;
  kind?: string;
  metaLines?: string[];
  compact?: boolean;
}): number {
  const minH = input.compact ? CHILD_NODE_MIN_H : TOP_LEVEL_NODE_MIN_H;
  let height = STEP_HEADER_H + 16;
  if (input.subtitle) height += 12;
  if (input.kind) height += STEP_KIND_LINE_H;
  if (input.metaLines?.length) height += input.metaLines.length * STEP_META_LINE_H;
  return Math.max(minH, height);
}

type StepMemo = RunGraphPayload["step_memos"][number] & {
  started_at?: string;
  completed_at?: string;
  error_code?: string;
  executor_type?: string;
};

export function shortStepLabel(stepId: string): string {
  const dot = stepId.lastIndexOf(".");
  return dot >= 0 ? stepId.slice(dot + 1) : stepId;
}

export function collectLoopStepIds(graph: RunGraphPayload): Set<string> {
  const loopIds = new Set<string>();
  for (const edge of graph.edges) {
    if (!edge.id.includes(":loop")) continue;
    const target = graph.nodes.find((n) => n.id === edge.target);
    if (target) loopIds.add(target.step_id);
  }
  return loopIds;
}

export function stepIterationFromExec(
  execContext: Record<string, unknown> | undefined,
  stepId: string,
): number | undefined {
  if (!execContext) return undefined;
  const steps = execContext.steps as
    | Record<string, { output?: { iteration?: number } }>
    | undefined;
  const iteration = steps?.[stepId]?.output?.iteration;
  return typeof iteration === "number" && iteration > 0 ? iteration : undefined;
}

export function loopStepTitle(
  stepId: string,
  loopStepIds: Set<string>,
  status: string | undefined,
  execContext: Record<string, unknown> | undefined,
): string {
  const base = shortStepLabel(stepId);
  if (!loopStepIds.has(stepId)) return base;

  const iteration = stepIterationFromExec(execContext, stepId);
  if (iteration != null) return `${base} ×${iteration}`;
  if (status && status !== "pending" && status !== "idle") return `${base} ×1`;
  return base;
}

const kindLabels: Record<string, string> = {
  step_contract: "contract step",
  invoke: "action",
  gate: "human gate",
  fork: "parallel fork",
  join: "parallel join",
  lane: "lane",
  child_run: "child run",
  hook: "hook",
  action: "action",
};

export function kindLabel(kind: string | undefined): string | undefined {
  if (!kind) return undefined;
  return kindLabels[kind] ?? kind.replace(/_/g, " ");
}

export function memoByStepId(graph: RunGraphPayload): Map<string, StepMemo> {
  return new Map(graph.step_memos.map((memo) => [memo.step_id, memo as StepMemo]));
}

export function stepMetaLines(
  node: RunGraphNode,
  memo: StepMemo | undefined,
  laneLabel?: string,
): string[] {
  const lines: string[] = [];
  if (laneLabel) lines.push(`lane · ${laneLabel}`);
  if (memo?.executor_type) lines.push(`executor · ${memo.executor_type}`);
  if (memo?.started_at) lines.push(`started · ${formatDateTimeCompact(memo.started_at)}`);
  if (memo?.completed_at && memo.status === "completed") {
    lines.push(`done · ${formatDateTimeCompact(memo.completed_at)}`);
  }
  if (memo?.error_code) lines.push(`error · ${memo.error_code}`);
  if (node.federated) lines.push("federated · remote hub");
  return lines;
}

function nodeById(graph: RunGraphPayload): Map<string, RunGraphNode> {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

function isNestedSiblingEdge(
  source: RunGraphNode | undefined,
  target: RunGraphNode | undefined,
): boolean {
  if (!source?.parent_step_id || !target?.parent_step_id) return false;
  return source.parent_step_id === target.parent_step_id;
}

export function buildFlowEdges(
  graph: RunGraphPayload,
  idRemap: Map<string, string>,
): BuiltInEdge[] {
  const nodes = nodeById(graph);

  return graph.edges.map((edge) => {
    const sourceId = idRemap.get(edge.source) ?? edge.source;
    const targetId = idRemap.get(edge.target) ?? edge.target;
    const sourceNode = nodes.get(edge.source);
    const targetNode = nodes.get(edge.target);
    const isLoop = edge.id.includes(":loop");
    const nested = isNestedSiblingEdge(sourceNode, targetNode);
    const targetStatus = targetNode?.status;
    const stroke = isLoop ? "#d97706" : edge.tone === "failure" ? "#7f1d1d" : "#71717a";
    const common = {
      label: edge.label,
      labelStyle: { fill: edge.tone === "failure" ? "#f87171" : "#a1a1aa", fontSize: 10 },
      labelBgStyle: { fill: "#09090b", fillOpacity: 0.9 },
    };

    if (isLoop) {
      return {
        id: edge.id,
        source: sourceId,
        target: targetId,
        type: "smoothstep",
        sourceHandle: "bottom",
        targetHandle: "bottom",
        pathOptions: { borderRadius: 0, offset: GROUP_PAD_BOTTOM + 8, stepPosition: 0.5 },
        style: { stroke, strokeWidth: 1.5, strokeDasharray: "5 4" },
        animated: targetStatus === "working",
        ...common,
      };
    }

    if (nested) {
      return {
        id: edge.id,
        source: sourceId,
        target: targetId,
        type: "smoothstep",
        sourceHandle: "right",
        targetHandle: "left",
        pathOptions: { borderRadius: 0, offset: 14, stepPosition: 0.5 },
        style: { stroke, strokeWidth: 1.5 },
        animated: targetStatus === "working",
        ...common,
      };
    }

    return {
      id: edge.id,
      source: sourceId,
      target: targetId,
      type: "smoothstep",
      sourceHandle: "bottom",
      targetHandle: "top",
      pathOptions: { borderRadius: 0, offset: 22, stepPosition: 0.5 },
      style: { stroke, strokeWidth: 1.5 },
      animated: targetStatus === "working",
      ...common,
    };
  });
}
