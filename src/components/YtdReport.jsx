/**
 * YtdReport — the year-to-date section of the Executive Overview.
 *
 * The Month-to-Date section answers "how is this month going". This one answers "how is
 * the year going": actual against the plan to date, what is left of the annual target, the
 * pace the remaining months need, and where the year lands if the current pace holds.
 *
 * Two different yardsticks on purpose, and both are labelled:
 *   · the headline is against the **plan to date**, because in September a province at 47%
 *     of its annual target is not failing — it has had eight months
 *   · the bar is against the **annual target**, because that is the number being filled
 *
 * The verdict (on pace / behind / critical) is judged on finished months only, so nothing
 * screams on the second day of a month. See computeYtd() in utils/yearTables.js.
 */
import { formatNumber, getBadgeStyle, getPaceBadgeStyle } from '../utils/dataProcessor'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function Badge({ label, color, bg, border, pulse }) {
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${bg} ${color} ${border}`}>
      {pulse && <span className="w-1.5 h-1.5 rounded-full mr-1 bg-emerald-500 animate-pulse" />}
      {label}
    </span>
  )
}

/** One month of the strip: what it delivered against what it was asked for. */
function MonthCell({ index, actual, target, future, accentText }) {
  const hasActual = typeof actual === 'number' && Number.isFinite(actual)
  const fill = !future && target > 0 && hasActual ? Math.min((actual / target) * 100, 100) : 0
  const hit = !future && target > 0 && hasActual && actual >= target
  const ratio = !future && target > 0 && hasActual ? (actual / target) * 100 : null

  return (
    <div
      className={`flex-1 min-w-[44px] rounded-lg border px-1.5 py-2 text-center ${
        future
          ? 'border-dashed border-slate-200 dark:border-slate-800 bg-transparent opacity-55'
          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40'
      }`}
      title={future
        ? `${MONTH_LABELS[index]} · target ${formatNumber(target)}, not yet reached`
        : `${MONTH_LABELS[index]} · ${formatNumber(actual)} of ${formatNumber(target)} target${ratio != null ? ` (${ratio.toFixed(0)}%)` : ''}`}
    >
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{MONTH_LABELS[index]}</p>
      <p className={`text-[13px] font-black tabular-nums leading-tight mt-0.5 ${
        future ? 'text-slate-300 dark:text-slate-600' : hit ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100'
      }`}>
        {future || !hasActual ? '—' : formatNumber(actual)}
      </p>
      <div className="h-1 mt-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full ${hit ? 'bg-emerald-500' : accentText ? `${accentText} bg-current opacity-70` : 'bg-teal-500'}`}
          style={{ width: `${fill}%` }}
        />
      </div>
      <p className="text-[8px] text-slate-400 dark:text-slate-500 mt-0.5 tabular-nums">{formatNumber(target)}</p>
    </div>
  )
}

