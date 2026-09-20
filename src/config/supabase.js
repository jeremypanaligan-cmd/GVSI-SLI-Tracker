/**
 * Supabase project behind the cold archive (closed months) and the account /
 * session / presence / maintenance features.
 *
 * The key below is the PUBLIC anon key and it does ship inside the bundle — that is
 * by design. Every table in the project has RLS enabled with NO anonymous read
 * policy, so this key cannot read users, password hashes, sessions or settings
 * directly. All it can do is call the RPCs in `supabase/schema.sql`:
 *
 *   verify_login        → the only way to read a user row (needs the password hash)
 *   presence_ping       → heartbeat; also returns the maintenance state
 *   maintenance_get     → public, so the login screen can show the banner
 *   active_users / recent_sessions / maintenance_set / force_signout_all
 *                       → Developer-only; the role is checked against the caller's
 *                         session token inside the function, never in the browser
 *
 * Archive WRITES use the service_role key, which never leaves the Apps Script's
 * Script Properties. Rotating that key therefore cannot break the app.
 *
 * Switching project or rotating the anon key is a one-line edit here.
 */

export const SUPABASE_URL = 'https://fsebdacptgoknbjqdlor.supabase.co'

// Legacy JWT anon key — accepted by PostgREST as the `anon` role.
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzZWJkYWNwdGdva25ianFkbG9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1Njg1MTEsImV4cCI6MjEwNTE0NDUxMX0.V4Q8eXuFU8KIdp1ck8zPff7RNz75NZdTO21CgVC1BDc'

/**
 * Kill switch. When false the app behaves exactly as it did before Supabase existed:
 * sheet-only data, credential-sheet login, no presence, no maintenance gate. Useful
 * while a project is migrating, or if the project is ever rotated away.
 */
export const SUPABASE_ENABLED = true
