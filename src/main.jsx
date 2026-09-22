import React, { useCallback, useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider } from './context/ThemeContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import UpdateRequired from './components/UpdateRequired.jsx'
import { APP_VERSION } from './utils/version.js'
import { UPDATE_AVAILABLE_EVENT, fetchDeployedVersion, isUpdateRequired } from './utils/appUpdate.js'
import App from './App.jsx'
import './index.css'

/** Shown while the first version check is in flight — it decides whether we may start. */
function UpdateSplash() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#070A0F]">
      <img
        src={`${import.meta.env.BASE_URL}brand-mark.svg`}
        alt=""
        className="w-10 h-10 opacity-80"
      />
      <p className="text-xs text-slate-500">Checking for updates…</p>
    </div>
  )
}

/**
 * Gate the app behind the version the server is actually serving.
 *
 * Rendered above every provider, so the check cannot be skipped by anything downstream:
 * the login screen is behind it too, because a stale bundle is exactly what breaks
 * sign-in (it points at the previous credentials source). See src/utils/appUpdate.js for
 * why this is a block rather than the dismissible prompt it replaces.
 */
function Bootstrap() {
  const [deployed, setDeployed] = useState(undefined)
  const [checked, setChecked] = useState(false)

  const check = useCallback(async () => {
    const version = await fetchDeployedVersion()
    setDeployed(version)
    setChecked(true)
    return version
  }, [])

  useEffect(() => {
    check()

    // A release can land while the app is open. Re-check whenever it comes back to the
    // foreground, and whenever the service worker reports a new one has activated.
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(UPDATE_AVAILABLE_EVENT, check)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(UPDATE_AVAILABLE_EVENT, check)
    }
  }, [check])

  if (isUpdateRequired(deployed)) {
    return <UpdateRequired deployedVersion={deployed} onRecheck={check} />
  }

  if (!checked) return <UpdateSplash />

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Bootstrap />
  </React.StrictMode>,
)

// Register service worker for offline caching — PRODUCTION ONLY.
//
// In development it caches `/src/*.jsx` and Vite's pre-bundled dependencies, so after the
// dev server re-optimizes them the page can load a mix of old and new modules. That
// surfaces as "Invalid hook call" / two copies of React behind the error boundary, and it
// only clears when the caches are dropped — the same hard-refresh dance this change is
// about, in miniature. The update gate is a page-level check and works in dev regardless.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // An already-controlled page is an existing install, so a worker that
  // activates from here on is an *update* rather than the first install.
  const hadController = !!navigator.serviceWorker.controller

  window.addEventListener('load', () => {
    navigator.serviceWorker
      // The ?v= query versions the worker (and therefore its cache names) per release
      .register(`/GVSI-SLI-Tracker/sw.js?v=${APP_VERSION}`, { scope: '/GVSI-SLI-Tracker/' })
      .then((reg) => {
        // Check for SW updates on focus (when user returns to tab)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            reg.update()
          }
        })

        // A new worker has taken over and the page still runs the old bundle. The event
        // only asks Bootstrap to re-read the server's version — the gate, not this
        // listener, decides what the user sees.
        const notifyUpdate = () => {
          if (!hadController) return
          console.log('[SW] New version available. Re-checking the deployed version.')
          window.dispatchEvent(new CustomEvent(UPDATE_AVAILABLE_EVENT))
        }

        // Update that was already installed and waiting before we registered
        if (hadController && reg.waiting) notifyUpdate()

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              // sw.js calls skipWaiting(), so the new worker activates at once;
              // 'installed' covers browsers that hold it waiting instead.
              if (newWorker.state === 'activated' || newWorker.state === 'installed') {
                notifyUpdate()
              }
            })
          }
        })
      })
      .catch(() => {})
  })
}
