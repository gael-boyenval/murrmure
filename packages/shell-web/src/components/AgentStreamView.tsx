import { useState } from "react";
import { Bot, ChevronDown, ChevronRight, Terminal, Wrench } from "lucide-react";
import { cn } from "@murrmure/shell-ui";
import {
  hasToolInput,
  summarizeToolInputParts,
  type AgentStreamEvent,
} from "../lib/parse-agent-stream.js";

function ToolCallBlock({ name, input }: { name: string; input?: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const parts = summarizeToolInputParts(input, 3);
  const expandable = hasToolInput(input);
  const Icon = expanded ? ChevronDown : ChevronRight;

  return (
    <div className="rounded-md border border-zinc-800/90 bg-zinc-900/50">
      <button
        type="button"
        aria-expanded={expanded}
        disabled={!expandable}
        className={cn(
          "flex w-full min-w-0 items-center gap-2 px-2.5 py-1.5 text-left text-xs",
          expandable ? "cursor-pointer hover:bg-zinc-800/40" : "cursor-default",
        )}
        onClick={() => expandable && setExpanded((open) => !open)}
      >
        <Wrench className="size-3 shrink-0 text-amber-400/90" aria-hidden />
        <span className="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-200">{name}</span>
        {parts.length > 0 ? (
          <span className="flex min-w-0 items-center gap-1 truncate font-mono text-[10px] text-zinc-400">
            {parts.map((part, index) => (
              <span key={`${part.key}-${index}`} className="inline-flex min-w-0 items-center gap-0.5">
                {index > 0 ? <span className="shrink-0 text-zinc-600">·</span> : null}
                <span className="shrink-0 text-zinc-500">{part.key}=</span>
                <span className="truncate text-zinc-300">{part.value}</span>
              </span>
            ))}
          </span>
        ) : (
          <span className="text-[10px] text-zinc-600">no params</span>
        )}
        {expandable ? (
          <Icon className="ml-auto size-3 shrink-0 text-zinc-500" aria-hidden />
        ) : null}
      </button>
      {expanded && expandable ? (
        <pre className="border-t border-zinc-800/80 px-2.5 py-2 font-mono text-[10px] leading-relaxed whitespace-pre-wrap break-words text-zinc-400">
          {JSON.stringify(input, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

function AssistantBlock({ text }: { text: string }) {
  return (
    <div className="rounded-md border-l-2 border-sky-500/70 bg-zinc-900/50 px-3 py-2">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-sky-300/90">
        <Bot className="size-3" aria-hidden />
        Agent
      </div>
      <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-zinc-100">{text}</p>
    </div>
  );
}

function GenericEventBlock({ event }: { event: AgentStreamEvent }) {
  const [expanded, setExpanded] = useState(false);
  const label = event.type.replace(/_/g, " ");

  return (
    <div className="rounded-md border border-zinc-800/80 bg-zinc-900/40 px-2.5 py-2">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 text-left text-[10px] font-medium uppercase tracking-wide text-zinc-500"
        onClick={() => setExpanded((open) => !open)}
      >
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        {label}
      </button>
      {event.text ? (
        <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-zinc-300">{event.text}</p>
      ) : null}
      {expanded ? (
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[10px] text-zinc-500">
          {JSON.stringify(event.raw, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

function StreamEvent({ event }: { event: AgentStreamEvent }) {
  if (event.type === "assistant" && event.text) {
    return <AssistantBlock text={event.text} />;
  }
  if ((event.type === "tool" || event.type === "tool_call") && event.toolName) {
    return <ToolCallBlock name={event.toolName} input={event.toolInput} />;
  }
  if (event.type === "thinking" && event.text) {
    return (
      <p className="border-l-2 border-zinc-700 pl-3 text-xs italic leading-relaxed text-zinc-500">{event.text}</p>
    );
  }
  if (event.type === "error") {
    return (
      <p className="rounded-md border border-red-900/60 bg-red-950/30 px-2.5 py-2 text-xs text-red-300">
        {event.text ?? "Agent error"}
      </p>
    );
  }
  return <GenericEventBlock event={event} />;
}

export interface AgentStreamViewProps {
  events: AgentStreamEvent[];
  live?: boolean;
  className?: string;
}

export function AgentStreamView({ events, live, className }: AgentStreamViewProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-zinc-500">
        <Terminal className="size-3" aria-hidden />
        <span>Agent stream</span>
        {live ? (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-300">live</span>
        ) : null}
      </div>
      <div className="space-y-2">
        {events.map((event, index) => (
          <StreamEvent key={`${event.type}-${index}`} event={event} />
        ))}
      </div>
    </div>
  );
}
