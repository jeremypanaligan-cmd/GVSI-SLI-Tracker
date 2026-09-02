import { getBadgeStyle, formatNumber, getTodayStr } from '../utils/dataProcessor'

export default function ExecutiveOverview({ metrics, selectedDate, availableDates, onDateSelect, onMonthSelect, selectedMonthYear, availableMonths, onGoToDetail, plan }) {
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
  const mtdBadge = mtd.pct !== null && !isNaN(mtd.pct) ? getBadgeStyle(mtd.pct + '%') : null
  const progressPct = mtd.pct !== null && !isNaN(mtd.pct) ? Math.min(mtd.pct, 100) : 0
  const dailyCompleted = daily?.totalCompleted ?? 0

  const currentDateIdx = availableDates ? availableDates.indexOf(selectedDate) : -1
  const hasPrev = currentDateIdx > 0
  const isToday = selectedDate === getTodayStr()
  const pc = plan?.accentClasses || {}
  const px = plan?.accentHex || '#0d9488'
  const hasNext = availableDates && currentDateIdx < availableDates.length - 1 && !isToday

  return (
    <div className="max-w-[1400px] mx-auto px-3 sm:px-6 py-5 space-y-5">

      {/* MTD PORTION */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-1.5 h-5 rounded-full bg-gradient-to-b ${pc.bg || 'bg-teal-500'}`} />
          <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Month-to-Date</h2>
          {availableMonths && availableMonths.length > 1 ? (
            <div className="relative">
              <select
                value={selectedMonthYear || new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                onChange={(e) => onMonthSelect && onMonthSelect(e.target.value)}
                className="text-[11px] font-semibold px-4 py-1.5 pr-8 rounded-lg bg-slate-100 dark:bg-[#0E1622] border border-slate-200 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 transition appearance-none cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800"
              >
                {availableMonths.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-slate-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          ) : (
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-[#0E1622] border border-slate-200 dark:border-slate-700/60 px-3 py-1.5 rounded-lg">
              {selectedMonthYear || new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}
            </span>
          )}
        </div>

        {/* Hero: Achievement Rate + Progress Bar */}
        <div className={`relative overflow-hidden rounded-2xl border p-5 mb-3 ${
          mtdBadge?.pulse ? 'bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/40 dark:to-emerald-900/20 border-emerald-200 dark:border-emerald-800/50'
            : mtdBadge?.label === 'LAG' ? 'bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/40 dark:to-amber-900/20 border-amber-200 dark:border-amber-800/50'
              : 'bg-gradient-to-br from-rose-50 to-rose-100/50 dark:from-rose-950/40 dark:to-rose-900/20 border-rose-200 dark:border-rose-800/50'
        }`}>
          <div className={`absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-20 ${
            mtdBadge?.pulse ? 'bg-emerald-400' : mtdBadge?.label === 'LAG' ? 'bg-amber-400' : 'bg-rose-400'
          }`} />
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 relative">
            <div>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Achievement Rate</p>
              <div className="flex items-baseline gap-2">
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
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                {mtd.pct !== null && !isNaN(mtd.pct)
                  ? mtd.pct >= 100 ? (<span className="inline-flex items-center gap-1"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> Target achieved</span>) : `${(100 - mtd.pct).toFixed(1)}% gap remaining`
                  : 'Awaiting data'}
              </p>
            </div>
            {/* Progress Bar */}
            <div className="flex-1 max-w-xs">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Progress</span>
                <span className={`text-xs font-bold ${
                  mtdBadge?.pulse ? 'text-emerald-600 dark:text-emerald-300'
                    : mtdBadge?.label === 'LAG' ? 'text-amber-600 dark:text-amber-300'
                      : 'text-rose-600 dark:text-rose-300'
                }`}>
                  {mtd.pct !== null && !isNaN(mtd.pct) ? mtd.pct.toFixed(1) : '0'}%
                </span>
              </div>
              <div className="w-full h-3 rounded-full bg-white/60 dark:bg-slate-800/60 overflow-hidden shadow-inner">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${
                    mtdBadge?.pulse ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                      : mtdBadge?.label === 'LAG' ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                        : 'bg-gradient-to-r from-rose-500 to-rose-400'
                  }`}
                  style={{ width: progressPct + '%' }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[9px] text-slate-400 dark:text-slate-500">0%</span>
                <span className="text-[9px] text-slate-400 dark:text-slate-500">100%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom row: Total Completed + Target + To Go */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="group rounded-xl border border-slate-200 dark:border-slate-800/60 bg-white dark:bg-[#0E1622] p-4 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 dark:hover:border-slate-700/60 hover:shadow-md min-h-[100px]">
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Total Incoming</p>
            <span className="text-2xl sm:text-3xl font-black text-violet-600 dark:text-violet-400 tracking-tight">{fmt(mtd.totalIncoming)}</span>
            <p className="text-[11px] text-slate-500 mt-1.5">incoming tickets</p>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 flex flex-col justify-between">
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Total Completed</p>
            <div>
              <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">{fmt(mtd.totalCompleted)}</span>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
              of <span className="font-semibold text-slate-600 dark:text-slate-300">{fmt(mtd.target)}</span> target
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 flex flex-col justify-between">
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Monthly Target</p>
            <div>
              <span className={`text-3xl sm:text-4xl font-black tracking-tight ${pc.text || 'text-teal-600 dark:text-teal-400'}`}>{fmt(mtd.target)}</span>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
              {mtd.variance >= 0
                ? <span className="font-semibold text-emerald-600 dark:text-emerald-400">Exceeded by {fmt(mtd.variance)}</span>
                : <span className="font-semibold text-amber-600 dark:text-amber-400">{fmt(Math.abs(mtd.variance))} behind</span>
              }
            </p>
          </div>

          <div className={`rounded-2xl border p-5 flex flex-col justify-between ${
            mtd.toGo > 0
              ? 'border-amber-200 dark:border-amber-800/50 bg-gradient-to-br from-amber-50/80 to-white dark:from-amber-950/20 dark:to-slate-900/60'
              : 'border-emerald-200 dark:border-emerald-800/50 bg-gradient-to-br from-emerald-50/80 to-white dark:from-emerald-950/20 dark:to-slate-900/60'
          }`}>
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">To Go</p>
            <div>
              <span className={`text-3xl sm:text-4xl font-black tracking-tight ${
                mtd.toGo > 0 ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-300'
              }`}>
                {mtd.toGo > 0 ? fmt(mtd.toGo) : '0'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
              {mtd.toGo > 0
                ? <span className="font-semibold text-amber-600 dark:text-amber-400">remaining installations</span>
                : <span className="font-semibold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> Target reached!</span>
              }
            </p>
          </div>
        </div>
      </section>

      {/* DAILY TO-DATE PORTION */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-violet-500 to-violet-600" />
            <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Daily To-Date</h2>
          </div>
          {availableDates && availableDates.length > 0 && (
            <div className="flex items-center gap-1.5">
              <button onClick={() => hasPrev && onDateSelect(availableDates[currentDateIdx - 1])} disabled={!hasPrev}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition" title="Previous day">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <select value={selectedDate} onChange={(e) => onDateSelect(e.target.value)}
                className="px-2 py-1 rounded-lg text-[11px] font-medium bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-500/40 transition appearance-none cursor-pointer">
                {availableDates.map((d) => (<option key={d} value={d}>{d}</option>))}
              </select>
              <button onClick={() => hasNext && onDateSelect(availableDates[currentDateIdx + 1])} disabled={!hasNext}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition" title="Next day">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
              <span className="text-[10px] text-slate-400 dark:text-slate-600 ml-0.5">{currentDateIdx + 1}/{availableDates.length}</span>
            </div>
          )}
        </div>

        {daily ? (
          <div className="flex flex-wrap items-stretch justify-center gap-3">
            {/* LEFT GROUP: BF + INC */}
            <DailyMetricCard label="BF" value={fmt(daily.bf)} icon={<BFIcon />} subtitle="Brought forward"  />
            <DailyMetricCard label="INC" value={fmt(daily.inc)} icon={<INCIcon />} subtitle="Incoming" />

            {/* VERTICAL DIVIDER */}
            <div className="hidden sm:flex w-px bg-slate-200 dark:bg-slate-700/60 self-stretch my-1 mx-0.5" />

            {/* RIGHT GROUP: COMP ABL + COMP RJO + RJO INCOMING + RJO FPMos + TOTAL RJO */}
            <DailyMetricCard label="COMP ABL" value={fmt(daily.activeBacklog)} icon={<BacklogIcon />} subtitle="BF + INC" />
            <DailyMetricCard label="COMP RJO" value={fmt(daily.completedFromRjo)} icon={<RJOIcon />} subtitle="From previous months" />
            <DailyMetricCard label="RJO INCOMING" value={fmt(daily.rjoIncoming)} icon={<RJOIcon2 />} subtitle="Current month" />
            <DailyMetricCard label="RJO FPMos" value={fmt(daily.rjoRedispatched)} icon={<RJOIcon2 />} subtitle="From previous months" />
            <DailyMetricCard label="TOTAL RJO" value={fmt(daily.totalRjo)} icon={<RJOIcon />} />

            {/* TOTAL COMPLETED — Highlighted */}
            <div className={`rounded-2xl border-2 ${pc.badge || 'border-teal-300 dark:border-teal-600'} bg-gradient-to-br from-teal-50 to-teal-100/50 dark:from-teal-950/40 dark:to-teal-900/20 p-4 relative overflow-hidden min-w-[140px] flex-1 sm:flex-none sm:w-[180px]`}>
              <div className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full bg-teal-400/10" />
              <div className="flex items-center gap-2 mb-1 relative">
                <span className={pc.text || 'text-teal-500 dark:text-teal-400'}><TotalIcon /></span>
                <p className={`text-[10px] font-bold uppercase tracking-widest ${pc.text || 'text-teal-600 dark:text-teal-400'}`}>Total Completed</p>
              </div>
              <span className={`text-2xl sm:text-3xl font-black tracking-tight relative ${pc.text || 'text-teal-700 dark:text-teal-300'}`}>{fmt(dailyCompleted)}</span>
              <p className={`text-[10px] mt-1 relative font-medium ${pc.text || 'text-teal-500/70 dark:text-teal-400/50'}`}>INC + BF + CRJO</p>
            </div>

            <DailyMetricCard label="Carry Over" value={fmt(daily.carryOver)} icon={<COIcon />} />
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 p-8 text-center">
            <svg className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm text-slate-400 dark:text-slate-500">No data for this date</p>
          </div>
        )}
      </section>

      {/* VIEW BREAKDOWN */}
      <button onClick={onGoToDetail}
        className="group w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl bg-white dark:bg-[#0E1622] border border-slate-200 dark:border-slate-800/60 hover:border-emerald-300 dark:hover:border-emerald-500/40 hover:shadow-md hover:shadow-emerald-500/5 dark:hover:shadow-emerald-500/5 text-slate-700 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-300 font-semibold text-sm transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0">
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800/60 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-500/10 transition-colors duration-200">
          <svg className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        </span>
        <span>View Provincial Breakdown</span>
        <svg className="w-4 h-4 text-slate-400 dark:text-slate-500 group-hover:text-emerald-500 dark:group-hover:text-emerald-400 group-hover:translate-x-1 transition-all duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  )
}

function DailyMetricCard({ label, value, icon, subtitle }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 hover:shadow-md transition-shadow duration-200 min-w-[120px] flex-1 sm:flex-none sm:w-[150px]">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-slate-400 dark:text-slate-500">{icon}</span>
        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest leading-tight">{label}</p>
      </div>
      <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">{value}</span>
      {subtitle && <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1 font-medium italic">{subtitle}</p>}
    </div>
  )
}

function BFIcon() {
  return (<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>)
}
function INCIcon() {
  return (<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>)
}
function BacklogIcon() {
  return (<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>)
}
function RJOIcon() {
  return (<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>)
}
function RJOIcon2() {
  return (<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /><circle cx="12" cy="12" r="3" /></svg>)
}
function TotalIcon() {
  return (<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>)
}
function COIcon() {
  return (<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>)
}

function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
}
