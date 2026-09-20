import { useCallback, useEffect, useRef, useState } from 'react'
import {
  pingPresence, fetchMaintenanceState, fetchActiveUsers, fetchRecentSessions,
} from '../utils/presence'

const HEARTBEAT_MS = 60 * 1000
const ROSTER_MS = 30 * 1000

/**
 * Heartbeats the signed-in session once a minute and keeps the maintenance state
 * fresh.
 *
 * Three things come out of the single ping:
 *   * presence — the Developer roster's "active now" list
 *   * maintenance — the switch, so an enabled run locks non-Developers out
 *   * token validity — a revoked session signs itself out instead of sitting there
 *     looking signed in
 *
 * When Supabase cannot be reached the last known state is kept and flagged `stale`,
 * and the app keeps working: an outage must never take the dashboard down.
 */
export function usePresence({ user, plan, view, onTokenInvalid }) {
  const token = user?.token || null
  const [state, setState] = useState({
    maintenance: { enabled: false },
    stale: false,
    checkedAt: null,
  })

  const invalidRef = useRef(onTokenInvalid)
  invalidRef.current = onTokenInvalid

  const contextRef = useRef({ plan, view })
  contextRef.current = { plan, view }

  const check = useCallback(async () => {
    if (token) {
      try {
        const result = await pingPresence(token, contextRef.current.plan, contextRef.current.view)
        if (result) {
          setState({ maintenance: result.maintenance, stale: false, checkedAt: Date.now() })
          if (!result.tokenValid) invalidRef.current?.()
          return
        }
      } catch (error) {
        console.warn('[Presence] heartbeat failed:', error.message)
      }
    }

    // Signed out, or the heartbeat failed — the public read still keeps the
    // maintenance notice honest.
    try {
      const maintenance = await fetchMaintenanceState()
      setState({ maintenance, stale: false, checkedAt: Date.now() })
    } catch {
      setState((prev) => ({ ...prev, stale: true }))
    }
  }, [token])

  useEffect(() => { check() }, [check])

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    const timer = setInterval(onVisible, HEARTBEAT_MS)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [check])

  // NOTE: presence_leave is deliberately NOT wired to pagehide/visibilitychange.
  // A reload fires pagehide too, so ending the session there signed the user out on
  // every refresh: the next heartbeat found a finished session and revoked it.
  // Instead the roster simply ages out — someone counts as active for 2 minutes after
  // their last heartbeat — and presence_leave is only sent on a real sign-out.

  return { ...state, refresh: check }
}

/**
 * The Developer roster. Polls only while a Developer is signed in, and only while
 * `enabled` is true, so ordinary users cost nothing.
 */
export function useDevRoster(token, enabled) {
  const [state, setState] = useState({ active: [], recent: [], error: '', loading: false })

  const load = useCallback(async () => {
    if (!enabled || !token) return
    setState((prev) => ({ ...prev, loading: true }))
    try {
      const [active, recent] = await Promise.all([
        fetchActiveUsers(token),
        fetchRecentSessions(token, 25),
      ])
      setState({ active: active || [], recent: recent || [], error: '', loading: false })
    } catch (error) {
      setState((prev) => ({ ...prev, error: error.message, loading: false }))
    }
  }, [token, enabled])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!enabled || !token) return
    const timer = setInterval(load, ROSTER_MS)
    return () => clearInterval(timer)
  }, [enabled, token, load])

  return { ...state, refresh: load }
}
