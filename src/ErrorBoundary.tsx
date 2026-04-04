import { Component, type ReactNode, type ErrorInfo } from "react";
import { c, font } from "./tokens";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          role="alert"
          style={{
            minHeight: "100vh",
            background: c.obsidian,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: font.ui,
            padding: 24,
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "rgba(196,112,90,0.08)",
              border: "1px solid rgba(196,112,90,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 20,
            }}
          >
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: c.ivory, marginBottom: 8 }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 13, color: c.stone, maxWidth: 400, lineHeight: 1.6, marginBottom: 24 }}>
            An unexpected error occurred. Your interview data is safe. Try refreshing, or go back to the dashboard.
          </p>
          {this.state.error && (
            <pre
              style={{
                fontSize: 11,
                color: c.ember,
                background: "rgba(196,112,90,0.06)",
                border: `1px solid rgba(196,112,90,0.15)`,
                borderRadius: 8,
                padding: "12px 16px",
                maxWidth: 500,
                overflow: "auto",
                marginBottom: 24,
                fontFamily: font.mono,
                textAlign: "left",
              }}
            >
              {this.state.error.message}
            </pre>
          )}
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={this.handleReset}
              style={{
                padding: "10px 24px",
                borderRadius: 8,
                border: `1px solid ${c.border}`,
                background: "transparent",
                color: c.ivory,
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Try Again
            </button>
            <button
              onClick={() => { window.location.href = "/dashboard"; }}
              style={{
                padding: "10px 24px",
                borderRadius: 8,
                border: "none",
                background: c.gilt,
                color: c.obsidian,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/* ─── Lightweight route-level error boundary ─── */
/* Shows inline error within the layout instead of replacing the entire page */

interface RouteErrorState { hasError: boolean; error: Error | null }

export class RouteErrorBoundary extends Component<{ children: ReactNode }, RouteErrorState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): RouteErrorState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[RouteErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" style={{ padding: "48px 24px", textAlign: "center", fontFamily: font.ui }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: "rgba(196,112,90,0.08)", border: "1px solid rgba(196,112,90,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px",
          }}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: c.ivory, marginBottom: 6 }}>This section encountered an error</h2>
          <p style={{ fontSize: 13, color: c.stone, marginBottom: 16, maxWidth: 360, margin: "0 auto 16px" }}>
            Your data is safe. Try again or navigate to another section.
          </p>
          {this.state.error && (
            <pre style={{
              fontSize: 11, color: c.ember, background: "rgba(196,112,90,0.06)",
              border: "1px solid rgba(196,112,90,0.15)", borderRadius: 8,
              padding: "8px 12px", maxWidth: 400, margin: "0 auto 16px",
              overflow: "auto", fontFamily: font.mono, textAlign: "left",
            }}>{this.state.error.message}</pre>
          )}
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: "8px 20px", borderRadius: 8, border: `1px solid ${c.border}`,
              background: "transparent", color: c.ivory, fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}
          >Try Again</button>
        </div>
      );
    }
    return this.props.children;
  }
}
