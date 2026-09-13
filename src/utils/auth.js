import { parseCSV } from './csvParser'
import { AUTH_URL } from '../config/plans'

/**
 * Client-side access gate for the GVSI SLI Tracker.
 *
 * Credentials live in the `Login Credentials` tab of the FIBERX spreadsheet as
 * `Username | PasswordHash | FullName | Role`, where PasswordHash is the lowercase
 * SHA-256 hex of the plain password.
 *
 * NOTE: this is a convenience gate, not real security — the sheet is publicly
 * readable and the check runs in the browser, so it can be bypassed. See the README.
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

/**
 * Returns the matching user, or null when the username is unknown or the
 * password does not hash to the stored value.
 */
export async function verifyCredentials(credentials, username, password) {
  const name = String(username || '').trim().toLowerCase()
  const user = (credentials || []).find((entry) => entry.username.toLowerCase() === name)
  if (!user) return null

  const hash = await sha256Hex(String(password || ''))
  return hash === user.passwordHash ? user : null
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
