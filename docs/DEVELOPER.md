# Accounts, sessions and the Developer console

Who can sign in, who is signed in right now, and how maintenance mode works.

## Accounts

Credentials live in the `sli_users` table of the Supabase project — **not** in the shared
Google Sheet any more. The sheet's `Login Credentials` tab was publicly readable through
its CSV export URL, which meant every password hash was downloadable by anyone with the
link. Table access is now closed (`RLS` on, no anonymous policy) and the only way to check
a password is the `verify_login` function.

| Column | Meaning |
|---|---|
| `username` | what people type at the login screen (e.g. `JSP`) |
| `password_hash` | lowercase SHA-256 hex of the password — the same scheme as before, so no password had to be reset |
| `full_name` | shown in the header and in the roster |
| `role` | free text, but `Developer` is special — it unlocks the console |
| `is_active` | set to `false` to disable someone without deleting them; a live session is revoked on its next heartbeat |

```sql
-- Add someone
insert into public.sli_users (username, password_hash, full_name, role)
values ('NEWUSER', '<sha256 hex>', 'Full Name', 'Supervisor');

-- Retire someone
update public.sli_users set is_active = false where username = 'OLDUSER';

-- Promote to Developer
update public.sli_users set role = 'Developer' where username = 'JSP';
```

Get the hash for a password: `printf '%s' 'the-password' | shasum -a 256`
(`sha256sum` on Linux, `Get-FileHash` on Windows).

> **Rotate the existing password.** The five hashes that were migrated from the sheet were
> publicly readable for as long as that tab was link-shared, and the scheme is unsalted
> SHA-256 — a guessable password can be brute-forced offline from its hash. Change the
> passwords, then store the new hashes here.

## Sessions

