import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@murrmure/shell-ui";
import {
  coerceDisplayValue,
  DEFAULT_TRUNCATE_LEN,
  isStructuredValue,
} from "../lib/parse-display-value.js";

export interface DataTableViewProps {
  value: unknown;
  className?: string;
  depth?: number;
  truncateAt?: number;
}

function ExpandToggle({
  expanded,
  onToggle,
  label,
  className,
}: {
  expanded: boolean;
  onToggle: () => void;
  label: ReactNode;
  className?: string;
}) {
  const Icon = expanded ? ChevronDown : ChevronRight;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={cn(
        "inline-flex max-w-full items-start gap-1 rounded-sm px-1 -mx-1 py-0.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground",
        className,
      )}
    >
      <Icon className="mt-0.5 size-3 shrink-0 opacity-60" aria-hidden />
      <span className="min-w-0">{label}</span>
    </button>
  );
}

function primitiveLabel(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function ValueCell({
  value,
  depth,
  truncateAt,
}: {
  value: unknown;
  depth: number;
  truncateAt: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const coerced = coerceDisplayValue(value);

  if (isStructuredValue(coerced)) {
    const isArray = Array.isArray(coerced);
    const size = isArray ? coerced.length : Object.keys(coerced).length;
    const summary = isArray ? `${size} items` : `${size} keys`;

    if (!expanded) {
      return (
        <ExpandToggle
          expanded={false}
          onToggle={() => setExpanded(true)}
          label={<span className="text-primary/90">{summary}</span>}
        />
      );
    }

    return (
      <div className="space-y-1">
        <ExpandToggle
          expanded
          onToggle={() => setExpanded(false)}
          label={<span className="text-muted-foreground">{summary}</span>}
        />
        <DataTableView value={coerced} depth={depth + 1} truncateAt={truncateAt} />
      </div>
    );
  }

  if (typeof coerced === "string") {
    if (coerced.length > truncateAt && !expanded) {
      return (
        <ExpandToggle
          expanded={false}
          onToggle={() => setExpanded(true)}
          label={<span className="font-mono break-all whitespace-pre-wrap">{coerced.slice(0, truncateAt)}…</span>}
        />
      );
    }
    if (coerced.length > truncateAt && expanded) {
      return (
        <div className="space-y-1">
          <ExpandToggle
            expanded
            onToggle={() => setExpanded(false)}
            label={<span className="text-muted-foreground">Show less</span>}
          />
          <span className="font-mono break-all whitespace-pre-wrap">{coerced}</span>
        </div>
      );
    }
    return <span className="font-mono break-all whitespace-pre-wrap">{coerced}</span>;
  }

  return <span className="font-mono">{primitiveLabel(coerced)}</span>;
}

export function DataTableView({
  value,
  className,
  depth = 0,
  truncateAt = DEFAULT_TRUNCATE_LEN,
}: DataTableViewProps) {
  const coerced = coerceDisplayValue(value);

  if (!isStructuredValue(coerced)) {
    return (
      <div className={cn("text-xs", className)}>
        <ValueCell value={coerced} depth={depth} truncateAt={truncateAt} />
      </div>
    );
  }

  const rows: Array<[string, unknown]> = Array.isArray(coerced)
    ? coerced.map((item, index) => [String(index), item])
    : Object.entries(coerced);

  if (rows.length === 0) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        {Array.isArray(coerced) ? "[]" : "{}"}
      </span>
    );
  }

  return (
    <table className={cn("w-full text-xs", depth > 0 && "ml-2 pl-2", className)}>
      <tbody>
        {rows.map(([key, cellValue]) => (
          <tr key={key}>
            <td className="py-0.5 pr-4 align-top text-[11px] font-medium text-muted-foreground/80 whitespace-nowrap">
              {key}
            </td>
            <td className="min-w-0 py-0.5 align-top text-foreground/90">
              <ValueCell value={cellValue} depth={depth} truncateAt={truncateAt} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** @deprecated Use DataTableView */
export function FormattedJson(props: Omit<DataTableViewProps, "truncateAt"> & { indent?: number }) {
  const { indent: _indent, ...rest } = props;
  return <DataTableView {...rest} />;
}
