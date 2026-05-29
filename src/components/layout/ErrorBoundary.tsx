import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Workspace error boundary.
 *
 * A single thrown render used to take the whole shell down. The boundary
 * catches it, logs the cause to the console (so the user can still grab
 * the stack from devtools), and renders a calm recovery panel with a
 * "다시 시도" reset so the user does not have to reload the page.
 *
 * `resetKey` lets the parent force a fresh attempt — flipping the value
 * clears the error state. The shell ties it to `currentView` so a route
 * change auto-recovers a previously-broken surface.
 */

type Props = {
  children: ReactNode;
  /** When this prop changes, the boundary clears its error state. */
  resetKey?: string | number;
};

type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Console capture is the user's escape hatch — they can copy the
    // stack into a bug report. Avoid throwing again here.
    console.error("[Mori] workspace render error", error, info.componentStack);
  }

  componentDidUpdate(prev: Props): void {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="workspace-error-boundary" role="alert">
          <div className="workspace-error-boundary-card">
            <header>
              <AlertTriangle size={18} aria-hidden="true" />
              <h2>화면을 그릴 수 없습니다</h2>
            </header>
            <p>
              방금 화면을 그리는 중 예상치 못한 오류가 발생했습니다. 다른
              화면으로 이동하거나 아래 버튼으로 다시 시도해 보세요.
            </p>
            <pre className="workspace-error-boundary-detail">
              {this.state.error.message}
            </pre>
            <button
              type="button"
              className="workspace-error-boundary-reset"
              onClick={this.handleReset}
            >
              <RotateCcw size={13} aria-hidden="true" /> 다시 시도
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
