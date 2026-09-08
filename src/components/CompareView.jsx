/**
 * CompareView — Portfolio Compare Mode (Phase 3, F4).
 *
 * Renders all service plans (FIBERX / BIDA / SME) side-by-side as compact MTD
 * cards — achievement rate with badge + pace pill, total completed, target,
 * to go, total incoming — each in its plan accent color. A PORTFOLIO TOTALS
 * card below sums the numbers across plans.
 *
 * Data is a map: { [planId]: { mtd, raw, source, loading } } where `mtd` is
 * the parsed MTD data (parseMTDData) and `raw` the parsed RAW daily data.
 */
import { getBadgeStyle, getPaceBadgeStyle, projectRunRate, findLatestDataDate, getTodayStr } from '../utils/dataProcessor'
import { PLANS, PLAN_ORDER } from '../config/plans'

function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function Badge({ badge }) {
  if (!badge) return null
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.bg} ${badge.color} ${badge.border || ''}`}>
      {badge.pulse && <span className="w-1.5 h-1.5 rounded-full mr-1 bg-emerald-500 animate-pulse" />}
      {badge.label}
    </span>
  )
}

function PacePill({ pace }) {
  if (!pace) return null
  const badge = getPaceBadgeStyle(pace)
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.bg} ${badge.color} ${badge.border}`}>
      {badge.label}
    </span>
  )
}

function PlanCard({ planId, entry, selectedMonthYear, onOpenPlan }) {
  const plan = PLANS[planId]
  const pc = plan.accentClasses
  const mtd = entry?.mtd
  const ot = mtd?.overallTotal

  const pct = ot?.lastPct
  const totalCompleted = ot?.lastMtd
  const target = ot?.target
  const totalIncoming = ot?.totalIncoming
  const toGo = Math.max(0, (target || 0) - (totalCompleted || 0))

  const hasData = pct !== null && pct !== undefined && !isNaN(pct)
  const badge = hasData ? getBadgeStyle(pct + '%') : null
  const progressPct = hasData ? Math.min(pct, 100) : 0

  const latestDate = findLatestDataDate(entry?.raw)
  const projection = (totalCompleted != null && target != null && !isNaN(totalCompleted) && !isNaN(target) && target > 0)
    ? projectRunRate(totalCompleted, target, latestDate || getTodayStr())
    : null

  return (
    <div className={`relative rounded-2xl border border-slate-200 dark:border-slate-800/60 bg-white dark:bg-[#0E1622] overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${pc.badge}`}>
      {/* Accent top bar */}
      <div className={`h-1.5 w-full ${pc.bg}`} />

      <div className="p-4 sm:p-5 flex-1 flex flex-col">
        {/* Plan identity */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className={`text-base font-black tracking-tight ${pc.text}`}>{plan.name}</h3>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">{plan.fullName}</p>
          </div>
          <span className={`w-2.5 h-2.5 rounded-full ${pc.bg} opacity-70`} />
        </div>

        {!hasData ? (
          <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
            <svg className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2 animate-spin" style={{ animationDuration: '2s' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <p className="text-xs text-slate-400 dark:text-slate-500">Loading data…</p>
          </div>
        ) : (
          <>
            {/* Achievement rate */}
            <div className="mb-3">
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Achievement Rate</p>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className={`text-3xl sm:text-4xl font-black tracking-tight ${badge?.color || 'text-slate-900 dark:text-white'}`}>
                  {pct.toFixed(1)}%
                </span>
                <Badge badge={badge} />
                <PacePill pace={projection?.pace} />
              </div>
              {projection && (
                <p className={`text-[11px] font-semibold mt-1 ${getPaceBadgeStyle(projection.pace)?.color || 'text-slate-500 dark:text-slate-400'}`}>
                  Projected: {fmt(Math.round(projection.projected))}
                </p>
              )}
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800/60 overflow-hidden mb-4">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${pc.bg}`}
                style={{ width: progressPct + '%' }}
              />
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
              <div>
                <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Total Completed</p>
                <p className="text-lg font-black text-slate-900 dark:text-white leading-tight">{fmt(totalCompleted)}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">of {fmt(target)} target</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">To Go</p>
                <p className={`text-lg font-black leading-tight ${toGo > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {fmt(toGo)}
                </p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">incoming: {fmt(totalIncoming)}</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Open plan */}
      <button
        onClick={() => onOpenPlan(planId)}
        className={`w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold ${pc.bg} text-white hover:opacity-90 active:opacity-100 transition-opacity`}
      >
        Open {plan.name}
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  )
}

function PortfolioTotals({ data, selectedMonthYear }) {
  let totalCompleted = 0
  let target = 0
  let toGo = 0
  let totalIncoming = 0
  let plansWithData = 0

  for (const planId of PLAN_ORDER) {
    const ot = data?.[planId]?.mtd?.overallTotal
    if (ot && ot.lastPct !== null && ot.lastPct !== undefined && !isNaN(ot.lastPct)) {
      totalCompleted += ot.lastMtd || 0
      target += ot.target || 0
      toGo += Math.max(0, (ot.target || 0) - (ot.lastMtd || 0))
      totalIncoming += ot.totalIncoming || 0
      plansWithData++
    }
  }

  if (plansWithData === 0) return null

  const pct = target > 0 ? (totalCompleted / target) * 100 : null
  const badge = pct !== null ? getBadgeStyle(pct + '%') : null

  return (
    <div className="rounded-2xl border-2 border-slate-300 dark:border-slate-700/60 bg-slate-50 dark:bg-[#0E1622] p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-slate-500 to-slate-600" />
          <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
            Portfolio Totals {selectedMonthYear ? `— ${selectedMonthYear}` : ''}
          </h3>
        </div>
        <Badge badge={badge} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Achievement</p>
          <p className={`text-xl sm:text-2xl font-black ${badge?.color || 'text-slate-900 dark:text-white'}`}>{pct !== null ? pct.toFixed(1) + '%' : '—'}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Total Completed</p>
          <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">{fmt(totalCompleted)}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Monthly Target</p>
          <p className="text-xl sm:text-2xl font-black text-teal-600 dark:text-teal-400">{fmt(target)}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">To Go</p>
          <p className={`text-xl sm:text-2xl font-black ${toGo > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{fmt(toGo)}</p>
        </div>
      </div>

      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-3">
        Total incoming this month: <span className="font-semibold text-slate-600 dark:text-slate-300">{fmt(totalIncoming)}</span> across {plansWithData} plan{plansWithData > 1 ? 's' : ''}
      </p>
    </div>
  )
}

export default function CompareView({ data, selectedMonthYear, onOpenPlan }) {
  return (
    <div className="max-w-[1400px] mx-auto px-3 sm:px-6 py-5 space-y-5">
      {/* Section header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-x-3 gap-y-2">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-violet-500 to-violet-600" />
          <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Portfolio Compare</h2>
        </div>
        <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-[#0E1622] border border-slate-200 dark:border-slate-700/60 px-3 py-1.5 rounded-lg self-start sm:self-auto">
          {selectedMonthYear}
        </span>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 items-stretch">
        {PLAN_ORDER.map((planId) => (
          <PlanCard key={planId} planId={planId} entry={data?.[planId]} selectedMonthYear={selectedMonthYear} onOpenPlan={onOpenPlan} />
        ))}
      </div>

      {/* Portfolio totals */}
      <PortfolioTotals data={data} selectedMonthYear={selectedMonthYear} />
    </div>
  )
}