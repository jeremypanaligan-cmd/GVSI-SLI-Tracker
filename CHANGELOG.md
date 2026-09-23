# GVSI SLI Tracker — Changelog

All notable changes to the **GVSI SLI Tracker** Progressive Web App are documented here.

---

## [Unreleased]

### ✨ Features

- **The spreadsheet can finally stop growing.** A month that has been copied to Supabase and
  verified can now be taken out of `NEW REPORT` even when that tab is a live `IMPORTRANGE`
  mirror — by moving the range's start row past it, `A1:M` to `A19:M`, instead of deleting
  formula output. The archive previously refused outright: removing a spilled formula's rows
  does not remove data, it tears the formula out of `A1`, which is what had to be pasted back
  by hand on 2026-09-21. The mirror's block layout, cell types and 13-column contract are
  untouched, because the range still spills whole rows straight from the source
- **The new start row is read from the source spreadsheet**, not counted in the mirror. The id
  and tab name come out of the formula itself, so the answer stays correct when rows near the
  top of `BIDA DAILY` are deleted; if the source cannot be opened it falls back to counting in
  the mirror, and the audit line says which was used
- It runs **once per archive run**, after every due month has been uploaded and verified. The
  trim now has **its own switch, `ARCHIVE_TRIM`, and it is `TRUE` by default** — pressing
  *Archive Closed Months to Supabase* (or letting the 02:00 trigger run) is now enough for the
  archived month to leave `NEW REPORT` as soon as Supabase is verified to hold it, with no
  second setting to remember. It no longer rides on `ARCHIVE_PURGE`, which stays `FALSE` by
  default because deleting rows from a hand-encoded tab is the one step that cannot be taken
  back: a window move is a single range that **Restore Full History** undoes, so the two acts
  are gated separately. `Setup / Edit CONFIG Sheet` seeds the new key
- The two switches now answer different questions, and the audit line says so. With
  `ARCHIVE_TRIM = FALSE` the run reports `hindi naka-TRUE ang ARCHIVE_TRIM, kaya hindi
  gumagalaw ang window ng …` instead of a generic "nothing was deleted", so the reason a sheet
  did not shrink is readable from `LAST_ARCHIVE` alone
- Two new menu items: **Preview Formula Trim** (the formula it would write and each guard's
  verdict, writing nothing) and **Restore NEW REPORT Formula (full history)** (back to `A1:M`,
  then a Full Sync). Enabled for BIDA only (`PLAN_SHEET_TRIM_ENABLED`); FIBERX and SME keep
  their windows until their own months are verifiably reaching Supabase

### 🐛 Fixes

- The archive harness now proves the trim end to end: one **real** (non-dry) run of
  `archiveClosedMonths` with `ARCHIVE_PURGE = FALSE` and `ARCHIVE_TRIM = TRUE`, with the three
  Supabase calls held in memory so the checksum gate is judged against what the run actually
  uploaded rather than against a hand-fed answer. It asserts the month is archived, the window
  moves to September in the same pass, no rows are deleted, and the run's own `LAST_ARCHIVE`
  line records both halves
- **The window never narrows past a month the database does not have.** Every month older than
  the new start must have been archived *in that same run*, or the trim refuses and reports
  which month it would have dropped. It also refuses when there is no later month to start at —
  a month whose successor has not been filled yet stays in the sheet for a day rather than
  leaving the mirror empty — and it never moves backwards
- **A move that does not land is undone.** `IMPORTRANGE` recalculates asynchronously, so after
  writing the formula the run waits for the spill to actually reach the new month; if it does
  not settle within 20 seconds the old formula is written back and the audit line says so. That
  check is also what catches a source sheet whose rows shifted under the trim

## [1.17.0] — 2026-09-23

### ✨ Features

- **The Provincial Year-to-Date table exports to CSV.** One row per province plus the overall
  total, with every column the table shows — `YTD`, `PLAN TO DATE`, `% OF PLAN`, `ANNUAL TGT`,
  `% OF TGT`, `REMAINING`, `REQ / MO`, `PROJ` and the `PACE` verdict — behind a small download
  button in the table's own header. `PLAN` and `THROUGH` lead every row, so the file still says
  what it covers after the filename is gone, and percentages and rates are rounded to two decimals
  rather than flattened to the table's own rounding, so a reader can check the fraction
- The file always holds **every province**, even with a pace filter applied: the `OVER ALL TOTAL`
  row it carries covers all of them, and a filtered file would contradict its own total. A province
  with no verdict exports the reason (`Starts Sep`), not the machine value, and the build is a pure
  function (`buildYtdCSV`) separate from the download (`exportYtdCSV`), so the exact bytes can be
  tested without a browser

## [1.16.1] — 2026-09-23

### ✨ Features

- **The Provincial Year-to-Date table now shows the share of the annual target each province has
  actually completed.** A new `% OF TGT` column sits beside `ANNUAL TGT`, so the two yardsticks in
  the table are finally both stated: `% OF PLAN` (YTD against the months elapsed — the fair read
  mid-year) and `% OF TGT` (YTD against the whole year). On mobile, where there is only room for
  one, the card now carries the annual figure and labels it `of target`, because the annual target
  is what the year is judged on
- **The annual figure is tinted by the pace verdict, not by its own percentage.** 46% in September
  is not a failure, so the monthly thresholds would have painted the entire column red and taught
  the reader to ignore it. The chip now takes the colour of the `PACE` column beside it — green,
  amber, red — so one row never carries two contradicting verdicts, and a province with no verdict
  yet stays neutral
- **The Year-to-Date table's last column is now called `PACE`, not `STATUS`.** It holds the same
  verdict the daily table's `PACE` column holds, from the same three-way vocabulary as the filter
  chips above both tables, so the two tables now name the same thing the same way

### 🐛 Fixes

- **A province with no pace verdict now says why, instead of showing a dash.** BIDA and FIBERX
  Aurora are 0 in the worksheet for every month JAN–AUG and 26/28/25/26 and 83/83/85/83 from SEP
  on — its target has not started, so there is no finished-month target to measure August against
  and the app refuses to invent a verdict from zero. `—` read as missing data, so the cell now
  reads **`Starts Sep`**, a province with no target at all reads **`No target`**, and January reads
  **`Too early`**. The remaining-month pace is unaffected and still shown: Aurora needs **81/month**
  for the last three months against a 334 target

## [1.16.0] — 2026-09-23

### ✨ Features

- **The dashboard now answers for the year, not only the month.** The Executive Overview gains a
  **Year-to-Date** section and the Provincial Breakdown a **Year-to-Date** table, both driven by
  two new tabs in the shared workbook — `YTD 2026` (completed installations, one column per month)
  and `TARGET 2026` (that same grid as the monthly target plan, plus each province's annual
  target). Neither exists anywhere in the app today for the months before August 2026, and the
  targets for the months still ahead existed nowhere at all
- **The projection is stated as work, not as a percentage.** Per province and for the portfolio:
  remaining installations to the annual target, the pace the remaining months need after this
  month's own target is accounted for, and where the year lands if the finished months keep their
  average pace. Example — BIDA Benguet, September 2026: 470 achieved against 526 planned, 181 left
  after September's target, so **60 per month** across October–December
- **The verdict is judged on finished months, never on a partial one.** A province is not called
  behind on the 2nd of the month for not yet delivering the whole month. The headline percentage
  is measured against the **plan to date** rather than the annual target — in September, 47% of a
  year is not a failure, and a bar measured against December would say it was — while the progress
  bar fills against the annual target, because that is the number being filled
- **Every figure that supersedes the worksheet says so.** BIDA's `AUG` column in `YTD 2026` holds
  **August's target** — 1,044 for the block, province for province identical to the target column —
  where the archive holds 31, 36, 53… The app therefore prefers its own recorded month over the
  worksheet for any month it holds, the same rule the RAW/MTD merge already follows, and the YTD
  table states which month was substituted
- **A plan with no block is explained, not left blank.** The two tabs cover BIDA and FIBERX only,
  so SME's Year-to-Date section says so instead of rendering an empty table
- Both tabs are read **once for every plan** and cached for **24 hours** — an annual table cannot
  change between two page loads, so the two extra requests are not paid per plan or per visit. The
  Developer console shows that read (source, payload, cache age) beside the per-plan sheet reads
- **The Developer console now says which provinces and months still need `YTD 2026`.** A new
  **Worksheet dependency** panel reports it per plan, with a province × month grid marking each
  elapsed month as the worksheet's, Supabase's, or the live sheet tab's. Nothing on the dashboard
  could show this — an actual reads the same whichever tab it came from — and the countdown is the
  point: each closed month converts to the archive `ARCHIVE_AFTER_DAYS` days later, so the
  worksheet's share shrinks on its own. For BIDA in September 2026 it is **98 of 117
  province-months**. It also states what will *not* move: `JAN–JUL` never converts (they fall before
  the first month the tracker held), Cagayan, Kalinga and Apayao have no record yet, and every
  target cell is the worksheet's permanently, so the target side is reported without a countdown
  rather than with one that can never count down
