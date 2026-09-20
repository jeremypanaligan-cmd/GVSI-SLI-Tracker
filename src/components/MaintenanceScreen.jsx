import AppLogo from './AppLogo'

/**
 * Shown to everyone except Developers while maintenance mode is on.
 *
 * It is deliberately a coordination notice rather than a security control: the check
 * runs in the browser and the dashboard data still comes from public sheet exports.
 * See docs/DEVELOPER.md.
 */
export default function MaintenanceScreen({ maintenance, stale, onRetry }) {
  const since = maintenance?.since ? new Date(maintenance.since) : null
  const until = maintenance?.expiresAt ? new Date(maintenance.expiresAt) : null

  const format = (date) =>
    date && !isNaN(date.getTime())
      ? date.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : null

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-[#070A0F] font-sans">
      <div className="w-full max-w-md text-center">
        <div className="flex flex-col items-center mb-5">
          <AppLogo className="w-14 h-14 rounded-2xl shadow-lg shadow-amber-500/25" />
          <h1 className="mt-3 text-lg font-bold text-slate-900 dark:text-white tracking-tight">
            <span className="text-amber-600 dark:text-amber-400">Maintenance</span> mode
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">GVSI SLI Tracker</p>
        </div>

        <div className="rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-white dark:bg-slate-900/60 backdrop-blur-xl shadow-2xl shadow-black/5 dark:shadow-black/30 p-5">
          <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
            {maintenance?.message || 'The dashboard is temporarily unavailable while maintenance is being carried out.'}
          </p>

          <dl className="mt-4 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
            {format(since) && (
              <div className="flex justify-between gap-3">
                <dt>Started</dt>
                <dd className="font-medium text-slate-700 dark:text-slate-300">{format(since)}</dd>
              </div>
            )}
            {maintenance?.by && (
              <div className="flex justify-between gap-3">
                <dt>Set by</dt>
                <dd className="font-medium text-slate-700 dark:text-slate-300">{maintenance.by}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt>Closed until</dt>
              <dd className="font-medium text-slate-700 dark:text-slate-300">
                {format(until) || 'manual turn-off'}
              </dd>
            </div>
          </dl>

          {stale && (
            <p className="mt-4 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg px-3 py-2">
              The server could not be reached, so this is the last known state. If maintenance
              has already finished, refresh the page.
            </p>
          )}

          <button
            type="button"
            onClick={onRetry}
            className="mt-5 w-full rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold py-2.5 transition-all duration-200"
          >
            Try again
          </button>
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
          Developer access is not blocked. Ask a Developer if you need immediate access.
        </p>
      </div>
    </div>
  )
}
