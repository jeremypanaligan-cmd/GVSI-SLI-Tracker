/**
 * Shared bits for the end-to-end smoke test.
 *
 * Two rules this file exists to keep:
 *
 * 1. **Nothing here is a second source of truth.** The Supabase URL, the anon key and the
 *    year the section covers are imported from the app's own config, so a project change or
 *    a rotated key is one edit in one place, and a test that keeps passing against a stale
 *    copy is not a thing that can happen.
 *
 * 2. **The credentials never enter the repository.** Signing in goes through `verify_login`,
 *    which hashes the password in the browser and compares it inside Postgres — so the test
 *    needs the real password, and the only safe place for it is outside the working copy:
 *    a gitignored `.env.e2e`, or the environment. Without one, the signed-in test skips
 *    with a message instead of failing, so `npm run test:e2e` stays useful on a fresh clone.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../../src/config/supabase.js'
import { YTD_YEAR } from '../../src/config/plans.js'

export { SUPABASE_ANON_KEY, SUPABASE_URL, YTD_YEAR }

/**
 * Where the app is being served. The trailing slash matters: the app's own base is
 * `/GVSI-SLI-Tracker/`, and `page.goto('/')` would be resolved against the origin and land
 * on a 404 that looks nothing like a broken deploy.
 */
export const APP_URL =
  process.env.E2E_BASE_URL || 'https://jeremypanaligan-cmd.github.io/GVSI-SLI-Tracker/'

/**
 * The two tabs the Year-to-Date section no longer reads, by `gid` — `YTD 2026` and
 * `TARGET 2026` of the shared workbook (`src/config/plans.js` names them in a comment now).
 * A request carrying either one means something is still reaching for the worksheet, which
 * is the one regression that would not show up as a wrong number on screen: the app would
 * simply keep working, off a source it is supposed to have stopped reading.
 */
export const RETIRED_YEAR_TAB_GIDS = ['1253792447', '1221052795']

/** True for any URL that would read one of the retired year tabs. */
export function isRetiredTabUrl(url) {
  return RETIRED_YEAR_TAB_GIDS.some((gid) => String(url).includes(`gid=${gid}`))
}

// ── the environment ──────────────────────────────────────────────────────────

/**
 * Read `KEY=value` lines from a file into `process.env`, without a dependency and without
 * overwriting anything already set — the environment wins, so a one-off run can override the
 * file with `E2E_USERNAME=… npm run test:e2e`.
 */
export function loadEnvFile(file = path.join(process.cwd(), '.env.e2e')) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return
  }

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const equals = line.indexOf('=')
    if (equals === -1) continue

    const key = line.slice(0, equals).trim()
    let value = line.slice(equals + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key && process.env[key] === undefined) process.env[key] = value
  }
}

/** The account the signed-in test uses, or empty strings when none is configured. */
export function credentials() {
  loadEnvFile()
  return {
    username: process.env.E2E_USERNAME || '',
    password: process.env.E2E_PASSWORD || '',
  }
}

// ── Supabase, read the way the app reads it ──────────────────────────────────

/** The anon headers the browser sends — the same key, so the same rows are visible. */
export function supabaseHeaders() {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Is the dashboard gated right now? Maintenance only blocks non-Developers, and the account
 * this test uses is not necessarily a Developer — so a window would fail the run for a reason
 * that has nothing to do with `sli_targets`. Asked through the public RPC the login screen
 * itself uses, and an expired window counts as off, exactly as `normalizeMaintenance` decides.
 */
export async function maintenanceIsOn(request) {
  const response = await request.post(`${SUPABASE_URL}/rest/v1/rpc/maintenance_get`, {
    headers: supabaseHeaders(),
    data: {},
  })
  if (!response.ok()) return false

  const state = await response.json().catch(() => null)
  if (!state || state.enabled !== true) return false
  if (state.expires_at && Date.parse(state.expires_at) <= Date.now()) return false
  return true
}

/**
 * The year plan (`sli_targets`) for one plan, read straight from PostgREST — the same route
 * and the same anon role the app uses, but in the test's own connection. That is what makes
 * the assertions real: the expected figures are computed from the database at run time
 * rather than written down here, so a corrected target does not have to be typed twice, and
 * the test cannot pass by agreeing with a stale number.
 *
 * @returns {Promise<{rowCount:number, months:string[], areas:string[], byMonth:Record<string,number>, annualTotal:number}>}
 */
export async function fetchYearPlan(request, planId) {
  const url =
    `${SUPABASE_URL}/rest/v1/sli_targets?plan=eq.${planId}&select=month_key,area,target`
  const response = await request.get(url, { headers: supabaseHeaders() })
  if (!response.ok()) {
    throw new Error(`sli_targets responded ${response.status()} for ${planId}`)
  }

  const rows = await response.json()
  const byMonth = {}
  const areas = new Set()
  let annualTotal = 0

  for (const row of rows) {
    const target = Number(row.target) || 0
    byMonth[row.month_key] = (byMonth[row.month_key] || 0) + target
    areas.add(row.area)
    annualTotal += target
  }

  return {
    rowCount: rows.length,
    months: Object.keys(byMonth).sort(),
    areas: [...areas],
    byMonth,
    annualTotal,
  }
}

/** `2026-08` for strip cell 7 — the year the section covers plus the cell's own order. */
export function monthKeyForIndex(index, year = YTD_YEAR) {
  return `${year}-${String(index + 1).padStart(2, '0')}`
}

/** '30,466' → 30466. The rendered figure, back as a number so it can be compared. */
export function toNumber(text) {
  if (text == null) return null
  const cleaned = String(text).replace(/[^0-9.-]/g, '')
  return cleaned === '' ? null : Number(cleaned)
}
