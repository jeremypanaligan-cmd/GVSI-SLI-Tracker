/**
 * DatePicker — Calendar grid date selector for daily data view.
 * Desktop: inline popover dropdown beneath trigger button.
 * Mobile (< sm): centered modal overlay with frosted backdrop.
 */
import { useState, useRef, useEffect } from 'react'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function parseDate(str) {
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

/** Display format: MMM d, yyyy */
function formatDisplay(str) {
  const d = parseDate(str)
  if (!d) return str || 'Select date'
  const mmm = MONTHS[d.getMonth()].slice(0, 3)
  const day = d.getDate()
  const yyyy = d.getFullYear()
  return `${mmm} ${day}, ${yyyy}`
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay()
}

export default function DatePicker({ dates, selectedDate, onSelect, maxDate, latestDataDate }) {
  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState(() => {
    const sel = parseDate(selectedDate)
    if (sel) return { year: sel.getFullYear(), month: sel.getMonth() }
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const ref = useRef(null)

  // Build lookup sets
  const availableSet = new Set()
  const availableDateObjs = new Map()
  ;(dates || []).forEach(d => {
    const obj = parseDate(d)
    if (obj) {
      const key = `${obj.getFullYear()}-${obj.getMonth()}-${obj.getDate()}`
      availableSet.add(key)
      availableDateObjs.set(key, d)
    }
  })

  // Update viewMonth when selectedDate changes externally
  useEffect(() => {
    const sel = parseDate(selectedDate)
    if (sel) setViewMonth({ year: sel.getFullYear(), month: sel.getMonth() })
  }, [selectedDate])

  // Close on outside click (desktop popover only)
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Lock body scroll when mobile modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [open])

  if (!dates || dates.length === 0) return null

  const currentIndex = dates.indexOf(selectedDate)
  const hasPrev = currentIndex > 0
  // hasNext: there is a later date in the array AND (no maxDate OR maxDate is not in array OR we're not past the last available date)
  const lastAvailableIdx = dates.length - 1
  const maxDateIdx = maxDate ? dates.indexOf(maxDate) : -1
  // If maxDate exists in the array, don't go past it; otherwise allow full range
  const upperBound = maxDateIdx >= 0 ? maxDateIdx : lastAvailableIdx
  const hasNext = currentIndex < upperBound
  // Badge shows ONLY on the latest date that actually has data input (INC > 0).
  // Falls back to the last array entry when no explicit latestDataDate is given.
  const latestDate = latestDataDate || (dates.length > 0 ? dates[dates.length - 1] : null)
  const isLatest = latestDate != null && selectedDate === latestDate

  const goPrev = () => { if (hasPrev) onSelect(dates[currentIndex - 1]) }
  const goNext = () => { if (hasNext) onSelect(dates[currentIndex + 1]) }

  // Calendar grid
  const { year, month } = viewMonth
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)
  const today = new Date()

  const calendarDays = []
  for (let i = 0; i < firstDay; i++) calendarDays.push(null)
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d)

  const selectedObj = parseDate(selectedDate)

  // --- Shared calendar panel content ---
  const CalendarPanel = ({ isModal }) => (
    <div className={`bg-white dark:bg-slate-800/95 backdrop-blur-xl border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl ${isModal ? 'w-[90vw] max-w-[360px] p-5 sm:p-4' : 'w-[300px] p-4'}`}>
      {/* Month/Year header: < Month Year > [X if modal] */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setViewMonth(v => {
            let m = v.month - 1, y = v.year
            if (m < 0) { m = 11; y-- }
            return { year: y, month: m }
          })}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition text-slate-600 dark:text-slate-400"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          {MONTHS[month]} {year}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMonth(v => {
              let m = v.month + 1, y = v.year
              if (m > 11) { m = 0; y++ }
              return { year: y, month: m }
            })}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition text-slate-600 dark:text-slate-400"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          {isModal && (
            <button
              onClick={() => setOpen(false)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition text-slate-400 dark:text-slate-500"
              aria-label="Close calendar"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-0 mb-1">
        {DAYS.map(d => (              <div key={d} className="text-center text-[10px] sm:text-[11px] font-medium text-slate-400 dark:text-slate-500 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0">
        {calendarDays.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />
          const dateKey = `${year}-${month}-${day}`
          const isAvailable = availableSet.has(dateKey)
          const isSelected = selectedObj && selectedObj.getFullYear() === year && selectedObj.getMonth() === month && selectedObj.getDate() === day
          const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day

          return (
            <button
              key={dateKey}
              disabled={!isAvailable}
              onClick={() => {
                const formatted = availableDateObjs.get(dateKey)
                if (formatted) {
                  onSelect(formatted)
                  setOpen(false)
                }
              }}
              className={`
                relative w-full aspect-square flex items-center justify-center text-sm rounded-lg transition-all
                ${isSelected
                  ? 'bg-teal-500 text-white font-bold shadow-lg shadow-teal-500/30'
                  : isToday && isAvailable
                    ? 'ring-1 ring-teal-400 text-teal-600 dark:text-teal-400 font-semibold'
                    : isAvailable
                      ? 'text-slate-800 dark:text-slate-200 hover:bg-teal-50 dark:hover:bg-teal-900/30 cursor-pointer font-medium'
                      : 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                }
              `}
              title={isAvailable ? `${day}` : `${day} — no data`}
            >
              {day}
              {isAvailable && !isSelected && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-teal-400 dark:bg-teal-500" />
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-3 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/50">
        <span className="flex items-center gap-1 text-[10px] text-slate-400">
          <span className="w-2 h-2 rounded-full bg-teal-400" /> Has data
        </span>
        <span className="flex items-center gap-1 text-[10px] text-slate-400">
          <span className="w-2 h-2 rounded-full bg-slate-200 dark:bg-slate-600" /> No data
        </span>
      </div>
    </div>
  )

  return (
    <div className="flex items-center gap-1.5 sm:gap-2" ref={ref}>
      {/* Badge — shows ONLY on the single latest available date in the dataset */}
      {isLatest && (
        <span
          className="inline-flex items-center max-w-[90px] sm:max-w-none text-[10px] font-medium px-1.5 sm:px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700/40 truncate shrink-0"
          title="Latest date with available data"
        >
          Latest available
        </span>
      )}

      {/* Previous arrow */}
      <button
        onClick={goPrev}
        disabled={!hasPrev}
        className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition shrink-0"
        title="Previous day"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Calendar toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition cursor-pointer min-w-0 max-w-[130px] sm:max-w-none justify-between"
      >
        <span className="truncate">{formatDisplay(selectedDate)}</span>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Next arrow */}
      <button
        onClick={goNext}
        disabled={!hasNext}
        className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition shrink-0"
        title="Next day"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Date count badge — desktop only */}
      <span className="text-[10px] sm:text-[11px] text-slate-400 dark:text-slate-600 ml-0.5 sm:ml-1 hidden sm:inline shrink-0">
        {currentIndex + 1}/{dates.length}
      </span>

      {/* Desktop: inline popover */}
      {open && (
        <div className="hidden sm:block absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50">
          <CalendarPanel isModal={false} />
        </div>
      )}

      {/* Mobile: centered modal with backdrop */}
      {open && (
        <div className="sm:hidden fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div onClick={e => e.stopPropagation()}>
            <CalendarPanel isModal={true} />
          </div>
        </div>
      )}
    </div>
  )
}
