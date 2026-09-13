import { useEffect, useState } from 'react'

/**
 * Fired by the service-worker registration in `main.jsx` when a new build has
 * activated, so the running page needs one reload to pick it up.
 */
export const UPDATE_AVAILABLE_EVENT = 'gvsi:update-available'

export default function UpdatePrompt() {
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    const show = () => setAvailable(true)
    window.addEventListener(UPDATE_AVAILABLE_EVENT, show)
    return () => window.removeEventListener(UPDATE_AVAILABLE_EVENT, show)
  }, [])

  // Nothing to say when this page already loaded the current build
  if (!available) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[80] w-[calc(100%-1.5rem)] max-w-md animate-slide-up"
    >
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl px-4 py-3">
        <span className="w-8 h-8 rounded-lg bg-teal-500/15 dark:bg-teal-500/20 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-teal-600 dark:text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight whitespace-nowrap">
            New version ready
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
            Refresh for the latest build.
          </p>
        </div>

        <button
          onClick={() => window.location.reload()}
          className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white text-xs font-semibold transition-all duration-200 shadow-md shadow-teal-600/20 shrink-0"
        >
          Refresh
        </button>

        <button
          onClick={() => setAvailable(false)}
          aria-label="Dismiss update notice"
          className="px-2 py-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium transition shrink-0"
        >
          Later
        </button>
      </div>
    </div>
  )
}
