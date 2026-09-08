import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { formatNumber, computeAreaPace } from '../utils/dataProcessor'

/**
 * Light-only pace badge styles for the report sheet. The sheet is always white,
 * so we must NOT reuse the app's dark: variants — in dark mode those would render
 * pale text on a white background when printed.
 */
const REPORT_PACE_STYLE = {
  'on-pace': { bg: 'bg-emerald-100', color: 'text-emerald-700', border: 'border-emerald-300' },
  behind: { bg: 'bg-amber-100', color: 'text-amber-700', border: 'border-amber-300' },
  critical: { bg: 'bg-rose-100', color: 'text-rose-700', border: 'border-rose-300' },
}

/**
 * ExecutiveReportModal — one-click C-suite report (print / Save as PDF).
 *
 * Renders a print-optimized one-pager for the active plan:
 *   MTD hero KPIs + MoM delta, daily snapshot, and ranked provincial table
 *   (top movers + stragglers). The modal is portaled to document.body so a
 *   @media print rule can hide the app shell and print only this sheet.
 *
 * While open, body gets class `report-open`; `window.print()` then outputs
 * exactly the report sheet (see index.css @media print).
 */
export default function ExecutiveReportModal({
  plan,
  metrics,
  selectedDate,
  selectedMonthYear,
  areas = [],
  latestDataDate,
  momDelta,
  onClose,
}) {
  useEffect(() => {
    document.body.classList.add('report-open')
    const onKey = (e) => e.key === 'Escape' && onClose && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.classList.remove('report-open')
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  if (!plan || !metrics) return null

  const { mtd, daily } = metrics
  const pc = plan.accentClasses || {}

  // Provincial ranking by LAST MTD (desc); top 5 movers + bottom 5 stragglers.
  const ranked = (areas || [])
    .filter((a) => a && typeof a.lastMtd === 'number' && !isNaN(a.lastMtd))
    .sort((a, b) => (b.lastMtd || 0) - (a.lastMtd || 0))

  const take = ranked.slice(0, 5)
  const bottom = ranked.slice(-5).reverse()
  const rankedProvinces = []
  for (const r of take) if (!rankedProvinces.includes(r)) rankedProvinces.push(r)
  for (const r of bottom) if (!rankedProvinces.includes(r)) rankedProvinces.push(r)

  const now = new Date()

  const ach = mtd.pct != null && !isNaN(mtd.pct) ? mtd.pct : null

  const kpi = [
    { label: 'Achievement Rate', value: ach != null ? `${ach.toFixed(1)}%` : '—', sub: momDelta ? `${momDelta.improved ? '▲' : '▼'} ${Math.abs(momDelta.deltaPts).toFixed(1)} pts vs ${momDelta.prevMonth}` : null },
    { label: 'Total Completed', value: mtd.totalCompleted != null ? formatNumber(mtd.totalCompleted) : '—', sub: `of ${formatNumber(mtd.target)} target` },
    { label: 'Total Incoming', value: mtd.totalIncoming != null ? formatNumber(mtd.totalIncoming) : '—', sub: 'month-to-date tickets' },
    { label: 'To Go', value: mtd.toGo > 0 ? formatNumber(mtd.toGo) : '0', sub: mtd.toGo > 0 ? 'remaining to target' : 'target reached ✓' },
  ]

  const dailyRow = [
    { label: 'BF', v: daily?.bf, sub: 'Brought forward' },
    { label: 'INC', v: daily?.inc, sub: 'Incoming' },
    { label: 'COMP ABL', v: daily?.activeBacklog, sub: 'BF + INC' },
    { label: 'COMP RJO', v: daily?.completedFromRjo, sub: 'Prev. months' },
    { label: 'TOTAL RJO', v: daily?.totalRjo, sub: 'RJO total' },
    { label: 'COMPLETED', v: daily?.totalCompleted, sub: 'daily' },
    { label: 'CARRY OVER', v: daily?.carryOver, sub: 'CO' },
  ]

  return createPortal(
    <div className="report-overlay fixed inset-0 z-[80] bg-slate-900/70 dark:bg-black/70 backdrop-blur-sm overflow-y-auto">
      {/* Close + print actions (hidden on paper) */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-slate-200 dark:border-slate-700/60">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Executive Report — {plan.fullName}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-white text-xs font-semibold transition hover:opacity-90"
            style={{ backgroundColor: plan.accentHex }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4H7v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print / Save as PDF
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Close
          </button>
        </div>
      </div>

      {/* ── Print sheet ── */}
      <div className="report-sheet max-w-3xl mx-auto my-4 sm:my-8 bg-white text-slate-900 rounded-xl shadow-2xl overflow-hidden">
        {/* Brand header */}
        <div className="px-8 py-6 border-b border-slate-200">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-white text-sm tracking-tight"
                style={{ backgroundColor: plan.accentHex }}
              >
                SLI
              </div>
              <div>
                <h1 className="text-lg font-black tracking-tight text-slate-900">GVSI SLI Tracker</h1>
                <p className="text-[11px] text-slate-500 font-semibold">{plan.fullName}</p>
                <p className="text-[10px] text-slate-400">Service Line Installation — Executive Report</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-slate-700">{selectedMonthYear}</p>
              <p className="text-[11px] text-slate-500">Data as of {selectedDate}</p>
              <p className="text-[10px] text-slate-400">Generated {now.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</p>
            </div>
          </div>
        </div>

        {/* MTD KPI grid */}
        <div className="report-block px-8 py-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Month-to-Date</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {kpi.map((k) => (
              <div key={k.label} className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{k.label}</p>
                <p className="text-xl font-black text-slate-900 mt-0.5">{k.value}</p>
                {k.sub && <p className={`text-[9px] font-medium mt-0.5 ${k.label === 'Achievement Rate' && momDelta ? (momDelta.improved ? 'text-emerald-600' : 'text-rose-600') : 'text-slate-400'}`}>{k.sub}</p>}
              </div>
            ))}
          </div>
        </div>

        {/* Daily snapshot */}
        {daily && (
          <div className="report-block px-8 py-5 border-t border-slate-200">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Daily Snapshot — {selectedDate}</p>
            <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
              {dailyRow.map((d) => (
                <div key={d.label} className="rounded-lg border border-slate-200 px-2.5 py-2 text-center">
                  <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">{d.label}</p>
                  <p className="text-base font-black text-slate-900">{d.v != null && !isNaN(d.v) ? formatNumber(d.v) : '—'}</p>
                  <p className="text-[8px] text-slate-400 truncate">{d.sub}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Provincial ranking */}
        <div className="report-block px-8 py-5 border-t border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Provincial Standing</p>
            <p className="text-[9px] text-slate-400">Top movers &amp; stragglers — MTD</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b-2 border-slate-200">
                <th className="pb-2 text-[9px] font-bold uppercase tracking-wider text-slate-400">Area</th>
                <th className="pb-2 text-right text-[9px] font-bold uppercase tracking-wider text-slate-400">MTD Comp.</th>
                <th className="pb-2 text-right text-[9px] font-bold uppercase tracking-wider text-slate-400">Target</th>
                <th className="pb-2 text-right text-[9px] font-bold uppercase tracking-wider text-slate-400">Ach. %</th>
                <th className="pb-2 text-center text-[9px] font-bold uppercase tracking-wider text-slate-400">Pace</th>
              </tr>
            </thead>
            <tbody>
              {rankedProvinces.length === 0 && (
                <tr><td colSpan={5} className="py-4 text-center text-xs text-slate-400">No provincial MTD data available.</td></tr>
              )}
              {rankedProvinces.map((a, i) => {
                const isBottom = bottom.includes(a) && !take.includes(a)
                const proj = latestDataDate ? computeAreaPace(a, latestDataDate) : null
                const badge = proj ? REPORT_PACE_STYLE[proj.pace] || null : null
                const pct = a.lastPct != null && !isNaN(a.lastPct) ? a.lastPct : null
                return (
                  <tr key={a.area} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3">
                      <span className={`inline-flex items-center gap-2 font-semibold text-slate-700 ${isBottom ? 'text-rose-700' : ''}`}>
                        <span className={`w-1 h-4 rounded-full ${isBottom ? 'bg-rose-400' : i < take.length ? (pc.bg || 'bg-teal-500') : 'bg-slate-200'}`} />
                        {a.area}
                      </span>
                    </td>
                    <td className="py-2 text-right font-bold text-slate-900">{formatNumber(a.lastMtd)}</td>
                    <td className="py-2 text-right text-slate-500">{formatNumber(a.target)}</td>
                    <td className={`py-2 text-right font-bold ${pct != null ? (pct >= 100 ? 'text-emerald-700' : pct >= 80 ? 'text-amber-600' : 'text-slate-700') : 'text-slate-400'}`}>
                      {pct != null ? `${pct.toFixed(2)}%` : '—'}
                    </td>
                    <td className="py-2 text-center">
                      {badge ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border ${badge.bg} ${badge.color} ${badge.border}`}>
                          {badge.label}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="report-block px-8 py-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[9px] text-slate-400">Developed by <span className="font-bold">GVSI Dev</span> • GallopVision Services, Inc.</p>
          <p className="text-[9px] text-slate-400">Figures pulled live from the {plan.name} SLI tracker database.</p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
