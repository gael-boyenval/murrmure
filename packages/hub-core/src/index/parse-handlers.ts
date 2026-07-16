import {
  HandlersFileSchema,
  parseHandlerStepBinding,
  type HandlerSpec,
  type HandlersFile,
  type HandlerStepBinding,
} from "@murrmure/contracts";
import type { ParseResult } from "./parse-result.js";

export interface HandlerIndex {
  handlers: HandlerSpec[];
  /** `step.opened::{alias}` handlers keyed by readable alias. */
  step_opened_by_alias: Record<string, HandlerSpec[]>;
  /** `step.resolved::{alias}` reaction handlers keyed by readable alias. */
  step_resolved_by_alias: Record<string, HandlerSpec[]>;
}

function addByKey(
  target: Record<string, HandlerSpec[]>,
  key: string,
  handler: HandlerSpec,
): void {
  const list = target[key] ?? [];
  list.push(handler);
  target[key] = list;
}

export function parseHandlersFile(raw: unknown): ParseResult<HandlersFile> {
  const parsed = HandlersFileSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      code: "INVALID_HANDLERS",
      message: "handlers.yaml failed validation",
      details: parsed.error,
    };
  }
  return { ok: true, value: parsed.data };
}

export function buildHandlerIndex(file: HandlersFile): HandlerIndex {
  const step_opened_by_alias: Record<string, HandlerSpec[]> = {};
  const step_resolved_by_alias: Record<string, HandlerSpec[]> = {};
  for (const handler of file.handlers) {
    const binding = parseHandlerStepBinding(handler.on);
    if (!binding) continue;
    if (binding.lifecycle === "opened") {
      addByKey(step_opened_by_alias, binding.alias, handler);
    } else {
      addByKey(step_resolved_by_alias, binding.alias, handler);
    }
  }
  return {
    handlers: file.handlers,
    step_opened_by_alias,
    step_resolved_by_alias,
  };
}

/** Step binding for a handler, or `null` for event handlers. */
export function handlerStepBinding(handler: HandlerSpec): HandlerStepBinding | null {
  return parseHandlerStepBinding(handler.on);
}

/** Readable alias (`{flow_name}.{qualified_step_id}`) for a step handler. */
export function handlerAlias(handler: HandlerSpec): string | null {
  return parseHandlerStepBinding(handler.on)?.alias ?? null;
}

/** Matching `step.opened::{alias}` handlers (at most one is valid; zero is valid). */
export function matchStepOpenedHandlers(
  index: HandlerIndex,
  alias: string,
): HandlerSpec[] {
  return index.step_opened_by_alias[alias] ?? [];
}

/** Matching `step.resolved::{alias}` reaction handlers (many are valid). */
export function matchStepResolvedHandlers(
  index: HandlerIndex,
  alias: string,
): HandlerSpec[] {
  return index.step_resolved_by_alias[alias] ?? [];
}

export function matchEventHandlers(
  handlers: HandlerSpec[],
  event: { event_type: string; source: string },
): HandlerSpec[] {
  return handlers.filter((handler) => {
    if (typeof handler.on === "string") return false;
    const on = handler.on.event;
    if (on.type !== event.event_type) return false;
    if (!on.source) return true;
    if (typeof on.source === "string") return on.source === event.source;
    return on.source.includes(event.source);
  });
}