- **A plan whose archive is not running is called out, not left to hope.** The panel compares the
  closed months that have passed their cutoff against the months Supabase actually holds, and names
  the mismatch — FIBERX and SME have eight due months and none archived, so `ARCHIVE_ENABLED` is off
  in `CONFIG` for them; saying so beats printing a conversion date that will pass in silence

### 🐛 Fixes

- **The import no longer second-guesses which provinces a month has.** The Apps Script held an
  exclusion list (`EXCLUDED_AREAS`, defaulting to `CAGAYAN, APAYAO, KALINGA`) that was applied after
  reading a NEW REPORT block, so `RAW DATA` and `MTD` carried nine provinces while the
  `OVER ALL TOTAL` row — copied from the sheet unchanged, and the row the MTD generator takes its
  `LAST MTD` from — still counted the twelve the block lists. BIDA's August 2026 read **523** for a
  month whose imported rows summed to **370**, which is what the Daily To-Date card and the archive
  were showing. The list is gone, with the reader and the cache behind it: every row a block carries
  is imported, so the sheet is the only area list. Retiring a province now means removing it from
  NEW REPORT, and its numbers leave the total with it because the total is the sheet's own
- **The `CONFIG` tab is kept for the archive settings it actually holds.** `Setup / Edit CONFIG
  Sheet` seeds a missing `ARCHIVE_*` key with the value the archive already falls back to and never
  overwrites an existing one, instead of managing a retired-area key that nothing reads
- **The app refuses to run a build the server has already replaced.** A stale bundle signed
  users out the morning after a release, and a hard refresh was the only cure. The root cause
  was in the service worker: the app's own document was cached stale-while-revalidate, and that
  document is what names the current bundle — so a release reached nobody whose browser had
  opened the app before. The document is now network-first, with the cached copy kept only as
  the offline fallback, and it is loaded *before* the shell-asset branch instead of after it.
  On top of that, every launch now reads `version.json` — written from `package.json` at build
  time, like the manifest — and if the version it holds is not the one on the device the app
  **does not start**: an "Update required" screen replaces the whole app, the login form
  included, and its one button unregisters the service worker, drops every cache and reloads
  onto the new build. A missing or unreachable `version.json` counts as "cannot tell" and never
  blocks, so offline launches and rollouts keep working
- **The dismissible "New version ready" prompt is replaced by that gate.** It arrived after the
  app had already been used, and "Later" was one tap away — the wrong shape for a build that
  can no longer read its own data source
- **The service worker no longer registers on the dev server.** It was caching `/src/*.jsx` and
  Vite's pre-bundled dependencies, so after the dev server re-optimized them a page could load a
  mix of old and new modules — which showed up as `Invalid hook call` / two copies of React behind
  the error boundary, and cleared only when the caches were dropped. Production is unaffected:
  the guard folds to `true` at build time and the bundle is byte-identical

### 📚 Documentation

- `README.md` — the *Releasing* section now names `version.json` and documents the update gate,
  including the one release it cannot cover: the first one, whose users are still on a build
  with no gate to show
- `docs/DATA_PIPELINE.md` — the `CONFIG` tab section is now **The area list**: the scripts hold no
  list, the import filters nothing, the `OVER ALL TOTAL` reconciliation is spelled out, and the
  retired key is documented as retired rather than as a setting
- **`docs/YTD_SCOPING.md`** — what the two tabs contain, what they add over the sheet the app
  already reads (the `MTD` tab's `TARGET` column already equals `TARGET 2026` for the live month,
  so the new value is the rest of the year), the August column that needs correcting, the YTD
  arithmetic, and the open decisions
- `docs/DATASOURCE.md` — the two new tabs, their gids, and the one rule that differs from the rest
  of the app: for these tabs, the app's own recorded month wins. Now also where the worksheet
  dependency is reported, and how the app's mirrored `ARCHIVE_AFTER_DAYS` relates to the Apps Script
  `CONFIG` key

## [1.15.0] — 2026-09-21

### 🐛 Fixes

- **The archive no longer reads the `MTD` sheet.** `collectMtdArchiveRows_` is replaced by
  `deriveMtdArchiveRows_`, which sums the `RAW DATA` rows the run already holds. The old
  reader could see a **blank** `MTD` tab: `generateMTDReport()` cleared it before rewriting
  it, and an installable `onChange` trigger rebuilds it on *every* spreadsheet edit — so
  enabling the archive cleared the very sheet the archive was about to read. A blank read
  then uploaded nothing **successfully** (`POST []` is HTTP 200) and passed the old gate
  because `0 === 0`. Verified against the live sheets for FIBERX, BIDA and SME: 4 month
  sections, 13 fields per row, **0 differences** from what the `MTD` tab held
- **The archive refuses when the month looks incomplete.** The gate now requires MTD rows as
  well as RAW rows, and reports `VERIFICATION FAILED — WALANG BINURA` instead of purging.
  This is what twice stopped a run from deleting August while its MTD figures had never been
  uploaded — the month would have disappeared from the dashboard entirely
- **`generateMTDReport()` writes the report once.** The grid is built in memory and written
  with a single `setValues()`, so the sheet is never blank for more than an instant while it
  rebuilds. The old code wrote row by row: **29 sheet round trips** between `clear()` and the
  last value. Output is unchanged — every value, background, font, number format and merge
  was compared cell-by-cell against the previous implementation and matches. A blank
  `RAW DATA` no longer wipes the previous report either, since the check now runs before any
  clearing
- **A formula-driven sheet is never purged.** `planSheetIsFormulaDriven_` reads column A and
  reports when the sheet is an `IMPORTRANGE` mirror. Deleting a row inside a spilled array
  formula does not remove data — it **destroys the formula**, which is why a purge against
  the BIDA mirror had to be restored by hand. The archive now uploads and leaves the sheet
  alone, and the message points at the source sheet instead
- **`scripts/apps-script/verify-archive.cjs --as-of YYYY-MM-DD`** — moves the sandbox's
  clock so the cut-off table for any future day can be inspected now. The month-by-month
  report reads its rules from the plan script itself (`archiveCutoff_`, `lastDayOfMonth_`,
  `todayMidnight_`) instead of restating them, and renders dates from local components
  rather than `toISOString()` — the script builds `new Date(y, m, d)`, so a UTC render
  showed every date a day early

### ⚙️ Configuration

- **`ARCHIVE_PURGE`** (new `CONFIG` key, absent = `FALSE`) — the archive uploads a closed
  month to Supabase but **leaves the sheet untouched** unless this is `TRUE`. Any failed
  verification, and any formula-driven sheet, refuse regardless

### 📚 Docs

- **`docs/ARCHIVE.md`** — why the MTD figures are computed rather than read off the sheet,
  the incident that proved it, the `ARCHIVE_PURGE` gate and the formula guard
- **`docs/DATA_PIPELINE.md`** and **`docs/DATASOURCE.md`** — `NEW REPORT` is an `IMPORTRANGE`
  mirror, not hand-encoded data, and the pipeline now says which parts come from Supabase

### 🔤 Language

- **Every user-facing string is professional English.** The console, the maintenance screen,
  the sign-in screen and the maintenance banner in the header were written in Taglish —
  "Aktibo ngayon", "Naka-ON ang maintenance mode", "Walang ibang aktibo sa loob ng 2 minuto".
  The wording is now the register a C-suite reader expects from an internal reporting tool.
  Nothing else changed: same layout, same behaviour, same keys in state

### 🔍 Developer console

- **Build status** (new section) — the version from `package.json`, the hashed bundle the
  browser actually loaded, and whether Supabase is configured. The bundle name is the same
  thing DevTools → Network shows, so "is the deploy I just pushed the one running?" is
  answered without opening it. The archived-month list is read with `force`, deliberately
  bypassing the 5-minute index cache, and refreshes that cache for the app as it does so
- **Data source diagnostics** (new section) — per plan, which months came from Supabase and
  which from the Google Sheet, with the payload size and row count on each side, plus the
  split the merge actually produced. `src/utils/dataSourceDiagnostics.js` records every read
  the data path makes (sheet export, archive fetch, per-month cache hit or miss) and the panel
  renders the snapshot. It is pure observation — every entry point returns nothing and is
  called for its side effect only — so a bug in it can make the panel wrong but cannot change
  what the dashboard shows
- **The instrumentation is what makes the archive's central claim checkable.** "The sheet
  payload stays flat as the archive grows" was an assertion in the docs; now the Sheet payload
  line shows the export the app actually downloaded next to the Archive payload it folded in,
  so the two are directly comparable

---

**Version:** package.json bumped 1.14.0 → **1.15.0**. As before, the service worker cache
names, the versioned manifest and the data and archive cache keys all derive from that one
value, so this is the only edit a release needs. Nothing here requires a database change.

A pushed `v*` tag publishes the GitHub release from this section.

---

## [1.14.0] — 2026-09-20

### 🗄️ Cold Archive — closed months move to Supabase

The sheet was going to grow forever: `RAW DATA` and `MTD` are rebuilt from `NEW REPORT` on
every sync, so every day of every month stayed in the spreadsheet. A finished month is now
copied to Supabase and purged from the sheet, and the app reads past months from there.

