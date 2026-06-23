import type { FlowHostContext, FlowHostContextPublic } from "./host.js";
import {
  Component,
  type ComponentType,
  createContext,
  type ErrorInfo,
  type ReactNode,
  useContext,
} from "react";

export interface HubBridgeClient {
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
}

export interface FlowRuntimeContextValue {
  context: FlowHostContext;
  hubBridgeClient: HubBridgeClient;
}

const FlowRuntimeContext = createContext<FlowRuntimeContextValue | null>(null);

export interface FlowProviderProps {
  context: FlowHostContext;
  hubBridgeClient: HubBridgeClient;
  children: ReactNode;
}

export function FlowProvider({
  context,
  hubBridgeClient,
  children,
}: FlowProviderProps): ReactNode {
  return (
    <FlowRuntimeContext.Provider value={{ context, hubBridgeClient }}>
      {children}
    </FlowRuntimeContext.Provider>
  );
}

export function useFlowRuntime(): FlowRuntimeContextValue {
  const value = useContext(FlowRuntimeContext);
  if (!value) {
    throw new Error("Flow runtime context is not available. Did you forget FlowProvider?");
  }
  return value;
}

export function useFlowContext(): FlowHostContext {
  return useFlowRuntime().context;
}

export function useFlowContextPublic(): FlowHostContextPublic {
  const context = useFlowContext();
  return {
    spaceId: context.spaceId,
    instanceId: context.instanceId,
    hubUrl: context.hubUrl,
    canvasRoute: context.canvasRoute,
    flowId: context.flowId,
    version: context.version,
  };
}

export function useHubBridgeClient(): HubBridgeClient {
  return useFlowRuntime().hubBridgeClient;
}

export interface FlowErrorStateProps {
  title?: string;
  message: string;
  details?: string;
  retryLabel?: string;
  onRetry?: () => void;
}

export function FlowErrorState({
  title = "Flow failed to render",
  message,
  details,
  retryLabel = "Retry",
  onRetry,
}: FlowErrorStateProps) {
  return (
    <section
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: "1rem",
        margin: "1rem",
        borderRadius: "0.75rem",
        border: "1px solid #fecaca",
        background: "#fff1f2",
        color: "#881337",
      }}
      role="alert"
      aria-live="assertive"
    >
      <h2 style={{ marginTop: 0, marginBottom: "0.5rem", fontSize: "1rem" }}>{title}</h2>
      <p style={{ marginTop: 0, marginBottom: details ? "0.75rem" : 0 }}>{message}</p>
      {details ? (
        <pre
          style={{
            margin: 0,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            fontSize: "0.75rem",
            lineHeight: 1.4,
          }}
        >
          {details}
        </pre>
      ) : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          style={{
            marginTop: "0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid #9f1239",
            background: "white",
            color: "#9f1239",
            padding: "0.375rem 0.75rem",
            cursor: "pointer",
          }}
        >
          {retryLabel}
        </button>
      ) : null}
    </section>
  );
}

export interface FlowErrorBoundaryProps {
  children: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
  fallback?: ComponentType<{ error: Error; reset: () => void }>;
}

interface FlowErrorBoundaryState {
  error: Error | null;
}

export class FlowErrorBoundary extends Component<
  FlowErrorBoundaryProps,
  FlowErrorBoundaryState
> {
  public override state: FlowErrorBoundaryState = { error: null };

  public override componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }

  private readonly reset = () => {
    this.setState({ error: null });
  };

  public static getDerivedStateFromError(error: Error): FlowErrorBoundaryState {
    return { error };
  }

  public override render() {
    if (this.state.error) {
      const Fallback = this.props.fallback;
      if (Fallback) {
        return <Fallback error={this.state.error} reset={this.reset} />;
      }
      return (
        <FlowErrorState
          message={this.state.error.message}
          details={this.state.error.stack}
          onRetry={this.reset}
        />
      );
    }
    return this.props.children;
  }
}

