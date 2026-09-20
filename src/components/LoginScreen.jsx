import { useEffect, useRef, useState } from 'react'
import AppLogo from './AppLogo'
import { useAuth } from '../context/AuthContext'
import { signIn as signInWithCredentials } from '../utils/auth'
import { fetchMaintenanceState } from '../utils/presence'

export default function LoginScreen() {
  const { signIn, notice, clearNotice } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const usernameRef = useRef(null)
  const [maintenance, setMaintenance] = useState({ enabled: false })

  useEffect(() => { usernameRef.current?.focus() }, [])

  // Public read, so the notice is visible before anyone signs in. Best effort: a
  // Supabase outage must not stop someone from signing in.
  useEffect(() => {
    let cancelled = false
    fetchMaintenanceState()
      .then((state) => { if (!cancelled) setMaintenance(state) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (busy) return

    setError('')
    clearNotice()
    if (!username.trim() || !password) {
      setError('Enter your username and password.')
      return
    }

    setBusy(true)
    try {
      // The password is hashed in the browser and verified inside Postgres, so the
      // hash never leaves this device in a form anything else can replay against
      // the sheet.
      const user = await signInWithCredentials(username, password)

      if (!user) {
        setError('Invalid username or password.')
        return
      }
      signIn(user, remember)
    } catch (err) {
      const message = String(err?.message || '')
      setError(
        message.startsWith('Sign-in needs')
          ? message
          : `${message || 'Could not sign in.'} Check your connection and try again.`
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-[#070A0F] font-sans">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex flex-col items-center mb-6">
          <AppLogo className="w-14 h-14 rounded-2xl shadow-lg shadow-teal-500/25" />
          <h1 className="mt-3 text-lg font-bold text-slate-900 dark:text-white tracking-tight">
            <span className="text-teal-600 dark:text-teal-400">GVSI</span> SLI Tracker
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Gallopvision Services, Inc.</p>
        </div>

        {maintenance.enabled && (
          <div className="mb-3 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2.5">
            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Maintenance mode
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-amber-700/90 dark:text-amber-300/90">
              {maintenance.message || 'Pansamantalang naka-off ang dashboard habang may inaayos.'}
              {' '}Puwede kang mag-sign in, pero haharangin ka hanggang matapos.
            </p>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 backdrop-blur-xl shadow-2xl shadow-black/5 dark:shadow-black/30 p-5"
        >
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Username</span>
            <input
              ref={usernameRef}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="e.g. JSP"
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950/60 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 transition"
            />
          </label>

          <label className="block mt-3">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Password</span>
            <div className="relative mt-1">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                spellCheck={false}
                placeholder="••••••••"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950/60 px-3 py-2 pr-10 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                {showPassword ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </label>

          <label className="flex items-center gap-2 mt-4 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-teal-600 focus:ring-teal-500/40"
            />
            <span className="text-xs text-slate-600 dark:text-slate-400">Keep me signed in on this device</span>
          </label>

          {notice && !error && (
            <p role="status" className="mt-4 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg px-3 py-2">
              {notice}
            </p>
          )}

          {error && (
            <p role="alert" className="mt-4 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-5 w-full rounded-lg bg-teal-600 hover:bg-teal-500 active:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 transition-all duration-200 shadow-md shadow-teal-600/20 flex items-center justify-center gap-2"
          >
            {busy && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
          Internal use only — customer-facing reporting. Access is limited to authorized GVSI staff.
        </p>
      </div>
    </div>
  )
}
