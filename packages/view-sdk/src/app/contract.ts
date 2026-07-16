import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  isViewContractError,
  type ViewAppContext,
  type ViewBranchContract,
  type ViewBranchSubmitInput,
  type ViewContractError,
  type ViewContractValidationError,
  type ViewHostOutboundMessage,
  type ViewSubmissionState,
} from "../types.js";
import { postViewMessage } from "./messages.js";
import { resolveHubOrigin } from "../hub-origin.js";
import { peekPendingViewContext, subscribeViewContext } from "./context-channel.js";

/** Result of validating a branch resolve against the projected contract. */
export function validateBranchResolve(
  context: ViewAppContext,
  branch: string,
  input: ViewBranchSubmitInput,
): ViewContractError | null {
  const branches = context.step?.branches ?? [];
  const contract = branches.find((b) => b.branch === branch);
  if (!contract) {
    return { code: "VIEW_UNKNOWN_BRANCH", message: `Unknown branch '${branch}'`, branch, errors: [] };
  }
  const errors: ViewContractValidationError[] = [];
  const slots = contract.artifact_slots ?? {};
  const schemaRequired = Array.isArray(contract.schema?.required)
    ? contract.schema.required.filter((name): name is string => typeof name === "string")
    : [];
  const artifactRequired =
    contract.artifact_required ?? schemaRequired.filter((name) => Object.hasOwn(slots, name));
  const payloadRequired =
    contract.payload_required ?? schemaRequired.filter((name) => !Object.hasOwn(slots, name));
  for (const field of payloadRequired) {
    const value = input.payload?.[field];
    if (value === undefined || value === null || value === "") {
      errors.push({
        source: "payload",
        path: `/${field.replace(/~/g, "~0").replace(/\//g, "~1")}`,
        rule: "required",
        message: `must have required property '${field}'`,
      });
    }
  }
  for (const slot of artifactRequired) {
    const supplied = input.files?.[slot];
    const files = supplied ? (Array.isArray(supplied) ? supplied : [supplied]) : [];
    if (files.length === 0) {
      errors.push({
        source: "artifact",
        path: `/files/${slot.replace(/~/g, "~0").replace(/\//g, "~1")}`,
        rule: "min_files",
        message: `Artifact slot '${slot}' requires at least 1 file(s)`,
      });
    }
  }
  return errors.length > 0
    ? {
        code: "CONTRACT_VALIDATION_FAILED",
        message: "Branch resolve contract validation failed",
        branch,
        errors,
      }
    : null;
}

interface AckStore {
  pending: Map<string, {
    resolve: (ok: boolean, error?: ViewContractError) => void;
    nonce: string;
    transportVersion: number;
    onProgress?: (state: ViewSubmissionState) => void;
  }>;
  cancel: { resolve: (ok: boolean, error?: ViewContractError) => void; nonce: string; transportVersion: number } | null;
}

const ackStore: AckStore = { pending: new Map(), cancel: null };
let ackListenerWired = false;

function ensureAckListener(): void {
  if (ackListenerWired) return;
  ackListenerWired = true;
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window.parent) return;
    const data = event.data as ViewHostOutboundMessage | undefined;
    if (!data) return;
    if (data.type === "murrmure.view.submission") {
      const pending = ackStore.pending.get(data.submission_id);
      if (!pending || data.v !== pending.transportVersion || data.nonce !== pending.nonce) return;
      pending.onProgress?.({
        status: data.status,
        uploadedBytes: data.uploaded_bytes,
        totalBytes: data.total_bytes,
      });
      return;
    }
    if (data.type !== "murrmure.view.ack") return;
    if ((data.kind === "submit_branch" || data.kind === "open_child") && data.submission_id) {
      const pending = ackStore.pending.get(data.submission_id);
      if (!pending || data.v !== pending.transportVersion || data.nonce !== pending.nonce) return;
      ackStore.pending.delete(data.submission_id);
      pending.resolve(data.ok, data.ok ? undefined : data.error);
      return;
    }
    if (data.kind === "cancel") {
      const pending = ackStore.cancel;
      if (!pending || data.v !== pending.transportVersion || data.nonce !== pending.nonce) return;
      ackStore.cancel = null;
      pending.resolve(data.ok, data.ok ? undefined : data.error);
    }
  });
}

/** Post a `submit_branch` intent and resolve when the host acks. Throws
 * `ViewContractError` if the host rejects. Dev hosts ack without mutating. */
export function submitBranch(
  context: ViewAppContext,
  branch: string,
  input: ViewBranchSubmitInput,
  options?: { submissionId?: string; onProgress?: (state: ViewSubmissionState) => void },
): Promise<void> {
  const validation = validateBranchResolve(context, branch, input);
  if (validation) return Promise.reject(validation);

  ensureAckListener();
  const submissionId = options?.submissionId ?? globalThis.crypto?.randomUUID?.() ?? `submission-${Date.now()}`;
  return new Promise<void>((resolve, reject) => {
    ackStore.pending.set(submissionId, {
      nonce: context.nonce,
      transportVersion: context.transport_version,
      onProgress: options?.onProgress,
      resolve: (ok, error) => {
        if (ok) resolve();
        else reject(error ?? { code: "VIEW_BRANCH_VALIDATION_FAILED", message: "Host rejected submit", errors: [] });
      },
    });
    postViewMessage(
      { type: "murrmure.view.submit_branch", submission_id: submissionId, branch, input },
      context.hub_base_url,
      context.nonce,
    );
  });
}

