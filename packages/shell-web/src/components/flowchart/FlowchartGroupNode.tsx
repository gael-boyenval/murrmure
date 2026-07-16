import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { cn } from "@murrmure/shell-ui";
import { BOTTOM_SOURCE_HANDLES, bottomHandleLeftPercent } from "./flowchart-layout.js";

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
        "relative box-border flex h-full w-full cursor-pointer flex-col rounded-md border border-dashed bg-zinc-950/70 transition-colors",
        data.selected && "border-blue-500 ring-1 ring-blue-500/40",
      )}
      style={{ borderColor: data.selected ? undefined : data.borderColor }}
    >
      <Handle type="target" position={Position.Top} id="top" className="flowchart-handle flowchart-handle-top" />
      {Array.from({ length: BOTTOM_SOURCE_HANDLES }, (_, index) => (
        <Handle
          key={index}
          type="source"
          position={Position.Bottom}
          id={`bottom-${index}`}
          className="flowchart-handle flowchart-handle-bottom-slot"
          style={{ left: `${bottomHandleLeftPercent(index)}%` }}
        />
      ))}

      <div className="border-b border-zinc-800/60 px-2.5 py-1.5" data-testid={`flow-group-${data.stepId}`}>
        <p className="truncate text-[11px] font-medium text-zinc-300">{data.title}</p>
        <p className="text-[10px] text-zinc-500">
          {data.childCount} substeps
          {data.status ? ` · ${data.status.replace(/_/g, " ")}` : ""}
        </p>
      </div>
    </div>
  );
}
