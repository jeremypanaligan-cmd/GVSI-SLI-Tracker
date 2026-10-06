import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatPeso } from '../utils/dataProcessor'

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
 *
 * The plan and the series are measured separately, and neither implies the other. `collectionBased`
 * is the plan's measure: SME's target is a peso figure, so the rate it must run at and the
 * requirement the dashed line draws are money whether or not this month's series carries any. The
 * series carries its own (`trend.money`) — NET collections on SME, completed installations on the
 * other plans — and the bars, their labels and the running average follow that, so a series that
 * fell back to counts is never written or named as money. They are drawn together only while the
 * two agree: bars in one measure under a line in another is how SME's chart came to show an amber
 * line with no bars beneath it.
 *
 * A bar is a button: it opens that day's own figures, the way a month in the Monthly Progress
 * strip does. The tooltip stays for a pointer — a `title` is unreachable by touch.
 *
 * That dialog also breaks the day down by province, from `areasByDate` — a day's total says the
 * day fell short, but not which areas carried it and which stood still.
 */
export default function VelocityReport({ projection, trend, areasByDate = null, collectionBased = false }) {
  // Which day's details are open, if any. Declared before the early return below — a hook
  // cannot sit behind a condition.
  const [openDay, setOpenDay] = useState(null)
  if (!projection) return null

  const { totalCompleted, target, daysElapsed, daysInMonth, rate, remainingDays, requiredDaily } = projection
  const toGo = Math.max(0, (target || 0) - (totalCompleted || 0))
  const done = requiredDaily === 0 || toGo === 0

  // Two measures meet in this card, and each side has to be asked for its own.
  //
  // `collectionBased` is the *plan's*: its target is money, so the rate it must run at, the drift
  // from an even track and the requirement the dashed line draws are money whether or not this
  // month's series carries any. A peso pace written as a bare number beside a peso target reads
  // as a count.
  const amount = (n, digits = 0) => (collectionBased ? formatPeso(n) : fmt(n, digits))
  // This one is the *series'*, which travels on it — NET collections on SME, ticket counts on the
  // other plans. The bars, their labels and the running average describe the series, so they
  // follow the series: one that fell back to counts is never written or named as money.
  const seriesMoney = Boolean(trend?.money)
  const seriesAmount = (n, digits = 0) => (seriesMoney ? formatPeso(n) : fmt(n, digits))
  const verb = seriesMoney ? 'collected' : 'completed'
  const activity = seriesMoney ? 'collections' : 'completions'

  // Bars and labels are paired before use: a series can carry a gap (a day the sheet has no
  // reading for), and filtering the values alone would slide every later label onto the
  // wrong bar — and, worse here, onto another day's area split.
  const pairs = ((trend && Array.isArray(trend.dates) ? trend.dates : []).map((d, i) => ({
    date: d,
    value: trend && Array.isArray(trend.values) ? trend.values[i] : undefined,
  }))).filter((p) => typeof p.value === 'number' && !isNaN(p.value))
  const values = pairs.map((p) => p.value)
  const dates = pairs.map((p) => p.date)
  // The bars are read against the required line, so the series and that line have to be in the
  // same measure. Normally they are — the caller hands a money plan its money series. When they
  // are not, there is no money series to draw and all that is left is ticket counts, which drawn
  // against a peso-per-day line are the invisible bars this chart was fixed for once already. So
  // it charts nothing rather than charting the wrong thing.
  const measureAligned = seriesMoney === collectionBased
  const hasChart = measureAligned && values.length >= 2

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
                {amount(rate, 1)}<span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 ml-1">/day</span>
              </p>
              <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1">month-to-date avg</p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-900/40 p-3">
              <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Required</p>
              <p className={`text-xl font-black tracking-tight ${done ? 'text-emerald-600 dark:text-emerald-400' : verdict.cls}`}>
                {amount(Math.ceil(requiredDaily))}<span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 ml-1">/day</span>
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
              <li className="font-semibold text-rose-600 dark:text-rose-400">No {activity} recorded this month yet</li>
            )}
            {recentAvg !== null && (
              <li className="text-slate-600 dark:text-slate-300">
                Last {recent.length} days: <span className="font-semibold text-slate-900 dark:text-white">{seriesAmount(recentAvg, 1)}/day</span>
                {/* A money plan's series begins where its month does, so early in the month the recent
                    window is the whole month and reading it against the month-to-date rate says
                    nothing — the verdict arrives once there are days behind the window. */}
                {recent.length < values.length && (recentAvg >= rate
                  ? <span className="text-emerald-600 dark:text-emerald-400 font-semibold"> · accelerating</span>
                  : <span className="text-amber-600 dark:text-amber-400 font-semibold"> · slowing</span>)}
              </li>
            )}
            <li className="text-slate-600 dark:text-slate-300">
              vs even track:{' '}
              <span className={`font-semibold ${trackDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {trackDelta >= 0 ? '+' : ''}{amount(trackDelta)}
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
                const label = dates[i] || 'Day ' + (i + 1)
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setOpenDay(i)}
                    title={`${label} — ${seriesAmount(v)} ${verb}${!done ? ` (${v >= requiredDaily ? 'at/above' : 'under'} the ${amount(Math.ceil(requiredDaily))}/day required)` : ''}`}
                    aria-haspopup="dialog"
                    aria-label={`${label} — ${seriesAmount(v)} ${verb}. Open the day's details.`}
                    className="group flex-1 min-w-[3px] h-full flex items-end bg-transparent rounded-t-[2px] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/60"
                  >
                    <span
                      className={`w-full rounded-t-[2px] transition-all duration-200 ${
                        done ? 'bg-slate-300 dark:bg-slate-600'
                          : met ? 'bg-emerald-500/80 dark:bg-emerald-400/70 group-hover:bg-emerald-500'
                            : 'bg-rose-400/60 dark:bg-rose-500/50 group-hover:bg-rose-400'
                      }`}
                      style={{ height: `${Math.max((v / scaleMax) * 100, 1.5)}%` }}
                    />
                  </button>
                )
              })}

              {!done && (
                <div
                  className="pointer-events-none absolute left-0 right-0 border-t-2 border-dashed border-amber-500/80 dark:border-amber-400/70"
                  style={{ bottom: `${Math.min((requiredDaily / scaleMax) * 100, 100)}%` }}
                >
                  <span className="absolute right-0 -top-4 text-[9px] font-bold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                    required {amount(Math.ceil(requiredDaily))}/day
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mt-1.5 text-[9px] text-slate-400 dark:text-slate-500">
              <span>{dates[0] || ''}</span>
              <span className="font-semibold">{values.length} days of {activity}</span>
              <span>{dates[values.length - 1] || ''}</span>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center p-6">
            <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
              {measureAligned
                ? 'Not enough daily history yet to chart velocity — figures above still reflect the current pace.'
                : 'Nothing to chart yet — this month is paced in money and the series here is in counts, so it cannot be drawn to the required line’s scale. The rates above stand on their own.'}
            </p>
          </div>
        )}
      </div>

      {/* The day behind a bar. A bar can only say that a day came in under the line; this is
          what the day brought in, what it was asked for, and what the difference was. */}
      {openDay !== null && values[openDay] !== undefined && (
        <DayDetailModal
          date={dates[openDay]}
          index={openDay}
          value={values[openDay]}
          required={requiredDaily}
          through={values.slice(0, openDay + 1).reduce((sum, v) => sum + v, 0)}
          throughLabel={collectionBased ? 'Month to date' : `Last ${openDay + 1} days`}
          done={done}
          areas={(areasByDate && areasByDate[dates[openDay]]) || []}
          collectionBased={collectionBased}
          onClose={() => setOpenDay(null)}
        />
      )}
    </div>
  )
}

