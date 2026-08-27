import { getBadgeStyle, formatNumber } from '../utils/dataProcessor'

export default function ExecutiveOverview({ metrics, onGoToDetail }) {
  if (!metrics) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <p className="text-slate-500">No overall data available. Sync data first.</p>
      </div>
    )
  }

  const badge = metrics.pct !== null ? getBadgeStyle(metrics.pct + '%') : null

  return (
    <div className="max-w-[1200px] mx-auto px-3 sm:px-6 py-6 space-y-6">
      {/* Hero KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KPICard
          label="Target Completion"
          value={metrics.pct !== null ? metrics.pct.toFixed(1) + '%' : '—'}
          sublabel={badge ? badge.label : ''}
          badge={badge}
          large
        />
        <KPICard
          label="To Go"
          value={formatKPI(metrics.toGo)}
          sublabel="remaining quota"
          accent="cyan"
        />
        <KPICard
          label="Completed Total"
          value={formatKPI(metrics.completedTotal)}
          sublabel={`${metrics.completedFromTotal || 0} tot + ${metrics.completedFromRJO || 0} rjo`}
          accent="emerald"
        />
        <KPICard
          label="Active Gross Load"
          value={formatKPI(metrics.total)}
          sublabel={`BF ${metrics.bf || 0} + INC ${metrics.inc || 0}`}
          accent="slate"
        />
      </div>

      {/* Summary Operations Matrix */}
      <div className="bg-slate-900/60 rounded-2xl border border-slate-800 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-3 border-b border-slate-800">
          <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
            Overall Operations Summary
          </h2>
        </div>
        <div className="p-4 sm:p-6">
          <div className="mb-5">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Workload</p>
            <div className="grid grid-cols-3 gap-3">
              <MetricBox label="BF" value={formatKPI(metrics.bf)} />
              <MetricBox label="INC" value={formatKPI(metrics.inc)} />
              <MetricBox label="TOTAL" value={formatKPI(metrics.total)} bold />
            </div>
          </div>

          <div className="mb-5">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Output</p>
            <div className="grid grid-cols-3 gap-3">
              <MetricBox label="Completed" value={formatKPI(metrics.completedTotal)} accent="emerald" />
              <MetricBox label="RJO" value={formatKPI(metrics.rjo)} />
              <MetricBox label="Carry Over" value={formatKPI(metrics.carryOver)} />
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Monthly Progress</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <MetricBox label="MTD" value={formatKPI(metrics.mtd)} bold accent="cyan" />
              <MetricBox label="Target" value={formatKPI(metrics.target)} />
              <div className="rounded-xl bg-slate-800/50 p-3 text-center">
                <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1">%</p>
                {badge ? (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-bold border ${badge.bg} ${badge.color} ${badge.border} ${badge.pulse ? 'badge-hit' : ''}`}>
                    {metrics.pct.toFixed(1)}%
                    <span className={`text-[9px] opacity-70 ${badge.color}`}>{badge.label}</span>
                  </span>
                ) : (
                  <p className="text-lg font-bold text-white">—</p>
                )}
              </div>
              <MetricBox label="Variance" value={formatKPI(metrics.variance)} />
              <MetricBox label="To Go" value={formatKPI(metrics.toGo)} bold accent="cyan" />
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-slate-900/60 rounded-2xl border border-slate-800 shadow-sm p-4 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
            MTD Progress vs Target
          </h2>
          <span className="text-xs text-slate-500">
            {formatKPI(metrics.mtd)} / {formatKPI(metrics.target)}
          </span>
        </div>
        <div className="w-full h-4 rounded-full bg-slate-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              badge?.pulse
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                : badge?.label === 'LAG'
                  ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                  : 'bg-gradient-to-r from-rose-500 to-rose-400'
            }`}
            style={{ width: `${Math.min(metrics.pct || 0, 100)}%` }}
          />
        </div>
        <p className="text-xs text-slate-500 mt-2">
          {metrics.pct !== null
            ? metrics.pct >= 100
              ? `Target achieved — ${metrics.pct.toFixed(1)}% completion`
              : `${(100 - metrics.pct).toFixed(1)}% gap remaining to hit monthly target`
            : 'Awaiting data'}
        </p>
      </div>

      {/* View Detail Button */}
      <button
        onClick={onGoToDetail}
        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-teal-600/20 hover:shadow-teal-500/30"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
        View Provincial Breakdown
      </button>
    </div>
  )
}

function KPICard({ label, value, sublabel, badge, large, accent }) {
  const accentColors = {
    cyan: 'border-l-teal-500',
    emerald: 'border-l-emerald-500',
    slate: 'border-l-slate-500',
  }
  const borderClass = accent ? accentColors[accent] || '' : ''

  return (
    <div className={`bg-slate-900/60 rounded-2xl border border-slate-800 shadow-sm p-4 ${borderClass ? 'border-l-4 ' + borderClass : ''}`}>
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      {badge ? (
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-bold border ${badge.bg} ${badge.color} ${badge.border} ${badge.pulse ? 'badge-hit' : ''} ${large ? 'text-2xl' : 'text-xl'}`}>
          {value}
          {badge.label && <span className={`text-[9px] opacity-70 ${badge.color}`}>{badge.label}</span>}
        </span>
      ) : (
        <p className={`${large ? 'text-3xl' : 'text-2xl'} font-black text-white leading-tight`}>{value}</p>
      )}
      {sublabel && <p className="text-[11px] text-slate-500 mt-1">{sublabel}</p>}
    </div>
  )
}

function MetricBox({ label, value, bold, accent }) {
  const accentColors = {
    cyan: 'text-teal-400',
    emerald: 'text-emerald-400',
  }

  return (
    <div className="rounded-xl bg-slate-800/50 p-3 text-center">
      <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1">{label}</p>
      <p className={`${bold ? 'text-xl font-black' : 'text-lg font-bold'} ${accent ? accentColors[accent] : 'text-white'}`}>
        {value}
      </p>
    </div>
  )
}

function formatKPI(n) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return formatNumber(String(n), 'MTD')
}
