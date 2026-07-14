import {
  createElement,
  StrictMode,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ViewAppContext } from "../types.js";
import {
  ensureViewContextChannel,
  peekPendingViewContext,
  subscribeViewContext,
} from "./context-channel.js";
import { ViewErrorBoundary } from "./error-boundary.js";
import { postViewMessage } from "./messages.js";
import { ViewProvider } from "./provider.js";

export interface CreateViewMountOptions {
  App: ComponentType;
  boundary?: ComponentType<{ children: ReactNode }>;
}

function ViewMountRoot({
  App,
  Boundary,
}: {
  App: ComponentType;
  Boundary?: ComponentType<{ children: ReactNode }>;
}) {
  const [context, setContext] = useState<ViewAppContext | null>(() => peekPendingViewContext());
  const [readySent, setReadySent] = useState(false);

  useEffect(() => subscribeViewContext(setContext), []);

  useEffect(() => {
    if (!context || readySent) return;
    postViewMessage({ type: "murrmure.view.ready" }, context.hub_base_url, context.nonce);
    setReadySent(true);
  }, [context, readySent]);

  if (!context) {
    return createElement(
      "p",
      { style: { fontFamily: "system-ui, sans-serif", padding: "1rem", color: "#64748b" } },
      "Waiting for view context…",
    );
  }

  const appNode = createElement(App);
  const guardedNode = Boundary
    ? createElement(Boundary, { children: appNode })
    : createElement(ViewErrorBoundary, { children: appNode });

  return createElement(ViewProvider, { context, children: guardedNode });
}

/** Mount a view app; listens for `murrmure.view.context` and posts `murrmure.view.ready`. */
export function createViewMount({ App, boundary: Boundary }: CreateViewMountOptions): void {
  ensureViewContextChannel();

  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("createViewMount requires a #root element in index.html");
  }

  let root: Root | undefined;
  const mount = () => {
    if (!root) {
      root = createRoot(rootElement);
    }
    root.render(
      createElement(StrictMode, null, createElement(ViewMountRoot, { App, Boundary })),
    );
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
}
