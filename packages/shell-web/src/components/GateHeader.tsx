import { Link } from "react-router-dom";
import type { GateItem } from "@murrmure/shell-client";
import { CardDescription, CardHeader, CardTitle } from "@murrmure/shell-ui";
import { resolveGateHeader } from "./gate-header.js";

export interface GateHeaderProps {
  gate: GateItem;
  /** Card title override (e.g. resolve form section). Defaults to resolved gate title. */
  title?: string;
  /** When true, omit the blocked-work summary line. */
  hideSummary?: boolean;
}

function truncateId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export function GateHeader({ gate, title, hideSummary }: GateHeaderProps) {
  const header = resolveGateHeader(gate);
  const displayTitle = title ?? header.title;

  return (
    <CardHeader>
      <CardTitle className="text-base">{displayTitle}</CardTitle>
      {!hideSummary && header.summary ? (
        <CardDescription className="text-sm">{header.summary}</CardDescription>
      ) : null}
      <dl className="mt-2 space-y-1.5 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <div>
            <dt className="sr-only">Step</dt>
            <dd>
              <span className="text-foreground/70">Step </span>
              <span className="font-mono text-foreground/90">{header.step_id}</span>
            </dd>
          </div>
          {header.pending_label ? (
            <div>
              <dt className="sr-only">Time pending</dt>
              <dd>
                <span className="text-foreground/70">Pending </span>
                <span>{header.pending_label}</span>
              </dd>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {header.space_label ? (
            <div>
              <dt className="sr-only">Space</dt>
              <dd>
                {header.space_link ? (
                  <Link to={header.space_link} className="text-primary underline underline-offset-2">
                    {header.space_label}
                  </Link>
                ) : (
                  <span>{header.space_label}</span>
                )}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="sr-only">Run</dt>
            <dd>
              <Link
                to={`/runs/${header.run_id}`}
                className="font-mono text-primary underline underline-offset-2"
              >
                {truncateId(header.run_id)}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="sr-only">Session</dt>
            <dd>
              <Link
                to={`/sessions/${header.session_id}`}
                className="font-mono text-primary underline underline-offset-2"
              >
                {truncateId(header.session_id)}
              </Link>
            </dd>
          </div>
        </div>
      </dl>
    </CardHeader>
  );
}
