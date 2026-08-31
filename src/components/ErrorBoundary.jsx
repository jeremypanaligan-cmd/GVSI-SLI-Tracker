import { Component } from 'react'

/**
 * ErrorBoundary — Catches JavaScript errors in child component tree.
 * Shows a user-friendly recovery UI instead of a white screen.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo })
    // Log error for debugging (only in dev)
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, errorInfo)
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#0B0F17] flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center">
            {/* Error icon */}
            <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-rose-100 to-rose-200 dark:from-rose-950/60 dark:to-rose-900/40 border border-rose-200 dark:border-rose-800/50 flex items-center justify-center shadow-lg">
              <svg className="w-10 h-10 text-rose-500 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>

            {/* Title */}
            <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              Something went wrong
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
              The app encountered an unexpected error. Your data is safe — this is a display issue, not a data loss.
            </p>

            {/* Error details (collapsible) */}
            {this.state.error && (
              <details className="mb-6 text-left">
                <summary className="text-xs font-medium text-slate-400 dark:text-slate-500 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 transition mb-2">
                  Technical details
                </summary>
                <div className="rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 p-3 text-left">
                  <p className="text-xs font-mono text-rose-600 dark:text-rose-400 break-all">
                    {this.state.error.message || String(this.state.error)}
                  </p>
                  {this.state.errorInfo?.componentStack && (
                    <pre className="text-[10px] text-slate-500 dark:text-slate-500 mt-2 overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  )}
                </div>
              </details>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleRetry}
                className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white text-sm font-semibold transition-all duration-200 shadow-lg shadow-teal-600/20 hover:shadow-teal-500/30"
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                className="px-5 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold transition-all duration-200 border border-slate-300 dark:border-slate-700"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
