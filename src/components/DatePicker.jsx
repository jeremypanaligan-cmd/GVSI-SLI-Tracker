/**
 * DatePicker — Dropdown date selector for daily data view.
 * Shows available dates with left/right navigation arrows.
 */
export default function DatePicker({ dates, selectedDate, onSelect, maxDate }) {
  if (!dates || dates.length === 0) return null

  const currentIndex = dates.indexOf(selectedDate)
  const hasPrev = currentIndex > 0
  const isAtMax = maxDate ? selectedDate === maxDate : false
  const hasNext = currentIndex < dates.length - 1 && !isAtMax

  const goPrev = () => { if (hasPrev) onSelect(dates[currentIndex - 1]) }
  const goNext = () => { if (hasNext) onSelect(dates[currentIndex + 1]) }

  return (
    <div className="flex items-center gap-2">
      {/* Previous arrow */}
      <button
        onClick={goPrev}
        disabled={!hasPrev}
        className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
        title="Previous day"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Date select dropdown */}
      <select
        value={selectedDate}
        onChange={(e) => onSelect(e.target.value)}
        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition appearance-none cursor-pointer min-w-[160px]"
      >
        {dates.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>

      {/* Next arrow */}
      <button
        onClick={goNext}
        disabled={!hasNext}
        className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
        title="Next day"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Date count badge */}
      <span className="text-[11px] text-slate-400 dark:text-slate-600 ml-1">
        {currentIndex + 1}/{dates.length}
      </span>
    </div>
  )
}
