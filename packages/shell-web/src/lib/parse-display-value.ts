/** Parse JSON-looking strings into objects for table display. */
export function tryParseJsonString(value: string): unknown | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

/** Coerce string values that contain JSON into structured data. */
export function coerceDisplayValue(value: unknown): unknown {
  if (typeof value === "string") {
    const parsed = tryParseJsonString(value);
    if (parsed !== undefined) return parsed;
  }
  return value;
}

export function isStructuredValue(value: unknown): value is Record<string, unknown> | unknown[] {
  const coerced = coerceDisplayValue(value);
  return coerced !== null && typeof coerced === "object";
}

export const DEFAULT_TRUNCATE_LEN = 100;
