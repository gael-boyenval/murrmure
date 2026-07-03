import { createShellClient, type ShellClient } from "@murrmure/shell-client";
import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
} from "react";
import type { ViewAppContext } from "../types.js";
import { postViewMessage } from "./messages.js";

export interface ViewRuntimeContextValue {
  context: ViewAppContext;
  hubClient: ShellClient;
}

const ViewRuntimeContext = createContext<ViewRuntimeContextValue | null>(null);

export interface ViewProviderProps {
  context: ViewAppContext;
  children: ReactNode;
}

export function ViewProvider({ context, children }: ViewProviderProps): ReactNode {
  const hubClient = useMemo(
    () =>
      createShellClient({
        baseUrl: context.hub_base_url,
        token: context.token,
      }),
    [context.hub_base_url, context.token],
  );

  const value = useMemo(
    () => ({ context, hubClient }),
    [context, hubClient],
  );

  return <ViewRuntimeContext.Provider value={value}>{children}</ViewRuntimeContext.Provider>;
}

export function useViewRuntime(): ViewRuntimeContextValue {
  const value = useContext(ViewRuntimeContext);
  if (!value) {
    throw new Error("View runtime context is not available. Did you forget ViewProvider?");
  }
  return value;
}

export function useViewContext(): ViewAppContext {
  return useViewRuntime().context;
}

/** Read-only hub client — views must not call orchestration mutation APIs. */
export function useViewHubClient(): ShellClient {
  return useViewRuntime().hubClient;
}

export function useViewSubmit(): {
  submit: (params: Record<string, unknown>) => void;
  cancel: () => void;
} {
  const { context } = useViewRuntime();
  return useMemo(
    () => ({
      submit: (params: Record<string, unknown>) => {
        postViewMessage({ type: "murrmure.view.submit", params }, context.hub_base_url);
      },
      cancel: () => {
        postViewMessage({ type: "murrmure.view.cancel" }, context.hub_base_url);
      },
    }),
    [context.hub_base_url],
  );
}
