import { parseCSV } from './csvParser'
import { AUTH_URL } from '../config/plans'
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_ENABLED } from '../config/supabase'

/**
 * Client-side access gate for the GVSI SLI Tracker.
 *
 * Sign-in is now verified by the `verify_login` RPC on Supabase: the browser sends the
 * SHA-256 of the password, Postgres compares it against `sli_users`, and on a match it
 * opens a session row and returns the user plus a session **token**.
 *
 * What that buys over the old credentials sheet:
 *   * password hashes are no longer readable by anyone with the sheet URL — `sli_users`
 *     has RLS on with no anonymous policy, so only the RPC can compare them
 *   * `role` comes from the server, so it can be trusted for Developer-only actions
 *   * the token is how the app reports presence, notices a forced sign-out, and reads
 *     the maintenance switch
 *
 * NOTE: this is still a convenience gate, not real security — the check runs in the
 * browser and the dashboard data itself comes from public sheet exports. See the
 * README. The `keep me signed in` session below is what makes offline sign-in work.
 *
 * If SUPABASE_ENABLED is switched off in `src/config/supabase.js`, the old
 * credentials-sheet path takes over so the app can never be locked out.
 */

const SESSION_KEY = 'gvsi_session'
const REMEMBER_DAYS = 30
const SESSION_HOURS = 12

/** SHA-256 of a string as lowercase hex. Needs a secure context (https or localhost). */
export async function sha256Hex(text) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Sign-in needs a secure connection (https:// or localhost).')
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

function supabaseHeaders() {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Sign in through the `verify_login` RPC.
 * Returns `{ username, fullName, role, token }`, or null when the credentials do not
 * match. Throws (with a distinct message) when the service cannot be reached, so the
 * login screen can tell "wrong password" apart from "no connection".
 */
export async function signIn(username, password) {
  if (!SUPABASE_ENABLED) return legacySignIn(username, password)

  const hash = await sha256Hex(String(password || ''))

  let response
  try {
    response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/verify_login`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify({
        p_username: String(username || '').trim(),
        p_hash: hash,
        p_user_agent: String(navigator.userAgent || '').slice(0, 300),
      }),
    })
  } catch {
    throw new Error('Could not reach the sign-in service.')
  }

  if (!response.ok) throw new Error('Could not reach the sign-in service.')
  const rows = await response.json()
  if (!Array.isArray(rows) || rows.length === 0) return null

  const row = rows[0]
  return {
    username: row.username,
    fullName: row.full_name || row.username,
    role: row.role || '',
    token: row.token || null,
  }
}

/**
 * Tells the server the session is over, so the Developer roster does not keep showing
 * someone who already left. Best effort — signing out locally must never fail.
 */
export async function endRemoteSession(token) {
  if (!SUPABASE_ENABLED || !token) return
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/presence_leave`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify({ p_token: token }),
      keepalive: true,
    })
  } catch { /* ignore */ }
}

/** True when the signed-in user may use the Developer panel. */
export function isDeveloper(user) {
  return String(user?.role || '').trim().toLowerCase() === 'developer'
}

// ── Session ──────────────────────────────────────────────────────────────────

/** The stored session, or null when missing/expired. */
export function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null

    const session = JSON.parse(raw)
    if (!session?.username) return null
    if (session.expiresAt && Date.now() > session.expiresAt) {
      clearSession()
      return null
    }
    // A session kept by an older version has no token, so it could not be tracked or
    // revoked. Requiring one costs a single sign-in and keeps every session honest.
    if (SUPABASE_ENABLED && !session.token) {
      clearSession()
      return null
    }
    return session
  } catch {
    return null
  }
}

/** Persist a session — localStorage when remembered, sessionStorage otherwise. */
export function saveSession(user, remember) {
  const ttl = remember ? REMEMBER_DAYS : SESSION_HOURS
  const session = {
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    token: user.token || null,
    issuedAt: Date.now(),
    expiresAt: Date.now() + ttl * 60 * 60 * 1000,
  }

  try {
    clearSession()
    // Never keep the password hash around in storage
    const store = remember ? localStorage : sessionStorage
    store.setItem(SESSION_KEY, JSON.stringify(session))
  } catch { /* ignore */ }

  return session
}

export function clearSession() {
  try { localStorage.removeItem(SESSION_KEY) } catch { /* ignore */ }
  try { sessionStorage.removeItem(SESSION_KEY) } catch { /* ignore */ }
}

// ── Legacy credentials-sheet path (only when SUPABASE_ENABLED is false) ──────

/** Load the credentials tab, normalised to { username, passwordHash, fullName, role }. */
export async function fetchCredentials() {
  const response = await fetch(AUTH_URL)
  if (!response.ok) throw new Error(`Credentials sheet responded ${response.status}.`)

  const { objects } = parseCSV(await response.text())

  return objects
    .map((row) => {
      // Header-name lookup, so column order (or spacing) can change freely
      const cells = {}
      Object.entries(row).forEach(([header, value]) => {
        cells[String(header).replace(/[^a-z0-9]/gi, '').toLowerCase()] = String(value ?? '').trim()
      })
      return {
        username: cells.username || '',
        passwordHash: (cells.passwordhash || '').toLowerCase(),
        fullName: cells.fullname || cells.username || '',
        role: cells.role || '',
      }
    })
    .filter((user) => user.username && user.passwordHash)
}

export async function verifyCredentials(credentials, username, password) {
  const name = String(username || '').trim().toLowerCase()
  const user = (credentials || []).find((entry) => entry.username.toLowerCase() === name)
  if (!user) return null

  const hash = await sha256Hex(String(password || ''))
  return hash === user.passwordHash ? { ...user, token: null } : null
}

async function legacySignIn(username, password) {
  const credentials = await fetchCredentials()
  return verifyCredentials(credentials, username, password)
}
