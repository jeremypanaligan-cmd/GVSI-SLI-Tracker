# GVSI SLI Tracker — Data Sources

Which spreadsheet and tab each part of the app reads from, and where that is wired up in code.

For how the sheets are *produced* (NEW REPORT → RAW DATA → MTD, the `CONFIG` tab, Full Sync),
see [DATA_PIPELINE.md](./DATA_PIPELINE.md). This document is the app-side view: what the UI
reads, and from where.

There are **two** kinds of source:

1. **Google Sheets**, read as CSV export URLs (`/export?format=csv&gid=…`) declared in
   `src/config/plans.js`. The app never uses the Sheets API and holds no credentials — every tab
   must be readable via "Publish to web" / link sharing.
2. **Supabase** (project `GVSI NetPulse`, ref `fsebdacptgoknbjqdlor`), called over PostgREST with
   the public anon key from `src/config/supabase.js`. It holds the **cold archive** (closed
   months, see [ARCHIVE.md](./ARCHIVE.md)) and **accounts / sessions / presence / maintenance**
   (see [DEVELOPER.md](./DEVELOPER.md)). Only two tables are readable by that key, and both are
   archive data; everything account-related is reachable only through RPCs.

Since the archiving job exists, the rule for a dashboard figure is:

> **Current month → Google Sheet. Previous months → Supabase.** The app fetches both and merges
them before parsing, so no view has to know which side a month came from.

## The spreadsheets

### 1. SLI TRACKER Database — shared

<https://docs.google.com/spreadsheets/d/1PGB2Mmo5Ka2NBfrlJWIF3V_X3Kxm6jepT5-eEYOC9bs>

The one sheet that is **not** per-plan. It holds login, the SLA/aging report, and the three
plan-specific trend tabs.

| Tab | gid | Read by | Config key |
|-----|-----|---------|------------|
| `Login Credentials` | `1425491426` | **Nothing** — superseded by `sli_users`; kept only as a private working copy | — |
| `COMPLETED AGING REPORT` | `766491804` | Installation SLA Breakdown | `PLANS[*].agingUrl` (all three plans) |
| `FIBERX DATA` | `0` | Executive Overview 30-day trend (FIBERX) | `PLANS.fiberx.trendUrl` |
| `BIDA DATA` | `721299435` | Executive Overview 30-day trend (BIDA) | `PLANS.bida.trendUrl` |
| `SME DATA` | `1854320942` | Executive Overview 30-day trend (SME) | `PLANS.sme.trendUrl` |

### 2. FIBERX SLI TRACKER DB

<https://docs.google.com/spreadsheets/d/1UUd8cpfKeOCBHANx9wmM7l1apFyDoZRv0dHZa2_bVr0>

Tabs: `FIBERX NEW REPORT`, `RAW DATA`, `MTD`

| Tab | gid | Read by |
|-----|-----|---------|
| `FIBERX NEW REPORT` | — | **Nothing in the app** — upstream encoding tab |
| `RAW DATA` | `486719298` | Daily / Provincial / Compare / Export |
| `MTD` | `1061751267` | Achievement, target, month-to-date figures |

### 3. BIDA SLI TRACKER DB

<https://docs.google.com/spreadsheets/d/1FrEowZ9Zl0jMAyLDe4OZE2cQV04nIz-rjRkLi6uv99M>

Tabs: `BIDA NEW REPORT`, `RAW DATA`, `MTD` — same gids as FIBERX (`486719298`, `1061751267`).

### 4. SME SLI TRACKER DB

<https://docs.google.com/spreadsheets/d/10P3GatvwC76IujPpjHtqgyNjE71ChAoP_8Ln7BDcvTY>

Tabs: `SME NEW REPORT`, `RAW DATA`, `MTD` — same gids as FIBERX (`486719298`, `1061751267`).

> The three per-plan sheets are structurally identical. Only the plan name differs.

### 5. Supabase — GVSI NetPulse

<https://supabase.com/dashboard/project/fsebdacptgoknbjqdlor>

| Table | Read by | Notes |
|-------|---------|-------|
| `sli_raw_daily` | Daily / Provincial / Compare / Export, for **archived** months | one row per day × area, `is_overall_total` flagged |
| `sli_mtd` | Achievement, target, month picker, MoM delta, for **archived** months | one row per month × area, plus the month's overall total |

