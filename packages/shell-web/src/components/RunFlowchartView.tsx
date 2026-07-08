import { memo, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { RunGraphPayload } from "@murrmure/shell-client";

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

export interface RunFlowchartViewProps {
  graph: RunGraphPayload;
  selectedRunId?: string;
  onSelectLane?: (runId: string) => void;
}

export const RunFlowchartView = memo(function RunFlowchartView({
  graph,
  selectedRunId,
  onSelectLane,
}: RunFlowchartViewProps) {
  const { nodes, edges } = useMemo(() => {
    const flowNodes: Node[] = graph.nodes.map((n, i) => {
      const isLane = n.kind === "lane";
      const isChildRun = n.kind === "child_run";
      const lane = isLane ? graph.lanes.find((l) => l.run_id === n.run_id) : undefined;
      const border = isLane ? laneColor(lane?.lifecycle) : statusColor(n.status);
      return {
        id: n.id,
        data: {
          label: isLane
            ? (lane?.label ?? n.run_id?.slice(-8) ?? n.step_id)
            : isChildRun
              ? `↳ ${n.run_id?.slice(-8) ?? "child"}`
              : `${n.federated ? "🌐 " : ""}${n.remote_label ? `${n.remote_label}: ` : ""}${n.step_id}`,
        },
        position: { x: (i % 4) * 180, y: Math.floor(i / 4) * 100 },
        style: {
          border: `2px solid ${border}`,
          borderRadius: 8,
          padding: 8,
          fontSize: 12,
          background: selectedRunId && n.run_id === selectedRunId ? "rgba(59,130,246,0.15)" : "#0a0a0a",
          cursor: (isLane || isChildRun) && n.run_id ? "pointer" : "default",
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      };
    });

    const flowEdges: Edge[] = graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: true,
    }));

    return { nodes: flowNodes, edges: flowEdges };
  }, [graph, selectedRunId]);

  return (
    <div className="h-[360px] w-full rounded-md border border-border">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        onNodeClick={(_, node) => {
          const graphNode = graph.nodes.find((n) => n.id === node.id);
          if (graphNode?.run_id && onSelectLane) onSelectLane(graphNode.run_id);
        }}
      >
        <Background />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
});
