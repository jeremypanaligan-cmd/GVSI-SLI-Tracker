import { getBadgeStyle, formatNumber } from '../utils/dataProcessor'

export default function ExecutiveOverview({ metrics, selectedDate, availableDates, onDateSelect, onGoToDetail }) {
  if (!metrics) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 flex items-center justify-center mb-5 shadow-inner">
          <svg className="w-10 h-10 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">No Data Available</h2>
        <p className="text-sm text-slate-400 dark:text-slate-500 max-w-xs">
          Click <span className="font-medium text-teal-600 dark:text-teal-400">Sync Data</span> to fetch the latest tracking information.
        </p>
      </div>
    )
  }

  const { mtd, daily } = metrics

  // MTD badge
  const mtdBadge = mtd.pct !== null && !isNaN(mtd.pct) ? getBadgeStyle(mtd.pct + '%') : null

  // Daily badge (for TOTAL COMPLETED highlight)
  const dailyCompleted = daily?.totalCompleted ?? 0

  return (
    <div className="max-w-[1400px] mx-auto px-3 sm:px-6 py-5 space-y-5">

      {/* ═══════════════ MTD PORTION ═══════════════ */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-teal-500 to-teal-600" />
          <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
            Month-to-Date
          </h2>
          <span className="text-[10px] font-medium text-slate-400 dark:text-slate-600 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
            {new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Hero: LAST % */}
          <div className={`relative overflow-hidden rounded-2xl border p-5 sm:col-span-1 ${
            mtdBadge?.pulse
              ? 'bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/40 dark:to-emerald-900/20 border-emerald-200 dark:border-emerald-800/50'
              : mtdBadge?.label === 'LAG'
                ? 'bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/40 dark:to-amber-900/20 border-amber-200 dark:border-amber-800/50'
                : 'bg-gradient-to-br from-rose-50 to-rose-100/50 dark:from-rose-950/40 dark:to-rose-900/20 border-rose-200 dark:border-rose-800/50'
          }`}>
            {/* Decorative circle */}
            <div className={`absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-20 ${
              mtdBadge?.pulse ? 'bg-emerald-400' : mtdBadge?.label === 'LAG' ? 'bg-amber-400' : 'bg-rose-400'
            }`} />
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 relative">
              Achievement Rate
            </p>
            <div className="relative flex items-baseline gap-2">
              <span className={`text-4xl sm:text-5xl font-black tracking-tight ${
                mtdBadge?.pulse ? 'text-emerald-600 dark:text-emerald-300'
                  : mtdBadge?.label === 'LAG' ? 'text-amber-600 dark:text-amber-300'
                    : 'text-rose-600 dark:text-rose-300'
              }`}>
                {mtd.pct !== null && !isNaN(mtd.pct) ? mtd.pct.toFixed(1) : '—'}%
              </span>
              {mtdBadge && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${mtdBadge.bg} ${mtdBadge.color} ${mtdBadge.border} self-center`}>
                  {mtdBadge.label}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 relative">
              {mtd.pct !== null && !isNaN(mtd.pct)
                ? mtd.pct >= 100
                  ? '🎉 Target achieved!'
                  : `${(100 - mtd.pct).toFixed(1)}% gap remaining`
                : 'Awaiting data'}
            </p>
          </div>

          {/* TOTAL COMPLETED */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 flex flex-col justify-between">
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">
              Total Completed
            </p>
            <div>
              <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
                {fmt(mtd.totalCompleted)}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
              of <span className="font-semibold text-slate-600 dark:text-slate-300">{fmt(mtd.target)}</span> target
            </p>
          </div>

          {/* TARGET */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 flex flex-col justify-between">
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">
              Monthly Target
            </p>
            <div>
              <span className="text-3xl sm:text-4xl font-black text-teal-600 dark:text-teal-400 tracking-tight">
                {fmt(mtd.target)}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
              {mtd.toGo > 0
                ? <><span className="font-semibold text-amber-600 dark:text-amber-400">{fmt(mtd.toGo)}</span> remaining</>
                : <span className="font-semibold text-emerald-600 dark:text-emerald-400">Target exceeded! ✓</span>
              }
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════════ DAILY PORTION ═══════════════ */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-violet-500 to-violet-600" />
          <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
            Daily To-Date
          </h2>
          {selectedDate && (
            <span className="text-[10px] font-medium text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-500/10 px-2 py-0.5 rounded-full border border-violet-200 dark:border-violet-500/20">
              {selectedDate}
            </span>
          )}
        </div>

        {daily ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <DailyMetricCard label="BF" value={fmt(daily.bf)} icon={<BFIcon />} />
            <DailyMetricCard label="INC" value={fmt(daily.inc)} icon={<INCIcon />} />
            <DailyMetricCard label="Comp from RJO" value={fmt(daily.completedFromRjo)} icon={<RJOIcon />} />

            {/* Highlighted: TOTAL COMPLETED */}
            <div className="col-span-2 sm:col-span-1 rounded-2xl border-2 border-teal-300 dark:border-teal-600 bg-gradient-to-br from-teal-50 to-teal-100/50 dark:from-teal-950/40 dark:to-teal-900/20 p-4 relative overflow-hidden">
              <div className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full bg-teal-400/10" />
              <p className="text-[10px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-widest mb-1 relative">
                Total Completed
              </p>
              <span className="text-2xl sm:text-3xl font-black text-teal-700 dark:text-teal-300 tracking-tight relative">
                {fmt(dailyCompleted)}
              </span>
              <p className="text-[10px] text-teal-500/70 dark:text-teal-400/50 mt-1 relative font-medium">
                BF + INC + RJO
              </p>
            </div>

            <DailyMetricCard label="Carry Over" value={fmt(daily.carryOver)} icon={<COIcon />} />
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 p-8 text-center">
            <svg className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm text-slate-400 dark:text-slate-500">
              No data for this date
            </p>
          </div>
        )}
      </section>

      {/* ═══════════════ VIEW BREAKDOWN ═══════════════ */}
      <button
        onClick={onGoToDetail}
        className="w-full flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 active:from-teal-700 active:to-teal-600 text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-teal-600/20 hover:shadow-xl hover:shadow-teal-500/30 hover:-translate-y-0.5"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
        View Provincial Breakdown
      </button>
    </div>
  )
}

// ==================== SUB-COMPONENTS ====================

function DailyMetricCard({ label, value, icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-slate-400 dark:text-slate-500">{icon}</span>
        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
          {label}
        </p>
      </div>
      <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
        {value}
      </span>
    </div>
  )
}

// ==================== MINI ICONS ====================

function BFIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  )
}

function INCIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function RJOIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  )
}

function COIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
  )
}

function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
}
