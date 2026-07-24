import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * App-level error boundary. Catches render/runtime errors anywhere in the
 * component tree and shows a recoverable fallback instead of a blank white
 * screen — critical for a production single-page app.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // In a real deployment this is where we'd forward to an error tracker
    // (Sentry, etc.). Keep a console record for now.
    console.error('Uncaught application error:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-50 px-4">
        <div className="card w-full max-w-md p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
            <AlertTriangle size={24} />
          </div>
          <h1 className="mt-4 text-xl font-bold text-ink-900">Something went wrong</h1>
          <p className="mt-2 text-sm text-ink-500">
            An unexpected error occurred while rendering this page. You can try again, or
            reload the application.
          </p>
          {this.state.error?.message ? (
            <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-left text-xs font-mono text-ink-500 break-words">
              {this.state.error.message}
            </p>
          ) : null}
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={this.handleReset}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.assign('/')}
              className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50"
            >
              Reload app
            </button>
          </div>
        </div>
      </div>
    );
  }
}
