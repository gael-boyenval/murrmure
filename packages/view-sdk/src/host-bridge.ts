import type {
  ViewAppContext,
  ViewContractError,
  ViewHostInboundMessage,
  ViewHostOutboundMessage,
  ViewBranchContract,
  ViewBranchSubmitInput,
  ViewSubmissionState,
} from "./types.js";
import { createViewContextMessage, createAckMessage, isViewHostInboundMessage } from "./app/messages.js";
import { hubOriginsMatch } from "./hub-origin.js";
import { isSandboxedOpaqueOrigin, resolveViewIframeOrigin, resolveViewIframeTargetOrigin } from "./iframe-origin.js";
import { validateBranchContract } from "@murrmure/contracts";

export { createViewContextMessage, createAckMessage, isViewHostInboundMessage } from "./app/messages.js";
export { resolveViewIframeOrigin, isSandboxedOpaqueOrigin, resolveViewIframeTargetOrigin } from "./iframe-origin.js";

export function viewSubmitFileName(
  branch: ViewBranchContract,
  slot: string,
  file: Blob,
  index: number,
): string {
  const supplied = (file as Blob & { name?: unknown }).name;
  if (typeof supplied === "string" && supplied.length > 0) return supplied;
  return `${slot}-${index}${branch.artifact_slots?.[slot]?.extensions?.[0] ?? ""}`;
}

export function validateHostBranchResolve(
  context: ViewAppContext,
  branchName: string,
  input: ViewBranchSubmitInput,
): ViewContractError | null {
  const branch = context.step?.branches.find((candidate) => candidate.branch === branchName);
  if (!branch) {
    return {
      code: "VIEW_UNKNOWN_BRANCH",
      message: `Unknown branch '${branchName}'`,
      branch: branchName,
      errors: [],
    };
  }
  const files = Object.fromEntries(
    Object.entries(input.files ?? {}).map(([slot, value]) => [
      slot,
      (Array.isArray(value) ? value : [value]).map((file, index) => ({
        name: viewSubmitFileName(branch, slot, file, index),
        media_type: file.type,
        size_bytes: file.size,
      })),
    ]),
  );
  const result = validateBranchContract(branch, { payload: input.payload, files });
  return result.ok
    ? null
    : {
        code: result.code,
        message: "Branch resolve contract validation failed",
        branch: branchName,
        errors: result.errors,
      };
}

/** Resolve relative view entry paths to hub-served asset URLs. External View
 * URLs are rejected — production Views are locally built and shell-hosted. */