- **`supabase/schema.sql`** (new) — `sli_raw_daily` + `sli_mtd`, RLS on with no anonymous
  policy, upsert-safe unique keys so a re-run can never duplicate a month
- **Apps Script `archiveClosedMonths()`** — a month is due on day 7 of the following month
  (`ARCHIVE_AFTER_DAYS`, in the `CONFIG` tab) and only once it looks complete. Upload →
  **verify row counts AND a checksum** → purge the month's day blocks from `NEW REPORT` →
  Full Sync. A failed verification deletes nothing
- **`OVER ALL TOTAL` rows are archived verbatim**, flagged `is_overall_total`, never
  recomputed: they are not always the sum of the area rows (BIDA August: total `387`, area
  sum `370`) and they are the number the dashboard showed while the month was live
- **Purging `NEW REPORT` is the point** — `RAW DATA` alone is not enough, because the import
  rebuilds it from `NEW REPORT` every 5 minutes and on every edit, so an old month always
  came back
- **`scripts/apps-script/gs-tail.template.txt` + `sync-gs-tail.cjs`** — the `TRIGGERS & MENU`
  section onwards of the three plan scripts is now generated from one template, so the three
  copies cannot drift
- **`src/utils/archiveFetcher.js`** (new) — renders archived months back into the exact row
  shape the Google Sheet export produces (same column order, same `September 1, 2026` date
  key, same `91.20%` percent text), so `dataProcessor` needed no changes at all. The merge
  happens in `dataFetcher` before parsing, which means every consumer — Executive, Compare,
  prefetch — gets it for free
- **Archive-aware cache:** the month index has a 5-minute TTL, while a month's rows are cached
  **without a TTL** because they never change. The Google Sheet payload therefore stays flat as
  the archive grows, and a past month is fetched once per browser
- **`App.jsx` month → date sync:** selecting a month now moves the date-driven views into it,
  so an archived August shows August's Daily To-Date and Provincial Breakdown instead of the
  live month's. Also fixes the `handleMonthChange` stale closure
- **MoM delta keeps working** for a month the sheet no longer holds, because the archived month
  section is prepended to the sheet's own
- **Supabase being unreachable is not an outage:** the merge is best-effort and the app falls
  back to sheet-only data without throwing
- **`GVSI Auto-DB → Test Supabase Connection`** (new) — says whether the Script Properties
  key can reach and *write* the archive tables, before anything is switched on. It reads the
  key's JWT role, so a pasted `anon` key is named as that instead of surfacing as a mystery
  permission error, and it proves write access with an **empty-row insert**: Postgres checks
  the grant and RLS before constraints, so a permitted key gets a not-null rejection and
  **nothing is stored**, while a key that may not write gets `42501`. Also reachable from the
  shell as `verify-archive.cjs <plan> --connection`, which skips the sheets entirely

### 🔐 Login moves to Supabase, with real sessions

The `Login Credentials` tab was link-shared, so every password hash was downloadable by anyone
with the URL.

- **`sli_users` + `verify_login`** — accounts live in a table with RLS on and no anonymous
  policy; the browser sends the SHA-256 of the password and Postgres compares it. Verified:
  `GET /rest/v1/sli_users` with the public anon key returns `401 permission denied`
- **Session tokens** — a sign-in opens a `sli_sessions` row and returns its token, so sessions
  can finally be revoked. A session stored by an older version is discarded (one re-login)
- **`src/utils/auth.js`** — `fetchCredentials`/`verifyCredentials` are replaced by a single
  `signIn()`; the credentials prefetch on the login screen is gone
- **Offline sign-in still works** through the remembered session; the first sign-in needs the
  network, exactly as before
- The old sheet path is kept behind `SUPABASE_ENABLED` as a kill switch, **not** as a fallback

### 🛠️ Developer Console

`role = Developer` unlocks a console (desktop utility icon + mobile ⋮ menu) that no one else
can see — and, more importantly, cannot use: every action calls an RPC that re-checks the role
against the caller's session token inside Postgres.

- **Active now** — who is signed in, their plan/view, session start, a live-ticking duration
  and a badge count, from a one-minute heartbeat (`presence_ping`), which also reports whether
  the token is still valid so a revoked session signs itself out
- **Maintenance mode** — blocks every non-Developer behind a message screen, shows Developers an
  amber banner instead so they can verify the state they set, and **auto-offs after 2 hours by
  default** (enforced by the app *and* the server, so a forgotten switch cannot lock the team
  out). When Supabase is unreachable it **fails open** and keeps working
- **Recent sessions + Force sign-out all** — the audit trail and the "everyone re-logs in" button
- **Honest scope:** maintenance mode is a coordination tool, not a security control — the check
  runs in the browser and the data still comes from public sheet exports
- **`src/components/MaintenanceScreen.jsx`**, **`src/components/DeveloperPanel.jsx`**,
  **`src/utils/presence.js`**, **`src/hooks/usePresence.js`** (all new)

### ⚙️ Apps Script triggers

- **`setupManagedTriggers()`** reconciles exactly three triggers — `autoSync` every 5 minutes,
  `archiveClosedMonths` daily at 02:00, and `fullSync` on spreadsheet change — and leaves every
  other trigger alone
- **Footgun removed:** the old `setupAutoTrigger()` deleted **every** project trigger before
  installing its timer, which silently removed the hand-made on-change `fullSync` trigger. The
  on-change trigger is now created by code, and the old function names simply delegate
- New menu items: **Setup / Stop Managed Triggers**, **Archive Closed Months to Supabase**,
  **Archive Dry Run**

### 🐛 Fixes

- **`src/App.jsx`** — a month picked in the Executive Overview no longer snaps back to the
  live one. Switching plan fetches in the background, and `applyPlanData` reset
  `selectedMonthYear` to the current month when that result landed seconds later — so
  picking August and then watching the dropdown jump to September was really the fetch
  overwriting the choice. The reset now happens once, eagerly, as the switch starts, and a
  late result is dropped if the month has moved on, which also keeps the hero and the
  tables from being parsed for a different month than the dropdown names
- **`scripts/apps-script/verify-archive.cjs`** (new) — runs a plan's `.gs` verbatim in Node
  against the live sheets and Supabase, so the archive gate can be exercised before the day
  it purges: every `deleteRows` is recorded instead of applied

### 📚 Documentation

- **`docs/ARCHIVE.md`** (new) — the archive runbook: cut-off rule, the verification gate,
  Script Properties, the `CONFIG` keys, first-run dry run, backups and rollback, troubleshooting
- **`docs/DEVELOPER.md`** (new) — accounts, sessions, presence, the console, maintenance mode
  and every RLS boundary
- **`docs/DATASOURCE.md`** — Supabase as a second source, the "current month → sheet / previous
  months → Supabase" rule, the archive cache keys
- **`docs/DATA_PIPELINE.md`** — the archive step, the new `CONFIG` keys and menu, and the
  generated script tail
- **`README.md`** — security posture updated: what changed (hashes no longer downloadable,
  server-side roles, revocable sessions) and what did not (still a browser-side gate)

> **Kailangang i-rotate ang mga password:** ang limang hash na na-migrate mula sa sheet ay
> publikong mababasa dati, at unsalted SHA-256 ang scheme.

---

**Version:** package.json bumped 1.13.0 → **1.14.0** — the only edit a release needs,
because the service worker cache names, the versioned manifest and the archive cache keys
all derive from it. Every other change here is code or documentation; the database side
(`supabase/schema.sql`) is applied separately and is not part of the bundle.

A pushed `v*` tag then publishes the GitHub release from this section.

---

## [1.13.0] — 2026-09-15

### 📈 30-Day Trend Sparkline

The Executive Overview hero card now carries a 30-day rolling sparkline of
daily completions beside the achievement rate, so a month that is technically
"on pace" can still be read as trending up or down.

- **`src/config/plans.js`** — new per-plan `trendUrl` pointing at the plan's own
  tab in the shared **SLI TRACKER Database** (`FIBERX DATA` / `BIDA DATA` /
  `SME DATA`). It uses the `RAW DATA` column layout, so the existing parser
  handles it unchanged
- **`src/utils/dataFetcher.js`** — fetches the trend tab alongside MTD / RAW /
  aging, with its own `trend` cache key (`gvsi_trend_<plan>_v<version>`); the
  key embeds the app version, so this release retires the previous cache set
- **`src/App.jsx`** — new `trend30Day` memo, widening the existing 7-day trend
  builder to 30 days. It anchors on `findLatestDataDate()` rather than the last
  row in the sheet, so a pre-entered trailing day of zeroes cannot flatten the
  series and make a healthy line look like a collapse
- **`src/components/ExecutiveOverview.jsx`** — sparkline plus period delta
  (`+4 (+5%)`); hidden for a past month, matching the projection rule, because
  the tab holds a rolling window and not a per-month one
- **Latent bug fixed:** `plan` was never passed to `ExecutiveOverview`, so every
  plan-accented element inside it silently fell back to teal. It now receives
  `currentPlan`, which also brings the sparkline and Monthly Target into the
  selected plan's colour

---

