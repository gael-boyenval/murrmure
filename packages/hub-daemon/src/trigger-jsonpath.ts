export interface SourceEvent {
  event_id: string;
  event_type: string;
  space_id: string;
  instance_id?: string;
  payload: Record<string, unknown>;
}

export function getJsonPathValue(source: SourceEvent, path: string): unknown {
  if (path === "$.space_id") return source.space_id;
  if (path === "$.event_id") return source.event_id;
  if (path === "$.instance_id") return source.instance_id;

  const parts = path.replace(/^\$\.?/, "").split(".");
  let cur: unknown = { payload: source.payload, space_id: source.space_id, event_id: source.event_id };
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function applyJsonPathMap(
  source: SourceEvent,
  payloadMap: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, path] of Object.entries(payloadMap)) {
    const value = getJsonPathValue(source, path);
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

export function computeBusinessKey(source: SourceEvent, keyJsonpaths: string[]): string {
  const parts = keyJsonpaths.map((p) => {
    const v = getJsonPathValue(source, p);
    return v === undefined ? "" : String(v);
  });
  return parts.join("|");
}

export function payloadMatches(
  payload: Record<string, unknown>,
  match: Record<string, unknown> | undefined,
): boolean {
  if (!match) return true;
  for (const [key, expected] of Object.entries(match)) {
    if (payload[key] !== expected) return false;
  }
  return true;
}
