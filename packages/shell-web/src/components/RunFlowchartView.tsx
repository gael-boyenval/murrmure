import { memo, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { RunGraphNode, RunGraphPayload } from "@murrmure/shell-client";
import {
  CheckCircle2,
  Clock,
  Hand,
  Loader2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { humanizeSchemaKey } from "./schema-label.js";

type FlowNodeData = {
  title: string;
  statusLabel: string;
  StatusIcon: LucideIcon;
  statusColor: string;
  iconSpin?: boolean;
  borderColor: string;
  selected: boolean;
  clickable: boolean;
};

const laneBorderColor = (lifecycle?: string) => {
  if (lifecycle === "completed") return "#22c55e";
  if (lifecycle === "failed" || lifecycle === "cancelled") return "#ef4444";
  if (lifecycle === "working") return "#eab308";
  return "#64748b";
};

const stepBorderColor = (status?: string, kind?: string) => {
  if (kind === "gate") return "#3b82f6";
  if (status === "completed") return "#22c55e";
  if (status === "failed") return "#ef4444";
  if (status === "working") return "#eab308";
  return "#64748b";
};

type StatusCue = Pick<FlowNodeData, "statusLabel" | "StatusIcon" | "statusColor" | "iconSpin">;

function laneStatus(lifecycle?: string): StatusCue {
  if (lifecycle === "completed") {
    return { statusLabel: "Done", StatusIcon: CheckCircle2, statusColor: "#22c55e" };
  }
  if (lifecycle === "failed" || lifecycle === "cancelled") {
    return { statusLabel: "Failed", StatusIcon: XCircle, statusColor: "#ef4444" };
  }
  if (lifecycle === "working") {
    return {
      statusLabel: "Running",
      StatusIcon: Loader2,
      statusColor: "#eab308",
      iconSpin: true,
    };
  }
  return { statusLabel: "Waiting", StatusIcon: Clock, statusColor: "#64748b" };
}

function stepStatus(node: RunGraphNode): StatusCue {
  if (node.kind === "gate") {
    return { statusLabel: "Gate", StatusIcon: Hand, statusColor: "#3b82f6" };
  }
  if (node.status === "completed") {
    return { statusLabel: "Done", StatusIcon: CheckCircle2, statusColor: "#22c55e" };
  }
  if (node.status === "failed") {
    return { statusLabel: "Failed", StatusIcon: XCircle, statusColor: "#ef4444" };
  }
  if (node.status === "working") {
    return {
      statusLabel: "Running",
      StatusIcon: Loader2,
      statusColor: "#eab308",
      iconSpin: true,
    };
  }
  return { statusLabel: "Waiting", StatusIcon: Clock, statusColor: "#64748b" };
}

function nodeTitle(node: RunGraphNode, laneLabel?: string): string {
  if (node.kind === "lane") return laneLabel ?? humanizeSchemaKey(node.step_id);
  if (node.kind === "child_run") return `↳ ${node.run_id?.slice(-8) ?? "child"}`;
  if (node.kind === "fork") return `${humanizeSchemaKey(node.step_id)} (fork)`;
  if (node.kind === "join") return `${humanizeSchemaKey(node.step_id)} (join)`;
  const prefix = node.federated ? "🌐 " : "";
  const remote = node.remote_label ? `${node.remote_label}: ` : "";
  return `${prefix}${remote}${humanizeSchemaKey(node.step_id)}`;
}

function FlowchartNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const { title, statusLabel, StatusIcon, statusColor, iconSpin, borderColor, selected, clickable } =
    data;

  return (
    <>
      <Handle type="target" position={Position.Left} className="!bg-border !w-1.5 !h-1.5 !border-0" />
      <div
        className="min-w-[120px] rounded-lg px-2 py-1.5 text-xs"
        style={{
          border: `2px solid ${borderColor}`,
          background: selected ? "rgba(59,130,246,0.15)" : "#0a0a0a",
          cursor: clickable ? "pointer" : "default",
        }}
      >
        <div className="font-medium leading-tight text-foreground">{title}</div>
        <div
          className="mt-1 flex items-center gap-1 text-[10px] leading-none"
          style={{ color: statusColor }}
        >
          <StatusIcon
            className={`h-3 w-3 shrink-0${iconSpin ? " animate-spin" : ""}`}
            aria-hidden="true"
          />
          <span>{statusLabel}</span>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-border !w-1.5 !h-1.5 !border-0" />
    </>
  );
}

const nodeTypes = { flowchart: FlowchartNode };

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
    const flowNodes: Node<FlowNodeData>[] = graph.nodes.map((n, i) => {
      const isLane = n.kind === "lane";
      const isChildRun = n.kind === "child_run";
      const lane = isLane ? graph.lanes.find((l) => l.run_id === n.run_id) : undefined;
      const status = isLane ? laneStatus(lane?.lifecycle) : stepStatus(n);
      const borderColor = isLane ? laneBorderColor(lane?.lifecycle) : stepBorderColor(n.status, n.kind);

      return {
        id: n.id,
        type: "flowchart",
        data: {
          title: nodeTitle(n, lane?.label),
          ...status,
          borderColor,
          selected: Boolean(selectedRunId && n.run_id === selectedRunId),
          clickable: Boolean((isLane || isChildRun) && n.run_id),
        },
        position: { x: (i % 4) * 180, y: Math.floor(i / 4) * 100 },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: false,
        selectable: false,
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
        colorMode="dark"
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
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
