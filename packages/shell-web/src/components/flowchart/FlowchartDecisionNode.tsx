import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { BOTTOM_SOURCE_HANDLES, bottomHandleLeftPercent } from "./flowchart-layout.js";

type FlowDecisionNode = Node<Record<string, never>, "flowDecision">;

/** Compact outcome diamond — multiple bottom exits so branch lines do not share a path. */
export function FlowchartDecisionNode(_props: NodeProps<FlowDecisionNode>) {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div className="absolute inset-[18%] rotate-45 border border-zinc-400/80 bg-zinc-900 shadow-[0_0_0_1px_rgba(0,0,0,0.4)]" />
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
    </div>
  );
}
