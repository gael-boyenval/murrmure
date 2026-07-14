// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

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
import { useViewContext } from "../src/app/provider.js";
import { createViewMount } from "../src/app/mount.js";
import {
  __setViewContextForTests,
  __resetViewContractForTests,
  submitBranch,
  useViewContract,
} from "../src/app/contract.js";
import { createElement, useEffect } from "react";
import { VIEW_TRANSPORT_VERSION, type ViewAppContext } from "../src/types.js";

const NONCE = "nonce-abc";

const sampleContext: ViewAppContext = {
  flow_id: "preview-review",
  space_id: "spc_local",
  hub_base_url: "http://127.0.0.1:8787",
  mode: "dev",
  transport_version: VIEW_TRANSPORT_VERSION,
  nonce: NONCE,
  session_id: "ses_dev",
  run_id: "run_dev",
  step: {
    step_id: "review",
    branches: [{ branch: "approve", schema: { type: "object", required: ["note"] } }],
  },
  input: { reviewer: "you@local" },
};

describe("view-sdk app bridge", () => {
  beforeEach(() => {
    resetViewContextChannelForTests();
    __resetViewContractForTests();
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    resetViewContextChannelForTests();
    __resetViewContractForTests();
    __setViewContextForTests(null);
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  function dispatchTrustedContext(context: ViewAppContext) {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: createViewContextMessage(context, NONCE),
        origin: "http://127.0.0.1:8787",
        source: window.parent,
      }),
    );
  }

  it("isViewContextMessage validates context payload with envelope", () => {
    expect(isViewContextMessage(createViewContextMessage(sampleContext, NONCE))).toBe(true);
    expect(isViewContextMessage({ type: "murrmure.view.context" })).toBe(false);
    expect(isViewContextMessage({ type: "other" })).toBe(false);
  });

  it("postViewMessage sends versioned submit_branch to parent at hub origin", () => {
    const postMessage = vi.fn();
    Object.defineProperty(window, "parent", {
      configurable: true,
      value: { postMessage },
    });

    postViewMessage(
      { type: "murrmure.view.submit_branch", branch: "approve", params: { note: "ok" } },
      sampleContext.hub_base_url,
      NONCE,
    );

    expect(postMessage).toHaveBeenCalledWith(
      {
        type: "murrmure.view.submit_branch",
        branch: "approve",
        params: { note: "ok" },
        v: VIEW_TRANSPORT_VERSION,
        nonce: NONCE,
      },
      "http://127.0.0.1:8787",
    );
  });

  it("isTrustedViewContextMessage requires parent source, hub origin, version and nonce", () => {
    const trusted = new MessageEvent("message", {
      data: createViewContextMessage(sampleContext, NONCE),
      origin: "http://127.0.0.1:8787",
      source: window.parent,
    });
    expect(isTrustedViewContextMessage(trusted)).toBe(true);

    const wrongOrigin = new MessageEvent("message", {
      data: createViewContextMessage(sampleContext, NONCE),
      origin: "http://evil.test",
      source: window.parent,
    });
    expect(isTrustedViewContextMessage(wrongOrigin)).toBe(false);

    const wrongSource = new MessageEvent("message", {
      data: createViewContextMessage(sampleContext, NONCE),
      origin: "http://127.0.0.1:8787",
      source: null,
    });
    expect(isTrustedViewContextMessage(wrongSource)).toBe(false);

    const wrongNonce = new MessageEvent("message", {
      // envelope nonce differs from the context's bound nonce
      data: createViewContextMessage(sampleContext, "mismatch"),
      origin: "http://127.0.0.1:8787",
      source: window.parent,
    });
    expect(isTrustedViewContextMessage(wrongNonce)).toBe(false);
  });

  it("isTrustedViewContextMessage accepts localhost/127.0.0.1 loopback alias", () => {
    const localhostShell = new MessageEvent("message", {
      data: createViewContextMessage(sampleContext, NONCE),
      origin: "http://localhost:8787",
      source: window.parent,
    });
    expect(isTrustedViewContextMessage(localhostShell)).toBe(true);

    const contextWithLocalhost = {
      ...sampleContext,
      hub_base_url: "http://localhost:8787",
    };
    const loopbackShell = new MessageEvent("message", {
      data: createViewContextMessage(contextWithLocalhost, NONCE),
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

    expect(postMessage).toHaveBeenCalledWith(
      { type: "murrmure.view.ready", v: VIEW_TRANSPORT_VERSION, nonce: NONCE },
      "http://127.0.0.1:8787",
    );
  });

  it("createViewMount posts ready after context and exposes the contract hook", async () => {
    const postMessage = vi.fn();
    Object.defineProperty(window, "parent", {
      configurable: true,
      value: { postMessage },
    });

    let capturedStepId = "";
    let capturedReady = false;

    function ProbeApp() {
      const { context, ready } = useViewContract();
      useEffect(() => {
        capturedStepId = context?.step?.step_id ?? "";
        capturedReady = ready;
      }, [context, ready]);
      return createElement("span", null, context?.step?.step_id ?? "none");
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

    expect(postMessage).toHaveBeenCalledWith(
      { type: "murrmure.view.ready", v: VIEW_TRANSPORT_VERSION, nonce: NONCE },
      "http://127.0.0.1:8787",
    );
    expect(capturedStepId).toBe("review");
    expect(capturedReady).toBe(true);
  });

  it("submitBranch posts submit_branch and resolves when the host acks ok", async () => {
    const postMessage = vi.fn();
    Object.defineProperty(window, "parent", {
      configurable: true,
      value: { postMessage },
    });

    const promise = submitBranch(sampleContext, "approve", { note: "ship it" });

    await vi.waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        {
          type: "murrmure.view.submit_branch",
          branch: "approve",
          params: { note: "ship it" },
          v: VIEW_TRANSPORT_VERSION,
          nonce: NONCE,
        },
        "http://127.0.0.1:8787",
      ),
    );

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "murrmure.view.ack",
          ok: true,
          kind: "submit_branch",
          v: VIEW_TRANSPORT_VERSION,
          nonce: NONCE,
        },
        origin: "http://127.0.0.1:8787",
        source: window.parent,
      }),
    );

    await expect(promise).resolves.toBeUndefined();
  });

  it("submitBranch rejects on unknown branch before posting", async () => {
    const postMessage = vi.fn();
    Object.defineProperty(window, "parent", {
      configurable: true,
      value: { postMessage },
    });

    await expect(submitBranch(sampleContext, "nope", {})).rejects.toMatchObject({
      code: "VIEW_UNKNOWN_BRANCH",
      branch: "nope",
    });
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("ViewProvider re-renders when context prop updates", async () => {
    const { ViewProvider } = await import("../src/app/provider.js");

    let stepId = "";
    function StepLabel() {
      stepId = useViewContext().step?.step_id ?? "";
      return createElement("span", null, stepId);
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(ViewProvider, { context: sampleContext, children: createElement(StepLabel) }));
    });
    expect(stepId).toBe("review");

    const updated: ViewAppContext = {
      ...sampleContext,
      step: { step_id: "review_round_2", branches: [] },
    };

    await act(async () => {
      root.render(createElement(ViewProvider, { context: updated, children: createElement(StepLabel) }));
    });
    expect(stepId).toBe("review_round_2");

    root.unmount();
    container.remove();
  });
});
