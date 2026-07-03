// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@murrmure/shell-client", () => ({
  createShellClient: vi.fn(() => ({})),
}));

import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  createViewContextMessage,
  isViewContextMessage,
  postViewMessage,
} from "../src/app/messages.js";
import {
  ensureViewContextChannel,
  isTrustedViewContextMessage,
  resetViewContextChannelForTests,
} from "../src/app/context-channel.js";
import { useViewContext, useViewSubmit } from "../src/app/provider.js";
import { createViewMount } from "../src/app/mount.js";
import { createElement, useEffect } from "react";

const sampleContext = {
  flow_id: "preview-review",
  space_id: "spc_local",
  hub_base_url: "http://127.0.0.1:8787",
  token: "dev-readonly",
  session_id: "ses_dev",
  run_id: "run_dev",
  gate: { gate_id: "gte_dev", step_id: "review" },
  input: { reviewer: "you@local" },
};

describe("view-sdk app bridge", () => {
  beforeEach(() => {
    resetViewContextChannelForTests();
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    resetViewContextChannelForTests();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  function dispatchTrustedContext(context: typeof sampleContext) {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: createViewContextMessage(context),
        origin: "http://127.0.0.1:8787",
        source: window.parent,
      }),
    );
  }

  it("isViewContextMessage validates context payload", () => {
    expect(isViewContextMessage(createViewContextMessage(sampleContext))).toBe(true);
    expect(isViewContextMessage({ type: "murrmure.view.context" })).toBe(false);
    expect(isViewContextMessage({ type: "other" })).toBe(false);
  });

  it("postViewMessage sends submit to parent at hub origin", () => {
    const postMessage = vi.fn();
    Object.defineProperty(window, "parent", {
      configurable: true,
      value: { postMessage },
    });

    postViewMessage({ type: "murrmure.view.submit", params: { outcome: "validated" } }, sampleContext.hub_base_url);

    expect(postMessage).toHaveBeenCalledWith(
      { type: "murrmure.view.submit", params: { outcome: "validated" } },
      "http://127.0.0.1:8787",
    );
  });

  it("isTrustedViewContextMessage requires parent source and hub origin", () => {
    const trusted = new MessageEvent("message", {
      data: createViewContextMessage(sampleContext),
      origin: "http://127.0.0.1:8787",
      source: window.parent,
    });
    expect(isTrustedViewContextMessage(trusted)).toBe(true);

    const wrongOrigin = new MessageEvent("message", {
      data: createViewContextMessage(sampleContext),
      origin: "http://evil.test",
      source: window.parent,
    });
    expect(isTrustedViewContextMessage(wrongOrigin)).toBe(false);

    const wrongSource = new MessageEvent("message", {
      data: createViewContextMessage(sampleContext),
      origin: "http://127.0.0.1:8787",
      source: null,
    });
    expect(isTrustedViewContextMessage(wrongSource)).toBe(false);
  });

  it("isTrustedViewContextMessage accepts localhost/127.0.0.1 loopback alias", () => {
    const localhostShell = new MessageEvent("message", {
      data: createViewContextMessage(sampleContext),
      origin: "http://localhost:8787",
      source: window.parent,
    });
    expect(isTrustedViewContextMessage(localhostShell)).toBe(true);

    const contextWithLocalhost = {
      ...sampleContext,
      hub_base_url: "http://localhost:8787",
    };
    const loopbackShell = new MessageEvent("message", {
      data: createViewContextMessage(contextWithLocalhost),
      origin: "http://127.0.0.1:8787",
      source: window.parent,
    });
    expect(isTrustedViewContextMessage(loopbackShell)).toBe(true);
  });

  it("ensureViewContextChannel buffers context posted before React mount", async () => {
    ensureViewContextChannel();
    dispatchTrustedContext(sampleContext);

    const postMessage = vi.fn();
    Object.defineProperty(window, "parent", {
      configurable: true,
      value: { postMessage },
    });

    createViewMount({ App: () => createElement("span", null, "ok") });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(postMessage).toHaveBeenCalledWith({ type: "murrmure.view.ready" }, "http://127.0.0.1:8787");
  });

  it("createViewMount posts ready after context and exposes hooks", async () => {
    const postMessage = vi.fn();
    Object.defineProperty(window, "parent", {
      configurable: true,
      value: { postMessage },
    });

    let capturedContext: typeof sampleContext | undefined;
    let submitFn: ((params: Record<string, unknown>) => void) | undefined;

    function ProbeApp() {
      const ctx = useViewContext();
      const { submit } = useViewSubmit();
      useEffect(() => {
        capturedContext = ctx;
        submitFn = submit;
      }, [ctx, submit]);
      return createElement("span", null, ctx.gate?.step_id ?? "none");
    }

    createViewMount({ App: ProbeApp });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      dispatchTrustedContext(sampleContext);
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(postMessage).toHaveBeenCalledWith({ type: "murrmure.view.ready" }, "http://127.0.0.1:8787");
    expect(capturedContext?.gate?.step_id).toBe("review");

    submitFn?.({ outcome: "validated" });
    expect(postMessage).toHaveBeenCalledWith(
      { type: "murrmure.view.submit", params: { outcome: "validated" } },
      "http://127.0.0.1:8787",
    );
  });

  it("ViewProvider re-renders when context message updates", async () => {
    const { ViewProvider } = await import("../src/app/provider.js");

    let gateId = "";
    function GateLabel() {
      gateId = useViewContext().gate?.gate_id ?? "";
      return createElement("span", null, gateId);
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(ViewProvider, { context: sampleContext, children: createElement(GateLabel) }));
    });
    expect(gateId).toBe("gte_dev");

    const updated = {
      ...sampleContext,
      gate: { gate_id: "gte_round_2", step_id: "review" },
    };

    await act(async () => {
      root.render(createElement(ViewProvider, { context: updated, children: createElement(GateLabel) }));
    });
    expect(gateId).toBe("gte_round_2");

    root.unmount();
    container.remove();
  });
});
