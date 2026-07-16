import { MarkerType, type BuiltInEdge } from "@xyflow/react";
import type { RunGraphNode, RunGraphPayload } from "@murrmure/shell-client";
import { formatDateTimeCompact } from "../../lib/format-display.js";

export const CHILD_NODE_W = 176;
export const CHILD_NODE_MIN_H = 52;
export const GROUP_PAD_X = 16;
export const GROUP_PAD_TOP = 44;
export const GROUP_PAD_BOTTOM = 40;
export const GROUP_GAP_X = 20;
export const TOP_LEVEL_GAP_Y = 80;
/** How far the outcome diamond pulls up into its owning step. */
export const DECISION_OVERLAP = 18;
/** Gap from the diamond bottom to the next spine node. */
export const DECISION_AFTER_GAP = 28;
/** Extra group bottom pad so nested outcome diamonds + loop backs stay inside the parent. */
export const GROUP_DECISION_PAD = 28;
/** Nested loop corridor depth under sibling steps. */
export const NESTED_LOOP_OFFSET = 36;
/** Bounding box for the rotated outcome diamond. */
export const DECISION_NODE_SIZE = 28;
export const TOP_LEVEL_NODE_W = 240;
export const TOP_LEVEL_NODE_MIN_H = 68;
export const FLOW_CENTER_X = 24;
/** Horizontal gap between side-by-side success / failure terminals. */
export const TERMINAL_GAP_X = 48;
/**
 * How far failure edges travel right before turning down.
 * Keeps the corridor outside the main step column / success terminal.
 */
export const FAILURE_EDGE_OFFSET = 120;
export const SUCCESS_EDGE_OFFSET = 14;
/** How many bottom source slots each step/branch exposes. */
export const BOTTOM_SOURCE_HANDLES = 5;

/** Spread bottom exits across the node width (percent). */
export function bottomHandleLeftPercent(index: number): number {
  const clamped = Math.max(0, Math.min(BOTTOM_SOURCE_HANDLES - 1, index));
  const start = 18;
  const end = 82;
  if (BOTTOM_SOURCE_HANDLES <= 1) return 50;
  return start + (clamped * (end - start)) / (BOTTOM_SOURCE_HANDLES - 1);
}

export function bottomSourceHandleId(index: number): string {
  const clamped = Math.max(0, Math.min(BOTTOM_SOURCE_HANDLES - 1, index));
  return `bottom-${clamped}`;
}

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

/** Catalog / layout order of step_ids under each parent (and top-level under ""). */
function siblingOrderByParent(graph: RunGraphPayload): Map<string, string[]> {
  const order = new Map<string, string[]>();
  for (const node of graph.nodes) {
    if (node.kind === "decision" || node.kind === "success_terminal" || node.kind === "failure_terminal") {
      continue;
    }
    const parentKey = node.parent_step_id ?? "";
    const list = order.get(parentKey) ?? [];
    if (!list.includes(node.step_id)) list.push(node.step_id);
    order.set(parentKey, list);
  }
  return order;
}

function siblingIndex(
  orderByParent: Map<string, string[]>,
  parentKey: string,
  stepId: string,
): number {
  return orderByParent.get(parentKey)?.indexOf(stepId) ?? -1;
}

/** True when the edge jumps backward among siblings (e.g. review → build-loop). */
export function isSiblingBackEdge(
  graph: RunGraphPayload,
  source: RunGraphNode | undefined,
  target: RunGraphNode | undefined,
  orderByParent = siblingOrderByParent(graph),
): boolean {
  if (!source || !target) return false;
  const parentKey = source.parent_step_id ?? "";
  if ((target.parent_step_id ?? "") !== parentKey) return false;
  const sourceIndex = siblingIndex(orderByParent, parentKey, source.step_id);
  const targetIndex = siblingIndex(orderByParent, parentKey, target.step_id);
  return sourceIndex >= 0 && targetIndex >= 0 && targetIndex < sourceIndex;
}

