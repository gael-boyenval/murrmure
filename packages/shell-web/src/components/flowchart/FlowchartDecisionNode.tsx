import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

type FlowDecisionNode = Node<{ label: string }, "flowDecision">;

export function FlowchartDecisionNode({ data }: NodeProps<FlowDecisionNode>) {
  return (
    <div className="relative flex size-24 rotate-45 items-center justify-center border-2 border-zinc-500 bg-zinc-950">
      <Handle type="target" position={Position.Top} id="top" className="flowchart-handle" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="flowchart-handle" />
      <Handle type="source" position={Position.Right} id="right" className="flowchart-handle" />
      <Handle type="target" position={Position.Left} id="left" className="flowchart-handle" />
      <span className="-rotate-45 text-center text-[10px] font-medium text-zinc-300">
        {data.label}
      </span>
    </div>
  );
}
