import type { HookSpec } from "@murrmure/contracts";
import { createHash } from "node:crypto";

export interface HookSourceEvent {
  event_id: string;
  event_type: string;
  space_id: string;
  source?: string;
  payload: Record<string, unknown>;
}

export interface IndexedHook {
  hook_id: string;
  spec: HookSpec;
}

export function computeHookDedupKey(
  source: string,
  eventId: string,
  hookId: string,
): string {
  return createHash("sha256").update(`${source}|${eventId}|${hookId}`).digest("hex");
}

export function normalizeHookSources(source: string | string[] | undefined): string[] | undefined {
  if (source == null) return undefined;
  return Array.isArray(source) ? source : [source];
}

export function hookSourceMatches(
  filterSource: string | string[] | undefined,
  eventSource: string,
): boolean {
  const allowed = normalizeHookSources(filterSource);
  if (!allowed || allowed.length === 0) return true;
  return allowed.includes(eventSource);
}

export function matchHooks(
  hooks: Array<{ name: string } & HookSpec>,
  event: HookSourceEvent,
): IndexedHook[] {
  const eventSource = event.source ?? `/spaces/${event.space_id}`;
  const matched: IndexedHook[] = [];

  for (const hook of hooks) {
    const filter = hook.on?.event;
    if (!filter || filter.type !== event.event_type) continue;
    if (!hookSourceMatches(filter.source, eventSource)) continue;
    matched.push({ hook_id: hook.name, spec: hook });
  }

  return matched;
}

export function hookStepId(hookId: string): string {
  return `hook:${hookId}`;
}
