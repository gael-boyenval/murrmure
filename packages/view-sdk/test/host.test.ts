// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  attachViewHostBridge,
  createViewContextMessage,
  isViewHostInboundMessage,
  resolveViewEntryUrl,
  resolveViewIframeOrigin,
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
        branch: "approve",
        params: { topic: "news" },
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
        branch: "approve",
        params: { topic: "ai" },
        v: VIEW_TRANSPORT_VERSION,
        nonce: NONCE,
      },
      origin: "http://127.0.0.1:8787",
      source: iframe.contentWindow,
    });
    window.dispatchEvent(event);

    await vi.waitFor(() => expect(onSubmitBranch).toHaveBeenCalledWith("approve", { topic: "ai" }));
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
        branch: "approve",
        params: {},
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
        branch: "approve",
        params: { topic: "ai" },
        v: VIEW_TRANSPORT_VERSION,
        nonce: NONCE,
      },
      origin: "http://localhost:8787",
      source: iframe.contentWindow,
    });
    window.dispatchEvent(event);

    await vi.waitFor(() => expect(onSubmitBranch).toHaveBeenCalledWith("approve", { topic: "ai" }));
    cleanup();
    iframe.remove();
  });
});