export function resolveViewEntryUrl(
  hubBaseUrl: string,
  viewRef: { view_id: string; origin_space_id: string; entry_url?: string },
): string | undefined {
  if (!viewRef.entry_url) return undefined;
  if (/^https?:\/\//i.test(viewRef.entry_url) || viewRef.entry_url.startsWith("//")) {
    throw new Error("External View URLs are rejected; production Views are locally built and shell-hosted");
  }
  const base = hubBaseUrl.replace(/\/$/, "");
  const entry = viewRef.entry_url.replace(/^\.\//, "");
  const spaceId = encodeURIComponent(viewRef.origin_space_id);
  const viewId = encodeURIComponent(viewRef.view_id);
  return `${base}/v1/spaces/${spaceId}/views/${viewId}/${entry.split("/").map(encodeURIComponent).join("/")}`;
}

export interface ViewHostBridgeHandlers {
  onReady?: () => void;
  onSubmitBranch?: (
    branch: string,
    input: ViewBranchSubmitInput,
    submission: {
      submission_id: string;
      report: (state: ViewSubmissionState) => void;
    },
  ) => Promise<{ ok: true } | { ok: false; error: ViewContractError }>;
  onCancelSubmission?: (submission_id: string) => Promise<void> | void;
  onOpenChild?: (
    child_step_id: string,
    idempotency_key: string,
  ) => Promise<{ ok: true } | { ok: false; error: ViewContractError }>;
  onCancel?: () => Promise<{ ok: true } | { ok: false; error: ViewContractError }>;
  onResolved?: () => void;
}

/** True when an inbound message binds the exact source window, transport version,
 * and per-instance nonce of this mount. */
function isMatchingInbound(
  event: MessageEvent,
  iframe: HTMLIFrameElement,
  context: ViewAppContext,
): event is MessageEvent & { data: ViewHostInboundMessage } {
  if (event.source !== iframe.contentWindow) return false;
  if (!isViewHostInboundMessage(event.data)) return false;
  const msg = event.data as ViewHostInboundMessage;
  return msg.v === context.transport_version && msg.nonce === context.nonce;
}

/** Attach postMessage listener for the versioned, nonce-bound view protocol. Returns cleanup. */
export function attachViewHostBridge(
  iframe: HTMLIFrameElement,
  context: ViewAppContext,
  handlers: ViewHostBridgeHandlers,
): () => void {
  const iframeOrigin = resolveViewIframeOrigin(iframe, context.hub_base_url);
  const hubBaseUrl = context.hub_base_url;
  // Sandboxed opaque-origin iframes (allow-scripts without allow-same-origin)
  // arrive with event.origin === "null" and can only be reached via "*". The
  // nonce-bound envelope and exact source-window binding remain the trust gate.
  const opaque = isSandboxedOpaqueOrigin(iframe);
  const targetOrigin = resolveViewIframeTargetOrigin(iframe, hubBaseUrl);

  const onMessage = async (event: MessageEvent) => {
    if (opaque) {
      if (event.origin !== "null") return;
    } else if (event.origin !== iframeOrigin && !hubOriginsMatch(event.origin, hubBaseUrl)) {
      return;
    }
    if (!isMatchingInbound(event, iframe, context)) return;
    const message = event.data as ViewHostInboundMessage;

    switch (message.type) {
      case "murrmure.view.ready":
        handlers.onReady?.();
        break;
      case "murrmure.view.submit_branch": {
        const report = (state: ViewSubmissionState) => {
          iframe.contentWindow?.postMessage(
            {
              type: "murrmure.view.submission",
              v: context.transport_version,
              nonce: context.nonce,
              submission_id: message.submission_id,
              status: state.status,
              uploaded_bytes: state.uploadedBytes,
              total_bytes: state.totalBytes,
            } satisfies ViewHostOutboundMessage,
            targetOrigin,
          );
        };
        const result = handlers.onSubmitBranch
          ? await handlers.onSubmitBranch(message.branch, message.input, {
              submission_id: message.submission_id,
              report,
            })
          : ({ ok: true } as const);
        const ack = result.ok
          ? createAckMessage({
              nonce: context.nonce,
              transport_version: context.transport_version,
              kind: "submit_branch",
              submission_id: message.submission_id,
              ok: true,
            })
          : createAckMessage({
              nonce: context.nonce,
              transport_version: context.transport_version,
              kind: "submit_branch",
              submission_id: message.submission_id,
              ok: false,
              error: result.error,
            });
        iframe.contentWindow?.postMessage(ack, targetOrigin);
        break;
      }
      case "murrmure.view.cancel_submission": {
        await handlers.onCancelSubmission?.(message.submission_id);
        iframe.contentWindow?.postMessage(
          createAckMessage({
            nonce: context.nonce,
            transport_version: context.transport_version,
            kind: "submission_cancel",
            submission_id: message.submission_id,
            ok: true,
          }),
          targetOrigin,
        );
        break;
      }
      case "murrmure.view.open_child": {
        const result = handlers.onOpenChild
          ? await handlers.onOpenChild(message.child_step_id, message.idempotency_key)
          : ({ ok: false as const, error: {
              code: "VIEW_OPEN_CHILD_REJECTED",
              message: "Host does not support child activation",
              errors: [] as import("./types.js").ViewContractValidationError[],
            } });
        iframe.contentWindow?.postMessage(
          result.ok
            ? createAckMessage({
                nonce: context.nonce,
                transport_version: context.transport_version,
                kind: "open_child",
                submission_id: message.submission_id,
                ok: true,
              })
            : createAckMessage({
                nonce: context.nonce,
                transport_version: context.transport_version,
                kind: "open_child",
                submission_id: message.submission_id,
                ok: false,
                error: result.error,
              }),
          targetOrigin,
        );
        break;
      }
      case "murrmure.view.cancel": {
        const result = handlers.onCancel ? await handlers.onCancel() : ({ ok: true } as const);
        const ack = result.ok
          ? createAckMessage({
              nonce: context.nonce,
              transport_version: context.transport_version,
              kind: "cancel",
              ok: true,
            })
          : createAckMessage({
              nonce: context.nonce,
              transport_version: context.transport_version,
              kind: "cancel",
              ok: false,
              error: result.error,
            });
        iframe.contentWindow?.postMessage(ack, targetOrigin);
        break;
      }
      case "murrmure.view.resolved":
        handlers.onResolved?.();
        break;
    }
  };

  window.addEventListener("message", onMessage);

  const sendContext = () => {
    iframe.contentWindow?.postMessage(
      createViewContextMessage(context, context.nonce) as ViewHostOutboundMessage,
      targetOrigin,
    );
  };

  iframe.addEventListener("load", sendContext);
  sendContext();

  return () => {
    window.removeEventListener("message", onMessage);
    iframe.removeEventListener("load", sendContext);
  };
}
