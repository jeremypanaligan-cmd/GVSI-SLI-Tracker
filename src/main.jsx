import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider } from './context/ThemeContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { UPDATE_AVAILABLE_EVENT } from './components/UpdatePrompt.jsx'
import { APP_VERSION } from './utils/version.js'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)

// Register service worker for offline caching
if ('serviceWorker' in navigator) {
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

        // New SW activated — the page still runs the old bundle, so surface a
        // refresh prompt (UpdatePrompt) instead of only logging this.
        const notifyUpdate = () => {
          if (!hadController) return
          console.log('[SW] New version available. Refresh to update.')
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
