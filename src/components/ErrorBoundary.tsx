import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Top-level error boundary.
 *
 * Catches uncaught render/runtime errors anywhere in the tree and shows a
 * recoverable fallback instead of a blank white screen — important for a
 * production deployment where a single bad render should not take down the
 * whole app.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface for observability; in production this is where a logging service
    // (Sentry, etc.) would be notified.
    console.error('Uncaught application error:', error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.assign('/');
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-ink-50 px-4">
          <div className="card max-w-md w-full p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
              <AlertTriangle size={24} />
            </div>
            <h1 className="mt-4 text-xl font-bold text-ink-900">Something went wrong</h1>
            <p className="mt-2 text-sm text-ink-500">
              An unexpected error occurred. You can return to the dashboard and try again.
            </p>
            <button
              onClick={this.handleReload}
              className="btn btn-primary mt-6 inline-flex items-center gap-2"
            >
              <RefreshCw size={16} />
              Back to dashboard
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
