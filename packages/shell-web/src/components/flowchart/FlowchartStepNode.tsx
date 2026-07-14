import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { cn } from "@murrmure/shell-ui";

export type FlowStepNodeData = {
  title: string;
  subtitle?: string;
  status?: string;
  kind?: string;
  metaLines?: string[];
  borderColor: string;
  selected?: boolean;
  highlighted?: boolean;
  compact?: boolean;
};

const statusTone: Record<string, string> = {
  completed: "bg-emerald-500/15 text-emerald-400",
  failed: "bg-red-500/15 text-red-400",
  working: "bg-amber-500/15 text-amber-300",
  pending: "bg-zinc-500/15 text-zinc-400",
  skipped: "bg-zinc-500/15 text-zinc-500",
};

type FlowStepNode = Node<FlowStepNodeData, "flowStep">;

function StatusPill({ status }: { status: string }) {
  const label = status.replace(/_/g, " ");
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide",
        statusTone[status] ?? "bg-zinc-500/15 text-zinc-400",
      )}
    >
      {label}
    </span>
  );
}

export function FlowchartStepNode({ data }: NodeProps<FlowStepNode>) {
  return (
    <div
      className={cn(
        "relative box-border flex h-full w-full flex-col rounded-lg border-2 bg-zinc-950 px-3 py-2.5 text-xs shadow-sm",
        data.selected && "ring-1 ring-blue-400/80",
        data.highlighted && !data.selected && "bg-blue-950/20",
      )}
      style={{ borderColor: data.selected ? "#3b82f6" : data.borderColor }}
    >
      <Handle type="target" position={Position.Top} id="top" className="flowchart-handle flowchart-handle-top" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="flowchart-handle flowchart-handle-bottom" />
      <Handle type="source" position={Position.Right} id="right" className="flowchart-handle flowchart-handle-right" />
      <Handle type="target" position={Position.Left} id="left" className="flowchart-handle flowchart-handle-left" />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium leading-tight text-zinc-100">{data.title}</p>
          {data.subtitle ? (
            <p className="truncate font-mono text-[10px] leading-tight text-zinc-500">{data.subtitle}</p>
          ) : null}
        </div>
        {data.status ? <StatusPill status={data.status} /> : null}
      </div>

      {data.kind ? <p className="mt-1.5 text-[10px] text-zinc-500">{data.kind}</p> : null}
      {data.metaLines?.map((line) => (
        <p key={line} className="mt-1 break-words font-mono text-[10px] leading-snug text-zinc-400">
          {line}
        </p>
      ))}
    </div>
  );
}
