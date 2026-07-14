import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
} from "react";
import type { ViewAppContext } from "../types.js";

export interface ViewRuntimeContextValue {
  context: ViewAppContext;
}

const ViewRuntimeContext = createContext<ViewRuntimeContextValue | null>(null);

export interface ViewProviderProps {
  context: ViewAppContext;
  children: ReactNode;
}

export function ViewProvider({ context, children }: ViewProviderProps): ReactNode {
  const value = useMemo(() => ({ context }), [context]);
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
