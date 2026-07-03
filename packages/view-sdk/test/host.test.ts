// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  attachViewHostBridge,
  createViewContextMessage,
  isViewHostInboundMessage,
  resolveViewEntryUrl,
  resolveViewIframeOrigin,
} from "../src/host-bridge.js";

describe("view-sdk host protocol", () => {
  it("isViewHostInboundMessage validates submit payload", () => {
    expect(isViewHostInboundMessage({ type: "murrmure.view.ready" })).toBe(true);
    expect(isViewHostInboundMessage({ type: "murrmure.view.cancel" })).toBe(true);
    expect(
      isViewHostInboundMessage({ type: "murrmure.view.submit", params: { topic: "news" } }),
    ).toBe(true);
    expect(isViewHostInboundMessage({ type: "murrmure.view.submit" })).toBe(false);
    expect(isViewHostInboundMessage({ type: "other" })).toBe(false);
  });

  it("createViewContextMessage wraps host context", () => {
    const msg = createViewContextMessage({
      flow_id: "flw_demo",
      space_id: "spc_demo",
      hub_base_url: "http://127.0.0.1:8787",
      token: "tok_read",
    });
    expect(msg.type).toBe("murrmure.view.context");
    expect(msg.context.flow_id).toBe("flw_demo");
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

    const cleanup = attachViewHostBridge(
      iframe,
      {
        flow_id: "flw_demo",
        space_id: "spc_demo",
        hub_base_url: "http://127.0.0.1:8787",
        token: "tok",
      },
      {},
    );

    expect(postMessage).toHaveBeenCalledWith(
      createViewContextMessage({
        flow_id: "flw_demo",
        space_id: "spc_demo",
        hub_base_url: "http://127.0.0.1:8787",
        token: "tok",
      }),
      "http://localhost:5173",
    );

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

    const baseContext = {
      flow_id: "flw_demo",
      space_id: "spc_demo",
      hub_base_url: "http://127.0.0.1:8787",
      token: "tok",
      gate: { gate_id: "gte_1", step_id: "review" },
    };

    const cleanup1 = attachViewHostBridge(iframe, baseContext, {});
    expect(postMessage).toHaveBeenCalledTimes(1);

    cleanup1();

    const cleanup2 = attachViewHostBridge(
      iframe,
      {
        ...baseContext,
        gate: { gate_id: "gte_2", step_id: "review" },
      },
      {},
    );

    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(postMessage.mock.calls[1]?.[0]).toEqual(
      createViewContextMessage({
        ...baseContext,
        gate: { gate_id: "gte_2", step_id: "review" },
      }),
    );

    cleanup2();
    iframe.remove();
  });

  it("attachViewHostBridge forwards submit from iframe", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);

    const onSubmit = vi.fn();
    const cleanup = attachViewHostBridge(
      iframe,
      {
        flow_id: "flw_demo",
        space_id: "spc_demo",
        hub_base_url: "http://127.0.0.1:8787",
        token: "tok",
      },
      { onSubmit },
    );

    const event = new MessageEvent("message", {
      data: { type: "murrmure.view.submit", params: { topic: "ai" } },
      origin: "http://127.0.0.1:8787",
      source: iframe.contentWindow,
    });
    window.dispatchEvent(event);

    expect(onSubmit).toHaveBeenCalledWith({ topic: "ai" });
    cleanup();
    iframe.remove();
  });

  it("attachViewHostBridge accepts localhost/127.0.0.1 hub origin alias", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);

    const onSubmit = vi.fn();
    const cleanup = attachViewHostBridge(
      iframe,
      {
        flow_id: "flw_demo",
        space_id: "spc_demo",
        hub_base_url: "http://127.0.0.1:8787",
        token: "tok",
      },
      { onSubmit },
    );

    const event = new MessageEvent("message", {
      data: { type: "murrmure.view.submit", params: { topic: "ai" } },
      origin: "http://localhost:8787",
      source: iframe.contentWindow,
    });
    window.dispatchEvent(event);

    expect(onSubmit).toHaveBeenCalledWith({ topic: "ai" });
    cleanup();
    iframe.remove();
  });
});
