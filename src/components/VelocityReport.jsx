/**
 * VelocityReport — actual daily completion pace vs the rate required to reach target.
 *
 * The run-rate projection already tells you *where* the month lands; this answers
 * the operational question behind it: how many jobs are actually closing per day,
 * how many need to close, and whether the gap is closing.
 *
 * Bars are per-day completions from the plan's DATA tab. The dashed line is the
 * required daily rate for the days remaining in the month, so any bar under the
 * line is a day that fell behind.
 */
export default function VelocityReport({ projection, trend }) {
  if (!projection) return null

  const { totalCompleted, target, daysElapsed, daysInMonth, rate, remainingDays, requiredDaily } = projection
  const toGo = Math.max(0, (target || 0) - (totalCompleted || 0))
  const done = requiredDaily === 0 || toGo === 0

  const values = (trend && Array.isArray(trend.values) ? trend.values : []).filter((v) => typeof v === 'number' && !isNaN(v))
  const dates = (trend && Array.isArray(trend.dates) ? trend.dates : []) || []
  const hasChart = values.length >= 2

  // Recent momentum — the last week of actual output, independent of the
  // month-to-date average, which is dragged down by a slow start.
  const recent = values.slice(-7)
  const recentAvg = recent.length ? recent.reduce((s, v) => s + v, 0) / recent.length : null

  // Linear track: where a perfectly even month would put us by today.
  const linearExpect = (target || 0) * (daysElapsed / daysInMonth)
  const trackDelta = (totalCompleted || 0) - linearExpect

  // Pace verdict
  const ratio = requiredDaily > 0 ? rate / requiredDaily : null
  // "7.7× the current rate" only means something with a non-zero rate — a month
  // with no output yet has an undefined multiple, not a large one.
  const gapMultiple = ratio !== null && ratio < 1 && rate > 0 ? (requiredDaily / rate).toFixed(1) : null
  const verdict = done
    ? { label: 'Requirement cleared', cls: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-100 dark:bg-emerald-900/50', border: 'border-emerald-300 dark:border-emerald-500/40' }
    : ratio >= 1
      ? { label: 'Above required pace', cls: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-100 dark:bg-emerald-900/50', border: 'border-emerald-300 dark:border-emerald-500/40' }
      : ratio >= 0.8
        ? { label: 'Slightly under pace', cls: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-100 dark:bg-amber-900/50', border: 'border-amber-300 dark:border-amber-500/40' }
        : { label: 'Well under pace', cls: 'text-red-700 dark:text-red-300', bg: 'bg-red-100 dark:bg-red-900/50', border: 'border-red-300 dark:border-red-500/40' }

  // Projected finish day at the current month-to-date rate.
  let finishDay = null
  if (!done && rate > 0) finishDay = daysElapsed + toGo / rate

  const scaleMax = Math.max(...(hasChart ? values : [0]), requiredDaily || 0, 1)

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1622] p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-4">
        <h3 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Velocity</h3>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${verdict.bg} ${verdict.cls} ${verdict.border}`}>
          {verdict.label}
        </span>
        <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-auto">
          Day {daysElapsed} of {daysInMonth} · {remainingDays} left
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,260px)_1fr] gap-4 lg:gap-6">
        {/* Left: the two rates side by side */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-900/40 p-3">
              <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Actual</p>
              <p className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                {fmt(rate, 1)}<span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 ml-1">/day</span>
              </p>
              <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1">month-to-date avg</p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-900/40 p-3">
              <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Required</p>
              <p className={`text-xl font-black tracking-tight ${done ? 'text-emerald-600 dark:text-emerald-400' : verdict.cls}`}>
                {fmt(Math.ceil(requiredDaily))}<span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 ml-1">/day</span>
              </p>
              <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1">{done ? 'target reached' : `for ${remainingDays} more days`}</p>
            </div>
          </div>

          <ul className="text-[11px] space-y-1.5">
            {!done && gapMultiple && (
              <li className="text-slate-600 dark:text-slate-300">
                Need <span className="font-bold text-rose-600 dark:text-rose-400">{gapMultiple}×</span> the current daily rate
              </li>
            )}
            {!done && rate <= 0 && (
              <li className="font-semibold text-rose-600 dark:text-rose-400">No completions recorded this month yet</li>
            )}
            {recentAvg !== null && (
              <li className="text-slate-600 dark:text-slate-300">
                Last {recent.length} days: <span className="font-semibold text-slate-900 dark:text-white">{fmt(recentAvg, 1)}/day</span>
                {recentAvg >= rate
                  ? <span className="text-emerald-600 dark:text-emerald-400 font-semibold"> · accelerating</span>
                  : <span className="text-amber-600 dark:text-amber-400 font-semibold"> · slowing</span>}
              </li>
            )}
            <li className="text-slate-600 dark:text-slate-300">
              vs even track:{' '}
              <span className={`font-semibold ${trackDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {trackDelta >= 0 ? '+' : ''}{fmt(Math.round(trackDelta))}
              </span>
            </li>
            {finishDay !== null && (
              <li className="text-slate-600 dark:text-slate-300">
                At this rate: {finishDay <= daysInMonth
                  ? <span className="font-semibold text-slate-900 dark:text-white">finishes day {Math.ceil(finishDay)}</span>
                  : <span className="font-semibold text-rose-600 dark:text-rose-400">{Math.ceil(finishDay - daysInMonth)} days past month-end</span>}
              </li>
            )}
          </ul>
        </div>

        {/* Right: daily output vs the required line */}
        {hasChart ? (
          <div>
            <div className="relative h-[110px] flex items-end gap-[2px]">
              {values.map((v, i) => {
                const met = done || v >= requiredDaily
                return (
                  <div
                    key={i}
                    title={`${dates[i] || 'Day ' + (i + 1)} — ${fmt(v)} completed${!done ? ` (${v >= requiredDaily ? 'at/above' : 'under'} the ${fmt(Math.ceil(requiredDaily))}/day required)` : ''}`}
                    className={`flex-1 min-w-[3px] rounded-t-[2px] transition-all duration-200 ${
                      done ? 'bg-slate-300 dark:bg-slate-600'
                        : met ? 'bg-emerald-500/80 dark:bg-emerald-400/70 hover:bg-emerald-500'
                          : 'bg-rose-400/60 dark:bg-rose-500/50 hover:bg-rose-400'
                    }`}
                    style={{ height: `${Math.max((v / scaleMax) * 100, 1.5)}%` }}
                  />
                )
              })}

              {!done && (
                <div
                  className="pointer-events-none absolute left-0 right-0 border-t-2 border-dashed border-amber-500/80 dark:border-amber-400/70"
                  style={{ bottom: `${Math.min((requiredDaily / scaleMax) * 100, 100)}%` }}
                >
                  <span className="absolute right-0 -top-4 text-[9px] font-bold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                    required {fmt(Math.ceil(requiredDaily))}/day
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mt-1.5 text-[9px] text-slate-400 dark:text-slate-500">
              <span>{dates[0] || ''}</span>
              <span className="font-semibold">{values.length} days of completions</span>
              <span>{dates[values.length - 1] || ''}</span>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center p-6">
            <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
              Not enough daily history yet to chart velocity — figures above still reflect the current pace.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function fmt(n, digits = 0) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}