export default function YtdReport({ ytd, plan, planName }) {
  const pc = plan?.accentClasses || {}

  if (!ytd) {
    return (
      <section>
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-1.5 h-5 rounded-full bg-gradient-to-b ${pc.bg || 'bg-teal-500'}`} />
          <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Year-to-Date</h2>
        </div>
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 p-6 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No year-to-date figures for {planName || 'this plan'} — the
            <span className="font-semibold"> YTD 2026</span> and <span className="font-semibold">TARGET 2026</span> tabs
            cover BIDA and FIBERX only, for 2026.
          </p>
        </div>
      </section>
    )
  }

  const { overall, monthIndex, months, year } = ytd
  const planBadge = overall.pctOfPlan != null ? getBadgeStyle(overall.pctOfPlan) : null
  const paceBadge = overall.pace ? getPaceBadgeStyle(overall.pace) : null
  const annualPct = overall.pct != null ? Math.min(overall.pct, 100) : 0
  const accentText = pc.text || 'text-teal-600 dark:text-teal-400'

  const behind = overall.deficit > 0
  const recordNote = ytd.closedRecordMonths?.length
    ? `${ytd.closedRecordMonths.map((index) => MONTH_LABELS[index]).join(', ')} ${year ?? ''} taken from the tracker's own record`
    : null

  return (
    <section>
      {/* Section header */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-3">
        <div className={`w-1.5 h-5 rounded-full bg-gradient-to-b ${pc.bg || 'bg-teal-500'}`} />
        <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Year-to-Date</h2>
        <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-[#0E1622] border border-slate-200 dark:border-slate-700/60 px-2.5 py-1 rounded-lg">
          {MONTH_LABELS[0]}–{MONTH_LABELS[monthIndex]} {year ?? ''}
        </span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          {ytd.monthsAfter > 0
            ? `${ytd.monthsAfter} month${ytd.monthsAfter === 1 ? '' : 's'} left`
            : 'final month of the year'}
        </span>
      </div>

      {/* Hero: actual against the plan to date */}
      <div className={`relative overflow-hidden rounded-2xl border p-5 mb-3 ${
        planBadge?.pulse ? 'bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/40 dark:to-emerald-900/20 border-emerald-200 dark:border-emerald-800/50'
          : planBadge?.label === 'LAG' ? 'bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/40 dark:to-amber-900/20 border-amber-200 dark:border-amber-800/50'
            : 'bg-gradient-to-br from-rose-50 to-rose-100/50 dark:from-rose-950/40 dark:to-rose-900/20 border-rose-200 dark:border-rose-800/50'
      }`}>
        <div className={`absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-20 ${
          planBadge?.pulse ? 'bg-emerald-400' : planBadge?.label === 'LAG' ? 'bg-amber-400' : 'bg-rose-400'
        }`} />

        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Against the plan to date</p>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className={`text-4xl sm:text-5xl font-black tracking-tight ${
                planBadge?.pulse ? 'text-emerald-600 dark:text-emerald-300'
                  : planBadge?.label === 'LAG' ? 'text-amber-600 dark:text-amber-300'
                    : 'text-rose-600 dark:text-rose-300'
              }`}>
                {overall.pctOfPlan != null ? overall.pctOfPlan.toFixed(1) : '—'}%
              </span>
              {planBadge && <Badge {...planBadge} />}
              {paceBadge && <Badge {...paceBadge} />}
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
              <span className="font-semibold text-slate-700 dark:text-slate-200">{formatNumber(overall.ytd)}</span> of{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-200">{formatNumber(overall.planToDate)}</span> planned
              {' · '}
              {behind
                ? <span className="font-semibold text-amber-600 dark:text-amber-400">{formatNumber(overall.deficit)} behind</span>
                : <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatNumber(-overall.deficit)} ahead</span>}
            </p>

            <p className={`text-[11px] font-semibold mt-1 ${paceBadge?.color || 'text-slate-500 dark:text-slate-400'}`}>
              {overall.pace
                ? `At ${formatNumber(Math.round(overall.paceMonthly))}/month, the year ends at ${formatNumber(Math.round(overall.projected))}`
                : `${formatNumber(Math.round(overall.projected))} projected by year-end`}
              {overall.projectedPct != null ? ` (${overall.projectedPct.toFixed(0)}% of target)` : ''}
            </p>
          </div>

          {/* Progress bar — against the annual target, the number actually being filled */}
          <div className="flex-1 max-w-xs">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Of annual target</span>
              <span className={`text-xs font-bold ${
                planBadge?.pulse ? 'text-emerald-600 dark:text-emerald-300'
                  : planBadge?.label === 'LAG' ? 'text-amber-600 dark:text-amber-300'
                    : 'text-rose-600 dark:text-rose-300'
              }`}>
                {overall.pct != null ? overall.pct.toFixed(1) : '0'}%
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-white/60 dark:bg-slate-800/60 overflow-hidden shadow-inner">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${
                  planBadge?.pulse ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                    : planBadge?.label === 'LAG' ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                      : 'bg-gradient-to-r from-rose-500 to-rose-400'
                }`}
                style={{ width: annualPct + '%' }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[9px] text-slate-400 dark:text-slate-500">0</span>
              <span className="text-[9px] text-slate-400 dark:text-slate-500">{formatNumber(overall.annualTarget)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 flex flex-col justify-between">
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">YTD Completed</p>
          <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">{formatNumber(overall.ytd)}</span>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
            {overall.completedMonths > 0
              ? `${formatNumber(Math.round(overall.paceMonthly))}/month across ${overall.completedMonths} finished month${overall.completedMonths === 1 ? '' : 's'}`
              : 'no finished month yet'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 flex flex-col justify-between">
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Annual Target</p>
          <span className={`text-3xl sm:text-4xl font-black tracking-tight ${accentText}`}>{formatNumber(overall.annualTarget)}</span>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
            {formatNumber(overall.planToDate)} planned through {MONTH_LABELS[monthIndex]}
          </p>
        </div>

        <div className={`rounded-2xl border p-5 flex flex-col justify-between ${
          overall.remaining > 0
            ? 'border-amber-200 dark:border-amber-800/50 bg-gradient-to-br from-amber-50/80 to-white dark:from-amber-950/20 dark:to-slate-900/60'
            : 'border-emerald-200 dark:border-emerald-800/50 bg-gradient-to-br from-emerald-50/80 to-white dark:from-emerald-950/20 dark:to-slate-900/60'
        }`}>
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Remaining</p>
          <span className={`text-3xl sm:text-4xl font-black tracking-tight ${
            overall.remaining > 0 ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-300'
          }`}>
            {formatNumber(overall.remaining)}
          </span>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
            {overall.remaining === 0 ? 'target reached' : 'installations to the annual target'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 flex flex-col justify-between">
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Required Pace</p>
          <span className={`text-3xl sm:text-4xl font-black tracking-tight ${accentText}`}>
            {overall.requiredPerMonth != null ? formatNumber(Math.ceil(overall.requiredPerMonth)) : '—'}
          </span>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
            {overall.requiredPerMonth != null
              ? `per month for the last ${ytd.monthsAfter} month${ytd.monthsAfter === 1 ? '' : 's'}`
              : 'no month left after this one'}
          </p>
        </div>
      </div>

      {/* Month strip */}
      <div className="mt-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2.5">
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Monthly Progress</p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">
            value each month delivered · target underneath
          </p>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {months.map((_, index) => (
            <MonthCell
              key={index}
              index={index}
              actual={overall.series.actual[index]}
              target={overall.series.target[index] || 0}
              future={index > monthIndex}
              accentText={pc.text}
            />
          ))}
        </div>
        {recordNote && (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 italic">{recordNote}</p>
        )}
      </div>
    </section>
  )
}