export function cancelSubmission(context: ViewAppContext, submissionId: string): void {
  postViewMessage(
    { type: "murrmure.view.cancel_submission", submission_id: submissionId },
    context.hub_base_url,
    context.nonce,
  );
}

/** Ask the host to yield this parent View assignment and open one declared child. */
export function openChildStep(
  context: ViewAppContext,
  childStepId: string,
  idempotencyKey: string,
): Promise<void> {
  if (!context.step?.declared_children?.includes(childStepId)) {
    return Promise.reject({
      code: "VIEW_OPEN_CHILD_REJECTED",
      message: `'${childStepId}' is not a declared child of '${context.step?.step_id ?? "unknown"}'`,
      errors: [],
    } satisfies ViewContractError);
  }
  ensureAckListener();
  const submissionId = globalThis.crypto?.randomUUID?.() ?? `open-child-${Date.now()}`;
  return new Promise<void>((resolve, reject) => {
    ackStore.pending.set(submissionId, {
      nonce: context.nonce,
      transportVersion: context.transport_version,
      resolve: (ok, error) => {
        if (ok) resolve();
        else reject(error ?? {
          code: "VIEW_OPEN_CHILD_REJECTED",
          message: "Host rejected child activation",
          errors: [],
        });
      },
    });
    postViewMessage({
      type: "murrmure.view.open_child",
      submission_id: submissionId,
      child_step_id: childStepId,
      idempotency_key: idempotencyKey,
    }, context.hub_base_url, context.nonce);
  });
}

/** Post a `cancel` intent and resolve when the host acks. */
export function cancel(context: ViewAppContext): Promise<void> {
  ensureAckListener();
  return new Promise<void>((resolve, reject) => {
    ackStore.cancel = {
      nonce: context.nonce,
      transportVersion: context.transport_version,
      resolve: (ok, error) => {
        if (ok) resolve();
        else reject(error ?? { code: "VIEW_CANCEL_REJECTED", message: "Host rejected cancel", errors: [] });
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
  branches: ViewBranchContract[];
  validate: (branch: string, input: ViewBranchSubmitInput) => ViewContractError | null;
  submitBranch: (branch: string, input: ViewBranchSubmitInput) => Promise<void>;
  openChild: (childStepId: string, idempotencyKey: string) => Promise<void>;
  cancel: () => Promise<void>;
  submission: ViewSubmissionState & { cancel: () => void };
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
  const [submission, setSubmission] = useState<ViewSubmissionState>({
    status: "idle",
    uploadedBytes: 0,
    totalBytes: 0,
  });
  const activeSubmission = useRef<string | null>(null);

  useEffect(() => {
    if (!context || ready) return;
    postViewMessage({ type: "murrmure.view.ready" }, context.hub_base_url, context.nonce);
    setReady(true);
  }, [context, ready]);

  const submit = useCallback(
    async (branch: string, input: ViewBranchSubmitInput) => {
      if (!context) {
        throw { code: "VIEW_CONTEXT_MISMATCH", message: "No view context", errors: [] } satisfies ViewContractError;
      }
      if (activeSubmission.current) {
        throw {
          code: "VIEW_SUBMISSION_IN_PROGRESS",
          message: "A branch submission is already in progress",
          branch,
          errors: [],
        } satisfies ViewContractError;
      }
      const submissionId = globalThis.crypto?.randomUUID?.() ?? `submission-${Date.now()}`;
      activeSubmission.current = submissionId;
      setSubmission({ status: "validating", uploadedBytes: 0, totalBytes: 0 });
      try {
        await submitBranch(context, branch, input, {
          submissionId,
          onProgress: setSubmission,
        });
        setSubmission((state) => ({ ...state, status: "succeeded" }));
      } catch (error) {
        const cancelled = isViewContractError(error) && error.code === "VIEW_SUBMISSION_CANCELLED";
        setSubmission((state) => ({
          ...state,
          status: cancelled ? "idle" : "failed",
        }));
        throw error;
      } finally {
        activeSubmission.current = null;
      }
    },
    [context],
  );
  const validate = useCallback(
    (branch: string, input: ViewBranchSubmitInput) =>
      context
        ? validateBranchResolve(context, branch, input)
        : ({ code: "VIEW_CONTEXT_MISMATCH", message: "No view context", errors: [] } satisfies ViewContractError),
    [context],
  );
  const doCancel = useCallback(() => {
    if (!context) {
      return Promise.reject({ code: "VIEW_CONTEXT_MISMATCH", message: "No view context", errors: [] } satisfies ViewContractError);
    }
    return cancel(context);
  }, [context]);
  const openChild = useCallback((childStepId: string, idempotencyKey: string) => {
    if (!context) {
      return Promise.reject({ code: "VIEW_CONTEXT_MISMATCH", message: "No view context", errors: [] } satisfies ViewContractError);
    }
    return openChildStep(context, childStepId, idempotencyKey);
  }, [context]);
  const cancelActiveSubmission = useCallback(() => {
    if (!context || !activeSubmission.current) return;
    cancelSubmission(context, activeSubmission.current);
    setSubmission({ status: "idle", uploadedBytes: 0, totalBytes: 0 });
  }, [context]);

  return useMemo(
    () => ({
      context,
      ready: ready && Boolean(context),
      branches: context?.step?.branches ?? [],
      validate,
      submitBranch: submit,
      openChild,
      cancel: doCancel,
      submission: { ...submission, cancel: cancelActiveSubmission },
    }),
    [context, ready, validate, submit, openChild, doCancel, submission, cancelActiveSubmission],
  );
}

export { resolveHubOrigin };
