import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  isViewContractError,
  type ViewAppContext,
  type ViewBranchContract,
  type ViewContractError,
  type ViewHostOutboundMessage,
} from "../types.js";
import { postViewMessage } from "./messages.js";
import { resolveHubOrigin } from "../hub-origin.js";
import { peekPendingViewContext, subscribeViewContext } from "./context-channel.js";

/** Result of validating a branch resolve against the projected contract. */
export function validateBranchResolve(
  context: ViewAppContext,
  branch: string,
  params: Record<string, unknown>,
): ViewContractError | null {
  const branches = context.step?.branches ?? [];
  const contract = branches.find((b) => b.branch === branch);
  if (!contract) {
    return { code: "VIEW_UNKNOWN_BRANCH", message: `Unknown branch '${branch}'`, branch };
  }
  const error = validateBranchParams(contract, params);
  if (error) return { ...error, branch };
  return null;
}

function validateBranchParams(
  contract: ViewBranchContract,
  params: Record<string, unknown>,
): ViewContractError | null {
  const schema = contract.schema;
  if (!schema || typeof schema !== "object") return null;
  const type = (schema as { type?: unknown }).type;
  if (type === "object") {
    const required = (schema as { required?: unknown[] }).required;
    if (Array.isArray(required)) {
      for (const field of required) {
        if (typeof field !== "string") continue;
        if (params[field] === undefined || params[field] === null || params[field] === "") {
          return {
            code: "VIEW_BRANCH_VALIDATION_FAILED",
            message: `Branch '${contract.branch}' requires field '${field}'`,
          };
        }
      }
    }
  }
  return null;
}

interface AckStore {
  pending: { resolve: (ok: boolean, error?: ViewContractError) => void; kind: string } | null;
}

const ackStore: AckStore = { pending: null };
let ackListenerWired = false;

function ensureAckListener(nonce: string, transportVersion: number): void {
  if (ackListenerWired) return;
  ackListenerWired = true;
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window.parent) return;
    const data = event.data as ViewHostOutboundMessage | undefined;
    if (!data || data.type !== "murrmure.view.ack") return;
    if (data.v !== transportVersion || data.nonce !== nonce) return;
    const pending = ackStore.pending;
    if (!pending || pending.kind !== data.kind) return;
    ackStore.pending = null;
    pending.resolve(data.ok, data.ok ? undefined : data.error);
  });
}

/** Post a `submit_branch` intent and resolve when the host acks. Throws
 * `ViewContractError` if the host rejects. Dev hosts ack without mutating. */
export function submitBranch(
  context: ViewAppContext,
  branch: string,
  params: Record<string, unknown>,
): Promise<void> {
  const validation = validateBranchResolve(context, branch, params);
  if (validation) return Promise.reject(validation);

  ensureAckListener(context.nonce, context.transport_version);
  return new Promise<void>((resolve, reject) => {
    ackStore.pending = {
      kind: "submit_branch",
      resolve: (ok, error) => {
        if (ok) resolve();
        else reject(error ?? { code: "VIEW_BRANCH_VALIDATION_FAILED", message: "Host rejected submit" });
      },
    };
    postViewMessage(
      { type: "murrmure.view.submit_branch", branch, params },
      context.hub_base_url,
      context.nonce,
    );
  });
}

/** Post a `cancel` intent and resolve when the host acks. */
export function cancel(context: ViewAppContext): Promise<void> {
  ensureAckListener(context.nonce, context.transport_version);
  return new Promise<void>((resolve, reject) => {
    ackStore.pending = {
      kind: "cancel",
      resolve: (ok, error) => {
        if (ok) resolve();
        else reject(error ?? { code: "VIEW_CANCEL_REJECTED", message: "Host rejected cancel" });
      },
    };
    postViewMessage({ type: "murrmure.view.cancel" }, context.hub_base_url, context.nonce);
  });
}

export { isViewContractError };
export type { ViewContractError };

export interface ViewContract {
  context: ViewAppContext | null;
  ready: boolean;
  submitBranch: (branch: string, params: Record<string, unknown>) => Promise<void>;
  cancel: () => Promise<void>;
}

class ChannelContextStore {
  private listeners = new Set<() => void>();
  private channelUnsub: (() => void) | null = null;

  private snapshot: { context: ViewAppContext | null; version: number } = {
    context: peekPendingViewContext(),
    version: 0,
  };

  private ensureChannel = (): void => {
    if (this.channelUnsub) return;
    this.channelUnsub = subscribeViewContext((context) => {
      this.applyContext(context);
    });
  };

  private applyContext(context: ViewAppContext | null): void {
    this.snapshot = { context, version: this.snapshot.version + 1 };
    for (const listener of this.listeners) listener();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.ensureChannel();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = (): { context: ViewAppContext | null; version: number } => {
    // Opportunistically pull any context buffered before the subscription wired.
    const pending = peekPendingViewContext();
    if (pending && pending !== this.snapshot.context) {
      this.applyContext(pending);
    }
    return this.snapshot;
  };
  setForTests = (context: ViewAppContext | null): void => {
    this.applyContext(context);
  };
  /** Test-only: drop the channel subscription so a reset channel re-wires cleanly. */
  resetForTests = (): void => {
    this.channelUnsub?.();
    this.channelUnsub = null;
    this.applyContext(peekPendingViewContext());
  };
}

const channelStore = new ChannelContextStore();

/** Test-only: inject a context without the postMessage channel (dev host / tests). */
export function __setViewContextForTests(context: ViewAppContext | null): void {
  channelStore.setForTests(context);
}

/** Test-only: drop the channel subscription so a reset channel re-wires cleanly. */
export function __resetViewContractForTests(): void {
  channelStore.resetForTests();
}

/**
 * v3 view contract hook. Reads the host context (nonce/version/window verified
 * by the channel), posts `ready`, and exposes host-mediated `submitBranch` /
 * `cancel`. Views never hold a Hub credential; in dev mode the host acks
 * without mutating a real run.
 */
export function useViewContract(): ViewContract {
  const { context } = useSyncExternalStore(channelStore.subscribe, channelStore.getSnapshot);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!context || ready) return;
    postViewMessage({ type: "murrmure.view.ready" }, context.hub_base_url, context.nonce);
    setReady(true);
  }, [context, ready]);

  const submit = useCallback(
    (branch: string, params: Record<string, unknown>) => {
      if (!context) {
        return Promise.reject({ code: "VIEW_CONTEXT_MISMATCH", message: "No view context" } satisfies ViewContractError);
      }
      return submitBranch(context, branch, params);
    },
    [context],
  );
  const doCancel = useCallback(() => {
    if (!context) {
      return Promise.reject({ code: "VIEW_CONTEXT_MISMATCH", message: "No view context" } satisfies ViewContractError);
    }
    return cancel(context);
  }, [context]);

  return useMemo(
    () => ({ context, ready: ready && Boolean(context), submitBranch: submit, cancel: doCancel }),
    [context, ready, submit, doCancel],
  );
}

export { resolveHubOrigin };
