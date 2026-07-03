import {
  Component,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from "react";

export interface ViewErrorStateProps {
  title?: string;
  message: string;
  details?: string;
  retryLabel?: string;
  onRetry?: () => void;
}

export function ViewErrorState({
  title = "View failed to render",
  message,
  details,
  retryLabel = "Retry",
  onRetry,
}: ViewErrorStateProps) {
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

export interface ViewErrorBoundaryProps {
  children: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
  fallback?: ComponentType<{ error: Error; reset: () => void }>;
}

interface ViewErrorBoundaryState {
  error: Error | null;
}

export class ViewErrorBoundary extends Component<ViewErrorBoundaryProps, ViewErrorBoundaryState> {
  public override state: ViewErrorBoundaryState = { error: null };

  public override componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }

  private readonly reset = () => {
    this.setState({ error: null });
  };

  public static getDerivedStateFromError(error: Error): ViewErrorBoundaryState {
    return { error };
  }

  public override render() {
    if (this.state.error) {
      const Fallback = this.props.fallback;
      if (Fallback) {
        return <Fallback error={this.state.error} reset={this.reset} />;
      }
      return (
        <ViewErrorState
          message={this.state.error.message}
          details={this.state.error.stack}
          onRetry={this.reset}
        />
      );
    }
    return this.props.children;
  }
}
