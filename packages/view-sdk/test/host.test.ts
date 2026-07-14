// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  attachViewHostBridge,
  createViewContextMessage,
  isViewHostInboundMessage,
  isSandboxedOpaqueOrigin,
  resolveViewEntryUrl,
  resolveViewIframeOrigin,
  resolveViewIframeTargetOrigin,
  validateHostBranchResolve,
} from "../src/host-bridge.js";
import { VIEW_TRANSPORT_VERSION, type ViewAppContext } from "../src/types.js";

const NONCE = "nonce-abc";

function makeContext(over: Partial<ViewAppContext> = {}): ViewAppContext {
  return {
    flow_id: "flw_demo",
    space_id: "spc_demo",
    hub_base_url: "http://127.0.0.1:8787",
    mode: "production",
    transport_version: VIEW_TRANSPORT_VERSION,
    nonce: NONCE,
    ...over,
  };
}

describe("view-sdk host protocol", () => {
  it("validates Draft 2020-12 payload and Blob metadata with normalized errors", () => {
    const context = makeContext({
      step: {
        step_id: "intake",
        branches: [{
          branch: "continue",
          schema: {
            type: "object",
            required: ["reviewer", "spec"],
            properties: { reviewer: { type: "string", format: "email" } },
          },
          payload_required: ["reviewer"],
          artifact_required: ["spec"],
          artifact_slots: {
            spec: {
              media_types: ["text/markdown"],
              extensions: [".md"],
              min_bytes: 1,
            },
          },
        }],
      },
    });
    expect(validateHostBranchResolve(context, "continue", {
      payload: { reviewer: "invalid" },
      files: { spec: new Blob(["x"], { type: "text/plain" }) },
    })).toMatchObject({
      code: "CONTRACT_VALIDATION_FAILED",
      errors: expect.arrayContaining([
        expect.objectContaining({ source: "payload", path: "/reviewer", rule: "format" }),
        expect.objectContaining({ source: "artifact", path: "/files/spec/0", rule: "media_type" }),
      ]),
    });
    expect(validateHostBranchResolve(context, "continue", {
      payload: { reviewer: "dev@example.com" },
      files: { spec: new Blob(["# Spec"], { type: "text/markdown" }) },
    })).toBeNull();
  });

  it("isViewHostInboundMessage validates submit_branch payload with envelope", () => {
    expect(
      isViewHostInboundMessage({ type: "murrmure.view.ready", v: 1, nonce: NONCE }),
    ).toBe(true);
    expect(
      isViewHostInboundMessage({ type: "murrmure.view.cancel", v: 1, nonce: NONCE }),
    ).toBe(true);
    expect(
      isViewHostInboundMessage({ type: "murrmure.view.resolved", v: 1, nonce: NONCE }),
    ).toBe(true);
    expect(
      isViewHostInboundMessage({
        type: "murrmure.view.submit_branch",
        submission_id: "sub-1",
        branch: "approve",
        input: { payload: { topic: "news" } },
        v: 1,
        nonce: NONCE,
      }),
    ).toBe(true);
    // missing branch/params
    expect(isViewHostInboundMessage({ type: "murrmure.view.submit_branch", v: 1, nonce: NONCE })).toBe(
      false,
    );
    // missing envelope
    expect(isViewHostInboundMessage({ type: "murrmure.view.ready" })).toBe(false);
    expect(isViewHostInboundMessage({ type: "other", v: 1, nonce: NONCE })).toBe(false);
  });

  it("createViewContextMessage wraps host context with envelope", () => {
    const ctx = makeContext();
    const msg = createViewContextMessage(ctx, NONCE);
    expect(msg.type).toBe("murrmure.view.context");
    expect(msg.context.flow_id).toBe("flw_demo");
    expect(msg.v).toBe(VIEW_TRANSPORT_VERSION);
    expect(msg.nonce).toBe(NONCE);
  });

  it("resolveViewEntryUrl maps relative entry to hub asset URL", () => {
    const url = resolveViewEntryUrl("http://127.0.0.1:8787", {
      view_id: "review-params",
      origin_space_id: "spc_demo",
      entry_url: "./dist/index.html",
    });
    expect(url).toBe(
      "http://127.0.0.1:8787/v1/spaces/spc_demo/views/review-params/dist/index.html",
    );
  });

  it("resolveViewEntryUrl rejects external View URLs", () => {
    expect(() =>
      resolveViewEntryUrl("http://127.0.0.1:8787", {
        view_id: "v",
        origin_space_id: "spc",
        entry_url: "https://evil.example/x.html",
      }),
    ).toThrow(/External View URLs are rejected/);
  });

  it("resolveViewIframeOrigin prefers iframe src over hub origin", () => {
    const iframe = document.createElement("iframe");
    iframe.src = "http://localhost:5173/";
    expect(resolveViewIframeOrigin(iframe, "http://127.0.0.1:8787")).toBe("http://localhost:5173");
  });

  it("isSandboxedOpaqueOrigin detects allow-scripts-without-same-origin", () => {
    const none = document.createElement("iframe");
    expect(isSandboxedOpaqueOrigin(none)).toBe(false);

    const empty = document.createElement("iframe");
    empty.setAttribute("sandbox", "");
    expect(isSandboxedOpaqueOrigin(empty)).toBe(true);

    const allowScripts = document.createElement("iframe");
    allowScripts.setAttribute("sandbox", "allow-scripts");
    expect(isSandboxedOpaqueOrigin(allowScripts)).toBe(true);

    const allowScriptsSameOrigin = document.createElement("iframe");
    allowScriptsSameOrigin.setAttribute("sandbox", "allow-scripts allow-same-origin");
    expect(isSandboxedOpaqueOrigin(allowScriptsSameOrigin)).toBe(false);
  });

  it("resolveViewIframeTargetOrigin uses wildcard for sandboxed opaque iframes", () => {
    const opaque = document.createElement("iframe");
    opaque.src = "http://localhost:5173/";
    opaque.setAttribute("sandbox", "allow-scripts");
    expect(resolveViewIframeTargetOrigin(opaque, "http://127.0.0.1:8787")).toBe("*");

    const notSandboxed = document.createElement("iframe");
    notSandboxed.src = "http://localhost:5173/";
    expect(resolveViewIframeTargetOrigin(notSandboxed, "http://127.0.0.1:8787")).toBe(
      "http://localhost:5173",
    );
  });

  it("attachViewHostBridge posts context with wildcard targetOrigin for sandboxed opaque iframe", () => {
    const iframe = document.createElement("iframe");
    iframe.src = "http://localhost:5173/";
    iframe.setAttribute("sandbox", "allow-scripts");
    document.body.appendChild(iframe);

    const postMessage = vi.fn();
    Object.defineProperty(iframe, "contentWindow", {
      configurable: true,
      value: { postMessage },
    });

    const ctx = makeContext();
    const cleanup = attachViewHostBridge(iframe, ctx, {});

    expect(postMessage).toHaveBeenCalledWith(createViewContextMessage(ctx, NONCE), "*");

    cleanup();
    iframe.remove();
  });

  it("attachViewHostBridge accepts null origin submit_branch from sandboxed opaque iframe", async () => {
    const iframe = document.createElement("iframe");
    iframe.src = "http://localhost:5173/";
    iframe.setAttribute("sandbox", "allow-scripts");
    document.body.appendChild(iframe);

    const postMessage = vi.fn();
    Object.defineProperty(iframe, "contentWindow", {
      configurable: true,
      value: { postMessage },
    });

    const onSubmitBranch = vi.fn().mockResolvedValue({ ok: true } as const);
    const cleanup = attachViewHostBridge(iframe, makeContext(), { onSubmitBranch });

    const event = new MessageEvent("message", {
      data: {
        type: "murrmure.view.submit_branch",
        submission_id: "sub-1",
        branch: "approve",
        input: { payload: { topic: "ai" } },
        v: VIEW_TRANSPORT_VERSION,
        nonce: NONCE,
      },
      origin: "null",
      source: iframe.contentWindow,
    });
    window.dispatchEvent(event);

    await vi.waitFor(() =>
      expect(onSubmitBranch).toHaveBeenCalledWith(
        "approve",
        { payload: { topic: "ai" } },
        expect.objectContaining({ submission_id: "sub-1" }),
      ),
    );
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalled());
    expect(postMessage.mock.calls.at(-1)?.[1]).toBe("*");
    cleanup();
    iframe.remove();
  });

  it("attachViewHostBridge rejects non-null origin from sandboxed opaque iframe", () => {
    const iframe = document.createElement("iframe");
    iframe.src = "http://localhost:5173/";
    iframe.setAttribute("sandbox", "allow-scripts");
    document.body.appendChild(iframe);

    Object.defineProperty(iframe, "contentWindow", {
      configurable: true,
      value: { postMessage: vi.fn() },
    });

    const onSubmitBranch = vi.fn();
    const cleanup = attachViewHostBridge(iframe, makeContext(), { onSubmitBranch });

    // A sandboxed opaque iframe cannot send a real origin; such a message is an
    // impersonation attempt and must be ignored despite the correct nonce.
    const event = new MessageEvent("message", {
      data: {
        type: "murrmure.view.submit_branch",
        submission_id: "sub-1",
        branch: "approve",
        input: {},
        v: VIEW_TRANSPORT_VERSION,
        nonce: NONCE,
      },
      origin: "http://evil.example",
      source: iframe.contentWindow,
    });
    window.dispatchEvent(event);

    expect(onSubmitBranch).not.toHaveBeenCalled();
    cleanup();
    iframe.remove();
  });

  it("attachViewHostBridge posts context to dev iframe origin", () => {
    const iframe = document.createElement("iframe");
    iframe.src = "http://localhost:5173/";
    document.body.appendChild(iframe);

    const postMessage = vi.fn();
    Object.defineProperty(iframe, "contentWindow", {
      configurable: true,
      value: { postMessage },
    });

    const ctx = makeContext();
    const cleanup = attachViewHostBridge(iframe, ctx, {});

    expect(postMessage).toHaveBeenCalledWith(createViewContextMessage(ctx, NONCE), "http://localhost:5173");

    cleanup();
    iframe.remove();
  });

  it("attachViewHostBridge re-sends context when re-attached without reload", () => {
    const iframe = document.createElement("iframe");
    iframe.src = "http://localhost:5173/";
    document.body.appendChild(iframe);

    const postMessage = vi.fn();
    Object.defineProperty(iframe, "contentWindow", {
      configurable: true,
      value: { postMessage },
    });

    const baseContext = makeContext({ step: { step_id: "review", branches: [] } });

    const cleanup1 = attachViewHostBridge(iframe, baseContext, {});
    expect(postMessage).toHaveBeenCalledTimes(1);

    cleanup1();

    const cleanup2 = attachViewHostBridge(iframe, baseContext, {});
    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(postMessage.mock.calls[1]?.[0]).toEqual(createViewContextMessage(baseContext, NONCE));

    cleanup2();
    iframe.remove();
  });

  it("attachViewHostBridge forwards submit_branch from iframe and acks", async () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);

    const postMessage = vi.fn();
    Object.defineProperty(iframe, "contentWindow", {
      configurable: true,
      value: { postMessage },
    });

    const onSubmitBranch = vi.fn().mockResolvedValue({ ok: true } as const);
    const cleanup = attachViewHostBridge(iframe, makeContext(), { onSubmitBranch });

    const event = new MessageEvent("message", {
      data: {
        type: "murrmure.view.submit_branch",
        submission_id: "sub-1",
        branch: "approve",
        input: { payload: { topic: "ai" } },
        v: VIEW_TRANSPORT_VERSION,
        nonce: NONCE,
      },
      origin: "http://127.0.0.1:8787",
      source: iframe.contentWindow,
    });
    window.dispatchEvent(event);

    await vi.waitFor(() =>
      expect(onSubmitBranch).toHaveBeenCalledWith(
        "approve",
        { payload: { topic: "ai" } },
        expect.objectContaining({ submission_id: "sub-1" }),
      ),
    );
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalled());
    const ack = postMessage.mock.calls.at(-1)?.[0];
    expect(ack).toMatchObject({ type: "murrmure.view.ack", ok: true, kind: "submit_branch" });
    cleanup();
    iframe.remove();
  });

  it("attachViewHostBridge forwards resolved from iframe", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);

    const onResolved = vi.fn();
    const cleanup = attachViewHostBridge(iframe, makeContext(), { onResolved });

    const event = new MessageEvent("message", {
      data: { type: "murrmure.view.resolved", v: VIEW_TRANSPORT_VERSION, nonce: NONCE },
      origin: "http://127.0.0.1:8787",
      source: iframe.contentWindow,
    });
    window.dispatchEvent(event);

    expect(onResolved).toHaveBeenCalled();
    cleanup();
    iframe.remove();
  });

  it("attachViewHostBridge ignores messages with wrong nonce", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);

    const onSubmitBranch = vi.fn();
    const cleanup = attachViewHostBridge(iframe, makeContext(), { onSubmitBranch });

    const event = new MessageEvent("message", {
      data: {
        type: "murrmure.view.submit_branch",
        submission_id: "sub-1",
        branch: "approve",
        input: {},
        v: VIEW_TRANSPORT_VERSION,
        nonce: "wrong-nonce",
      },
      origin: "http://127.0.0.1:8787",
      source: iframe.contentWindow,
    });
    window.dispatchEvent(event);

    expect(onSubmitBranch).not.toHaveBeenCalled();
    cleanup();
    iframe.remove();
  });

  it("attachViewHostBridge accepts localhost/127.0.0.1 hub origin alias", async () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);

    const onSubmitBranch = vi.fn().mockResolvedValue({ ok: true } as const);
    const cleanup = attachViewHostBridge(iframe, makeContext(), { onSubmitBranch });

    const event = new MessageEvent("message", {
      data: {
        type: "murrmure.view.submit_branch",
        submission_id: "sub-1",
        branch: "approve",
        input: { payload: { topic: "ai" } },
        v: VIEW_TRANSPORT_VERSION,
        nonce: NONCE,
      },
      origin: "http://localhost:8787",
      source: iframe.contentWindow,
    });
    window.dispatchEvent(event);

    await vi.waitFor(() =>
      expect(onSubmitBranch).toHaveBeenCalledWith(
        "approve",
        { payload: { topic: "ai" } },
        expect.objectContaining({ submission_id: "sub-1" }),
      ),
    );
    cleanup();
    iframe.remove();
  });
});
