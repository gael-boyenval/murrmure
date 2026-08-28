import { useEffect, useRef, useState, type Ref } from "react";
import type { TerminalCore } from "@wterm/dom";
import { Terminal, useTerminal, type TerminalHandle } from "@wterm/react";
import { GhosttyCore } from "@wterm/ghostty";
import ghosttyWasm from "@wterm/ghostty/ghostty-vt.wasm?url";
import "@wterm/react/css";
import { cn } from "@murrmure/shell-ui";
import {
  MEETING_PTY_COLS,
  MEETING_PTY_ROWS,
  TERM_RESET,
  nextPtyWrite,
} from "./seat-terminal-write.js";

/** Watch-only PTY. Ghostty paints VT bytes. Keys are discarded. */
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
  const [core, setCore] = useState<TerminalCore | undefined>();

  useEffect(() => {
    let cancelled = false;
    void GhosttyCore.load({ wasmPath: ghosttyWasm })
      .then((loaded) => {
        if (!cancelled) setCore(loaded);
      })
      .catch(() => {
        if (!cancelled) setCore(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const push = (chunk: string, reset = false) => {
    if (!chunk && !reset) return;
    const payload = reset ? `${TERM_RESET}${chunk}` : chunk;
    if (!ready.current) {
      pending.current += payload;
      return;
    }
    write(payload);
  };

  useEffect(() => {
    const next = nextPtyWrite(written.current, text);
    push(next.chunk, next.reset);
    written.current = text;
  }, [text, write]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-zinc-800 bg-zinc-950">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-3 py-1.5 text-[10px] uppercase tracking-wide text-zinc-500">
        <span>PTY</span>
        <span className={live ? "text-emerald-400" : "text-zinc-500"}>{live ? "live" : "exited"}</span>
      </div>
      <div className="relative min-h-0 flex-1 overflow-auto">
        {!text ? (
          <p className="absolute inset-0 z-10 px-3 py-2 font-mono text-[11px] text-zinc-600">{emptyLabel}</p>
        ) : null}
        {core ? (
          <Terminal
            ref={ref as Ref<TerminalHandle>}
            className={cn("h-full w-full", !text && "opacity-0")}
            cols={MEETING_PTY_COLS}
            rows={MEETING_PTY_ROWS}
            core={core}
            autoResize={false}
            theme="solarized-dark"
            cursorBlink={live}
            onData={() => undefined}
            onReady={() => {
              ready.current = true;
              if (pending.current) write(pending.current);
              pending.current = "";
            }}
          />
        ) : (
          <p className="px-3 py-2 font-mono text-[11px] text-zinc-600">Loading terminal…</p>
        )}
      </div>
    </div>
  );
}
