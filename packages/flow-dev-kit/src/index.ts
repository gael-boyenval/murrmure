import type { FlowHostContext } from "./host.js";
import { createElement, StrictMode, type ComponentType, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  FlowErrorBoundary,
  FlowProvider,
  type FlowErrorBoundaryProps,
  type HubBridgeClient,
} from "./react.js";

export type BridgeFetchLike =
  | Pick<FlowHostContext, "hubFetch">
  | {
      fetch: (path: string, init?: RequestInit) => Promise<Response>;
    };

export function createHubBridgeClient(source: BridgeFetchLike): HubBridgeClient {
  if ("hubFetch" in source) {
    return {
      fetch: (path: string, init?: RequestInit) => source.hubFetch(path, init),
    };
  }
  return {
    fetch: (path: string, init?: RequestInit) => source.fetch(path, init),
  };
}

export interface CreateFlowMountOptions {
  App: ComponentType;
  Boundary?: ComponentType<{ children: ReactNode }>;
  boundaryFallback?: FlowErrorBoundaryProps["fallback"];
  onBoundaryError?: FlowErrorBoundaryProps["onError"];
}

export function createFlowMount({
  App,
  Boundary,
  boundaryFallback,
  onBoundaryError,
}: CreateFlowMountOptions) {
  return (rootElement: HTMLElement, context: FlowHostContext): (() => void) => {
    const root = createRoot(rootElement);
    const hubBridgeClient = createHubBridgeClient(context);
    const appNode = createElement(App);
    const guardedNode = Boundary
      ? createElement(Boundary, { children: appNode })
      : createElement(
          FlowErrorBoundary,
          { fallback: boundaryFallback, onError: onBoundaryError, children: appNode },
        );

    root.render(
      createElement(
        StrictMode,
        null,
        createElement(FlowProvider, { context, hubBridgeClient, children: guardedNode }),
      ),
    );

    return () => {
      root.unmount();
    };
  };
}

export {
  FlowErrorBoundary,
  FlowErrorState,
  FlowProvider,
  useFlowContext,
  useFlowContextPublic,
  useFlowRuntime,
  useHubBridgeClient,
  type FlowErrorStateProps,
  type FlowRuntimeContextValue,
  type HubBridgeClient,
} from "./react.js";