/** One line of a day's details: a label on the left, the figure on the right. */
function DetailRow({ label, value, tone = 'text-slate-800 dark:text-slate-100', big = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</span>
      <span className={`tabular-nums ${big ? 'text-xl font-black' : 'text-sm font-bold'} ${tone}`}>{value}</span>
    </div>
  )
}

/**
 * One day of the chart, laid out — what the bar's tooltip says, for a screen that cannot hover.
 *
 * A day is read against the same required rate the chart's dashed line draws, so a day's
 * shortfall here is the gap the bar's own length falls short of: the amount collected (or the
 * work completed) that day, next to what that day needed to bring.
 *
 * `areas` is that day's per-province split, already sorted descending; each row's bar is the
 * area's share of the day. An area with nothing that day is listed rather than dropped — the
 * laggards are half of what the breakdown is for.
 *
 * Exported so a probe can render the card directly — `createPortal` renders nothing on a
 * server, which is where the rest of this file is checked.
 */
export function DayDetailCard({ date, index, value, required, through, throughLabel, done, collectionBased = false, areas = [], onClose }) {
  // A rate the chart displays, so it rounds the way the chart's own label does — a peso plan
  // in whole pesos, a ticket plan in whole installations.
  const money = (n) => (collectionBased ? formatPeso(n) : fmt(n))
  const goal = Math.ceil(required)
  const met = done || value >= required
  const difference = Math.abs(goal - value)
  const share = goal > 0 ? (value / goal) * 100 : null

  // The day split by province, straight from the sheet and already sorted descending — the
  // areas that made up the day lead, the ones that produced nothing sit at the bottom. An idle
  // area is named rather than dropped: on a day that came up short, which areas stood still is
  // the operational question, and a bar chart of a day answers it only by which bars are absent.
  const areaRows = (areas || []).filter((a) => a && a.area && Number.isFinite(a.value))
  const areaTotal = areaRows.reduce((sum, a) => sum + Math.max(a.value, 0), 0)
  const idleAreas = areaRows.filter((a) => a.value <= 0)
  const leader = areaRows.length ? areaRows.reduce((best, a) => (a.value > best.value ? a : best), areaRows[0]) : null
  const leaderShare = leader && areaTotal > 0 ? Math.round((leader.value / areaTotal) * 100) : null

  const verdict = done
    ? 'The month’s target is already cleared — this day no longer has a rate to meet.'
    : met
      ? 'This day met the rate the rest of the month needs.'
      : `This day came in ${money(difference)} short of the rate the rest of the month needs.`

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="velocity-day-title"
      onClick={(e) => e.stopPropagation()}
      className="w-full max-w-xs max-h-[85vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#0E1622] shadow-2xl overflow-hidden"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <h3 id="velocity-day-title" className="flex items-baseline gap-2 text-sm font-black tracking-tight text-slate-800 dark:text-slate-100">
          {date || `Day ${index + 1}`}
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Velocity</span>
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-300 dark:hover:bg-slate-800 transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 space-y-3">
          <DetailRow
            label={collectionBased ? 'Collected' : 'Completed'}
            value={money(value)}
            big
            tone={met ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}
          />
          <DetailRow label="Required that day" value={money(goal)} />
          <DetailRow
            label={done ? 'Requirement' : met ? 'Above by' : 'Short by'}
            value={done ? '—' : money(difference)}
            tone={done || met ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}
          />
          <DetailRow label="Of the day’s requirement" value={share === null ? '—' : `${share.toFixed(0)}%`} />
          <DetailRow label={throughLabel} value={money(through)} />
        </div>

        {areaRows.length > 0 && (
          <div className="px-4 pb-4">
            <div className="flex items-baseline justify-between gap-2 pt-3 mb-2 border-t border-slate-100 dark:border-slate-800">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">By area</span>
              <span className="text-[9px] text-slate-400 dark:text-slate-500">{areaRows.length - idleAreas.length} of {areaRows.length} produced</span>
            </div>
            <ul className="space-y-1">
              {areaRows.map(({ area, value: areaValue }) => {
                const idle = areaValue <= 0
                const pct = areaTotal > 0 ? Math.max(0, (areaValue / areaTotal) * 100) : 0
                return (
                  <li key={area} className="flex items-center gap-2" title={`${area} — ${money(areaValue)}, ${pct.toFixed(0)}% of the day`}>
                    <span className={`w-[92px] shrink-0 truncate text-[11px] ${idle ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-200'}`}>{area}</span>
                    <span className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800/80 overflow-hidden">
                      <span className="block h-full rounded-full bg-teal-500/70 dark:bg-teal-400/60" style={{ width: `${pct}%` }} />
                    </span>
                    <span className={`w-[62px] shrink-0 text-right text-[11px] tabular-nums ${idle ? 'text-slate-400 dark:text-slate-500' : 'font-bold text-slate-800 dark:text-slate-100'}`}>
                      {idle ? '—' : money(areaValue)}
                    </span>
                  </li>
                )
              })}
            </ul>
            {leader && (
              <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
                <span className="font-semibold text-slate-600 dark:text-slate-300">{leader.area}</span>
                {leaderShare !== null ? ` carried ${leaderShare}% of the day` : ' led the day'}
                {idleAreas.length > 0 ? `; ${idleAreas.length} of ${areaRows.length} produced nothing.` : '.'}
              </p>
            )}
          </div>
        )}

        <p className="px-4 pb-3 text-[11px] italic text-slate-500 dark:text-slate-400">{verdict}</p>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="w-full px-4 py-3 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
      >
        Close
      </button>
    </div>
  )
}

/**
 * The dialog itself: the day's figures sit in a portaled overlay so the chart's own height
 * cannot clip them. A sheet on a phone, a centered card from `sm` up. Backdrop click and
 * Escape both close it, the way a month in the Monthly Progress strip does.
 */
function DayDetailModal({ onClose, ...rest }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4 bg-slate-900/70 dark:bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <DayDetailCard onClose={onClose} {...rest} />
    </div>,
    document.body,
  )
}

function fmt(n, digits = 0) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}
