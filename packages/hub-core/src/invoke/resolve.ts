import type { IndexedAction, SpaceBinding } from "@murrmure/contracts";
import { ExecutorBindingSchema, isLocalSpaceBinding } from "@murrmure/contracts";
import type { ExecutorBinding } from "@murrmure/runtime-contracts";
import type { ResolvedInvoke } from "./types.js";

export interface IndexedExecutorRow {
  name: string;
  binding?: ExecutorBinding;
}

export function parseIndexedExecutor(row: Record<string, unknown>): IndexedExecutorRow | null {
  const name = String(row.name ?? "");
  if (!name) return null;
  const bindingRaw = row.binding ?? row;
  const parsed = ExecutorBindingSchema.safeParse(bindingRaw);
  if (!parsed.success) return null;
  return { name, binding: parsed.data };
}

export function resolveSpaceRoot(bindings: SpaceBinding[]): string | undefined {
  const local = bindings.filter(isLocalSpaceBinding);
  const primary = local.find((b) => b.primary) ?? local[0];
  return primary?.path;
}

export function isVirtualRemoteSpace(bindings: SpaceBinding[]): boolean {
  return bindings.some((b) => !isLocalSpaceBinding(b));
}

export function resolveInvokeTarget(
  actionName: string,
  actions: IndexedAction[],
  executors: Array<Record<string, unknown>>,
  bindings: SpaceBinding[],
  deliveryOverride?: "fail_fast" | "queue_until_executor",
): ResolvedInvoke | { code: string; message: string } {
  const action = actions.find((a) => a.name === actionName);
  if (!action) {
    return { code: "ACTION_NOT_FOUND", message: `Action '${actionName}' is not indexed` };
  }

  const executorRows = executors
    .map((row) => parseIndexedExecutor(row))
    .filter((row): row is IndexedExecutorRow => row != null);
  const executor = executorRows.find((e) => e.name === action.executor);
  if (!executor?.binding) {
    return {
      code: "EXECUTOR_NOT_FOUND",
      message: `Executor '${action.executor}' is not indexed for action '${actionName}'`,
    };
  }

  const delivery = deliveryOverride ?? action.delivery ?? "fail_fast";
  return {
    action,
    binding: executor.binding,
    space_root: resolveSpaceRoot(bindings),
    delivery,
  };
}
