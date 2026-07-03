/** Minimal 5-field cron matcher (minute hour dom month dow). Supports *, numbers, and ranges. */

function parseField(field: string, min: number, max: number): (value: number) => boolean {
  if (field === "*") return () => true;

  const parts = field.split(",");
  const matchers = parts.map((part) => {
    if (part.includes("-")) {
      const [a, b] = part.split("-").map(Number);
      return (v: number) => v >= a! && v <= b!;
    }
    const n = Number(part);
    return (v: number) => v === n;
  });

  return (value: number) => {
    if (value < min || value > max) return false;
    return matchers.some((m) => m(value));
  };
}

export function cronMatches(expression: string, date: Date): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return false;

  const minute = parseField(fields[0]!, 0, 59);
  const hour = parseField(fields[1]!, 0, 23);
  const dom = parseField(fields[2]!, 1, 31);
  const month = parseField(fields[3]!, 1, 12);
  const dow = parseField(fields[4]!, 0, 6);

  return (
    minute(date.getMinutes()) &&
    hour(date.getHours()) &&
    dom(date.getDate()) &&
    month(date.getMonth() + 1) &&
    dow(date.getDay())
  );
}

export function dueScheduledFlows(
  flows: Array<{ flow_id: string; schedule: string | null | undefined }>,
  date: Date,
): string[] {
  return flows
    .filter((f) => f.schedule && cronMatches(f.schedule, date))
    .map((f) => f.flow_id);
}
