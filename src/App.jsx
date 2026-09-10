import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { fetchAllData, getCachedData, prefetchAllPlans } from './utils/dataFetcher'
import {
  parseMTDData, extractExecutiveMetrics,
  parseRawDailyData, parseAgingReport, getTodayStr, findClosestDate,
  getCurrentMonthYear, findLatestDataDate,
  buildDailyTrend, buildSeriesFromBlocks, summarizeSeries,
  computeMoMDelta,
} from './utils/dataProcessor'
import ExecutiveOverview from './components/ExecutiveOverview'
import DailyTable from './components/DailyTable'
import CompareView from './components/CompareView'
import AgingReport from './components/AgingReport'
import DatePicker from './components/DatePicker'
import SyncIcon from './components/SyncIcon'
import ThemeToggle from './components/ThemeToggle'
import PlanSelector from './components/PlanSelector'
import { PLANS, PLAN_ORDER, DEFAULT_PLAN } from './config/plans'
import PWAInstallBanner from './components/PWAInstallBanner'
import ExecutiveReportModal from './components/ExecutiveReportModal'
import { exportRawDataCSV } from './utils/exportCSV'
import { copySnapshotLink } from './utils/copyLink'
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
  return v === 'daily' || v === 'compare' || v === 'aging' ? v : 'executive'
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
  const [agingData, setAgingData] = useState(null)
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
  const [compareData, setCompareData] = useState(null)
  const [toast, setToast] = useState(null)
  const toastTimerRef = useRef(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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

      setAgingData(parseAgingReport(result.aging))

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
        setAgingData(parseAgingReport(cached.aging))
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
    setAgingData(parseAgingReport(result.aging))
    setSource(result.source)
    setLastSync(result.timestamp)
    const planDates = planDaily.dates || []
    setSelectedDate(planDates.length > 0
      ? (findLatestDataDate(planDaily) || findClosestDate(planDates, getTodayStr()))
      : getTodayStr())
  }, [])

  const handlePlanChange = useCallback(async (newPlan) => {
    // Single active selection: picking a plan exits SLA / Compare modes so the
    // plan filter becomes the only highlighted navigation item.
    setView(v => (v === 'aging' || v === 'compare' ? 'executive' : v))
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
      setMtdData(null); setRawDaily(null); setAgingData(null); setLoading(true)
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

  // Open a plan from Compare mode → switch to that plan's executive view
  const handleOpenPlan = useCallback((planId) => {
    setView('executive')
    if (planId !== activePlan) {
      handlePlanChange(planId)
    }
  }, [activePlan, handlePlanChange])

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

  /**
   * Build a CompareView entry for one plan result: parsed MTD + RAW.
   * `mtdCsv` keeps the raw CSV structure so the month picker can re-parse
   * for a different month without refetching.
   */
  const makeCompareEntry = useCallback((result) => ({
    mtdCsv: result.mtd,
    mtd: parseMTDData(result.mtd, selectedMonthYear),
    raw: parseRawDailyData(result.raw),
    source: result.source,
    timestamp: result.timestamp,
  }), [selectedMonthYear])

  /**
   * Load ALL plans for Compare mode: cache-first for instant render, then
   * background-refresh each plan and swap in fresh data when it arrives.
   */
  const loadCompareData = useCallback(async () => {
    // 1) Cache-first — render immediately from warm caches (prefetch keeps them hot)
    const entries = {}
    for (const planId of PLAN_ORDER) {
      try {
        const cached = await getCachedData(planId)
        entries[planId] = makeCompareEntry(cached)
      } catch {
        entries[planId] = { mtd: null, raw: null, source: 'none', timestamp: null }
      }
    }
    setCompareData(entries)

    // 2) Background refresh — fetch each plan fresh, update per plan
    for (const planId of PLAN_ORDER) {
      try {
        const fresh = await fetchAllData(planId)
        setCompareData(prev => ({
          ...prev,
          [planId]: makeCompareEntry(fresh),
        }))
      } catch { /* keep cached entry */ }
    }
  }, [makeCompareEntry])

  // Enter Compare mode → load all plans (cache-first + refresh)
  useEffect(() => {
    if (view === 'compare') {
      loadCompareData()
    }
  }, [view]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-parse compare data when the month picker changes while in Compare mode
  useEffect(() => {
    if (view === 'compare' && compareData) {
      setCompareData(prev => {
        if (!prev) return prev
        const next = {}
        for (const planId of PLAN_ORDER) {
          const entry = prev[planId]
          next[planId] = entry ? { ...entry, mtd: parseMTDData(entry.mtdCsv, selectedMonthYear) } : entry
        }
        return next
      })
    }
  }, [selectedMonthYear]) // eslint-disable-line react-hooks/exhaustive-deps

  const refreshCountdown = nextRefresh ? Math.max(0, Math.ceil((nextRefresh - Date.now()) / 1000)) : null

  // Data freshness
  const dataAge = lastSync ? Date.now() - lastSync.getTime() : Infinity
  const freshness = getFreshnessStyle(dataAge, isOnline)
  const timeAgo = formatTimeAgo(lastSync)

  // Copy the current view state as a shareable link + show a confirmation toast.
  const handleCopyLink = useCallback(async () => {
    const ok = await copySnapshotLink()
    setToast(ok ? 'Link copied' : 'Could not copy link')
    clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 2200)
  }, [])

  // ── Header action buttons (SLA / Report / Export / Copy Link) ──
  // Shared by the mobile overflow menu and the WebView navbar utility group
  // so the two breakpoints never drift apart.
  const headerActions = [
    {
      key: 'aging',
      active: view === 'aging',
      disabled: !agingData,
      title: 'View installation SLA breakdown (≤24h / ≤72h / >72hrs)',
      onClick: () => setView(view === 'aging' ? 'executive' : 'aging'),
      label: view === 'aging' ? 'Back' : 'SLA',
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="13" r="8" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4l2.5 2.5M9 2h6" />
        </svg>
      ),
    },
    {
      key: 'report',
      active: false,
      disabled: !executiveMetrics,
      title: 'Generate executive report (print / PDF)',
      onClick: () => setReportOpen(true),
      label: 'Report',
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      key: 'export',
      active: false,
      disabled: !rawDaily || rawDaily.dates?.length === 0,
      title: 'Export all RAW DATA as CSV',
      onClick: () => exportRawDataCSV(rawDaily, activePlan),
      label: 'Export',
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      key: 'copy',
      active: false,
      title: 'Copy shareable link for this view',
      onClick: handleCopyLink,
      label: 'Copy Link',
      icon: (
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 010 5.656l-4 4a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l4-4a4 4 0 015.656 5.656l-1.5 1.5" />
        </svg>
      ),
    },
  ]


  // Mobile overflow menu (⋮) — secondary actions that don't fit the clean
  // brand row. Reuses the header action icons so mobile and desktop match.
  const mobileMenuItems = [
    {
      key: 'sync',
      label: isSyncing ? 'Syncing…' : 'Sync Data',
      icon: <SyncIcon spinning={isSyncing} />,
      onClick: () => loadData(true),
      disabled: isSyncing,
    },
    // SLA is excluded — it already lives in the bottom navigation bar.
    ...headerActions.filter(a => a.key !== 'aging').map(a => ({
      key: a.key,
      label: a.label,
      icon: a.icon,
      onClick: a.onClick,
      disabled: a.disabled,
    })),
  ]

  const viewTabs = [
    { id: 'executive', label: 'Executive', view: 'executive', active: view === 'executive' },
    { id: 'daily', label: 'Provincial', view: 'daily', active: view === 'daily' },
    { id: 'compare', label: 'Compare', view: 'compare', active: view === 'compare' },
  ]

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
      <header className="sticky top-0 z-40">
        {/* Mobile header (< md) — keeps existing mobile navigation behavior */}
        <div className="md:hidden bg-white/80 dark:bg-[#0B0F17]/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800/60">
        <div className="w-full px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center font-black text-white text-sm tracking-tight shadow-lg shadow-teal-500/20 shrink-0">
              SLI
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight tracking-tight truncate">
                <span className="text-teal-600 dark:text-teal-400">GVSI</span> SLI Tracker
              </h1>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 hidden sm:block tracking-wide truncate">
                Gallopvision Services, Inc. — {view === 'executive' ? 'Executive Overview' : view === 'compare' ? 'Portfolio Compare' : view === 'aging' ? 'Installation SLA Breakdown' : `Daily Status — ${selectedDate || '…'}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Desktop status pill: countdown + time ago */}
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

            {/* Mobile compact status pill: pulsing dot + time ago */}
            {lastSync && (
              <div className="sm:hidden flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60" title={`Last updated: ${lastSync.toLocaleString()} • Auto-refreshes every 5 min`}>
                <span className={`w-1.5 h-1.5 rounded-full ${freshness.dot}`} />
                <span className={freshness.text}>{isSyncing ? 'Syncing…' : timeAgo}</span>
              </div>
            )}

            {/* Mobile overflow menu (⋮) — secondary actions */}
            <div className="relative md:hidden">
              <button
                onClick={() => setMobileMenuOpen(o => !o)}
                className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-200 hover:bg-slate-300 active:bg-slate-400 dark:bg-slate-800 dark:hover:bg-slate-700 dark:active:bg-slate-600 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 transition-all duration-200"
                aria-label="More actions"
                aria-expanded={mobileMenuOpen}
              >
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h.01M12 12h.01M19 12h.01" />
                </svg>
              </button>

              {mobileMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMobileMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 z-50 w-48 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-2xl py-1">
                    {mobileMenuItems.map(item => (
                      <button
                        key={item.key}
                        onClick={() => { item.onClick(); setMobileMenuOpen(false) }}
                        disabled={item.disabled}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {item.icon}
                        {item.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <ThemeToggle />
          </div>
        </div>
        </div>

        {/* WebView / Desktop / Tablet navbar (md+) */}
        <div className="hidden md:block bg-[#070A0F]/80 backdrop-blur-md border-b border-slate-800/80">
          <div className="w-full px-4 lg:px-6 py-2.5 lg:py-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-6">

              {/* Left — Branding & Active Context */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center font-black text-white text-sm tracking-tight shadow-lg shadow-teal-500/20 shrink-0">
                  SLI
                </div>
                <div className="min-w-0">
                  <h1 className="text-[15px] font-bold text-white leading-tight tracking-tight truncate">
                    <span className="text-teal-400">GVSI</span> SLI Tracker
                  </h1>
                  <p className="text-xs text-slate-400 tracking-wide truncate">
                    Gallopvision Services, Inc. — Daily Status
                  </p>
                </div>
              </div>

              {/* Center — Main View Navigation */}
              <nav aria-label="Main views" className="flex items-center gap-1 bg-slate-800/40 border border-slate-700/50 rounded-lg p-1 w-full lg:w-auto lg:shrink-0">
                {viewTabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setView(tab.view)}
                    aria-current={tab.active ? 'page' : undefined}
                    className={`flex-1 lg:flex-none px-3 lg:px-4 py-1.5 rounded-md text-xs lg:text-sm font-semibold tracking-wide whitespace-nowrap transition-all duration-200 ${
                      tab.active
                        ? 'bg-slate-700/80 text-white shadow-sm ring-1 ring-white/10'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>

              {/* Right — Plan switcher, Utilities, Sync, Theme */}
              <div className="flex items-center justify-between lg:justify-end gap-2 lg:gap-3 shrink-0">
                <PlanSelector
                  variant="navbar"
                  activePlan={view === 'aging' || view === 'compare' ? null : activePlan}
                  onPlanChange={handlePlanChange}
                  isSyncing={isSyncing}
                />

                {/* Icon-only utilities in a frosted wrapper */}
                <div className="flex items-center gap-1 bg-slate-800/40 border border-slate-700/50 rounded-lg p-1">
                  {headerActions.map(a => (
                    <button
                      key={a.key}
                      onClick={a.onClick}
                      disabled={a.disabled}
                      title={a.title}
                      aria-label={a.label}
                      className={`w-8 h-8 lg:w-9 lg:h-9 rounded-md flex items-center justify-center transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
                        a.active
                          ? 'bg-white/10 text-white ring-1 ring-white/20'
                          : 'text-slate-400 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {a.icon}
                    </button>
                  ))}
                </div>

                {/* Primary CTA — Sync Data + inline live time badge (no floating) */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => loadData(true)}
                    disabled={isSyncing}
                    title={`Sync now • Last updated: ${lastSync ? lastSync.toLocaleString() : 'never'} • Auto-refreshes every 5 min${refreshCountdown != null ? ` • Next refresh in ${Math.floor(refreshCountdown / 60)}:${String(refreshCountdown % 60).padStart(2, '0')}` : ''}`}
                    className="flex items-center gap-2 rounded-lg px-3 lg:px-4 py-1.5 lg:py-2 text-xs lg:text-sm font-semibold text-white hover:opacity-90 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-black/20 shrink-0"
                    style={{ backgroundColor: currentPlan.accentHex }}
                  >
                    <SyncIcon spinning={isSyncing} />
                    <span>{isSyncing ? 'Syncing…' : 'Sync Data'}</span>
                  </button>
                  {lastSync && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800/60 border border-slate-700/50 text-[10px] font-semibold text-slate-300 whitespace-nowrap">
                      <span className={`w-1.5 h-1.5 rounded-full ${freshness.dot}`} />
                      {isSyncing ? 'Syncing…' : timeAgo}
                    </span>
                  )}
                </div>

                <ThemeToggle />
              </div>
            </div>
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
        ) : view === 'compare' ? (
          <CompareView
            data={compareData}
            selectedMonthYear={selectedMonthYear}
            onOpenPlan={handleOpenPlan}
          />
        ) : view === 'aging' ? (
          <AgingReport
            data={agingData}
          />
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
            <div className="w-full px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between md:justify-end gap-3 border-b border-slate-200 dark:border-slate-800/40">
              {/* WebView/Desktop only: back button hidden — the navbar tabs (Executive | Provincial | Compare) handle navigation */}
              <button
                onClick={() => setView('executive')}
                className="flex md:hidden items-center gap-1.5 text-xs font-medium text-teal-600 dark:text-teal-400 hover:text-teal-500 dark:hover:text-teal-300 transition"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Back to Executive Summary
              </button>

              <div className="relative flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
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

      {/* Mobile bottom tab bar — native app style (< sm) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-[#0B0F17]/95 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800/60 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch">
          {PLAN_ORDER.map((planId) => {
            const plan = PLANS[planId]
            const isActive = activePlan === planId && view !== 'aging' && view !== 'compare'
            return (
              <button
                key={planId}
                onClick={() => handleOpenPlan(planId)}
                className="relative flex-1 flex flex-col items-center justify-center py-2.5 active:bg-slate-100 dark:active:bg-slate-800/60 transition-colors"
                aria-label={`Open ${plan.fullName}`}
              >
                <span className={`absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-b-full transition-colors ${isActive ? plan.accentClasses.bg : 'bg-transparent'}`} />
                {/* Active tab micro-interaction: zoom + elevate icon & label, inactive stays muted */}
                <span className={`flex flex-col items-center justify-center gap-1 transition-all duration-200 ease-out ${isActive ? 'scale-110 -translate-y-0.5' : 'scale-100'}`}>
                  <PlanGlyph planId={planId} className={`w-5 h-5 transition-all duration-200 ease-out ${isActive ? `${plan.accentClasses.text} ${plan.accentClasses.glow}` : 'text-slate-400 dark:text-slate-500'}`} />
                  <span className={`text-[10px] font-bold tracking-wide transition-colors duration-200 ${isActive ? plan.accentClasses.text : 'text-slate-400 dark:text-slate-500'}`}>{plan.name}</span>
                </span>
              </button>
            )
          })}
          <button
            onClick={() => setView(view === 'aging' ? 'executive' : 'aging')}
            className="relative flex-1 flex flex-col items-center justify-center py-2.5 active:bg-slate-100 dark:active:bg-slate-800/60 transition-colors"
            aria-label="Installation SLA breakdown"
          >
            <span className={`absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-b-full transition-colors ${view === 'aging' ? 'bg-teal-500' : 'bg-transparent'}`} />
            <span className={`flex flex-col items-center justify-center gap-1 transition-all duration-200 ease-out ${view === 'aging' ? 'scale-110 -translate-y-0.5' : 'scale-100'}`}>
              <svg className={`w-5 h-5 transition-all duration-200 ease-out ${view === 'aging' ? 'text-teal-500 drop-shadow-[0_0_6px_rgba(20,184,166,0.6)]' : 'text-slate-400 dark:text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="13" r="8" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4l2.5 2.5M9 2h6" />
              </svg>
              <span className={`text-[10px] font-bold tracking-wide transition-colors duration-200 ${view === 'aging' ? 'text-teal-500' : 'text-slate-400 dark:text-slate-500'}`}>SLA</span>
            </span>
          </button>
          <button
            onClick={() => setView(view === 'compare' ? 'executive' : 'compare')}
            className="relative flex-1 flex flex-col items-center justify-center py-2.5 active:bg-slate-100 dark:active:bg-slate-800/60 transition-colors"
            aria-label="Portfolio compare"
          >
            <span className={`absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-b-full transition-colors ${view === 'compare' ? 'bg-violet-500' : 'bg-transparent'}`} />
            <span className={`flex flex-col items-center justify-center gap-1 transition-all duration-200 ease-out ${view === 'compare' ? 'scale-110 -translate-y-0.5' : 'scale-100'}`}>
              <svg className={`w-5 h-5 transition-all duration-200 ease-out ${view === 'compare' ? 'text-violet-500 drop-shadow-[0_0_6px_rgba(139,92,246,0.6)]' : 'text-slate-400 dark:text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              <span className={`text-[10px] font-bold tracking-wide transition-colors duration-200 ${view === 'compare' ? 'text-violet-500' : 'text-slate-400 dark:text-slate-500'}`}>Compare</span>
            </span>
          </button>
        </div>
      </nav>

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

      {/* Toast notification (e.g. "Link copied") */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold shadow-2xl animate-slide-up flex items-center gap-2 pointer-events-none">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {toast}
        </div>
      )}

      {/* Bottom nav spacer (mobile) — keeps footer clear of the fixed tab bar */}
      <div className="md:hidden h-[68px]" />

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

/** Per-plan glyphs for the mobile bottom tab bar. */
function PlanGlyph({ planId, className }) {
  if (planId === 'fiberx') {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2 12h4l3-8 4 16 3-8h6" />
      </svg>
    )
  }
  if (planId === 'bida') {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l10 5.5L12 13 2 7.5 12 2z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M2 12.5l10 5.5 10-5.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M2 17.5l10 5.5 10-5.5" />
      </svg>
    )
  }
  // SME
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
    </svg>
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
