import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_ENABLED } from '../config/supabase'

/**
 * Presence, maintenance and the Developer roster — all through Supabase RPCs.
 *
 * None of these functions can read the tables directly: `sli_sessions` and
 * `sli_settings` have RLS on with no anonymous policy. The privileged calls
 * (`active_users`, `recent_sessions`, `maintenance_set`, `force_signout_all`) pass the
 * caller's session token and Postgres checks the role inside the function, so the
 * browser cannot talk itself into Developer access.
 *
 * Every call is best-effort by design: a Supabase outage must degrade to "still works,
 * maybe stale", never to a broken dashboard.
 */

async function rpc(name, body, { keepalive = false } = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body || {}),
    keepalive,
  })

  if (!response.ok) {
    let detail = ''
    try {
      const payload = await response.json()
      detail = payload?.message || payload?.hint || ''
    } catch { /* ignore */ }
    const error = new Error(detail || `${name} responded ${response.status}`)
    error.status = response.status
    throw error
  }
  if (response.status === 204) return null
  return response.json()
}

/** The maintenance switch as the app should read it — expired counts as off. */
export function normalizeMaintenance(raw) {
  if (!raw || raw.enabled !== true) {
    return { enabled: false, expired: raw?.expired === true }
  }
  // Belt and braces: the server already reports an expired flag as disabled, and the
  // app re-checks here so a stale cached payload can never lock the team out.
  if (raw.expires_at && Date.parse(raw.expires_at) <= Date.now()) {
    return { enabled: false, expired: true }
  }
  return {
    enabled: true,
    message: raw.message || '',
    since: raw.since || null,
    by: raw.by || null,
    expiresAt: raw.expires_at || null,
  }
}

/** Public: works before sign-in, so the login screen can show the notice too. */
export async function fetchMaintenanceState() {
  if (!SUPABASE_ENABLED) return { enabled: false }
  return normalizeMaintenance(await rpc('maintenance_get'))
}

/**
 * One heartbeat that answers three questions at once: record me as active, is my
 * session still valid, and what is the maintenance switch doing.
 */
export async function pingPresence(token, plan, view) {
  if (!SUPABASE_ENABLED || !token) return null

  const result = await rpc('presence_ping', {
    p_token: token,
    p_plan: plan || null,
    p_view: view || null,
  })

  return {
    tokenValid: result?.token_valid !== false,
    maintenance: normalizeMaintenance(result?.maintenance),
  }
}

export async function fetchActiveUsers(token) {
  if (!SUPABASE_ENABLED || !token) return []
  return rpc('active_users', { p_token: token })
}

export async function fetchRecentSessions(token, limit = 25) {
  if (!SUPABASE_ENABLED || !token) return []
  return rpc('recent_sessions', { p_token: token, p_limit: limit })
}

export async function setMaintenance(token, { enabled, message, expiresAt }) {
  if (!SUPABASE_ENABLED || !token) throw new Error('Maintenance mode needs a signed-in Developer session.')
  return normalizeMaintenance(
    await rpc('maintenance_set', {
      p_token: token,
      p_enabled: !!enabled,
      p_message: message || null,
      p_expires_at: expiresAt || null,
    })
  )
}

/** Returns how many sessions were revoked. */
export async function forceSignOutAll(token, keepSelf = true) {
  if (!SUPABASE_ENABLED || !token) throw new Error('Force sign-out needs a signed-in Developer session.')
  return rpc('force_signout_all', { p_token: token, p_keep_self: keepSelf })
}

/** Human duration from a second count: '3h 12m'. */
export function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)

  if (days) return `${days}d ${hours}h`
  if (hours) return `${hours}h ${minutes}m`
  if (minutes) return `${minutes}m`
  return `${total}s`
}
