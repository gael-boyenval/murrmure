const INPUT_PATTERN = /\{\{input\.([^}]+)\}\}/g;
const STEPS_OUTPUT_PATTERN = /\{\{steps\.([^.}]+)\.output(?:\.([^}]+))?\}\}/g;
const ITEM_PATTERN = /\{\{item(?:\.([^}]+))?\}\}/g;
const EVENT_PATTERN = /\{\{event(?:\.([^}]+))?\}\}/g;
const ORIGIN_SPACE = "{{origin_space}}";

function readPath(root: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, root);
}

export function resolveStepSpace(space: string, originSpaceId: string): string {
  if (space === ORIGIN_SPACE) return originSpaceId;
  return space;
}

export function resolveTemplateString(template: string, execContext: Record<string, unknown>): string {
  const input = (execContext.input ?? execContext) as Record<string, unknown>;
  let out = template.replace(INPUT_PATTERN, (_, key: string) => {
    const value = input[key];
    return value === undefined || value === null ? "" : String(value);
  });
  out = out.replace(STEPS_OUTPUT_PATTERN, (_, stepId: string, field?: string) => {
    const steps = (execContext.steps ?? {}) as Record<string, Record<string, unknown>>;
    const output = steps[stepId]?.output as Record<string, unknown> | undefined;
    if (!output) return "";
    if (!field) return JSON.stringify(output);
    const value = readPath(output, field);
    return value === undefined || value === null ? "" : String(value);
  });
  out = out.replace(ITEM_PATTERN, (_, field?: string) => {
    const item = execContext.item;
    if (item === undefined || item === null) return "";
    if (!field) return typeof item === "object" ? JSON.stringify(item) : String(item);
    if (typeof item === "object" && item !== null) {
      const value = readPath(item as Record<string, unknown>, field);
      return value === undefined || value === null ? "" : String(value);
    }
    return String(item);
  });
  out = out.replace(EVENT_PATTERN, (_, field?: string) => {
    const event = (execContext.event ?? {}) as Record<string, unknown>;
    if (!field) return JSON.stringify(event);
    const value = readPath(event, field);
    return value === undefined || value === null ? "" : String(value);
  });
  return out;
}

/** Resolve a matrix expression to an array of lane items (§5.2.1). */
export function resolveMatrixValue(
  expression: string,
  execContext: Record<string, unknown>,
): unknown[] | null {
  const trimmed = expression.trim();
  if (trimmed.startsWith("{{") && trimmed.endsWith("}}")) {
    const inner = trimmed.slice(2, -2).trim();
    if (inner.startsWith("input.")) {
      const input = (execContext.input ?? {}) as Record<string, unknown>;
      const value = readPath(input, inner.slice("input.".length));
      return Array.isArray(value) ? value : null;
    }
    if (inner.startsWith("steps.")) {
      const match = inner.match(/^steps\.([^.}]+)\.output(?:\.(.+))?$/);
      if (!match) return null;
      const steps = (execContext.steps ?? {}) as Record<string, Record<string, unknown>>;
      const output = steps[match[1]!]?.output;
      if (match[2]) {
        const nested = readPath((output ?? {}) as Record<string, unknown>, match[2]);
        return Array.isArray(nested) ? nested : null;
      }
      return Array.isArray(output) ? output : null;
    }
  }
  const resolved = resolveTemplateString(expression, execContext);
  try {
    const parsed = JSON.parse(resolved);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function resolveStepParams(
  params: Record<string, unknown> | undefined,
  execContext: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!params) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      out[key] = resolveTemplateString(value, execContext);
    } else {
      out[key] = value;
    }
  }
  return out;
}
