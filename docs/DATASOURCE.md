# GVSI SLI Tracker — Data Sources

Which spreadsheet and tab each part of the app reads from, and where that is wired up in code.

For how the sheets are *produced* (NEW REPORT → RAW DATA → MTD, the `CONFIG` tab, Full Sync),
see [DATA_PIPELINE.md](./DATA_PIPELINE.md). This document is the app-side view: what the UI
reads, and from where.

All endpoints are Google Sheets **CSV export** URLs (`/export?format=csv&gid=…`) declared in
`src/config/plans.js`. The app never uses the Sheets API and holds no credentials — every tab
must be readable via "Publish to web" / link sharing.

## The spreadsheets

### 1. SLI TRACKER Database — shared

<https://docs.google.com/spreadsheets/d/1PGB2Mmo5Ka2NBfrlJWIF3V_X3Kxm6jepT5-eEYOC9bs>

The one sheet that is **not** per-plan. It holds login, the SLA/aging report, and the three
plan-specific trend tabs.

| Tab | gid | Read by | Config key |
|-----|-----|---------|------------|
| `Login Credentials` | `1425491426` | Login gate | `AUTH_URL` |
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

## App part → data source

| Part of the app | Component | Reads | Plan-scoped? |
|-----------------|-----------|-------|--------------|
| Login / sign out | `LoginScreen`, `AuthContext` | Shared → `Login Credentials` | No (shared) |
| Achievement Rate, Total Incoming, Total Completed, Monthly Target, To Go, Projected month-end | `ExecutiveOverview` | Plan sheet → `MTD` | Yes |
| Month-over-month delta (`+x pts vs <month>`) | `ExecutiveOverview` | Plan sheet → `MTD` (month sections) | Yes |
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
| `src/utils/auth.js` | Fetches `AUTH_URL`, compares the lowercase SHA-256 hex of the entered password |
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
- **`MTD` and `RAW DATA` still live in the per-plan sheets.** Only the aging report and the
  30-day trend tabs have moved to the shared database. Moving the rest is a possible follow-up.
- **The trend tabs are plan-specific** (`FIBERX DATA` / `BIDA DATA` / `SME DATA`), while the
  aging report and login tab are shared by all three plans.
- **`gid=0` means "first tab"**, which is why `FIBERX DATA` is `0`. Do not reorder tabs after
  this or the FIBERX 30-day trend will silently read the wrong data.
- **Compare multiplies the work by three.** It reads `MTD` and `RAW DATA` for every plan.
- **The 30-day trend is a rolling window** anchored on the latest date that carries incoming
  work, so it is hidden on past months (matching the projection rule) and grows toward 30 days
  as the `DATA` tabs accumulate history.
