import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchAllData, getCachedData } from './utils/dataFetcher'
import {
  parseMTDData, extractExecutiveMetrics,
  parseRawDailyData, getTodayStr, findClosestDate,
  getCurrentMonthYear,
} from './utils/dataProcessor'
import ExecutiveOverview from './components/ExecutiveOverview'
import DailyTable from './components/DailyTable'
import DatePicker from './components/DatePicker'
import SyncIcon from './components/SyncIcon'
import ThemeToggle from './components/ThemeToggle'
import PWAInstallBanner from './components/PWAInstallBanner'

const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000 // 5 minutes
const STALE_THRESHOLD = 5 * 60 * 1000 // 5 minutes — data older than this is "stale"

/**
 * Format a timestamp into a human-readable "time ago" string.
 * E.g. "just now", "2m ago", "1h ago", "3d ago"
 */
function formatTimeAgo(date) {
  if (!date) return null
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 30) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/**
 * Get freshness status color classes.
 */
function getFreshnessStyle(ageMs, isOnline) {
  if (!isOnline) return { dot: 'bg-amber-500 dark:bg-amber-400 animate-pulse', text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20' }
  if (ageMs < STALE_THRESHOLD) return { dot: 'bg-emerald-500 dark:bg-emerald-400', text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20' }
  return { dot: 'bg-amber-500 dark:bg-amber-400', text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20' }
}

export default function App() {
  const [mtdData, setMtdData] = useState(null)
  const [rawDaily, setRawDaily] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [source, setSource] = useState('none')
  const [lastSync, setLastSync] = useState(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [view, setView] = useState('executive')
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedMonthYear, setSelectedMonthYear] = useState(getCurrentMonthYear())
  const [nextRefresh, setNextRefresh] = useState(null)
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true)
  const [tick, setTick] = useState(0) // force re-render for "time ago" updates

  const loadDataRef = useRef(null)

  const loadData = useCallback(async (showSyncing = false) => {
    if (showSyncing) setIsSyncing(true)
    if (!mtdData) setLoading(true)
    setError(null)

    try {
      const result = await fetchAllData()

      const parsed = parseMTDData(result.mtd, selectedMonthYear)
      setMtdData(parsed)

      const daily = parseRawDailyData(result.raw)
      setRawDaily(daily)

      setSource(result.source)
      setLastSync(result.timestamp)

      if (daily.dates.length > 0 && !selectedDate) {
        const today = getTodayStr()
        setSelectedDate(findClosestDate(daily.dates, today))
      }
    } catch (err) {
      setError(err.message)
      const cached = getCachedData()
      if (cached.mtd) {
        setMtdData(parseMTDData(cached.mtd))
        setRawDaily(parseRawDailyData(cached.raw))
        setSource(cached.source)
        setLastSync(cached.timestamp)
      }
    } finally {
      setLoading(false)
      setIsSyncing(false)
    }
  }, [mtdData, selectedDate, selectedMonthYear])

  loadDataRef.current = loadData

  // Initial load
  useEffect(() => {
    loadData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Tick every 30s to update "time ago" display
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(interval)
  }, [])

  // Auto-refresh polling
  useEffect(() => {
    if (!autoRefreshEnabled) return

    const interval = setInterval(() => {

      if (loadDataRef.current) {
        loadDataRef.current(false)
      }
    }, AUTO_REFRESH_INTERVAL)

    const timer = setInterval(() => {
      setNextRefresh(prev => {
        if (!prev) return Date.now() + AUTO_REFRESH_INTERVAL
        return prev
      })
    }, 1000)

    setNextRefresh(Date.now() + AUTO_REFRESH_INTERVAL)

    return () => {
      clearInterval(interval)
      clearInterval(timer)
    }
  }, [autoRefreshEnabled])

  // Reset next refresh timer when data is synced
  useEffect(() => {
    if (lastSync) {
      setNextRefresh(Date.now() + AUTO_REFRESH_INTERVAL)
    }
  }, [lastSync])

  // Online/offline detection
  useEffect(() => {
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // Derived data
  const dailyBlock = rawDaily?.blocks?.[selectedDate] || null
  const availableDates = rawDaily?.dates || []
  const executiveMetrics = extractExecutiveMetrics(mtdData, dailyBlock)

  // When month changes, re-parse MTD data from cache
  const handleMonthChange = useCallback((newMonth) => {
    setSelectedMonthYear(newMonth)
    const cached = getCachedData()
    if (cached.mtd) {
      setMtdData(parseMTDData(cached.mtd, newMonth))
    }
  }, [])

  const refreshCountdown = nextRefresh ? Math.max(0, Math.ceil((nextRefresh - Date.now()) / 1000)) : null

  // Data freshness
  const dataAge = lastSync ? Date.now() - lastSync.getTime() : Infinity
  const freshness = getFreshnessStyle(dataAge, isOnline)
  const timeAgo = formatTimeAgo(lastSync)

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B0F17] flex flex-col font-sans">
      {/* Sync overlay */}
      {isSyncing && mtdData && (
        <div className="fixed inset-0 z-[60] bg-black/20 dark:bg-black/40 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="bg-white dark:bg-slate-900/90 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700/50 px-6 py-4 flex items-center gap-3 pointer-events-none">
            <SyncIcon spinning />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Syncing data…</span>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-[#0B0F17]/90 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800/60">
        <div className="w-full px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center font-black text-white text-sm tracking-tight shadow-lg shadow-teal-500/20">
              SLI
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight tracking-tight">
                <span className="text-teal-600 dark:text-teal-400">GVSI</span> SLI Tracker
              </h1>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 hidden sm:block tracking-wide">
                GallopVision Services, Inc. — {view === 'executive' ? 'Executive Overview' : `Daily Status — ${selectedDate || '…'}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Auto-refresh countdown */}
            {autoRefreshEnabled && refreshCountdown !== null && !isSyncing && (
              <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-500 border border-slate-200 dark:border-slate-700" title="Auto-refreshes every 5 minutes">
                <svg className="w-3 h-3 animate-spin" style={{ animationDuration: '3s' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {Math.floor(refreshCountdown / 60)}:{String(refreshCountdown % 60).padStart(2, '0')}
              </div>
            )}

            {/* Data freshness indicator */}
            {lastSync && (
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium border ${freshness.bg}`} title={`Last updated: ${lastSync.toLocaleString()}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${freshness.dot}`} />
                <span className={freshness.text}>
                  {isSyncing ? 'Updating…' : timeAgo}
                </span>
              </div>
            )}

            {/* Online/Offline status */}
            <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              isOnline
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                isOnline ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-amber-500 dark:bg-amber-400 animate-pulse'
              }`} />
              {isOnline ? 'Online' : 'Offline'}
            </span>

            <ThemeToggle />

            <button
              onClick={() => loadData(true)}
              disabled={isSyncing}
              className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-teal-600/20 hover:shadow-teal-500/30"
            >
              <SyncIcon spinning={isSyncing} />
              <span className="hidden sm:inline">{isSyncing ? 'Syncing…' : 'Sync Data'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        {loading && !mtdData ? (
          <LoadingSkeleton />
        ) : error && !mtdData ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-rose-100 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-rose-500 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Unable to Load Data</h2>
            <p className="text-sm text-slate-500 max-w-md mb-4">{error}</p>
            <button
              onClick={() => loadData(true)}
              className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium transition"
            >
              Try Again
            </button>
          </div>
        ) : view === 'executive' ? (
          <ExecutiveOverview
            metrics={executiveMetrics}
            selectedDate={selectedDate}
            availableDates={availableDates}
            onDateSelect={setSelectedDate}
            onMonthSelect={handleMonthChange}
            selectedMonthYear={selectedMonthYear}
            availableMonths={mtdData?.availableMonths || []}
            onGoToDetail={() => setView('daily')}
          />
        ) : (
          <div className="h-full flex flex-col">
            {/* Control bar */}
            <div className="w-full px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800/40">
              <button
                onClick={() => setView('executive')}
                className="flex items-center gap-1.5 text-xs font-medium text-teal-600 dark:text-teal-400 hover:text-teal-500 dark:hover:text-teal-300 transition"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Back to Executive Summary
              </button>

              <div className="flex items-center gap-3">
                <DatePicker
                  dates={availableDates}
                  selectedDate={selectedDate}
                  onSelect={setSelectedDate}
                />
                <span className="text-[11px] text-slate-400 dark:text-slate-600">
                  {lastSync && `Last sync: ${lastSync.toLocaleTimeString()}`}
                </span>
              </div>
            </div>

            {/* Daily table */}
            <div className="flex-1 overflow-auto">
              <DailyTable dateData={dailyBlock} />
            </div>
          </div>
        )}
      </main>

      {/* PWA Install Banner */}
      <PWAInstallBanner />

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800/60 bg-white/80 dark:bg-[#0B0F17]/80 backdrop-blur-xl">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center font-black text-white text-[7px] tracking-tight">
              SLI
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-500">
              <span className="font-semibold text-slate-600 dark:text-slate-400">GVSI SLI Tracker</span> — Service Line Installation Daily Tracking
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-600">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
            <span>Developed by <span className="font-bold text-teal-600 dark:text-teal-400">GVSI Dev</span></span>
            <span className="mx-1 text-slate-300 dark:text-slate-700">•</span>
            <span>© {new Date().getFullYear()} GallopVision Services, Inc.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="max-w-[1200px] mx-auto px-3 sm:px-6 py-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton h-24 rounded-2xl" style={{ animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
      <div className="skeleton h-48 rounded-2xl mb-6" />
      <div className="skeleton h-12 rounded-xl" />
    </div>
  )
}
