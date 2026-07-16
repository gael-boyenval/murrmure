const DATE_TIME = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const DATE_TIME_COMPACT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const ISO_LIKE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export function parseDate(value: string | Date | number | undefined | null): Date | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Human-readable local date/time for ISO timestamps and Date values. */
export function formatDateTime(value: string | Date | number | undefined | null): string {
  const date = parseDate(value);
  if (!date) return value == null ? "" : String(value);
  return DATE_TIME.format(date);
}

/** Shorter date/time for dense lists (journal rows, log headers). */
export function formatDateTimeCompact(value: string | Date | number | undefined | null): string {
  const date = parseDate(value);
  if (!date) return value == null ? "" : String(value);
  return DATE_TIME_COMPACT.format(date);
}

/** Relative age: `just now`, `5m`, `2h`, `3d`. */
export function formatRelativeDuration(iso: string, now = new Date()): string {
  const then = parseDate(iso);
  if (!then) return "";
  const diffMs = Math.max(0, now.getTime() - then.getTime());
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Pretty-print JSON (objects, arrays, or JSON strings). */
export function formatJson(value: unknown, indent = 2): string {
  if (value === undefined) return "";
  if (value === null) return "null";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return JSON.stringify(JSON.parse(trimmed), null, indent);
      } catch {
        return value;
      }
    }
    return value;
  }
  try {
    return JSON.stringify(value, null, indent);
  } catch {
    return String(value);
  }
}

/** Pretty-print text when it looks like JSON; otherwise return as-is. */
export function formatMaybeJsonText(text: string, indent = 2): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return text;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, indent);
  } catch {
    return text;
  }
}
