import { useState, useEffect, useCallback } from 'react'
import { fetchSLIData, getCachedData } from './utils/dataFetcher'
import { processRows, COLUMNS } from './utils/dataProcessor'
import SLITable from './components/SLITable'
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

  const loadData = useCallback(async (showSyncing = false) => {
    if (showSyncing) setIsSyncing(true)
    setLoading(true)
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
      // Try cache as fallback
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
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

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

  const processedRows = rawData ? processRows(rawData) : []
  const overallTotal = processedRows.find(r => r.type === 'overall-total')

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-700/50">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-700 flex items-center justify-center font-black text-slate-950 text-sm tracking-tight shadow-lg shadow-cyan-500/20">
              SLI
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight">
                GVSI SLI Tracker
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
                Service Line Installation Daily Tracking
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Status indicators */}
            <div className="flex items-center gap-2 text-xs">
              <span className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${
                isOnline
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  isOnline
                    ? 'bg-emerald-500 dark:bg-emerald-400'
                    : 'bg-amber-500 dark:bg-amber-400 animate-pulse'
                }`} />
                {isOnline ? 'Online' : 'Offline'}
              </span>
              {source === 'cache' || source === 'stale-cache' ? (
                <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 hidden sm:inline-flex">
                  Cached
                </span>
              ) : null}
            </div>

            {/* Theme toggle */}
            <ThemeToggle />

            {/* Sync button */}
            <button
              onClick={() => loadData(true)}
              disabled={isSyncing}
              className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-600/20 hover:shadow-cyan-500/30"
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
            <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-500/30 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-red-500 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Unable to Load Data</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mb-4">{error}</p>
            <button
              onClick={() => loadData(true)}
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition"
            >
              Try Again
            </button>
          </div>
        ) : (
          <div className="h-full">
            {/* Info bar */}
            <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-2 flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
              <span>
                {processedRows.length} rows
                {lastSync && ` · Last sync: ${lastSync.toLocaleTimeString()}`}
              </span>
              {overallTotal && (
                <span className="text-cyan-600 dark:text-cyan-400 font-medium">
                  Grand Total: {overallTotal.row['TOTAL'] || overallTotal.row['MTD'] || '—'}
                </span>
              )}
            </div>
            <SLITable rows={processedRows} columns={COLUMNS} />
          </div>
        )}
      </main>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-8">
      <div className="space-y-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className="skeleton h-10 rounded-lg flex-1" style={{ animationDelay: `${i * 0.1}s` }} />
            <div className="skeleton h-10 rounded-lg w-20" style={{ animationDelay: `${i * 0.1 + 0.05}s` }} />
            <div className="skeleton h-10 rounded-lg w-16" style={{ animationDelay: `${i * 0.1 + 0.1}s` }} />
            <div className="skeleton h-10 rounded-lg w-16" style={{ animationDelay: `${i * 0.1 + 0.15}s` }} />
            <div className="skeleton h-10 rounded-lg w-20" style={{ animationDelay: `${i * 0.1 + 0.2}s` }} />
          </div>
        ))}
      </div>
    </div>
  )
}