### 🚀 Velocity Report

Answers the question the run-rate projection only implies: how fast is work
actually closing, and how fast does it need to?

- **`src/components/VelocityReport.jsx`** (new) — month-to-date rate next to the
  required rate, recent 7-day momentum with an accelerating / slowing read,
  drift from an even track (`completed − target × daysElapsed ÷ daysInMonth`),
  the projected finish day, and a per-day bar chart with the required rate drawn
  as a dashed reference line — days that missed it are rose, days that met it
  emerald
- **`src/components/ExecutiveOverview.jsx`** — renders between Month-to-Date and
  Daily To-Date, gated on the projection, so a closed month shows no per-day
  requirement it can no longer act on

---

### 🗂️ Data Sources Consolidated on the Shared Database

- **`src/config/plans.js`** — `AUTH_URL` now reads the shared **Login
  Credentials** tab instead of the FIBERX sheet, and `agingUrl` the shared
  **COMPLETED AGING REPORT** tab, so users can be added, and SLA data kept, in
  one place rather than per plan
- MTD and `RAW DATA` deliberately stay on the per-plan sheets: they are written
  by each plan's Apps Script, and the split keeps a plan's writers out of the
  shared file

---

### 🐛 Fixes

- **`src/App.jsx`** — `handleMonthChange` had an empty dependency array, so it
  kept reading the cache of whichever plan was active on the first render:
  switching to BIDA and then changing the month showed FIBERX numbers. It now
  depends on `activePlan`
- **`src/App.jsx`** — the same stale-closure shape in `loadData`, where
  `activePlan` was missing from the deps. Reachable when both the cache and the
  network fail during a plan switch, after which an auto-refresh would re-fetch
  the previous plan
- **`src/components/ExecutiveOverview.jsx`** — projections are suppressed for a
  month that is already over. It compares month index and year rather than
  sorting the label, which orders "December 2026" before "January 2026"
- **`src/components/DailyTable.jsx`** — table headers reveal the full column
  name and its definition on hover (BF, ABL, COMP RJO, RJO FPMos, CO, PACE, …)
- **`src/components/SLITable.jsx`** — deleted; unreferenced dead code, which also
  dropped ~1.4 KB of CSS left behind by Tailwind's purge

---

### 📚 Documentation

- **`docs/DATASOURCE.md`** (new) — every part of the app mapped to the sheet and
  tab it reads, with the cache keys, the prefetch behaviour and the gotchas
  (including that `NEW REPORT` is an upstream encoding tab the app never reads)
- **`README.md`**, **`docs/DATA_PIPELINE.md`** — corrected the now-stale
  credentials and aging-report locations after the move to the shared database,
  and added the trend tab

---

**Version:** package.json bumped 1.12.0 → **1.13.0**, the only edit a release
needs — the service worker cache names, the versioned manifest and the data
cache keys all derive from it.

---

## [1.12.0] — 2026-09-13

### 🎨 Plan-Coloured Table Chrome

The Provincial Breakdown now reads as the selected plan's screen instead of a
teal-tinted one, and the bottom bar's SLA tab no longer wears SME's colour.

- **`src/config/plans.js`** — new `accentClasses.head` and `accentClasses.total`
  per plan (`bg` / `text` / `border`) for the table header strip and the OVER ALL
  TOTAL row. Both backgrounds are **fully opaque on purpose**: the AREA and
  MTD · TARGET · % cells are pinned, so an alpha tint let the columns scrolling
  underneath show through. The total row deliberately uses one solid colour for
  the whole row, so the pinned cells no longer sit on a darker patch than the
  rest of it
- **`src/components/DailyTable.jsx`** — takes a new `accent` prop
  - the header row and its four sticky cells are tinted in the plan colour, with
    the plan colour on the labels, the sort arrows and the bottom border
  - the **OVER ALL TOTAL** row follows the plan as well — on the desktop table and
    in the mobile card — which removes the last hardcoded teal from the table
  - the 7D TREND sparkline in the total row picks up the plan colour too
  - the active PACE filter chip uses the plan colour instead of hardcoded teal
  - all of it falls back to the previous neutral/teal styling when no plan is in
    context, so the component still works standalone
- **`src/components/AgingReport.jsx`** — the Installation SLA Breakdown is now
  amber-accented so it matches its own bottom-bar tab: the heading badge, the
  sort arrows, the search focus ring and the OVERALL TOTAL row all moved off
  teal. Its total row was an alpha tint as well, and the PROVINCE cell there is
  pinned too, so it gets the same solid treatment via one `TOTAL_ROW_BG` constant
  (the mobile card matches the desktop row). The ≤24h / ≤72h / >72h stat cards
  keep their own semantic green / amber / red
- **`src/App.jsx`** — passes `currentPlan.accentClasses` down to the table
- **`src/App.jsx`** — the mobile bottom bar's **SLA** tab was `teal-500`, which
  was indistinguishable from SME's plan colour two slots away. It now has its own
  `slaAccent` (amber) for the indicator bar, icon and label — a colour that
  collides with no plan accent

**Version:** package.json bumped 1.11.0 → **1.12.0** (the service worker cache
names, manifest icon query and data cache keys all follow it).

---

## [1.11.0] — 2026-09-13

### 🔐 Login Gate

The dashboard now sits behind a username/password screen, backed by a
`Login Credentials` tab so users can be added or removed without a code change.

- **`src/components/LoginScreen.jsx`** (new) — full-screen sign-in: username +
password with a show/hide toggle, "Keep me signed in on this device", inline
error message, autofocus, and Enter-to-submit
- **`src/utils/auth.js`** (new) —
  - `sha256Hex()` hashes the entered password with Web Crypto (needs https or
    localhost)
  - `fetchCredentials()` reads the credentials tab and maps columns **by header
    name** (`Username` / `PasswordHash` / `FullName` / `Role`), so column order
    can change freely
  - `verifyCredentials()` matches the username case-insensitively (unknown user
    and wrong password both return the same generic result)
  - session helpers — 30 days when remembered, 12 hours otherwise; the password
    hash is never written to storage
- **`src/context/AuthContext.jsx`** (new) — `AuthProvider` + `useAuth()`. It
renders `LoginScreen` until a session exists, so the dashboard never mounts and
**never fetches sheet data** before sign-in
- **`src/main.jsx`** — wraps `<App />` in `<AuthProvider />`
- **`src/App.jsx`** — `Sign out` joins the shared header actions, so it appears in
both the desktop utility group and the mobile ⋮ menu; the signed-in user shows as
a chip in the navbar (lg+) and as a name/role header at the top of the mobile menu
- **`src/config/plans.js`** — `AUTH_URL` for the shared `Login Credentials` tab
(gid `895191585`), read from the FIBERX sheet for all plans

**Security note:** this is a **convenience gate, not security.** The credentials
tab is publicly readable through the CSV export, the hashes use no salt or key
stretching, and the check runs in the browser — it can be bypassed and its hashes
brute-forced offline. Documented in the README so the limits are explicit.

### 🎨 Brand Mark

The in-app logo is now the app's canonical icon instead of the placeholder teal
"SLI" tile.

- **`src/components/AppLogo.jsx`** (new) — one shared brand mark used by the
  mobile header, desktop navbar, footer, login screen, install banner and the
  printed executive report. The asset path lives in this one file, so artwork
  can be swapped or renamed in a single place, and `import.meta.env.BASE_URL`
  keeps the `/GVSI-SLI-Tracker/` prefix out of every call site
- **Two variants:** `variant="full"` (the default) is `public/icon-512.png` —
  the app icon with its "SLI TRACKER" wordmark, generated from
  `public/icon-source.svg` and already declared by `manifest.json`, used where
  there is room (login screen, install banner, printed report). `variant="mark"`
  is the new `public/brand-mark.svg`: the same artwork with the wordmark removed
  and heavier strokes, so it still reads at 20–36px (mobile header, desktop
  navbar, footer) instead of smudging
- The mark joins the service worker's shell pre-cache list next to the PWA icons
- Every hard-coded `bg-gradient-to-br from-teal-500 to-teal-700` logo tile is
  gone, and the previously used `public/new/` icon set is no longer referenced

**Version:** package.json bumped 1.10.0 → **1.11.0** (one line — the service
worker cache names, manifest icon query and data cache keys all follow it).

---

## [1.10.0] — 2026-09-13

### 🌐 Spreadsheet-Driven Area Config (Apps Script)

Retired provinces no longer require a code edit — the list of exported areas
is read from a new **`CONFIG`** tab in each plan's spreadsheet.

**Root cause of "removed provinces keep coming back in MTD":** the MTD
report does **not** read the NEW REPORT sheet. It builds its area list from
`RAW DATA`, and `RAW DATA` is only ever rewritten by the *Import* step.
Running only *Generate MTD Report* reproduces whatever was imported last, so
provinces deleted from NEW REPORT (leaving zero rows or `#REF!` formulas)
stayed in both `RAW DATA` and `MTD`.

**`FIBERXSCRIPT.gs` / `BIDASCRIPT.gs` / `SMESCRIPT.gs`** (all three plans):

