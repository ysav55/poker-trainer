import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Best-effort server-side logging — non-blocking
    try {
      fetch('/api/logs/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error?.message ?? String(error),
          stack: error?.stack,
          componentStack: info?.componentStack,
          boundary: this.props.name ?? 'unknown',
        }),
      }).catch(() => {});
    } catch (_) {
      // ignore — logging must never throw
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center h-full w-full gap-4 p-8 text-center">
        <p className="text-red-400 text-lg font-semibold">Something went wrong.</p>
        <p className="text-slate-400 text-sm max-w-md">
          An unexpected error occurred in this panel. You can try reloading the page or
          reconnecting.
        </p>
        <div className="flex gap-3 mt-2">
          <button
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
          <button
            className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 text-white text-sm"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
