import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { cn } from "@murrmure/shell-ui";

export type FlowGroupNodeData = {
  stepId: string;
  title: string;
  status?: string;
  borderColor: string;
  childCount: number;
  selected?: boolean;
};

type FlowGroupNode = Node<FlowGroupNodeData, "flowGroup">;

export function FlowchartGroupNode({ data }: NodeProps<FlowGroupNode>) {
  return (
    <div
      className={cn(
        "relative box-border flex h-full w-full cursor-pointer flex-col rounded-xl border-2 border-dashed bg-zinc-950/90 transition-colors",
        data.selected && "ring-1 ring-blue-400/80",
      )}
      style={{ borderColor: data.selected ? "#3b82f6" : data.borderColor }}
    >
      <Handle type="target" position={Position.Top} id="top" className="flowchart-handle flowchart-handle-top" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="flowchart-handle flowchart-handle-bottom" />

      <div className="border-b border-zinc-800/80 px-3 py-1.5" data-testid={`flow-group-${data.stepId}`}>
        <p className="truncate text-[11px] font-semibold text-zinc-300">{data.title}</p>
        <p className="text-[10px] text-zinc-500">
          {data.childCount} substeps
          {data.status ? ` · ${data.status.replace(/_/g, " ")}` : ""}
        </p>
      </div>
    </div>
  );
}