- New **`CONFIG` tab** — column A holds the `EXCLUDED_AREAS` key, column B
the area names (e.g. `CAGAYAN, APAYAO, KALINGA`). Separators may be commas,
semicolons, slashes or line breaks, and the key may repeat to list one area
per row; `EXCLUDED_AREAS` / `EXCLUDED_AREA` and loose spacing are accepted
- `getExcludedAreas()` / `readExcludedAreasFromConfig()` / `isExcludedArea()`
— matching is case-insensitive (`Cagayan` = `CAGAYAN`) and the tab is read
once per run, so hundreds of row checks cost a single read
- **Blank value = exclude nothing**; **missing tab or key = safe fallback**
to the built-in `DEFAULT_EXCLUDED_AREAS`, so a deleted tab can never
silently blank out the reports
- Filtering applied at **both** stages — the RAW DATA import skips excluded
areas, and `parseRawData()` skips them again, so a stale `RAW DATA` cannot
leak them into MTD; they are also left out of `OVER ALL TOTAL` sums
- New menu item **`Setup / Edit CONFIG Sheet`** — creates the tab with its
header + current list and reports what is configured, without ever
overwriting existing values; script header bumped to v9

### 📚 Data Pipeline Documentation

- **`docs/DATA_PIPELINE.md`** (new) — pipeline diagram, sheet roles, the
Apps Script file per plan, the NEW REPORT → RAW DATA column mapping, how
MTD sections / areas / totals are built, the `CONFIG` tab format and rules,
the **Full Sync requirement** (and why *Generate MTD Report* alone is not
enough), the menu reference, and troubleshooting (`#REF!` / `#DIV/0!`,
stale app data, newly added provinces)
- **`README.md`** — the stale single-sheet **Data Source** section now lists
the three live plan spreadsheets used by `src/config/plans.js`, plus a new
**Documentation** section linking the pipeline doc and this changelog
- **`scripts/SETUP_GUIDE.md`** — marked legacy with a pointer to the new doc
(it documents the retired FIBERX v1 `scripts/MTD.gs` path; its menu labels,
trigger behaviour and MTD columns are out of date)

### 🔖 Version & Cache Refresh — package.json Is Now the Single Source

**`package.json`** — version bumped 1.8.0 → **1.10.0** so the app version catches
up with this changelog (1.9.0 shipped without a package bump). It is now the
**only** file to bump on a release — every version carrier below derives from it:

- **`vite.config.js`** — injects `__APP_VERSION__` and adds a `versionedManifest()`
plugin that fills `{{VERSION}}` in `public/manifest.json` (served substituted in
dev, written substituted into `dist/` on build)
- **`src/utils/version.js`** (new) — exports `APP_VERSION`
- **`src/main.jsx`** — registers the worker as `sw.js?v=<APP_VERSION>`
- **`public/sw.js`** — cache names now come from the worker's own `?v=` query
(`gvsi-sli-v1.10.0` / `gvsi-sli-data-v1.10.0`), so a release never edits this
file; the changing URL also guarantees the browser picks up the new worker
- **`src/utils/dataFetcher.js`** — `CACHE_VERSION` derives from the app version
(`gvsi_mtd_fiberx_v1.10.0`, …), and retired versions are now **swept** instead of
hand-listed: anything matching the data-key prefixes that isn't part of the
current set is removed from localStorage on every load and from IndexedDB once
per version (`gvsi_idb_purged` marker)
- **`src/utils/idbCache.js`** — new `idbKeys()` and `idbRemoveMany(keys)` purge a
whole retired version from IndexedDB in a single transaction
- **`public/manifest.json`** — icon cache-buster is the `{{VERSION}}` placeholder
- Verified that the sweep leaves `gvsi_theme`, `gvsi_active_plan` and the
`gvsi_selected_*` view state untouched
- **`public/manifest.json`** — icon cache-busting query `?v=1.8.0` →
`?v=1.10.0` to match the released version

---

## [1.9.0] — 2026-09-10

### 🖥️ WebView / Desktop C-Suite Navbar Redesign

**`src/App.jsx`** — the single-row toolbar is replaced by a hierarchical,
frosted navbar on `md:` and above (WebView / Desktop / Tablet). Mobile
(`< md`) keeps the brand row + ⋮ menu + bottom tab bar unchanged:

- **Left — Branding & Active Context:** SLI logo + app title + muted
  subtitle `Gallopvision Services, Inc. — Daily Status` (`text-slate-400
  text-xs`)
- **Center — Main View Navigation:** segmented pill tabs
  `[ Executive | Provincial | Compare ]` with smooth active-state
  transitions (`transition-all duration-200`)
- **Right — Plan Switcher & Utilities:** segmented `[ FIBERX | BIDA |
  SME ]` switcher with per-plan accent colors; SLA / Report / Export /
  Copy Link collapsed into **icon-only buttons with tooltips** inside a
  frosted wrapper (`bg-slate-800/40 border border-slate-700/50 rounded-lg
  p-1`); standout **Sync Data** button with a live time badge (e.g.
  `2m ago`)
- Sticky frosted chrome: `sticky top-0 z-40 bg-[#070A0F]/80
  backdrop-blur-md border-b border-slate-800/80`
- Mobile bottom tab bar now covers everything below `md` (`md:hidden`) —
  the cramped `sm`-only single-row toolbar is gone

**`src/components/PlanSelector.jsx`** — new `variant="navbar"` styling
tuned for the dark frosted navbar (inactive pills muted slate, active
pills keep their plan accent); dropped a broken dynamic shadow class.

---

### 📱 Mobile — Latest Available Badge Order + Meatball Cleanup

- **`src/components/DatePicker.jsx`** — new `badgeBefore` prop renders the
  "Latest available" badge **before** the date controls
  (`[Latest available] [◀] [date] [▶]`); default position unchanged for
  Provincial Breakdown
- **`src/components/ExecutiveOverview.jsx`** — Daily To-Date DatePicker
  passes `badgeBefore`, so mobile shows the badge first; Provincial
  Breakdown untouched
- **`src/App.jsx`** — **SLA** removed from the ⋮ meatball menu (already
  available in the bottom tab bar)

---

### ✨ Active Tab Scale-Up Micro-Interaction (Mobile Bottom Nav)

**`src/App.jsx`** + **`src/config/plans.js`** — the active bottom-nav tab
now zooms & elevates its icon + label (`scale-110 -translate-y-0.5` on an
inner wrapper, `transition-all duration-200 ease-out`), with a per-plan
accent glow (`accentClasses.glow` drop-shadow: indigo / red / teal) and
brand-colored text; inactive tabs stay `scale-100` muted. Transforms only
— no layout shifts, overflow, or clipping.

---

### 🎯 Single Active Navigation Fix

- Plan tabs (mobile bottom nav) now deactivate in SLA / Compare views:
  `activePlan === planId && view !== 'aging' && view !== 'compare'`
- Desktop plan switcher receives `activePlan={null}` while SLA / Compare
  is active, so no plan pill highlights alongside the SLA icon
- `handlePlanChange` exits SLA / Compare views (`setView('executive')`)
  when a plan is selected — exactly one navigation element can be
  highlighted at any time; `activePlan` still drives which plan's data
  loads

---

### 🧹 Provincial Breakdown WebView Cleanup

- **`src/App.jsx`** — the `Back to Executive Summary` button is hidden on
  `md+` (`flex md:hidden`; the navbar tabs handle navigation) and the
  control bar right-aligns the DatePicker + last-sync stamp via
  `md:justify-end`; mobile keeps the back button
- The **sync time badge** no longer floats over the Sync Data button
  (`absolute -top-2 -right-1.5` removed) — it now flows inline as a
  frosted pill beside the button (`flex items-center gap-2`) with the
  live freshness dot

---

## [1.8.0] — 2026-09-10

### 📊 Phase 3 — Portfolio Compare Mode (F4)

**New `src/components/CompareView.jsx`** — renders all three service plans
(FIBERX / BIDA / SME) side-by-side:
- One card per plan in its accent color: achievement rate + HIT/MISS/LAG
  badge + pace pill, projected month-end, total completed (of target),
  to go, total incoming, mini progress bar
- **PORTFOLIO TOTALS** card below: achievement %, total completed, target,
  to go, and total incoming summed across all plans
- "Open {plan}" button on each card jumps straight to that plan's executive
  view

**`src/App.jsx`** — new `compare` view:
- Header **Compare toggle** button (active state violet) next to the plan
  selector; toggles Single ↔ Compare
- Compare data loads **cache-first** (instant render from warm caches,
  thanks to Phase 1 prefetch) then background-refreshes each plan
- `?view=compare` persists in the URL / localStorage like the other views;
  month picker re-parses all plans without refetching

**`src/components/DailyTable.jsx`** — Provincial Breakdown toolbar:
- **Area search box** (case-insensitive substring filter, with clear button)
- **Pace filter chips** (All / On pace / Behind / Critical) using the
  existing run-rate pace flags
- "X of Y areas" live counter; OVER ALL TOTAL row always stays visible;
  friendly no-match state

### 🧭 Header Decluttering — 2-Tier App Bar (UI TODO #1)

