import { memo, useMemo } from "react";
import { ReactFlow, Background, type Node, Position } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { RunGraphPayload, RunGraphNode } from "@murrmure/shell-client";
import { cn } from "@murrmure/shell-ui";
import { FlowchartStepNode } from "./flowchart/FlowchartStepNode.js";
import { FlowchartGroupNode, type FlowGroupNodeData } from "./flowchart/FlowchartGroupNode.js";
import { FlowchartDecisionNode } from "./flowchart/FlowchartDecisionNode.js";
import {
  CHILD_NODE_W,
  DECISION_AFTER_GAP,
  DECISION_NODE_SIZE,
  DECISION_OVERLAP,
  FLOW_CENTER_X,
  GROUP_DECISION_PAD,
  GROUP_GAP_X,
  GROUP_PAD_BOTTOM,
  GROUP_PAD_TOP,
  GROUP_PAD_X,
  TERMINAL_GAP_X,
  TOP_LEVEL_GAP_Y,
  TOP_LEVEL_NODE_W,
  buildFlowEdges,
  collectLoopStepIds,
  estimateStepNodeHeight,
  kindLabel,
  loopStepTitle,
  memoByStepId,
  shortStepLabel,
  stepMetaLines,
} from "./flowchart/flowchart-layout.js";

const laneColor = (lifecycle?: string) => {
  if (lifecycle === "completed") return "#22c55e";
  if (lifecycle === "failed" || lifecycle === "cancelled") return "#ef4444";
  return "#64748b";
};

const statusColor = (status?: string) => {
  if (status === "completed") return "#22c55e";
  if (status === "failed") return "#ef4444";
  if (status === "working") return "#eab308";
  return "#64748b";
};

const nodeTypes = {
  flowStep: FlowchartStepNode,
  flowGroup: FlowchartGroupNode,
  flowDecision: FlowchartDecisionNode,
};

function nodeKindFlags(n: RunGraphNode) {
  const isLane = n.kind === "lane";
  const isChildRun = n.kind === "child_run";
  const isDecision = n.kind === "decision";
  const isFailureTerminal = n.kind === "failure_terminal";
  const isSuccessTerminal = n.kind === "success_terminal";
  const isStep =
    !isLane && !isChildRun && !isDecision && !isFailureTerminal && !isSuccessTerminal;
  return { isLane, isChildRun, isDecision, isFailureTerminal, isSuccessTerminal, isStep };
}

function stepNodeData(input: {
  title: string;
  subtitle?: string;
  status?: string;
  kind?: string;
  metaLines: string[];
  borderColor: string;
  selected?: boolean;
  highlighted?: boolean;
  compact?: boolean;
  onActivate?: () => void;
}) {
  return {
    title: input.title,
    subtitle: input.subtitle,
    status: input.status,
    kind: input.kind,
    metaLines: input.metaLines,
    borderColor: input.borderColor,
    selected: input.selected,
    highlighted: input.highlighted,
    compact: input.compact,
    onActivate: input.onActivate,
  };
}

export interface RunFlowchartViewProps {
  graph: RunGraphPayload;
  execContext?: Record<string, unknown>;
  selectedRunId?: string;
  selectedStepId?: string;
  onSelectLane?: (runId: string) => void;
  onSelectStep?: (stepId: string) => void;
  className?: string;
}

