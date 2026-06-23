import type { CapabilityHostContext } from "@studio/capability-sdk/host";
import { createElement, StrictMode, type ComponentType, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  CapabilityErrorBoundary,
  CapabilityProvider,
  type CapabilityErrorBoundaryProps,
  type HubBridgeClient,
} from "./react.js";

export type BridgeFetchLike =
  | Pick<CapabilityHostContext, "hubFetch">
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

export interface CreateCapabilityMountOptions {
  App: ComponentType;
  Boundary?: ComponentType<{ children: ReactNode }>;
  boundaryFallback?: CapabilityErrorBoundaryProps["fallback"];
  onBoundaryError?: CapabilityErrorBoundaryProps["onError"];
}

export function createCapabilityMount({
  App,
  Boundary,
  boundaryFallback,
  onBoundaryError,
}: CreateCapabilityMountOptions) {
  return (rootElement: HTMLElement, context: CapabilityHostContext): (() => void) => {
    const root = createRoot(rootElement);
    const hubBridgeClient = createHubBridgeClient(context);
    const appNode = createElement(App);
    const guardedNode = Boundary
      ? createElement(Boundary, { children: appNode })
      : createElement(
          CapabilityErrorBoundary,
          { fallback: boundaryFallback, onError: onBoundaryError, children: appNode },
        );

    root.render(
      createElement(
        StrictMode,
        null,
        createElement(CapabilityProvider, { context, hubBridgeClient, children: guardedNode }),
      ),
    );

    return () => {
      root.unmount();
    };
  };
}

export {
  CapabilityErrorBoundary,
  CapabilityErrorState,
  CapabilityProvider,
  useCapabilityContext,
  useCapabilityContextPublic,
  useCapabilityRuntime,
  useHubBridgeClient,
  type CapabilityErrorStateProps,
  type CapabilityRuntimeContextValue,
  type HubBridgeClient,
} from "./react.js";

