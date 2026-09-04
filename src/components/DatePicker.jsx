/**
 * DatePicker — Calendar grid date selector for daily data view.
 * Shows a monthly calendar with available dates highlighted.
 * Allows left/right arrow navigation and clicking any available date.
 */
import { useState, useRef, useEffect } from 'react'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function parseDate(str) {
  // "September 1, 2026" → Date
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

function formatDateKey(d) {
  // Date → "September 1, 2026"
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay()
}

export default function DatePicker({ dates, selectedDate, onSelect, maxDate }) {
  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState(() => {
    const sel = parseDate(selectedDate)
    if (sel) return { year: sel.getFullYear(), month: sel.getMonth() }
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const ref = useRef(null)

  // Build a Set of "YYYY-MM-DD" for quick lookup of available dates
  const availableSet = new Set()
  const availableDateObjs = new Map() // "YYYY-MM-DD" → formatted date string
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
    if (sel) {
      setViewMonth({ year: sel.getFullYear(), month: sel.getMonth() })
    }
  }, [selectedDate])

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  if (!dates || dates.length === 0) return null

  const currentIndex = dates.indexOf(selectedDate)
  const hasPrev = currentIndex > 0
  const isAtMax = maxDate ? selectedDate === maxDate : false
  const isFallback = maxDate && selectedDate !== maxDate
  const hasNext = currentIndex < dates.length - 1 && !isAtMax

  const goPrev = () => { if (hasPrev) onSelect(dates[currentIndex - 1]) }
  const goNext = () => { if (hasNext) onSelect(dates[currentIndex + 1]) }

  // Calendar grid for current view month
  const { year, month } = viewMonth
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)
  const today = new Date()

  const calendarDays = []
  for (let i = 0; i < firstDay; i++) calendarDays.push(null)
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d)

  const canGoPrevMonth = !(viewMonth.year === today.getFullYear() && viewMonth.month === today.getMonth())
  const canGoNextMonth = true // allow navigating forward freely

  const selectedObj = parseDate(selectedDate)

  return (
    <div className="flex items-center gap-2" ref={ref}>
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

      {/* Calendar toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition cursor-pointer min-w-[180px] justify-between"
      >
        <span>{selectedDate || 'Select date'}</span>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

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

      {/* Fallback indicator */}
      {isFallback && (
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700/40 whitespace-nowrap" title="No data for today. Showing latest available date.">
          Latest available
        </span>
      )}

      {/* Calendar dropdown */}
      {open && (
        <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 w-[300px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-3">
          {/* Month/Year header */}
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
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 gap-0 mb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-[10px] font-medium text-slate-400 dark:text-slate-500 py-1">
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
                    relative w-full aspect-square flex items-center justify-center text-xs rounded-lg transition-all
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
      )}
    </div>
  )
}
