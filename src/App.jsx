import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { fetchAllData, getCachedData, prefetchAllPlans } from './utils/dataFetcher'
import {
  parseMTDData, extractExecutiveMetrics,
  parseRawDailyData, getTodayStr, findClosestDate,
  getCurrentMonthYear, findLatestDataDate,
  buildDailyTrend, buildSeriesFromBlocks, summarizeSeries,
  computeMoMDelta,
} from './utils/dataProcessor'
import ExecutiveOverview from './components/ExecutiveOverview'
import DailyTable from './components/DailyTable'
import DatePicker from './components/DatePicker'
import SyncIcon from './components/SyncIcon'
import ThemeToggle from './components/ThemeToggle'
import PlanSelector from './components/PlanSelector'
import { PLANS, DEFAULT_PLAN } from './config/plans'
import PWAInstallBanner from './components/PWAInstallBanner'
import ExecutiveReportModal from './components/ExecutiveReportModal'
import { exportRawDataCSV } from './utils/exportCSV'
import { readUrlState, writeUrlState, STATE_STORAGE_KEYS } from './utils/urlState'

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

function storageGet(key) {
  try { return localStorage.getItem(key) } catch { return null }
}

// Initial shareable state — resolved once per app load: URL params → localStorage → defaults.
const initialUrlState = readUrlState()

function initialView() {
  const v = initialUrlState.view || storageGet(STATE_STORAGE_KEYS.view)
  return v === 'daily' ? 'daily' : 'executive'
}

function initialDate() {
  return initialUrlState.date || storageGet(STATE_STORAGE_KEYS.date) || ''
}

function initialMonth() {
  return initialUrlState.month || storageGet(STATE_STORAGE_KEYS.month) || getCurrentMonthYear()
}