A successful sign-in opens a row in `sli_sessions` and returns its `token` to the browser.
The token is what the app carries in the signed-in session (`localStorage` when "keep me
signed in" is ticked, `sessionStorage` otherwise), and it is the credential for every
Developer action — the browser never asserts a role, Postgres reads it from the session.

That buys three things that were impossible with a browser-only gate:

* the roster can show **who is signed in and for how long**
* a session can be **revoked** (maintenance mode, `Force sign-out all`, or disabling a user)
* presence has something honest to hang off

Sessions expire on their own in the browser after 30 days (remembered) or 12 hours, and a
session stored by an app version that predates tokens is discarded, so every session in
use today is server-tracked.

## Presence — who is active

The app heartbeats **once a minute** while the tab is visible, and immediately when it
comes back into focus. One call answers three questions at once:

```
presence_ping(token, plan, view) → { token_valid, maintenance }
```

* records `last_seen_at`, and the plan/view the person is looking at
* reports whether the token is still valid — a revoked session signs itself out instead of
  sitting there looking signed in
* returns the maintenance state

Someone counts as **active** when `last_seen_at` is within the last 2 minutes. Closing the
tab sends `presence_leave` (with `keepalive`), so the roster clears promptly rather than
waiting the window out.

## The Developer console

Visible only to `role = 'Developer'` — an icon in the desktop utility group and an entry in
the mobile ⋮ menu. Nothing in it is protected by the button being hidden: each action calls
an RPC that re-checks the role against the caller's session token inside Postgres, so
opening the console by hand grants nothing.

| Section | Shows |
|---|---|
| **Build status** | the bundle actually loaded (the hashed file name), the build version, whether Supabase is configured, and which months each plan has archived |
| **Archive trim** | per plan, the archive switches from its own `CONFIG` tab and whether the last run moved its `IMPORTRANGE` window — with the reason when it refused |
| **Data source diagnostics** | per plan: the live-month source, the sheet payload, the months Supabase holds, what was handed to the parser, and which province-months still need the `YTD 2026` worksheet |
| **Active now** | username, full name, role, plan/view, session start, a live-ticking duration, and a count in the icon badge |
| **Maintenance mode** | the switch, the message users will read, an auto-off timer, who turned it on and when, plus **Force sign-out all** |
| **Recent sessions** | the last 25 sessions with their duration, and which were revoked — the "who came in, and for how long" trail |

The console refreshes itself every 30 seconds while open.

### Reading a trim refusal

**Archive trim** exists because a month can be safely in Supabase and still sitting in its
sheet, and nothing on the dashboard distinguishes that from a month that was never due. The
verdict is the archiver's own — it is written into the plan's `CONFIG` tab as `LAST_ARCHIVE` —
and the console reads that tab directly, outside the dashboard's data path. So a plan whose
`CONFIG` cannot be read shows an error on its own row and nothing else changes.

Two switches have to agree before a window moves. `TRIM` is the `CONFIG` row
(`ARCHIVE_TRIM`, `TRUE` by default) and decides whether any run may shrink a sheet at all;
`PLAN_SHEET_TRIM_ENABLED` is a constant inside each generated Apps Script and answers
whether *that* plan's history is certifiably in the database yet. A plan can therefore hold
its window while `TRIM` reads `TRUE` — which is exactly the case the reason line names, and
the reason the console shows both.

## Maintenance mode

**On:** everyone except a Developer sees a blocking screen with the message, who set it and
when it lifts. Developers keep working and get an amber banner instead, so they can verify
the state they just set.

**Off:** the switch clears; `since`/`by` are dropped and the previous status is gone.

### Auto-off, and why it exists

The timer defaults to **2 hours** and can be set to 30 minutes, 1, 2, 4 or 8 hours, or
"no auto-off". It is enforced twice: the server reports an expired switch as disabled, and
the app re-checks `expires_at` itself. A forgotten switch therefore cannot leave the team
locked out overnight.

### When Supabase is unreachable

The app **fails open**: it keeps the last known state, flags it as stale in the block
screen, and carries on. An outage of the sign-in service must not take the dashboard down,
and the dashboard is operational data people may need right then.

### What maintenance mode is not

It is a **coordination tool, not a security control.** The check runs in the browser and
the dashboard's data still comes from public sheet exports, so anyone willing to edit the
JavaScript or fetch the sheet directly can bypass it. Enforcing it for real means moving
all data behind Supabase so RLS can refuse the read — the natural next step is retiring the
public `COMPLETED AGING REPORT` and `<PLAN> DATA` tabs the same way the archive retired
`RAW DATA` and `MTD`.

## Getting into the Supabase project

The app talks to one project — **GVSI NetPulse**, ref `fsebdacptgoknbjqdlor` (region
`ap-northeast-2`, Seoul). It is shared with the NetPulse app, so look before you delete.

| What you want | Where |
|---|---|
| The dashboard | <https://supabase.com/dashboard/project/fsebdacptgoknbjqdlor> |
| Rows — `sli_users`, `sli_sessions`, `sli_settings`, `sli_raw_daily`, `sli_mtd` | **Table Editor** (`sli_*` is the SLI Tracker, everything else is NetPulse) |
| Ad-hoc queries | **SQL Editor** — this is also where `supabase/schema.sql` was applied |
| The service_role secret | **Project Settings → API keys** |
| Who can open the project at all | **Organization → Team** — you must be a member |

You need a Supabase account that is a member of the organization owning that project. Ask
whoever created it to invite you; there is no separate SLI Tracker account.

Two keys exist and they are not interchangeable:

* **anon key** — ships inside the public app bundle (`src/config/supabase.js`), so treat it
  as public. RLS stops it from reading anything on its own; see the table below.
* **service_role key** — bypasses RLS entirely, so it is the only key that can write archive
  rows. It never goes in this repo, in `src/`, or in a chat message. It belongs in the Apps
  Script's **Project Settings → Script Properties** as `SUPABASE_SERVICE_KEY`, together with
  `SUPABASE_URL` and the optional `ALERT_EMAIL` — see [ARCHIVE.md](ARCHIVE.md).

The browser never speaks to Postgres directly: it only calls the RPCs in
[`supabase/schema.sql`](../supabase/schema.sql). To browse the data yourself without the
dashboard, the same RPCs answer over plain HTTP:

```bash
curl -s "https://fsebdacptgoknbjqdlor.supabase.co/rest/v1/rpc/maintenance_get" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H 'Content-Type: application/json' -d '{}'
# → {"enabled":false}
```

## RLS — what the public anon key can and cannot do

| Table | anon (in the app bundle) |
|---|---|
| `sli_users`, `sli_sessions`, `sli_settings` | **nothing** — `401 permission denied` |
| `sli_raw_daily`, `sli_mtd` | readable; writes need the service_role key |

All app access goes through the RPCs in [`supabase/schema.sql`](../supabase/schema.sql).
Verify it yourself:

```bash
curl -s "https://fsebdacptgoknbjqdlor.supabase.co/rest/v1/sli_users?select=username" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
# → {"code":"42501","message":"permission denied for table sli_users"}
```
