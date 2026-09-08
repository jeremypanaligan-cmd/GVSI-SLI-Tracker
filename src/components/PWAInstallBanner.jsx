import { useState, useEffect, useRef } from 'react'

const DISMISS_KEY = 'gvsi_pwa_install_dismissed'
const DISMISS_EXPIRY = 3 * 24 * 60 * 60 * 1000 // 3 days — short enough that the banner returns soon

const UA = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : ''
const IS_IOS = /iphone|ipad|ipod/i.test(UA)
const IS_ANDROID = /android/i.test(UA)

function isStandaloneMode() {
  if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true
  if (typeof navigator !== 'undefined' && navigator.standalone) return true
  return false
}

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showBanner, setShowBanner] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const promptArrived = useRef(false)

  useEffect(() => {
    // Already installed / running as an app
    if (isStandaloneMode()) {
      setIsInstalled(true)
      return
    }

    // Respect "Not now" within the expiry window
    try {
      const dismissed = localStorage.getItem(DISMISS_KEY)
      if (dismissed && Date.now() - parseInt(dismissed, 10) < DISMISS_EXPIRY) return
    } catch { /* ignore */ }

    // ── iOS Safari ──
    // beforeinstallprompt is NOT supported on iOS. The only install route is
    // the Share → Add to Home Screen menu, so always offer manual steps.
    if (IS_IOS) {
      const t = setTimeout(() => setShowBanner(true), 2000)
      return () => clearTimeout(t)
    }

    // ── Android Chrome / desktop ──
    const handler = (e) => {
      e.preventDefault()
      promptArrived.current = true
      setDeferredPrompt(e)
      setTimeout(() => setShowBanner(true), 1500)
    }
    window.addEventListener('beforeinstallprompt', handler)

    const installedHandler = () => {
      setIsInstalled(true)
      setShowBanner(false)
      setDeferredPrompt(null)
    }
    window.addEventListener('appinstalled', installedHandler)

    // ── Android fallback ──
    // Chrome only fires beforeinstallprompt after engagement criteria are met
    // (and suppresses it for a while if its own mini-infobar was dismissed).
    // Never let the install option silently vanish: offer manual steps.
    let fallbackTimer = null
    if (IS_ANDROID) {
      fallbackTimer = setTimeout(() => {
        if (!promptArrived.current) setShowBanner(true)
      }, 4000)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installedHandler)
      if (fallbackTimer) clearTimeout(fallbackTimer)
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return

    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === 'accepted') {
      setShowBanner(false)
    }
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    setShowBanner(false)
    try {
      localStorage.setItem(DISMISS_KEY, Date.now().toString())
    } catch { /* ignore */ }
  }

  // Don't show when installed, dismissed, or not yet eligible
  if (isInstalled || !showBanner) return null

  // Manual-instructions mode: no install prompt is available (iOS, or Android
  // where Chrome hasn't fired beforeinstallprompt yet).
  const manualMode = !deferredPrompt

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-3 sm:p-4 animate-slide-up">
      <div className="max-w-lg mx-auto">
        <div className="bg-white dark:bg-slate-900/95 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700/50 p-4 backdrop-blur-xl">
          <div className="flex items-start gap-3">
            {/* App icon */}
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center font-black text-white text-base tracking-tight shadow-lg shadow-teal-500/30 flex-shrink-0">
              SLI
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-0.5">
                Install GVSI SLI Tracker
              </h3>

              {manualMode ? (
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                    Your browser didn't show the automatic prompt — here's how to add it manually:
                  </p>
                  {IS_IOS ? (
                    <ol className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                      <li className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500 dark:text-slate-400 flex-shrink-0">1</span>
                        Tap the <b>Share</b> button in Safari <span className="text-teal-600 dark:text-teal-400">(□↑)</span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500 dark:text-slate-400 flex-shrink-0">2</span>
                        Tap <b>Add to Home Screen</b>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500 dark:text-slate-400 flex-shrink-0">3</span>
                        Tap <b>Add</b> — it's now on your home screen
                      </li>
                    </ol>
                  ) : (
                    <ol className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                      <li className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500 dark:text-slate-400 flex-shrink-0">1</span>
                        Tap the menu <b>⋮</b> in the top-right of Chrome
                      </li>
                      <li className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500 dark:text-slate-400 flex-shrink-0">2</span>
                        Tap <b>Install app</b> or <b>Add to Home screen</b>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500 dark:text-slate-400 flex-shrink-0">3</span>
                        Tap <b>Install</b> — it's now on your home screen
                      </li>
                    </ol>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  Add to your home screen for quick access and offline support.
                </p>
              )}

              <div className="flex items-center gap-2">
                {!manualMode && (
                  <button
                    onClick={handleInstall}
                    className="px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white text-xs font-semibold transition-all duration-200 shadow-md shadow-teal-600/20"
                  >
                    Install App
                  </button>
                )}
                <button
                  onClick={handleDismiss}
                  className="px-3 py-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium transition"
                >
                  {manualMode ? 'Got it' : 'Not now'}
                </button>
              </div>
            </div>

            {/* Close button */}
            <button
              onClick={handleDismiss}
              className="w-6 h-6 flex items-center justify-center rounded-full text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex-shrink-0"
              title="Dismiss"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}