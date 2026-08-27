import { useState, useEffect, useCallback } from 'react'
import { fetchSLIData, getCachedData } from './utils/dataFetcher'
import { buildTableRows, extractOverallMetrics } from './utils/dataProcessor'
import SLITable from './components/SLITable'
import ExecutiveOverview from './components/ExecutiveOverview'
import SyncIcon from './components/SyncIcon'
import ThemeToggle from './components/ThemeToggle'

export default function App() {
  const [rawData, setRawData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [source, setSource] = useState('none')
  const [lastSync, setLastSync] = useState(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [view, setView] = useState('executive') // 'executive' | 'detail'
  const [showVariance, setShowVariance] = useState(false)

  const loadData = useCallback(async (showSyncing = false) => {
    if (showSyncing) setIsSyncing(true)
    if (!rawData) setLoading(true)
    setError(null)

    try {
      const result = await fetchSLIData()
      if (result.data && result.data.length > 0) {
        setRawData(result.data)
        setSource(result.source)
        setLastSync(result.timestamp)
      } else {
        setError('No data received from the Google Sheet. Check if the sheet is publicly accessible.')
      }
    } catch (err) {
      setError(err.message)
      const cached = getCachedData()
      if (cached.data) {
        setRawData(cached.data)
        setSource(cached.source)
        setLastSync(cached.timestamp)
      }
    } finally {
      setLoading(false)
      setIsSyncing(false)
    }
  }, [rawData])

  useEffect(() => {
    loadData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  const tableRows = rawData ? buildTableRows(rawData) : []
  const overallMetrics = extractOverallMetrics(tableRows)

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B0F17] flex flex-col font-sans">
      {/* Sync overlay */}
      {isSyncing && rawData && (
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
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight">
                GVSI SLI Tracker
              </h1>
              <p className="text-xs text-slate-500 hidden sm:block">
                {view === 'executive'
                  ? 'Service Line Installation Daily Tracking'
                  : 'Provincial Breakdown'
                }
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Status */}
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

            {source === 'cache' || source === 'stale-cache' ? (
              <span className="px-2 py-1 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500 border border-slate-200 dark:border-slate-700 hidden sm:inline-flex">
                Cached
              </span>
            ) : null}

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
        {loading && !rawData ? (
          <LoadingSkeleton />
        ) : error && !rawData ? (
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
            metrics={overallMetrics}
            onGoToDetail={() => setView('detail')}
          />
        ) : (
          <div className="h-full flex flex-col">
            {/* Control bar */}
            <div className="w-full px-4 sm:px-6 py-2 flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800/40">
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
                {/* Global variance toggle */}
                <button
                  onClick={() => setShowVariance(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    showVariance
                      ? 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300 border border-teal-300 dark:border-teal-500/30'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-500 border border-slate-200 dark:border-slate-700/50 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={showVariance ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
                  </svg>
                  {showVariance ? 'Hide Cluster Variances' : 'Show Cluster Variances'}
                </button>

                <span className="text-[11px] text-slate-400 dark:text-slate-600">
                  {lastSync && `Last sync: ${lastSync.toLocaleTimeString()}`}
                </span>
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-hidden">
              <SLITable
                rows={tableRows}
                showVariance={showVariance}
                onToggleVariance={() => setShowVariance(v => !v)}
              />
            </div>
          </div>
        )}
      </main>
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