export function collectLoopStepIds(graph: RunGraphPayload): Set<string> {
  const loopIds = new Set<string>();
  const orderByParent = siblingOrderByParent(graph);
  const nodes = nodeById(graph);
  for (const edge of graph.edges) {
    const target = nodes.get(edge.target);
    if (!target) continue;
    if (edge.id.includes(":loop")) {
      loopIds.add(target.step_id);
      continue;
    }
    const source = nodes.get(edge.source);
    if (isSiblingBackEdge(graph, source, target, orderByParent)) {
      loopIds.add(target.step_id);
    }
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
  failure_terminal: "shared failure terminal",
  success_terminal: "shared success terminal",
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

function isFailureTarget(targetNode: RunGraphNode | undefined, targetId: string): boolean {
  return targetId === "terminal:failed" || targetNode?.kind === "failure_terminal";
}

function isSuccessTarget(targetNode: RunGraphNode | undefined, targetId: string): boolean {
  return targetId === "terminal:succeeded" || targetNode?.kind === "success_terminal";
}

function isActiveStatus(status: string | undefined): boolean {
  return status === "working" || status === "pending";
}

export interface BuildFlowEdgesOptions {
  selectedStepId?: string;
}

function edgeEmphasis(input: {
  sourceNode: RunGraphNode | undefined;
  targetNode: RunGraphNode | undefined;
  selectedStepId?: string;
  isLoop: boolean;
  toFailure: boolean;
  toSuccess: boolean;
  tone?: "default" | "failure";
}): {
  stroke: string;
  strokeWidth: number;
  opacity: number;
  animated: boolean;
  labelFill: string;
  labelSize: number;
} {
  const relatedSelected = Boolean(
    input.selectedStepId &&
      (input.sourceNode?.step_id === input.selectedStepId ||
        input.targetNode?.step_id === input.selectedStepId),
  );
  const relatedRunning =
    isActiveStatus(input.sourceNode?.status) || isActiveStatus(input.targetNode?.status);
  const emphasized = relatedSelected || relatedRunning;

  if (input.isLoop) {
    return {
      stroke: emphasized ? "#f59e0b" : "#b45309",
      strokeWidth: emphasized ? 2.5 : 1,
      opacity: emphasized ? 1 : 0.5,
      animated: relatedRunning,
      labelFill: emphasized ? "#fbbf24" : "#a1a1aa",
      labelSize: emphasized ? 11 : 9,
    };
  }

  if (input.toFailure || input.tone === "failure") {
    return {
      stroke: emphasized ? "#ef4444" : "#7f1d1d",
      strokeWidth: emphasized ? 2.5 : 1,
      opacity: emphasized ? 1 : 0.5,
      animated: relatedRunning,
      labelFill: emphasized ? "#f87171" : "#71717a",
      labelSize: emphasized ? 11 : 9,
    };
  }

  if (input.toSuccess) {
    return {
      stroke: emphasized ? "#22c55e" : "#14532d",
      strokeWidth: emphasized ? 2.5 : 1,
      opacity: emphasized ? 1 : 0.5,
      animated: relatedRunning,
      labelFill: emphasized ? "#4ade80" : "#71717a",
      labelSize: emphasized ? 11 : 9,
    };
  }

  return {
    stroke: emphasized ? "#93c5fd" : "#52525b",
    strokeWidth: emphasized ? 2.5 : 1,
    opacity: emphasized ? 1 : 0.5,
    animated: relatedRunning,
    labelFill: emphasized ? "#e4e4e7" : "#71717a",
    labelSize: emphasized ? 11 : 9,
  };
}

export function buildFlowEdges(
  graph: RunGraphPayload,
  idRemap: Map<string, string>,
  options: BuildFlowEdgesOptions = {},
): BuiltInEdge[] {
  const nodes = nodeById(graph);
  const selectedStepId = options.selectedStepId;
  const orderByParent = siblingOrderByParent(graph);

  const siblingIndexBySource = new Map<string, number>();
  const bottomExitIndexBySource = new Map<string, number>();
  let failureLane = 0;

  const nextBottomHandle = (sourceId: string): string => {
    const index = bottomExitIndexBySource.get(sourceId) ?? 0;
    bottomExitIndexBySource.set(sourceId, index + 1);
    return bottomSourceHandleId(index);
  };

  return graph.edges.map((edge) => {
    const sourceId = idRemap.get(edge.source) ?? edge.source;
    const targetId = idRemap.get(edge.target) ?? edge.target;
    const sourceNode = nodes.get(edge.source);
    const targetNode = nodes.get(edge.target);
    const isLoop =
      edge.id.includes(":loop") || isSiblingBackEdge(graph, sourceNode, targetNode, orderByParent);
    const nested = isNestedSiblingEdge(sourceNode, targetNode);
    const toFailure = isFailureTarget(targetNode, targetId);
    const toSuccess = isSuccessTarget(targetNode, targetId);
    // Decisions only expose bottom exits — never route them as horizontal siblings.
    const nestedForward =
      nested &&
      !isLoop &&
      sourceNode?.kind !== "decision" &&
      targetNode?.kind !== "decision";

    // Step → its own decision diamond overlaps the step; skip the stub connector.
    if (
      sourceNode &&
      targetNode?.kind === "decision" &&
      sourceNode.step_id === targetNode.step_id &&
      sourceNode.kind !== "decision"
    ) {
      return {
        id: edge.id,
        source: sourceId,
        target: targetId,
        hidden: true,
        style: { strokeWidth: 0, opacity: 0 },
      };
    }

    const emphasis = edgeEmphasis({
      sourceNode,
      targetNode,
      selectedStepId,
      isLoop,
      toFailure,
      toSuccess,
      tone: edge.tone,
    });
    const emphasized = emphasis.opacity >= 1;
    const common = {
      label: edge.label,
      labelStyle: {
        fill: emphasis.labelFill,
        fontSize: emphasis.labelSize,
        opacity: emphasis.opacity,
      },
      labelBgStyle: {
        fill: "#09090b",
        fillOpacity: emphasized ? 0.85 : 0.45,
      },
      style: {
        stroke: emphasis.stroke,
        strokeWidth: emphasis.strokeWidth,
        opacity: emphasis.opacity,
        ...(isLoop ? { strokeDasharray: emphasis.animated ? "6 4" : "4 5" } : {}),
      },
      animated: emphasis.animated,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: emphasis.stroke,
        width: emphasized ? 10 : 8,
        height: emphasized ? 10 : 8,
      },
    };

    // Loop / back-edge: leave from bottom, travel under siblings, enter the earlier step from the left.
    if (isLoop) {
      return {
        id: edge.id,
        source: sourceId,
        target: targetId,
        type: "smoothstep",
        sourceHandle: nextBottomHandle(sourceId),
        targetHandle: "left",
        pathOptions: {
          borderRadius: 10,
          offset: nested ? NESTED_LOOP_OFFSET : GROUP_PAD_BOTTOM + 8,
          stepPosition: 0.75,
        },
        ...common,
      };
    }

    if (nestedForward) {
      return {
        id: edge.id,
        source: sourceId,
        target: targetId,
        type: "smoothstep",
        sourceHandle: "right",
        targetHandle: "left",
        pathOptions: { borderRadius: 6, offset: 14, stepPosition: 0.5 },
        ...common,
      };
    }

    // Failure corridor: leave from a dedicated bottom slot, bend right, enter failure from above.
    if (toFailure) {
      const lane = failureLane++;
      return {
        id: edge.id,
        source: sourceId,
        target: targetId,
        type: "smoothstep",
        sourceHandle: nextBottomHandle(sourceId),
        targetHandle: "top",
        pathOptions: {
          borderRadius: 16,
          offset: FAILURE_EDGE_OFFSET + lane * 20,
          stepPosition: 0.2,
        },
        ...common,
      };
    }

    if (toSuccess) {
      return {
        id: edge.id,
        source: sourceId,
        target: targetId,
        type: "smoothstep",
        sourceHandle: nextBottomHandle(sourceId),
        targetHandle: "top",
        pathOptions: {
          borderRadius: 0,
          offset: SUCCESS_EDGE_OFFSET,
          stepPosition: 0.5,
        },
        ...common,
      };
    }

    // Remaining branches from the same source: distinct bottom slots + fan offsets.
    const siblingIndex = siblingIndexBySource.get(sourceId) ?? 0;
    siblingIndexBySource.set(sourceId, siblingIndex + 1);
    const stepPosition =
      siblingIndex === 0 ? 0.5 : Math.min(0.82, Math.max(0.18, 0.5 + (siblingIndex % 2 === 0 ? 0.2 : -0.2)));
    const offset = 16 + siblingIndex * 22;

    return {
      id: edge.id,
      source: sourceId,
      target: targetId,
      type: "smoothstep",
      sourceHandle: nextBottomHandle(sourceId),
      targetHandle: "top",
      pathOptions: {
        borderRadius: siblingIndex > 0 ? 12 : 0,
        offset,
        stepPosition,
      },
      ...common,
    };
  });
}