export const RunFlowchartView = memo(function RunFlowchartView({
  graph,
  execContext,
  selectedRunId,
  selectedStepId,
  onSelectStep,
  onSelectLane,
  className,
}: RunFlowchartViewProps) {
  const { nodes, edges } = useMemo(() => {
    const loopStepIds = collectLoopStepIds(graph);
    const memos = memoByStepId(graph);
    const childrenByParent = new Map<string, RunGraphNode[]>();

    for (const n of graph.nodes) {
      if (!n.parent_step_id) continue;
      const list = childrenByParent.get(n.parent_step_id) ?? [];
      list.push(n);
      childrenByParent.set(n.parent_step_id, list);
    }

    const parentIdsWithChildren = new Set(childrenByParent.keys());
    const idRemap = new Map<string, string>();

    for (const parentId of parentIdsWithChildren) {
      const parentNode = graph.nodes.find((n) => n.step_id === parentId && !n.parent_step_id);
      if (parentNode) idRemap.set(parentNode.id, `group:${parentId}`);
    }

    const flowNodes: Node[] = [];
    let y = 0;
    const isTerminalKind = (kind: string) =>
      kind === "success_terminal" || kind === "failure_terminal";
    const topLevel = graph.nodes.filter((node) => !node.parent_step_id);
    const spine = topLevel.filter((node) => !isTerminalKind(node.kind));
    const successTerminal = topLevel.find((node) => node.kind === "success_terminal");
    const failureTerminal = topLevel.find((node) => node.kind === "failure_terminal");

    for (let index = 0; index < spine.length; index++) {
      const n = spine[index]!;
      const next = spine[index + 1];
      const ownsDecision =
        next?.kind === "decision" && next.step_id === n.step_id;

      const { isLane, isChildRun, isDecision, isStep } = nodeKindFlags(n);
      const lane = isLane ? graph.lanes.find((l) => l.run_id === n.run_id) : undefined;
      const border = isLane ? laneColor(lane?.lifecycle) : statusColor(n.status);
      const memo = memos.get(n.step_id);
      const stepSelected = isStep && selectedStepId === n.step_id;
      const runHighlighted = Boolean(selectedRunId && n.run_id === selectedRunId);

      const children = childrenByParent.get(n.step_id) ?? [];
      if (isDecision) {
        flowNodes.push({
          id: n.id,
          type: "flowDecision",
          data: {},
          position: {
            x: FLOW_CENTER_X + (TOP_LEVEL_NODE_W - DECISION_NODE_SIZE) / 2,
            y,
          },
          style: { width: DECISION_NODE_SIZE, height: DECISION_NODE_SIZE, zIndex: 12 },
          zIndex: 12,
          draggable: false,
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
        });
        y += DECISION_NODE_SIZE + DECISION_AFTER_GAP;
        continue;
      }

      if (children.length > 0) {
        const groupId = `group:${n.step_id}`;
        const stepChildren = children.filter((child) => child.kind !== "decision");
        const decisionByStepId = new Map(
          children
            .filter((child) => child.kind === "decision")
            .map((child) => [child.step_id, child] as const),
        );
        const childLayouts = stepChildren.map((child) => {
          const childMemo = memos.get(child.step_id);
          const metaLines = stepMetaLines(child, childMemo);
          const data = stepNodeData({
            title: loopStepTitle(child.step_id, loopStepIds, child.status, execContext),
            subtitle: child.step_id,
            status: child.status,
            kind: kindLabel(child.kind),
            metaLines,
            borderColor: statusColor(child.status),
            selected: selectedStepId === child.step_id,
            compact: true,
            onActivate: onSelectStep ? () => onSelectStep(child.step_id) : undefined,
          });
          return {
            child,
            data,
            height: estimateStepNodeHeight(data),
            decision: decisionByStepId.get(child.step_id),
          };
        });
        const maxChildHeight = Math.max(
          0,
          ...childLayouts.map((layout) => layout.height),
        );
        const hasNestedDecision = childLayouts.some((layout) => layout.decision);
        const groupWidth =
          GROUP_PAD_X * 2 +
          stepChildren.length * CHILD_NODE_W +
          Math.max(0, stepChildren.length - 1) * GROUP_GAP_X;
        const groupHeight =
          GROUP_PAD_TOP +
          maxChildHeight +
          GROUP_PAD_BOTTOM +
          (hasNestedDecision ? GROUP_DECISION_PAD : 0);

        flowNodes.push({
          id: groupId,
          type: "flowGroup",
          data: {
            stepId: n.step_id,
            title: n.step_id,
            status: n.status,
            borderColor: statusColor(n.status),
            childCount: stepChildren.length,
            selected: selectedStepId === n.step_id,
          } satisfies FlowGroupNodeData,
          position: { x: FLOW_CENTER_X, y },
          style: { width: groupWidth, height: groupHeight },
          draggable: false,
        });

        childLayouts.forEach(({ child, data, height, decision }, childIndex) => {
          const childX = GROUP_PAD_X + childIndex * (CHILD_NODE_W + GROUP_GAP_X);
          flowNodes.push({
            id: child.id,
            type: "flowStep",
            parentId: groupId,
            extent: "parent",
            data,
            position: {
              x: childX,
              y: GROUP_PAD_TOP,
            },
            style: { width: CHILD_NODE_W, height },
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
          });

          if (decision) {
            flowNodes.push({
              id: decision.id,
              type: "flowDecision",
              parentId: groupId,
              extent: "parent",
              data: {},
              position: {
                x: childX + (CHILD_NODE_W - DECISION_NODE_SIZE) / 2,
                y: GROUP_PAD_TOP + height - DECISION_OVERLAP,
              },
              style: {
                width: DECISION_NODE_SIZE,
                height: DECISION_NODE_SIZE,
                zIndex: 12,
              },
              zIndex: 12,
              draggable: false,
              sourcePosition: Position.Bottom,
              targetPosition: Position.Top,
            });
          }
        });

        y += ownsDecision ? groupHeight - DECISION_OVERLAP : groupHeight + TOP_LEVEL_GAP_Y;
        continue;
      }

      const title = isLane
        ? (lane?.label ?? n.run_id?.slice(-8) ?? n.step_id)
        : isChildRun
          ? `↳ ${n.run_id?.slice(-8) ?? "child"}`
          : loopStepTitle(n.step_id, loopStepIds, n.status, execContext);
      const metaLines = stepMetaLines(n, memo, lane?.label);
      const data = stepNodeData({
        title,
        subtitle:
          isLane || isChildRun
            ? undefined
            : shortStepLabel(n.step_id) !== title
              ? n.step_id
              : undefined,
        status: isLane ? lane?.lifecycle : n.status,
        kind: kindLabel(n.kind),
        metaLines,
        borderColor: border,
        selected: stepSelected,
        highlighted: runHighlighted,
        onActivate: isStep && onSelectStep ? () => onSelectStep(n.step_id) : undefined,
      });
      const nodeHeight = estimateStepNodeHeight(data);

      flowNodes.push({
        id: n.id,
        type: "flowStep",
        data,
        position: { x: FLOW_CENTER_X, y },
        style: { width: TOP_LEVEL_NODE_W, height: nodeHeight },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
      });

      y += ownsDecision ? nodeHeight - DECISION_OVERLAP : nodeHeight + TOP_LEVEL_GAP_Y;
    }

    if (successTerminal || failureTerminal) {
      const terminalData = (kind: "success_terminal" | "failure_terminal") =>
        stepNodeData({
          title: kind === "success_terminal" ? "Success" : "Run failed",
          status: kind === "success_terminal" ? "completed" : "failed",
          kind:
            kind === "success_terminal" ? "shared success terminal" : "shared failure terminal",
          metaLines: [],
          borderColor: kind === "success_terminal" ? "#166534" : "#7f1d1d",
        });
      const successHeight = successTerminal
        ? estimateStepNodeHeight(terminalData("success_terminal"))
        : 0;
      const failureHeight = failureTerminal
        ? estimateStepNodeHeight(terminalData("failure_terminal"))
        : 0;
      const terminalHeight = Math.max(successHeight, failureHeight);

      if (successTerminal && failureTerminal) {
        const successX = FLOW_CENTER_X;
        const failureX = FLOW_CENTER_X + TOP_LEVEL_NODE_W + TERMINAL_GAP_X;
        flowNodes.push({
          id: successTerminal.id,
          type: "flowStep",
          data: terminalData("success_terminal"),
          position: { x: successX, y },
          style: { width: TOP_LEVEL_NODE_W, height: terminalHeight },
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
        });
        flowNodes.push({
          id: failureTerminal.id,
          type: "flowStep",
          data: terminalData("failure_terminal"),
          position: { x: failureX, y },
          style: { width: TOP_LEVEL_NODE_W, height: terminalHeight },
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
        });
      } else {
        const alone = successTerminal ?? failureTerminal!;
        const kind = alone.kind as "success_terminal" | "failure_terminal";
        flowNodes.push({
          id: alone.id,
          type: "flowStep",
          data: terminalData(kind),
          position: { x: FLOW_CENTER_X, y },
          style: { width: TOP_LEVEL_NODE_W, height: terminalHeight },
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
        });
      }
    }

    return { nodes: flowNodes, edges: buildFlowEdges(graph, idRemap, { selectedStepId }) };
  }, [graph, execContext, selectedRunId, selectedStepId, onSelectStep]);

  const selectNode = (node: Node) => {
    if (node.id.startsWith("group:")) {
      const stepId = (node.data as FlowGroupNodeData).stepId;
      if (stepId && onSelectStep) onSelectStep(stepId);
      return;
    }
    const graphNode = graph.nodes.find((candidate) => candidate.id === node.id);
    if (!graphNode) return;
    if (graphNode.run_id && onSelectLane && (graphNode.kind === "lane" || graphNode.kind === "child_run")) {
      onSelectLane(graphNode.run_id);
      return;
    }
    if (graphNode.kind === "step_contract" && onSelectStep) {
      onSelectStep(graphNode.step_id);
    }
  };

  return (
    <div className={cn("min-h-0 w-full flex-1 rounded-md border border-border bg-background", className)}>
      <ReactFlow
        className="bg-transparent!"
        colorMode="dark"
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => selectNode(node)}
      >
        <Background gap={20} size={1} color="#27272a" />
      </ReactFlow>
    </div>
  );
});
