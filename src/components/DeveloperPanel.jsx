import { useEffect, useState } from 'react'
import { setMaintenance, forceSignOutAll, formatDuration } from '../utils/presence'

const DURATIONS = [
  { label: '30 minuto', hours: 0.5 },
  { label: '1 oras', hours: 1 },
  { label: '2 oras (default)', hours: 2 },
  { label: '4 na oras', hours: 4 },
  { label: '8 oras', hours: 8 },
  { label: 'Walang auto-off', hours: null },
]

const formatTime = (value) => {
  const date = value ? new Date(value) : null
  if (!date || isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-PH', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/**
 * Developer-only console: who is signed in right now (and for how long), plus the
 * maintenance switch.
 *
 * Every action goes through a Supabase RPC that re-checks the caller's role against
 * their session token inside Postgres, so this panel being open in the DOM does not
 * by itself grant anything.
 */
export default function DeveloperPanel({
  open, onClose, token, roster, maintenance, onMaintenanceChange, onNotice,
}) {
  const [message, setMessage] = useState('')
  const [durationIndex, setDurationIndex] = useState(2)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())

  // Live durations — the figures move on their own while the panel stays open.
  useEffect(() => {
    if (!open) return
    const timer = setInterval(() => setNow(Date.now()), 10000)
    return () => clearInterval(timer)
  }, [open])

  useEffect(() => {
    if (open && maintenance?.enabled && maintenance.message) setMessage(maintenance.message)
  }, [open, maintenance?.enabled, maintenance?.message])

  if (!open) return null

  const active = roster?.active || []
  const recent = roster?.recent || []

  const runMaintenance = async (enabled) => {
    setBusy(enabled ? 'on' : 'off')
    setError('')
    try {
      const hours = DURATIONS[durationIndex]?.hours
      const expiresAt = enabled && hours
        ? new Date(Date.now() + hours * 3600 * 1000).toISOString()
        : null

      await setMaintenance(token, { enabled, message, expiresAt })
      await onMaintenanceChange?.()
      onNotice?.(enabled ? 'Naka-ON ang maintenance mode.' : 'Naka-OFF na ang maintenance mode.')
    } catch (err) {
      setError(err.message || 'Hindi nagawa ang pagbabago.')
    } finally {
      setBusy('')
    }
  }

  const runForceSignOut = async () => {
    if (!window.confirm('I-revoke ang session ng LAHAT maliban sa iyo? Kailangan nilang mag-sign in muli.')) return
    setBusy('kick')
    setError('')
    try {
      const count = await forceSignOutAll(token, true)
      await roster?.refresh?.()
      onNotice?.(`${count || 0} session ang ni-revoke.`)
    } catch (err) {
      setError(err.message || 'Hindi nagawa ang force sign-out.')
    } finally {
      setBusy('')
    }
  }

  const durationFor = (row) => {
    const start = row?.started_at ? new Date(row.started_at).getTime() : null
    if (!start || isNaN(start)) return '—'
    return formatDuration((now - start) / 1000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 overflow-y-auto bg-slate-950/60 backdrop-blur-sm">
      <div className="w-full max-w-3xl my-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
        <header className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <span className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Developer console</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {active.length} aktibo ngayon · awtomatikong nagre-refresh
            </p>
          </div>
          <button
            type="button"
            onClick={() => roster?.refresh?.()}
            disabled={roster?.loading}
            className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition"
          >
            {roster?.loading ? 'Naglo-load…' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Isara"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="p-4 space-y-5 max-h-[75vh] overflow-y-auto">
          {roster?.error && (
            <p role="alert" className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg px-3 py-2">
              {roster.error}
            </p>
          )}
          {error && (
            <p role="alert" className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Active now */}
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
              Aktibo ngayon
            </h3>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="text-left font-semibold px-3 py-2">User</th>
                      <th className="text-left font-semibold px-3 py-2">Role</th>
                      <th className="text-left font-semibold px-3 py-2">View</th>
                      <th className="text-right font-semibold px-3 py-2">Aktibo</th>
                      <th className="text-right font-semibold px-3 py-2">Simula</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {active.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-center text-slate-400 dark:text-slate-500">
                          Walang ibang aktibo sa loob ng 2 minuto.
                        </td>
                      </tr>
                    )}
                    {active.map((row, index) => (
                      <tr key={`${row.username}-${row.started_at}-${index}`} className="text-slate-700 dark:text-slate-200">
                        <td className="px-3 py-2">
                          <span className="font-semibold">{row.username}</span>
                          {row.full_name && (
                            <span className="block text-[10px] text-slate-400 dark:text-slate-500">{row.full_name}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{row.role || '—'}</td>
                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                          {row.plan ? `${row.plan}${row.view ? ` / ${row.view}` : ''}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                          {durationFor(row)}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {formatTime(row.started_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Maintenance */}
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
              Maintenance mode
            </h3>
            <div className={`rounded-xl border p-3 ${
              maintenance?.enabled
                ? 'border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10'
                : 'border-slate-200 dark:border-slate-800'
            }`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                    {maintenance?.enabled ? 'Naka-ON ngayon' : 'Naka-OFF'}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {maintenance?.enabled
                      ? `Ni ${maintenance.by || '—'} noong ${formatTime(maintenance.since)}` +
                        (maintenance.expiresAt ? ` · hanggang ${formatTime(maintenance.expiresAt)}` : ' · manu-manong i-off')
                      : 'Hindi nakikita ng mga user ang maintenance screen.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => runMaintenance(!maintenance?.enabled)}
                  disabled={busy === 'on' || busy === 'off'}
                  className={`shrink-0 text-xs font-semibold px-3 py-2 rounded-lg transition disabled:opacity-50 ${
                    maintenance?.enabled
                      ? 'bg-slate-800 dark:bg-slate-700 text-white hover:bg-slate-700 dark:hover:bg-slate-600'
                      : 'bg-amber-600 hover:bg-amber-500 text-white'
                  }`}
                >
                  {busy === 'on' || busy === 'off'
                    ? 'Ina-apply…'
                    : maintenance?.enabled ? 'I-off' : 'I-ON ang maintenance'}
                </button>
              </div>

              {!maintenance?.enabled && (
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    type="text"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Mensahe sa mga user (opsyonal)"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950/60 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition"
                  />
                  <select
                    value={durationIndex}
                    onChange={(event) => setDurationIndex(Number(event.target.value))}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950/60 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  >
                    {DURATIONS.map((option, index) => (
                      <option key={option.label} value={index}>{option.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <p className="mt-3 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                Harang ito para sa lahat maliban sa Developer, at awtomatikong nag-o-off sa napiling
                oras — para hindi maiwang naka-lock ang team. Hindi ito security control: nasa browser
                ang check. Tingnan ang docs/DEVELOPER.md.
              </p>
            </div>
          </section>

          {/* Sessions */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Mga nakaraang session
              </h3>
              <button
                type="button"
                onClick={runForceSignOut}
                disabled={busy === 'kick'}
                className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-rose-300 dark:border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 disabled:opacity-50 transition"
              >
                {busy === 'kick' ? 'Nagre-revoke…' : 'Force sign-out ang lahat'}
              </button>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="text-left font-semibold px-3 py-2">User</th>
                      <th className="text-left font-semibold px-3 py-2">Simula</th>
                      <th className="text-left font-semibold px-3 py-2">Katapusan</th>
                      <th className="text-right font-semibold px-3 py-2">Tagal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {recent.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center text-slate-400 dark:text-slate-500">
                          Wala pang naitalang session.
                        </td>
                      </tr>
                    )}
                    {recent.map((row, index) => (
                      <tr key={`${row.username}-${row.started_at}-${index}`} className="text-slate-700 dark:text-slate-200">
                        <td className="px-3 py-2">
                          <span className="font-semibold">{row.username}</span>
                          {row.revoked_at && (
                            <span className="ml-2 text-[10px] font-semibold text-rose-600 dark:text-rose-400">revoked</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {formatTime(row.started_at)}
                        </td>
                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {row.ended_at ? formatTime(row.ended_at) : (row.revoked_at ? 'ni-revoke' : 'aktibo pa')}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {formatDuration(row.duration_seconds)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
