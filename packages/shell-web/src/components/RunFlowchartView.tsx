import { memo, useMemo } from "react";
import { ReactFlow, Background, type Node, Position } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { RunGraphPayload, RunGraphNode } from "@murrmure/shell-client";
import { cn } from "@murrmure/shell-ui";
import { FlowchartStepNode } from "./flowchart/FlowchartStepNode.js";
import { FlowchartGroupNode, type FlowGroupNodeData } from "./flowchart/FlowchartGroupNode.js";
import {
  CHILD_NODE_W,
  FLOW_CENTER_X,
  GROUP_GAP_X,
  GROUP_PAD_BOTTOM,
  GROUP_PAD_TOP,
  GROUP_PAD_X,
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
};

function nodeKindFlags(n: RunGraphNode) {
  const isLane = n.kind === "lane";
  const isChildRun = n.kind === "child_run";
  const isStep = !isLane && !isChildRun;
  return { isLane, isChildRun, isStep };
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

    for (const n of graph.nodes) {
      if (n.parent_step_id) continue;

      const { isLane, isChildRun, isStep } = nodeKindFlags(n);
      const lane = isLane ? graph.lanes.find((l) => l.run_id === n.run_id) : undefined;
      const border = isLane ? laneColor(lane?.lifecycle) : statusColor(n.status);
      const memo = memos.get(n.step_id);
      const stepSelected = isStep && selectedStepId === n.step_id;
      const runHighlighted = Boolean(selectedRunId && n.run_id === selectedRunId);

      const children = childrenByParent.get(n.step_id) ?? [];
      if (children.length > 0) {
        const groupId = `group:${n.step_id}`;
        const childLayouts = children.map((child) => {
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
          });
          return {
            child,
            data,
            height: estimateStepNodeHeight(data),
          };
        });
        const maxChildHeight = Math.max(...childLayouts.map((layout) => layout.height));
        const groupWidth =
          GROUP_PAD_X * 2 +
          children.length * CHILD_NODE_W +
          Math.max(0, children.length - 1) * GROUP_GAP_X;
        const groupHeight = GROUP_PAD_TOP + maxChildHeight + GROUP_PAD_BOTTOM;

        flowNodes.push({
          id: groupId,
          type: "flowGroup",
          data: {
            stepId: n.step_id,
            title: n.step_id,
            status: n.status,
            borderColor: statusColor(n.status),
            childCount: children.length,
            selected: selectedStepId === n.step_id,
          } satisfies FlowGroupNodeData,
          position: { x: FLOW_CENTER_X, y },
          style: { width: groupWidth, height: groupHeight },
          draggable: false,
        });

        childLayouts.forEach(({ child, data, height }, index) => {
          flowNodes.push({
            id: child.id,
            type: "flowStep",
            parentId: groupId,
            extent: "parent",
            data,
            position: {
              x: GROUP_PAD_X + index * (CHILD_NODE_W + GROUP_GAP_X),
              y: GROUP_PAD_TOP,
            },
            style: { width: CHILD_NODE_W, height },
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
          });
        });

        y += groupHeight + TOP_LEVEL_GAP_Y;
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
        subtitle: isLane || isChildRun ? n.step_id : shortStepLabel(n.step_id) !== title ? n.step_id : undefined,
        status: isLane ? lane?.lifecycle : n.status,
        kind: kindLabel(n.kind),
        metaLines,
        borderColor: border,
        selected: stepSelected,
        highlighted: runHighlighted,
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

      y += nodeHeight + TOP_LEVEL_GAP_Y;
    }

    return { nodes: flowNodes, edges: buildFlowEdges(graph, idRemap) };
  }, [graph, execContext, selectedRunId, selectedStepId]);

  return (
    <div className={cn("min-h-0 w-full flex-1 rounded-md border border-border", className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => {
          if (node.id.startsWith("group:")) {
            const stepId = (node.data as FlowGroupNodeData).stepId;
            if (stepId && onSelectStep) onSelectStep(stepId);
            return;
          }
          const graphNode = graph.nodes.find((n) => n.id === node.id);
          if (!graphNode) return;
          if (graphNode.run_id && onSelectLane && (graphNode.kind === "lane" || graphNode.kind === "child_run")) {
            onSelectLane(graphNode.run_id);
            return;
          }
          if (graphNode.kind !== "lane" && graphNode.kind !== "child_run" && onSelectStep) {
            onSelectStep(graphNode.step_id);
          }
        }}
      >
        <Background gap={20} size={1} color="#27272a" />
      </ReactFlow>
    </div>
  );
});
