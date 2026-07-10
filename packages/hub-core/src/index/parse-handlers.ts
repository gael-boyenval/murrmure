import {
  HandlersFileSchema,
  type HandlerSpec,
  type HandlersFile,
} from "@murrmure/contracts";
import type { ParseResult } from "./parse-result.js";

export interface HandlerIndex {
  handlers: HandlerSpec[];
  step_opened_by_key: Record<string, HandlerSpec[]>;
  step_resolved_by_key: Record<string, HandlerSpec[]>;
}

function isLifecycleOn(
  on: HandlerSpec["on"],
  expected: "step.opened" | "step.resolved",
): boolean {
  return typeof on === "string" && on === expected;
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
  const step_opened_by_key: Record<string, HandlerSpec[]> = {};
  const step_resolved_by_key: Record<string, HandlerSpec[]> = {};
  for (const handler of file.handlers) {
    for (const key of handler.contract_keys ?? []) {
      if (isLifecycleOn(handler.on, "step.opened")) {
        addByKey(step_opened_by_key, key, handler);
      }
      if (isLifecycleOn(handler.on, "step.resolved")) {
        addByKey(step_resolved_by_key, key, handler);
      }
    }
  }
  return {
    handlers: file.handlers,
    step_opened_by_key,
    step_resolved_by_key,
  };
}

export function matchStepOpenedHandlers(
  index: HandlerIndex,
  contract_key: string,
): HandlerSpec[] {
  return index.step_opened_by_key[contract_key] ?? [];
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
