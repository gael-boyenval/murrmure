import type { CapabilityHostContext, CapabilityHostContextPublic } from "@studio/capability-sdk/host";
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

export interface CapabilityRuntimeContextValue {
  context: CapabilityHostContext;
  hubBridgeClient: HubBridgeClient;
}

const CapabilityRuntimeContext = createContext<CapabilityRuntimeContextValue | null>(null);

export interface CapabilityProviderProps {
  context: CapabilityHostContext;
  hubBridgeClient: HubBridgeClient;
  children: ReactNode;
}

export function CapabilityProvider({
  context,
  hubBridgeClient,
  children,
}: CapabilityProviderProps): ReactNode {
  return (
    <CapabilityRuntimeContext.Provider value={{ context, hubBridgeClient }}>
      {children}
    </CapabilityRuntimeContext.Provider>
  );
}

export function useCapabilityRuntime(): CapabilityRuntimeContextValue {
  const value = useContext(CapabilityRuntimeContext);
  if (!value) {
    throw new Error("Capability runtime context is not available. Did you forget CapabilityProvider?");
  }
  return value;
}

export function useCapabilityContext(): CapabilityHostContext {
  return useCapabilityRuntime().context;
}

export function useCapabilityContextPublic(): CapabilityHostContextPublic {
  const context = useCapabilityContext();
  return {
    spaceId: context.spaceId,
    instanceId: context.instanceId,
    hubUrl: context.hubUrl,
    canvasRoute: context.canvasRoute,
    packageId: context.packageId,
    version: context.version,
  };
}

export function useHubBridgeClient(): HubBridgeClient {
  return useCapabilityRuntime().hubBridgeClient;
}

export interface CapabilityErrorStateProps {
  title?: string;
  message: string;
  details?: string;
  retryLabel?: string;
  onRetry?: () => void;
}

export function CapabilityErrorState({
  title = "Capability failed to render",
  message,
  details,
  retryLabel = "Retry",
  onRetry,
}: CapabilityErrorStateProps) {
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

export interface CapabilityErrorBoundaryProps {
  children: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
  fallback?: ComponentType<{ error: Error; reset: () => void }>;
}

interface CapabilityErrorBoundaryState {
  error: Error | null;
}

export class CapabilityErrorBoundary extends Component<
  CapabilityErrorBoundaryProps,
  CapabilityErrorBoundaryState
> {
  public override state: CapabilityErrorBoundaryState = { error: null };

  public override componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }

  private readonly reset = () => {
    this.setState({ error: null });
  };

  public static getDerivedStateFromError(error: Error): CapabilityErrorBoundaryState {
    return { error };
  }

  public override render() {
    if (this.state.error) {
      const Fallback = this.props.fallback;
      if (Fallback) {
        return <Fallback error={this.state.error} reset={this.reset} />;
      }
      return (
        <CapabilityErrorState
          message={this.state.error.message}
          details={this.state.error.stack}
          onRetry={this.reset}
        />
      );
    }
    return this.props.children;
  }
}

