import { useState } from 'react'
import { APP_VERSION } from '../utils/version'
import { applyUpdate } from '../utils/appUpdate'

/**
 * The blocking screen shown when the server is serving a different version than the one
 * this device is running.
 *
 * It has no dismiss: the old build is the one that broke — a release that changes the data
 * source or the login path leaves a stale bundle with numbers and credentials it can no
 * longer use — and the only way past it is to take the new build. Shown before the login
 * form exists, so nobody enters credentials into a build that cannot use them.
 */
export default function UpdateRequired({ deployedVersion, onRecheck }) {
  const [busy, setBusy] = useState(false)
  const [waiting, setWaiting] = useState(false)

  const update = () => {
    setBusy(true)
    applyUpdate(deployedVersion)
  }

  const recheck = async () => {
    setWaiting(true)
    try {
      if (onRecheck) await onRecheck()
    } finally {
      setWaiting(false)
    }
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="update-required-title"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[#070A0F] px-4 py-8 overflow-y-auto"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-700/60 bg-slate-900/95 shadow-2xl p-6 text-center">
        <span className="mx-auto w-12 h-12 rounded-xl bg-teal-500/15 flex items-center justify-center">
          <svg className="w-6 h-6 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </span>

        <h1 id="update-required-title" className="mt-4 text-lg font-bold text-white">
          Update required
        </h1>

        <p className="mt-2 text-sm text-slate-300 leading-relaxed">
          A newer version of the SLI Tracker is available. Your device is still running the
          previous one — please update before continuing, so the figures and the sign-in
          you see are the current ones.
        </p>

        <div className="mt-4 flex items-center justify-center gap-3 text-[11px] font-mono text-slate-400">
          <span className="px-2 py-1 rounded bg-slate-800/80 border border-slate-700/60">
            your build v{APP_VERSION}
          </span>
          <span aria-hidden="true">→</span>
          <span className="px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
            newest v{deployedVersion}
          </span>
        </div>

        <button
          type="button"
          onClick={update}
          disabled={busy}
          className="mt-6 w-full px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 active:bg-teal-700 disabled:opacity-60 text-white text-sm font-semibold transition-all duration-200 shadow-lg shadow-teal-600/20"
        >
          {busy ? 'Updating…' : 'Update now'}
        </button>

        <button
          type="button"
          onClick={recheck}
          disabled={waiting}
          className="mt-2 w-full px-4 py-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 disabled:opacity-60 text-xs font-medium transition"
        >
          {waiting ? 'Checking…' : 'Check again'}
        </button>

        <p className="mt-4 text-[11px] text-slate-500 leading-relaxed">
          If nothing happens, close the app completely and open it again. No data is deleted
          — only the copy of the app stored on this device.
        </p>
      </div>
    </div>
  )
}