**`src/App.jsx`** — restructured the sticky header so the mobile "tab" is no
longer a cramped multi-row wrap:
- **Tier 1 (brand row, mobile):** SLI logo + truncated title + compact
  status pill (pulsing dot + time-ago, UI TODO #2) + theme toggle — 4
  elements, clean
- **Tier 2 (action strip, mobile):** horizontally scrollable bar
  (`overflow-x-auto` + new `.no-scrollbar` utility in `index.css`) holding
  the plan tabs (FIBERX/BIDA/SME) + Compare + Report + Export + Sync as
  icon+label buttons
- **Desktop (sm+):** unchanged single row — status pill (countdown + time
  ago) + plan selector + Compare/Report/Export/Sync + theme toggle
- Compare/Report/Export/Sync are now shared action definitions rendered by
  both breakpoints (`headerActions` + `renderHeaderAction`), so the two
  layouts can never drift apart; also fixed a pre-existing stray quote in
  the Sync button className (`shadow-lg'`)

### 📉 Daily To-Date Cards — Sparklines Removed

**`src/components/ExecutiveOverview.jsx`** — removed the small 7-day
sparkline line-charts under each Daily To-Date metric value, keeping only the
compact day-over-day delta (e.g. `-9 (1%)`, `+90 (115%)`). Cleaner numbers-only
look; the 7D TREND column in the Provincial Breakdown table still uses
sparklines. Unused `Sparkline` import dropped from this file.

### 🔗 Copy Snapshot Link (UI TODO #3)

**New `src/utils/copyLink.js`** — `copySnapshotLink()` copies the current
shareable URL (`?plan=&date=&month=&view=`, kept in sync by urlState) to the
clipboard via the async Clipboard API, with a hidden-textarea
`execCommand('copy')` fallback for older browsers / non-secure contexts.

**`src/App.jsx`** — new **Copy Link** action in the shared header buttons
(mobile strip + desktop row): copies the current snapshot link and shows a
"Link copied" toast (auto-dismisses after ~2.2s). Self-updating link — anyone
who opens it gets fresh data for that exact screen state.

### 🎠 Compare Mode Mobile Carousel (UI TODO #4)

**`src/components/CompareView.jsx`** — on phones the three plan cards no
longer stack into a long vertical scroll; they now form a horizontal
**snap-scroll carousel**:
- `flex + overflow-x-auto + snap-x snap-mandatory`, each card `snap-start`
  `w-[85%]` so the next plan peeks at the edge (swipe to compare FIBERX /
  BIDA / SME); hidden scrollbar via the existing `.no-scrollbar` utility
- **Scroll indicator dots** (mobile only): active card is a wider violet
  pill; dots are tappable and smooth-scroll to that plan
- Desktop (sm+) keeps the original 2/3-column grid unchanged

### 📱 Native-Style Mobile Bottom Tab Bar

**`src/App.jsx`** — the mobile header is no longer a compressed action
strip; navigation now lives in a **fixed bottom tab bar** (native app
pattern, `< sm` only):
- Four evenly-spaced tabs: **FIBERX / BIDA / SME / Compare** — each with a
  per-plan glyph icon + label; active tab shows its plan accent color
  (indigo / red / teal) or violet for Compare, plus a slim top indicator
  bar; inactive tabs are muted slate
- Plan tabs route to that plan's executive view (`handleOpenPlan`); the
  Compare tab toggles Compare ↔ Executive
- Safe-area bottom padding (`env(safe-area-inset-bottom)`) + a mobile
  spacer keeps the footer clear of the fixed bar

**Secondary actions** (Sync Data / Report / Export / Copy Link) moved into
a **⋮ overflow menu** on the mobile brand row (reuses the same action
icons; closes on outside tap). Desktop header is unchanged — single row
with the plan selector + all actions.

**`src/components/PWAInstallBanner.jsx`** — banner now floats above the
bottom tab bar on mobile (`pb-[68px] sm:pb-4`) so it never covers the
nav; desktop unchanged.

### 📅 DatePicker Quick Jump (UI TODO #5)

**`src/components/DatePicker.jsx`** — no more clicking through months one
arrow at a time:
- The **month/year label is now a button** (with ▾ chevron) that opens a
  quick month/year selector: a year stepper (◀ year ▶) plus a 12-month
  grid; picking a month jumps the calendar straight there, with the
  current view month highlighted
- New **Today** button in the calendar header — jumps to the current
  month/year and, when today has data, selects it and closes (URL state
  updates immediately); otherwise it just lands the view on the current
  month so nearby dates are one tap away
- Existing `< Month Year >` arrows, day grid, and mobile modal all
  unchanged

### 📊 Table UX Hardening (UI TODO #6)

**`src/components/DailyTable.jsx`** — Provincial Breakdown table now
handles wide data much better:
- **Fixed column widths** — every column has a consistent `width`
  (72–150px), so numbers stay perfectly aligned while sorting
- **Right-sticky MTD · TARGET · % columns** — mirror the AREA sticky
  column: they stay pinned to the right edge while the middle columns
  scroll, with a subtle left shadow-fade signaling more columns exist
  (offsets 180 / 84 / 0px); solid per-row backgrounds keep them opaque
- PACE and 7D TREND moved before the sticky group so they are never
  covered while scrolling
- Same treatment on the OVER ALL TOTAL row (teal sticky cells)

---

### 📱 Installation SLA Breakdown — Mobile Card List

**`src/components/AgingReport.jsx`** — the SLA table now uses the same
two-line card list on mobile (< sm) as the Provincial Breakdown:
- **Left:** province name (bold) + color-coded buckets
  (`≤24h` green / `≤72h` amber / `>72h` red)
- **Right:** TOTAL (bold) with a "Total" subtext
- OVERALL TOTAL pinned as a teal card at the bottom; search applies to
  both layouts
- Desktop (sm+) keeps the full sortable table unchanged
  (`hidden sm:block`)

---

### 📱 Mobile Date Bar & Card Readability Polish

**`src/components/DatePicker.jsx`** — the "Latest available" badge no
longer shifts the date controls on mobile: it now renders **after** the
date picker (`[<] [date] [>] [Latest available]`), keeping the picker
stable; on desktop it stays **first** via `sm:order-first` (badge → prev
→ toggle → next → counter).

**`src/components/DailyTable.jsx`** — mobile card `MTD x · TGT y` subtext
is now larger (`text-xs`) and high-contrast (**bold white** labels +
numbers, `text-slate-100`/`text-slate-700`) for low-vision users.

---

### 📱 Provincial Breakdown — Mobile Card List

**`src/components/DailyTable.jsx`** — the wide scrollable table is replaced
by a **two-line card list on mobile** (< sm), styled like a native billing
list (Lumen Billing reference):
- **Left:** province name (bold) + pace badge (On pace / Behind /
  Critical) + `MTD x · TGT y` subtext
- **Right:** achievement % (color-coded by HIT/LAG/MISS) + `CO n` subtext
- OVER ALL TOTAL stays pinned as a teal card at the bottom; search and
  pace filter chips apply to both layouts
- Desktop (sm+) keeps the full 16-column sortable table unchanged
  (`hidden sm:block`)

---

### ⏱️ New Module — Installation SLA Breakdown (shared across plans)

**`src/components/AgingReport.jsx`** (new) — reads the **COMPLETED AGING
REPORT** tab (`A1:D15`, gid `1502867991`) and presents it as the
**Installation SLA Breakdown**:
- Four summary stat cards: **Total Aging**, **≤24 Hours** (green),
  **≤72 Hours** (amber), **>72 HRS** (red) — each with its share of the
  total
- Sortable + searchable province table with a computed per-province
  TOTAL column and the sheet's **OVERALL TOTAL** row pinned in a teal
  footer row; SLA buckets are color-coded (compliant / mid / breach)

**Plan-agnostic by design:** the module is shared across **FIBERX + BIDA
+ SME** — it always renders the same report regardless of the active
plan, and the data source currently lives in the FIBERX sheet (badge
"All Plans"). Add the tab to the other sheets later and it flows
through the same pipeline.

**`src/config/plans.js`** — each plan now has an `agingUrl` pointing at
its COMPLETED AGING REPORT tab.

**`src/utils/dataFetcher.js`** — `fetchAllData`/`getCachedData` now also
fetch + cache the SLA report (always pulled from the FIBERX sheet,
best-effort so a missing tab never fails the main MTD/RAW load); cache
version bumped to **v7**.

**`src/utils/dataProcessor.js`** — new `parseAgingReport()` maps the
4-column sheet (PROVINCE / ≤24h / ≤72h / >72HRS) into structured rows
plus the overall total.

**`src/App.jsx`** — new `aging` view (`?view=aging`, URL/localStorage
persisted):
- **SLA action button** in the desktop header + mobile ⋮ overflow menu
  (clock icon, toggles Back)
- **SLA tab** added to the mobile bottom tab bar (5 tabs: FIBERX /
  BIDA / SME / **SLA** / Compare), teal when active
- Header subtext shows "Installation SLA Breakdown" in this view

---

## [1.6.1] — 2026-09-09

### 📲 PWA Install Banner Restored on Mobile

**`src/components/PWAInstallBanner.jsx`** — the install prompt relied entirely on the
`beforeinstallprompt` event, which never fires on iOS and is suppressed on Android
Chrome until engagement criteria are met (or after its native mini-infobar is
dismissed). Rebuilt so the install option never silently disappears:
- **iOS Safari fallback:** always shows a 3-step Share → Add to Home Screen guide
  (no `beforeinstallprompt` support on iOS)
- **Android fallback:** if Chrome never fires the prompt within 4s, shows manual
  steps (⋮ menu → Install app / Add to Home screen)
- **Faster re-show:** "Not now" dismiss expiry shortened from 7 days → 3 days
- Desktop behavior unchanged (uses the browser's own install icon)

**`public/manifest.json`** — added `id` and `display_override`
(`["standalone", "minimal-ui", "browser"]`) so Android Chrome recognizes the app
as installable sooner and fires `beforeinstallprompt` more reliably.

**`index.html`** — removed `user-scalable=no` / `maximum-scale=1.0` viewport lock
(no impact on screenshots — web pages cannot block OS screenshots — but restores
pinch-zoom and accessibility gestures); added `apple-mobile-web-app-title`.

**Version bump:** 1.6.0 → 1.6.1; service worker caches refreshed to
`gvsi-sli-v15` / `gvsi-sli-data-v11` so installed clients fetch the new banner,
manifest, and index.html immediately.

### 📱 Mobile Header Overflow Fix

**`src/components/ExecutiveOverview.jsx`** — the DAILY TO-DATE section header
(title + "Latest available" badge + date navigation) previously sat in one row
(and later relied on `flex-wrap`, which still clipped on ~400px phones where it
barely fit). The header now **forces a stacked layout on mobile**
(`flex-col sm:flex-row`): title on line 1, the date controls right-aligned on
line 2 (`self-end`) below `sm`, and side-by-side only on larger screens — so
the texts can never overflow regardless of device width.

**`src/App.jsx`** — Provincial Breakdown control bar: the DatePicker + "Last
sync" text sat in a non-wrapping flex row that overflowed below ~350px
viewports; the container now uses `flex-wrap` + `justify-end` so the sync
stamp wraps onto its own line on narrow phones.

**`src/components/DailyTable.jsx`** — sticky AREA column polish: the pinned
province column (already sticky since v1.6.0) had its own hover color that
mismatched the row hover, leaving a visible seam while scrolling. Rows now
carry `group` and the sticky cell uses `group-hover` so the pinned cell and
the scrolling cells highlight together. Verified: AREA stays pinned at
`left: 0` through the full 924px horizontal scroll.

---

## [1.6.0] — 2026-09-08

### 📈 Run-Rate Projection & Health Alerts (Phase 1 — Tasks 5–7, completed)

**`src/utils/dataProcessor.js`** — new projection math:
- `projectRunRate(totalCompleted, target, refDateStr)` — `projected = totalCompleted / daysElapsed × daysInMonth` plus `daysElapsed`, `daysInMonth`, `remainingDays`, `requiredDaily`, current & projected percentages
- Pace classification: **on-pace** (projected ≥ target) / **behind** (≥ 80% of target) / **critical** (otherwise); days-elapsed derives from the latest **data** date (not calendar today)
- Guards: empty/invalid inputs return `null`; **target ≤ 0 returns `null`** — areas without a set target no longer show a misleading "On pace" badge
- `computeAreaPace(areaEntry, refDateStr)` wrapper + `getPaceBadgeStyle(pace)` badge classes

**`src/components/ExecutiveOverview.jsx`** — projection UI:
- Pace pill beside the achievement badge (On pace / Behind pace / Critical)
- `Projected month-end: 2,657 (152% of target)` line under the hero score
- Total Completed card shows `Projected: 2,657`; To Go card shows `Need 49/day for 23 days`

**`src/components/DailyTable.jsx`** — new **PACE** column in the Provincial Breakdown (per area + OVER ALL TOTAL), driven by a `refDate` prop (selected date)

### 📊 Trend Analytics (Phase 2 — F1, completed)

**`src/utils/dataProcessor.js`** — trend math utilities:
- `buildSeriesFromBlocks` / `summarizeSeries` / `buildDailyTrend` — chronological 7-day windows of any RAW metric, day-over-day + period deltas, NaN-safe
- `computeMoMDelta(mtdData)` — achievement % vs the previous available MTD month; returns `null` until a second month section exists (future-ready)
- `parseMTDData` now also exports `overallByMonth` (every month's OVER ALL TOTAL) to feed MoM deltas

**New file: `src/components/Sparkline.jsx`** — reusable inline SVG sparkline (area fill + line, up/down coloring)

**`src/components/ExecutiveOverview.jsx`** — momentum visible everywhere:
- MoM delta chip beside the achievement rate (`▲ +6.8 pts vs August`) once MTD holds a prior month
- 7-day sparkline + day-over-day delta on every Daily To-Date card (BF, INC, COMP ABL, COMP RJO, RJO, RJO FPMos, TOTAL RJO, Completed, CO) — e.g. `INC +90 (115%)`

**`src/components/DailyTable.jsx`** — new **7D TREND** column (sparkline + delta per area row and OVER ALL TOTAL)

**`src/App.jsx`** — computes `momDelta`, `dailyTrends`, `areaTrends` via `useMemo` and passes them down

### 🖨️ One-Click Executive Report (Phase 2 — F3, completed)

**New file: `src/components/ExecutiveReportModal.jsx`** — print/PDF-ready C-suite one-pager (portaled to `document.body`):
- Brand header (SLI badge, plan name, month/year, data-as-of, generated timestamp)
- MTD KPI grid (Achievement Rate + MoM delta, Total Completed / target, Total Incoming, To Go)
- Daily snapshot grid for the selected date; Provincial standing table (top movers + stragglers w/ pace); GVSI Dev footer

**`src/App.jsx`** — new **Report** header button (document icon) next to Export

**`src/index.css`** — `@media print` rules (body gets `report-open` while the modal is up):
- Hides the whole `#root` shell (not just children) so the empty container can't push the report to a second page
- Forces a white page during print (dark-mode grid background can't leak onto paper)
- `break-inside: avoid` on report blocks and table rows
- Pace badges on the sheet use **light-only** colors (`REPORT_PACE_STYLE`) so they stay legible on white paper even when the app is in dark mode

---

## [1.5.0] — 2026-09-08

### 🗺️ Roadmap Document

- Added `ROADMAP.md` — feature/architecture proposal for the next phase: Momentum & Trend Analytics (WoW/MoM/DoD), Run-Rate Projection & Health Alerts, One-Click Executive Report & Shareable Snapshots, Portfolio Compare Mode, and Instant-State Pack.
- Added detailed **Phase 1 scope** (planning only): URL/localStorage state persistence, background prefetch of non-active plans, and run-rate projection — with a task list and file-level plan.

### 🔗 State Persistence (Phase 1 — Tasks 1–2, completed)

**New file: `src/utils/urlState.js`**
- `readUrlState()` / `writeUrlState()` — shareable view state via URL query params (`?plan=&date=&month=&view=`)
- Date/month conversion helpers: `2026-09-06` ↔ `"September 6, 2026"`, `2026-09` ↔ `"September 2026"`
- Uses `history.replaceState` (never `pushState`) so date-stepping doesn't spam browser history
- `STATE_STORAGE_KEYS` — `gvsi_selected_date`, `gvsi_selected_month`, `gvsi_selected_view` (plan reuses `gvsi_active_plan`)

**`src/App.jsx`**
- Initial-state resolver: URL params → localStorage → defaults, resolved in `useState` initializers (no flash of wrong state)
- URL + localStorage sync effect on plan/date/month/view change — shareable deep links now work
- Validation: invalid or no-longer-available restored dates/months fall back to `findLatestDataDate` / current month — never crashes
- Plan persistence centralized in the sync effect (removed duplicate write in `handlePlanChange`)

### ⚡ Instant Plan Switching (Phase 1 — Tasks 3–4, completed)

**`src/utils/dataFetcher.js`**
- New `prefetchAllPlans(activePlanId)` — background-prefetches RAW + MTD for every non-active plan into the plan-scoped cache
- Skips plans whose cache is still fresh (within the 5-min `CACHE_MAX_AGE`) to avoid hammering Google's export endpoints
- Dedupe guard: concurrent calls share one in-flight run (promise resets when it settles); never throws — failures are logged and ignored

**`src/App.jsx`**
- `handlePlanChange` is now **cache-first**: cached data renders instantly (no loading skeleton), then a background refresh swaps in fresh data when it arrives
- New `applyPlanData()` helper — single code path for cache/live/fallback results (MTD, RAW, source, timestamp, latest date)
- Race-condition guard (`planChangeRef`) — rapidly switching plans can no longer let a stale fetch overwrite the latest selection
- Prefetch triggered on initial load and after every plan change, so future switches are near-instant

### ⏳ Phase 1 — Planned (Tasks 5–7, not yet implemented)

- Run-rate projection math (`projectRunRate`, `computeAreaPace`) and per-area pace badges
- Run-rate projection math: `projectRunRate`, `computeAreaPace`, `getPaceBadgeStyle` (`dataProcessor.js`)
- Projection UI: MTD hero pace pill + projected month-end, To-Go required-daily-rate, per-area pace badges (Executive Overview / Provincial Breakdown)

---

## [1.4.0] — 2026-09-07

### 📅 Date Selector & Daily View

- Calendar-grid date picker (popover on desktop, centered modal on mobile) shared by Executive Overview and Provincial Breakdown.
- Reordered date bar: `Latest available` badge → prev day → date toggle → next day → date counter.
- `Latest available` badge now appears **only on the newest date with actual input (INC > 0)**, tolerating delayed Google Sheet entries; app defaults to that date instead of an empty "today" block.
- Excluded future-dated rows from the RAW DATA parser so pre-entered days don't surface as available dates.
- Mobile: responsive trigger (truncating label), full-width modal calendar, readable day grid.
- MM/DD/YY formatting removed in favor of consistent `MMM d, yyyy` labels.

### 🐛 Bug Fixes

- Fixed missing next-month chevron / trapped month navigation in the calendar modal.
- Fixed Next-day arrow state after navigating to earlier dates.
- Fixed date picker crash (`d is not defined`) and stale `currentDateIdx` reference.
- Fixed console `Response body already used` and `chrome-extension` cache errors in the service worker (earlier hotfixes).

---

## [1.3.0] — 2026-09-03

### 🔧 Backend — Apps Script Column Layout Update

**Remove Column J (TOTAL RJO) from NEW REPORT sheets across all 3 plans**

| Plan | Sheet | Change |
|------|-------|--------|
| FIBERX | FIBERX NEW REPORT | Removed Column J (TOTAL RJO) |
| BIDA | BIDA NEW REPORT | Removed Column J (TOTAL RJO) |
| SME | SME NEW REPORT | Removed Column J (TOTAL RJO) |

**New NEW REPORT Layout (13 columns A-M):**
```
A:AREA  B:BF  C:INC  D:TOTAL  E:COMP FROM TOTAL  F:COMP FROM RJO  G:COMP TOTAL
H:RJO FOR THE MOS.  I:RJO FROM PREV MOS.
J:CARRY OVER  K:MTD  L:TARGET  M:%
```

**Apps Script Changes (FIBERXSCRIPT.gs, BIDASCRIPT.gs, SMESCRIPT.gs):**
- `totalRjo` is now **calculated** as `rjoThisMo + rjoRedispatched` (H+I) instead of reading from Column J
- Column indices shifted: `carryOver=row[9]`, `mtd=row[10]`, `target=row[11]`, `pct=row[12]`
- Updated file header comments and column mapping documentation

**RAW DATA Output — Unchanged (15 columns):**
```
Date | AREA | BF | INC | Total Jo | COMPLETED FROM TOTAL | COMPLETED FROM RJO | TOTAL COMPLETED
RJO INCOMING | RJO REDISPATCHED | TOTAL RJO | Carry Over | MTD | TARGET | %
```

---

### 🎨 Frontend — Executive Dashboard Redesign

**Visual Overhaul:**
- Blueprint/tech grid background pattern (light & dark modes)
- Deep dark slate card surfaces (`bg-[#0E1622]`)
- Frosted glass borders and subtle hover micro-interactions
- Full light mode support with proper `dark:` prefix utilities

**Executive Overview — Achievement Rate Hero:**
- 3-column layout: Score + Badge | SVG Gauge Meter | Linear Progress Bar
- Semi-circular gauge with glow filter, scales to 150% max
- Status badges: HIT (≥100% emerald), LAG (80-99.9% amber), MISS (<80% red)

**MTD Section:**
- 4-column grid: Total Incoming | Total Completed | Monthly Target | To Go
- Plan-accented colors (purple/red/teal per plan)
- Month/Year dropdown picker with custom chevron styling

**Daily To-Date Section:**
- 7-card grid: BF | INC | COMP ABL | COMP RJO | RJO | RJO FPMos | TOTAL RJO
- Highlighted Total Completed card with plan accent border
- Carry Over card at bottom

**Navigation & Controls:**
- Merged countdown + freshness into single status pill
- Removed "Online/Offline" badge
- Month/Year dropdown with improved styling
- SVG icons replace all emojis (checkmarks for target achieved)

---

### 📱 Mobile Responsive Fixes

- Header wraps cleanly on mobile (flex-wrap)
- Plan selector tabs compact on small screens (`px-2 py-1 text-[10px]`)
- Sync button icon-only on mobile
- Sticky AREA column in Provincial Breakdown with solid opaque backgrounds
- Proper z-index layering for sticky columns

---

### 🗄️ Data & Caching

**IndexedDB Fallback Cache:**
- New `src/utils/idbCache.js` module
- localStorage tried first (synchronous, fast)
- Falls back to IndexedDB on QuotaExceeded error
- No practical size limit — supports years of data

**CSV Export:**
- New `src/utils/exportCSV.js` module
- Downloads all RAW DATA as CSV with plan-scoped filename
- BOM character for Excel UTF-8 compatibility
- Filename format: `SLI_FIBERX_RAW_DATA_2026-09-03.csv`

**Cache Invalidation:**
- Service worker skips `chrome-extension://` URLs
- Cache keys scoped per plan (`gvsi_mtd_fiberx_v6`, etc.)

---

### 🐛 Bug Fixes

- Fixed sticky AREA column text bleed (solid opaque backgrounds instead of transparent)
- Fixed service worker `Failed to execute 'put' on 'Cache'` for extension URLs
- Fixed `Failed to execute 'clone' on 'Response'` in service worker
- Fixed light mode color contrast (all cards now have proper `dark:` prefixes)
- Fixed Provincial Breakdown button icon blowing up to full viewport
- Fixed `getCachedData()` async/await flow after IndexedDB integration
- Fixed month/year dropdown not updating MTD data on change

---

### 🏗️ Multi-Plan Architecture

**New Files:**
| File | Purpose |
|------|---------|
| `src/config/plans.js` | Plan registry with URLs, names, accent colors |
| `src/components/PlanSelector.jsx` | Tab bar UI with plan-specific accent colors |

**Modified Files:**
| File | Changes |
|------|---------|
| `src/App.jsx` | Plan state, PlanSelector, plan-accent Sync button, plan-scoped export |
| `src/utils/dataFetcher.js` | Plan-aware fetching, plan-scoped cache keys |
| `src/utils/exportCSV.js` | Plan name in filename |

**Plan Accent Colors:**
| Plan | Color | Hex |
|------|-------|-----|
| FIBERX | Indigo (purple) | `#4A1FB8` |
| BIDA | Red | `#D32F2F` |
| SME | Teal | `#00897B` |

---

### ⚡ Performance

- Auto-refresh polling every 5 minutes
- Loading skeleton animations with shimmer effect
- Layout-matching skeleton mirrors exact dashboard structure
- Staggered animation delays for natural cascade

---

### 🔒 PWA & Offline

- Service worker with cache-first strategy for app shell
- Google Sheets CSV cached separately with network-first strategy
- Offline fallback displays last cached data
- PWA install banner for first-time visitors

---

## [1.2.0] — 2026-09-02

### Added
- Executive Overview landing page with KPI cards
- Provincial Breakdown view with sortable table
- Dark/Light theme toggle
- Google Sheets data integration (FIBERX)
- PWA support with service worker
- Deployed to Vercel

---

## [1.1.0] — 2026-09-01

### Added
- Initial project setup with React + Vite + Tailwind CSS
- Basic data fetching from Google Sheets
- Responsive table layout

---

## [1.0.0] — 2026-08-31

### Added
- Project initialization
- Core architecture and design system

---

## Sheet Changes Summary

### FIBERX SLI Tracker DB
| Sheet | Change | Date |
|-------|--------|------|
| FIBERX NEW REPORT | Removed Column J (TOTAL RJO) | 2026-09-03 |
| RAW DATA | No change (15 columns) | — |
| MTD | No change (11 columns) | — |

### BIDA SLI Tracker DB
| Sheet | Change | Date |
|-------|--------|------|
| BIDA NEW REPORT | Removed Column J (TOTAL RJO) | 2026-09-03 |
| RAW DATA | No change (15 columns) | — |
| MTD | No change (11 columns) | — |

### SME SLI Tracker DB
| Sheet | Change | Date |
|-------|--------|------|
| SME NEW REPORT | Removed Column J (TOTAL RJO) | 2026-09-03 |
| RAW DATA | No change (15 columns) | — |
| MTD | No change (11 columns) | — |

---

## Deployment

| Platform | URL | Status |
|----------|-----|--------|
| Vercel | [gvsi-sli-tracker.vercel.app](https://gvsi-sli-tracker.vercel.app) | ✅ Live |

---

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.x | UI Framework |
| Vite | 5.x | Build Tool |
| Tailwind CSS | 3.x | Styling |
| Lucide React | Latest | Icons |
| Google Sheets API | CSV Export | Data Source |
| IndexedDB | Native | Offline Cache |
