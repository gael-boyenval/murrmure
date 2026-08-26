import { useEffect, useRef } from "react";
import { Terminal, useTerminal } from "@wterm/react";
import "@wterm/react/css";
import { cn } from "@murrmure/shell-ui";

/** Watch-only PTY. wterm paints VT bytes. Keys are discarded. */
export function SeatTerminal({
  text,
  live,
  emptyLabel,
}: {
  text: string;
  live: boolean;
  emptyLabel: string;
}) {
  const { ref, write } = useTerminal();
  const written = useRef("");
  const ready = useRef(false);
  const pending = useRef("");

  const push = (chunk: string) => {
    if (!chunk) return;
    if (!ready.current) {
      pending.current += chunk;
      return;
    }
    write(chunk);
  };

  useEffect(() => {
    if (text.startsWith(written.current)) {
      push(text.slice(written.current.length));
    } else {
      push(text);
    }
    written.current = text;
  }, [text, write]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-zinc-800 bg-zinc-950">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-3 py-1.5 text-[10px] uppercase tracking-wide text-zinc-500">
        <span>PTY</span>
        <span className={live ? "text-emerald-400" : "text-zinc-500"}>{live ? "live" : "exited"}</span>
      </div>
      <div className="relative min-h-0 flex-1">
        {!text ? (
          <p className="absolute inset-0 z-10 px-3 py-2 font-mono text-[11px] text-zinc-600">{emptyLabel}</p>
        ) : null}
        <Terminal
          ref={ref}
          className={cn("h-full w-full", !text && "opacity-0")}
          autoResize
          theme="solarized-dark"
          cursorBlink={live}
          onData={() => undefined}
          onReady={() => {
            ready.current = true;
            if (pending.current) write(pending.current);
            pending.current = "";
          }}
        />
      </div>
    </div>
  );
}
