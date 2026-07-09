import { createShellClient, type ShellClient } from "@murrmure/shell-client";
import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
} from "react";
import type { ViewAppContext } from "../types.js";
import { postViewMessage } from "./messages.js";
import { mapViewSubmitToResolveStep, uploadViewArtifacts, type ViewSubmitArtifact } from "./resolve-step.js";

function resolveViaHost(context: ViewAppContext, params: Record<string, unknown>, action: "submit" | "cancel") {
  postViewMessage(
    action === "submit"
      ? { type: "murrmure.view.submit", params }
      : { type: "murrmure.view.cancel" },
    context.hub_base_url,
  );
}

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
  submit: (params: Record<string, unknown>, artifacts?: ViewSubmitArtifact[]) => Promise<void>;
  cancel: () => Promise<void>;
} {
  const { context, hubClient } = useViewRuntime();
  return useMemo(
    () => ({
      submit: async (params: Record<string, unknown>, artifacts?: ViewSubmitArtifact[]) => {
        if (context.step?.step_id && context.run_id) {
          try {
            const artifacts_out = artifacts?.length
              ? await uploadViewArtifacts({
                  hub_base_url: context.hub_base_url,
                  token: context.token,
                  run_id: context.run_id,
                  step_id: context.step!.step_id,
                  artifacts,
                })
              : undefined;
            const body = mapViewSubmitToResolveStep(params, "submit", artifacts_out);
            await hubClient.runs.resolveStep(context.run_id, context.step.step_id, body);
            postViewMessage({ type: "murrmure.view.resolved" }, context.hub_base_url);
            return;
          } catch (error) {
            resolveViaHost(context, params, "submit");
            throw error;
          }
        }
        resolveViaHost(context, params, "submit");
      },
      cancel: async () => {
        if (context.step?.step_id && context.run_id) {
          try {
            const body = mapViewSubmitToResolveStep({}, "cancel");
            await hubClient.runs.resolveStep(context.run_id, context.step.step_id, body);
            postViewMessage({ type: "murrmure.view.resolved" }, context.hub_base_url);
            return;
          } catch (error) {
            resolveViaHost(context, {}, "cancel");
            throw error;
          }
        }
        resolveViaHost(context, {}, "cancel");
      },
    }),
    [context, hubClient],
  );
}