function initialPlan() {
  const p = initialUrlState.plan || storageGet(STATE_STORAGE_KEYS.plan)
  return PLANS[p] ? p : DEFAULT_PLAN
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
  const [view, setView] = useState(initialView)
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [selectedMonthYear, setSelectedMonthYear] = useState(initialMonth)
  const [nextRefresh, setNextRefresh] = useState(null)
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true)
  const [tick, setTick] = useState(0)
  const [activePlan, setActivePlan] = useState(initialPlan)
  const [reportOpen, setReportOpen] = useState(false)

  const loadDataRef = useRef(null)
  // Guards against race conditions when the user rapidly switches plans: only
  // the result of the most recently requested plan may update state.
  const planChangeRef = useRef(activePlan)

  const loadData = useCallback(async (showSyncing = false) => {
    if (showSyncing) setIsSyncing(true)
    if (!mtdData) setLoading(true)
    setError(null)

    try {
      const result = await fetchAllData(activePlan)

      const parsed = parseMTDData(result.mtd, selectedMonthYear)
      setMtdData(parsed)

      const daily = parseRawDailyData(result.raw)
      setRawDaily(daily)

      setSource(result.source)
      setLastSync(result.timestamp)

      // Select date: latest with actual input (INC > 0); today only if it has data,
      // otherwise closest to today. Sheet entries can lag behind, so an all-zero
      // "today" block is treated as not-yet-available.
      const dates = daily.dates || []
      if (dates.length > 0) {
        const today = getTodayStr()
        const best = findLatestDataDate(daily) || findClosestDate(dates, today)
        if (!selectedDate || selectedDate === today || !dates.includes(selectedDate)) {
          setSelectedDate(best)
        }
      }
    } catch (err) {
      setError(err.message)
      const cached = await getCachedData(activePlan)
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

  /**
   * Apply a fetched/cached plan result to state (MTD, RAW, source, date, month).
   * Used by both the cache-first path and the background refresh path.
   */
  const applyPlanData = useCallback((result) => {
    setMtdData(parseMTDData(result.mtd, getCurrentMonthYear()))
    setSelectedMonthYear(getCurrentMonthYear())
    const planDaily = parseRawDailyData(result.raw)
    setRawDaily(planDaily)
    setSource(result.source)
    setLastSync(result.timestamp)
    const planDates = planDaily.dates || []
    setSelectedDate(planDates.length > 0
      ? (findLatestDataDate(planDaily) || findClosestDate(planDates, getTodayStr()))
      : getTodayStr())
  }, [])

  const handlePlanChange = useCallback(async (newPlan) => {
    if (newPlan === activePlan) return
    planChangeRef.current = newPlan
    setActivePlan(newPlan)
    setError(null)

    // 1) Cache-first: if this plan's data is already cached, render it
    //    instantly and refresh in the background — no loading skeleton on
    //    plan switch.
    let cached = null
    try {
      cached = await getCachedData(newPlan)
    } catch { /* ignore */ }

    const hasCached = cached && (cached.mtd?.rows?.length > 0 || cached.raw?.rows?.length > 0)
    if (hasCached) {
      if (planChangeRef.current !== newPlan) return
      applyPlanData(cached)
    } else {
      setMtdData(null); setRawDaily(null); setLoading(true)
    }

    // 2) Background refresh: fetch fresh data and swap it in when it arrives.
    try {
      const result = await fetchAllData(newPlan)
      if (planChangeRef.current !== newPlan) return
      applyPlanData(result)
    } catch (err) {
      if (planChangeRef.current !== newPlan) return
      setError(err.message)
      const fallback = await getCachedData(newPlan)
      if (fallback.mtd) applyPlanData(fallback)
    } finally {
      setLoading(false)
      setIsSyncing(false)
    }

    // 3) Warm the caches of the other plans so future switches are instant.
    prefetchAllPlans(newPlan).catch(() => {})
  }, [activePlan, applyPlanData])

  const currentPlan = PLANS[activePlan] || PLANS[DEFAULT_PLAN]

  loadDataRef.current = loadData

  // Persist shareable state (plan, date, month, view) to URL + localStorage.
  // URL writes use replaceState so date-stepping never pollutes browser history.
  useEffect(() => {
    writeUrlState({ plan: activePlan, date: selectedDate, month: selectedMonthYear, view })
    try {
      localStorage.setItem(STATE_STORAGE_KEYS.plan, activePlan)
      localStorage.setItem(STATE_STORAGE_KEYS.date, selectedDate)
      localStorage.setItem(STATE_STORAGE_KEYS.month, selectedMonthYear)
      localStorage.setItem(STATE_STORAGE_KEYS.view, view)
    } catch { /* ignore quota / private-mode errors */ }
  }, [activePlan, selectedDate, selectedMonthYear, view])

  // Initial load + warm the caches of the other plans in the background
  useEffect(() => {
    loadData()
    prefetchAllPlans(activePlan).catch(() => {})
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
  const latestDataDate = findLatestDataDate(rawDaily)
  const executiveMetrics = extractExecutiveMetrics(mtdData, dailyBlock)

  // Phase 2 — F1 trend analytics
  // MoM: current MTD achievement % vs the previous available month (if any)
  const momDelta = useMemo(() => computeMoMDelta(mtdData), [mtdData])

  // 7-day overall trends per daily metric (keyed by RAW overallTotal field)
  const dailyTrends = useMemo(() => {
    if (!rawDaily || !selectedDate) return null
    const keys = ['bf', 'inc', 'completedFromTotal', 'completedFromRjo',
      'rjoIncoming', 'rjoRedispatched', 'totalRjo', 'totalCompleted', 'carryOver']
    const out = {}
    for (const k of keys) out[k] = buildDailyTrend(rawDaily, selectedDate, k, 7)
    return out
  }, [rawDaily, selectedDate])

  // 7-day total-completed trend per area + OVER ALL (for the Provincial table)
  const areaTrends = useMemo(() => {
    if (!rawDaily || !selectedDate) return null
    const names = (dailyBlock?.areas || []).map((a) => a.area)
    const out = {}
    for (const nm of names) {
      const s = summarizeSeries(buildSeriesFromBlocks(
        rawDaily, selectedDate, 'totalCompleted', 7,
        (b) => (b?.areas || []).find((a) => a.area === nm),
      ))
      if (s) out[nm] = s
    }
    const overall = summarizeSeries(buildSeriesFromBlocks(rawDaily, selectedDate, 'totalCompleted', 7))
    if (overall) out['OVER ALL TOTAL'] = overall
    return out
  }, [rawDaily, selectedDate, dailyBlock])

  // When month changes, re-parse MTD data from cache
  const handleMonthChange = useCallback(async (newMonth) => {
    setSelectedMonthYear(newMonth)
    const cached = await getCachedData(activePlan)
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
    <div className="min-h-screen flex flex-col font-sans">
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
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-[#0B0F17]/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800/60">
        <div className="w-full px-3 sm:px-6 py-2.5 sm:py-3 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center font-black text-white text-sm tracking-tight shadow-lg shadow-teal-500/20">
              SLI
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight tracking-tight">
                <span className="text-teal-600 dark:text-teal-400">GVSI</span> SLI Tracker
              </h1>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 hidden sm:block tracking-wide">
                Gallopvision Services, Inc. — {view === 'executive' ? 'Executive Overview' : `Daily Status — ${selectedDate || '…'}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 flex-wrap justify-end">
            {/* Consolidated Status Pill: countdown + time ago */}
            {lastSync && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60" title={`Last updated: ${lastSync.toLocaleString()} • Auto-refreshes every 5 min`}>                <svg className="w-3 h-3 text-slate-400 dark:text-slate-500 animate-spin" style={{ animationDuration: '3s' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="text-slate-500 dark:text-slate-400">
                  {Math.floor(refreshCountdown / 60)}:{String(refreshCountdown % 60).padStart(2, '0')}
                </span>
                <span className="text-slate-300 dark:text-slate-600">·</span>
                <span className={`${freshness.text}`}>{isSyncing ? 'Syncing…' : timeAgo}</span>
              </div>
            )}

            <PlanSelector activePlan={activePlan} onPlanChange={handlePlanChange} isSyncing={isSyncing} />
            <ThemeToggle />

            {/* Report (print / PDF) button */}
            <button
              onClick={() => setReportOpen(true)}
              disabled={!executiveMetrics}
              className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Generate executive report (print / PDF)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="hidden sm:inline">Report</span>
            </button>

            {/* Export CSV button */}
            <button
              onClick={() => exportRawDataCSV(rawDaily, activePlan)}
              disabled={!rawDaily || rawDaily.dates?.length === 0}
              className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Export all RAW DATA as CSV"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="hidden sm:inline">Export</span>
            </button>

            <button
              onClick={() => loadData(true)}
              disabled={isSyncing}
              className="flex items-center gap-2 px-2 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg'
              style={{ backgroundColor: currentPlan.accentHex }}"
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
            latestDataDate={latestDataDate}
            onDateSelect={setSelectedDate}
            onMonthSelect={handleMonthChange}
            selectedMonthYear={selectedMonthYear}
            availableMonths={mtdData?.availableMonths || []}
            onGoToDetail={() => setView('daily')}
            momDelta={momDelta}
            dailyTrends={dailyTrends}
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

              <div className="relative flex items-center gap-3">
                <DatePicker
                  dates={availableDates}
                  selectedDate={selectedDate}
                  onSelect={setSelectedDate}
                  maxDate={getTodayStr()}
                  latestDataDate={latestDataDate}
                />
                <span className="text-[11px] text-slate-400 dark:text-slate-600">
                  {lastSync && `Last sync: ${lastSync.toLocaleTimeString()}`}
                </span>
              </div>
            </div>

            {/* Daily table */}
            <div className="flex-1 overflow-auto">
              <DailyTable dateData={dailyBlock} refDate={selectedDate || latestDataDate} areaTrends={areaTrends} />
            </div>
          </div>
        )}
      </main>

      {/* PWA Install Banner */}
      <PWAInstallBanner />

      {/* Executive Report (print / PDF) */}
      {reportOpen && (
        <ExecutiveReportModal
          plan={currentPlan}
          metrics={executiveMetrics}
          selectedDate={selectedDate}
          selectedMonthYear={selectedMonthYear}
          areas={mtdData?.areas || []}
          latestDataDate={latestDataDate}
          momDelta={momDelta}
          onClose={() => setReportOpen(false)}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800/60 bg-white/60 dark:bg-[#0B0F17]/60 backdrop-blur-xl">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center font-black text-white text-[7px] tracking-tight">
              SLI
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-500">
              <span className="font-semibold text-slate-600 dark:text-slate-400">GVSI SLI Tracker</span> {'—'} {currentPlan.fullName}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-600">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
            <span>Developed by <span className="font-bold text-teal-600 dark:text-teal-400">GVSI Dev</span></span>
            <span className="mx-1 text-slate-300 dark:text-slate-700">•</span>
            <span>© {new Date().getFullYear()} Gallopvision Services, Inc.</span>
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
