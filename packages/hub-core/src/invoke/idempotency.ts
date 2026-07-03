import type { IndexedAction } from "@murrmure/contracts";

/** rev-1 §4.5 — step invoke idempotency key from header + run + step. */
export function buildHeadlessStepId(actionName: string, explicit?: string): string {
  return explicit ?? `action:${actionName}`;
}

export function buildInvokeIdempotencyKey(input: {
  header?: string;
  run_id?: string;
  step_id: string;
  action?: IndexedAction;
}): string | null {
  const policy = input.action?.idempotency ?? "caller_key";
  if (policy === "none" && !input.header) {
    return null;
  }
  if (!input.header && !input.run_id) {
    return null;
  }
  return [input.header ?? "", input.run_id ?? "", input.step_id].join(":");
}