Both are public-readable through the anon key; **writes need the service_role key**, which
lives only in the Apps Script's Script Properties.

| RPC | Read by | Public? |
|-----|---------|---------|
| `verify_login` | Login gate | yes — wrong credentials return an empty set |
| `presence_ping` | Heartbeat (presence + maintenance + token check) | yes |
| `presence_leave` | Sign-out / tab close | yes |
| `maintenance_get` | Login screen, maintenance gate | yes |
| `active_users`, `recent_sessions` | Developer console | Developer session required |
| `maintenance_set`, `force_signout_all` | Developer console | Developer session required |

`sli_users`, `sli_sessions` and `sli_settings` are **not** readable with the anon key at all
(`401 permission denied`); the RPCs above are the only way in. Schema:
[`supabase/schema.sql`](../supabase/schema.sql).

## App part → data source

| Part of the app | Component | Reads | Plan-scoped? |
|-----------------|-----------|-------|--------------|
| Login / sign out | `LoginScreen`, `AuthContext` | Supabase RPC `verify_login` → `sli_users` | No (shared) |
| Active-user roster, maintenance switch | `DeveloperPanel` | Supabase RPCs `active_users`, `recent_sessions`, `maintenance_set`, `force_signout_all` | No (shared) |
| Maintenance gate for non-Developers | `MaintenanceScreen` | Supabase RPC `presence_ping` → `maintenance` | No (shared) |
| Achievement Rate, Total Incoming, Total Completed, Monthly Target, To Go, Projected month-end | `ExecutiveOverview` | Plan sheet → `MTD` | Yes |
| Month-over-month delta (`+x pts vs <month>`) | `ExecutiveOverview` | Plan sheet → `MTD` (month sections), plus Supabase `sli_mtd` for archived months | Yes |
| Month picker (which months are selectable) | `ExecutiveOverview` | Plan sheet → `MTD` month headers **+** Supabase archived months | Yes |
| **Any figure for a past month** | all of the above | Supabase `sli_mtd` (area rows + overall total) | Yes |
| **Daily / Provincial for a past month** | `ExecutiveOverview`, `DailyTable` | Supabase `sli_raw_daily`, merged into the sheet's `RAW DATA` rows | Yes |
| Daily To-Date cards (BF, INC, COMP ABL, COMP RJO, RJO, RJO FPMos, TOTAL RJO, Completed, CO) + 7-day trend arrows | `ExecutiveOverview` | Plan sheet → `RAW DATA` (selected date's block) | Yes |
| **30-day trend** sparkline | `ExecutiveOverview` | Shared → `<PLAN> DATA` | Yes |
| Provincial Breakdown table (all daily columns, AREA rows) | `DailyTable` | Plan sheet → `RAW DATA` (selected date's block) | Yes |
| Provincial Breakdown — `MTD` / `TARGET` / `%` columns | `DailyTable` | Plan sheet → `RAW DATA` (`mtd`, `target`, `pct` fields of the same block) | Yes |
| Provincial Breakdown — `7D TREND` per area | `DailyTable` | Plan sheet → `RAW DATA` (7-day window across blocks) | Yes |
| Date picker's list of available dates | `App` | Plan sheet → `RAW DATA` (`Date` column) | Yes |
| Compare view (all three plans side by side) | `CompareView` | **All three** plan sheets → `MTD` + `RAW DATA` | Yes (×3) |
| Installation SLA Breakdown (≤24h / ≤72h / >72h) | `AgingReport` | Shared → `COMPLETED AGING REPORT` | No (shared) |
| Executive Report (print / PDF) | `ExecutiveReportModal` | Plan sheet → `MTD` (areas + metrics); `RAW DATA` for the reference date | Yes |
| `Export` — "Export all RAW DATA as CSV" | `exportRawDataCSV` | Plan sheet → `RAW DATA` | Yes |
| Prefetch (background warm-up for all plans) | `prefetchAllPlans` | All three plan sheets → `MTD` + `RAW DATA` + shared aging/trend | Yes (×3) |

## Code map

| File | Responsibility |
|------|----------------|
| `src/config/plans.js` | Every URL: `AUTH_URL`, and per-plan `mtdUrl`, `rawUrl`, `agingUrl`, `trendUrl`, `sheetId`, `accentClasses`. **This is the only place a sheet URL should live.** |
| `src/utils/dataFetcher.js` | `fetchAllData` (live), `getCachedData` (cache-first), `prefetchAllPlans`, cache read/write |
| `src/utils/csvParser.js` | `parseCSV` — handles quoted fields and CRLF from Google's export |
| `src/utils/dataProcessor.js` | `parseMTDData`, `parseRawDailyData`, `parseAgingReport`, `extractExecutiveMetrics`, `buildDailyTrend`, `findLatestDataDate` |
| `src/config/supabase.js` | Supabase URL + the public anon key. **The only place a Supabase endpoint should live.** |
| `src/utils/archiveFetcher.js` | Reads archived months and rebuilds them as sheet-shaped CSV rows; merges them into the sheet data before parsing |
| `src/utils/presence.js` | Presence / maintenance / roster RPC client |
| `src/utils/auth.js` | Hashes the password, calls `verify_login`, stores the returned session token |
| `src/utils/idbCache.js` | IndexedDB fallback when localStorage quota is exceeded |

### Fetched together, every sync

`fetchAllData(planId)` pulls four endpoints in one pass and caches all of them:

1. `plan.mtdUrl`
2. `plan.rawUrl`
3. `plan.agingUrl` — **best effort**, failure is ignored (aging is optional)
4. `plan.trendUrl` — **best effort**, failure is ignored (trend is optional)

A failed MTD or RAW fetch fails the whole sync; a failed aging or trend fetch only omits that view.

## Cache and freshness

| Aspect | Behaviour |
|--------|-----------|
| Storage | `localStorage`, with an IndexedDB fallback on quota errors |
| Keys | `gvsi_<mtd\|raw\|aging\|trend\|time>_<plan>_v<appVersion>` (e.g. `gvsi_trend_fiberx_v1.12.0`) |
| Archive keys | `gvsi_arch_idx_<plan>_v…` (month list, 5-minute TTL) and `gvsi_arch_<mtd\|raw>_<plan>_<month>_v…` (**no TTL** — an archived month never changes, so it is fetched once per browser) |
| Versioning | The key embeds `APP_VERSION`, so a release retires the whole previous cache set and orphaned records are purged on version change |
| TTL | `CACHE_MAX_AGE` = **5 minutes**; older than that is treated as `stale-cache` |
| Refresh | The **Sync Data** button, the auto-refresh timer, or a hard reload |
| Prefetch | `prefetchAllPlans` warms the other two plans so Compare and plan switching render instantly |

> Because `trend` is a **separate cache key**, a client whose cache is still fresh (`< 5 min`) will
> not show the 30-day sparkline until the cache expires or **Sync Data** is pressed.

## Gotchas

- **`NEW REPORT` is never read by the app.** It is the hand-encoded source of truth; Apps Script
  turns it into `RAW DATA` and `MTD`. Editing it changes nothing until **Full Sync** runs.
- **`RAW DATA`, not `MTD`, drives the daily and provincial views** — and both are rebuilt from
  scratch on every script run, so never edit them by hand.
- **`MTD` and `RAW DATA` still live in the per-plan sheets** — but only for the live month once
  archiving is switched on. A closed month is read from Supabase, and the merge replaces any
  sheet rows for that month (the archive wins), so a month can never be counted twice even if a
  purge has not run yet.
- **An archived month is fetched once and cached without a TTL.** Bump `APP_VERSION` (i.e. release)
  and those caches are retired — that is the only way their shape changes.
- **The app tolerates Supabase being down.** Archived months simply do not appear and every view
  falls back to sheet-only data; nothing throws.
- **The trend tabs are plan-specific** (`FIBERX DATA` / `BIDA DATA` / `SME DATA`), while the
  aging report and login tab are shared by all three plans.
- **`gid=0` means "first tab"**, which is why `FIBERX DATA` is `0`. Do not reorder tabs after
  this or the FIBERX 30-day trend will silently read the wrong data.
- **Compare multiplies the work by three.** It reads `MTD` and `RAW DATA` for every plan.
- **The 30-day trend is a rolling window** anchored on the latest date that carries incoming
  work, so it is hidden on past months (matching the projection rule) and grows toward 30 days
  as the `DATA` tabs accumulate history.
