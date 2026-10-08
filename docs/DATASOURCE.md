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
   months, see [ARCHIVE.md](./ARCHIVE.md)), the **year's target plan** (`sli_targets`) and
   **accounts / sessions / presence / maintenance** (see [DEVELOPER.md](./DEVELOPER.md)). Four
   tables are readable by that key — `sli_raw_daily`, `sli_mtd`, `sli_monthly`, `sli_targets` —
   and they are all dashboard data; everything account-related is reachable only through RPCs.

Since the archiving job exists, the rule for a dashboard figure is:

> **Current month → Google Sheet. Previous months → Supabase.** The app fetches both and merges
them before parsing, so no view has to know which side a month came from.

And since the year's targets moved into the project, the rule for the Year-to-Date section is:

> **Figures → the record (`sli_monthly`, then the live `MTD` tab). Targets and the province list
> → `sli_targets`.** The shared `YTD 2026` / `TARGET 2026` worksheet is not read at all.

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
| `YTD 2026` | `1253792447` | **Nothing.** Retired from the app; the figures come from the archive now | — |
| `TARGET 2026` | `1221052795` | **Nothing.** Retired; the plan is copied into `sli_targets` | — |

`YTD 2026` and `TARGET 2026` hold a block per plan (13 provinces × `JAN…DEC` + `TOTAL`). They
were the Year-to-Date section's source for everything — figures, monthly targets, annual
targets and the province list — and **the app no longer reads either of them.**

What replaced them, in the same order:

* the **figures** are the app's own record (see below);
* the **monthly targets, annual targets and the province list** are `sli_targets`, a copy of the
  `TARGET 2026` plan taken once by `scripts/targets-seed.cjs` (the SQL it printed is
  `supabase/seed-year-targets.sql`). One row per plan × month × area, so the table states the
  year's plan rather than a single annual figure per province, and the province list — thirteen
  of them, three more than the archive ever sees — is just the plan's own `row_order`.

`src/utils/yearTables.js` builds the two blocks the section is computed from, and does not need
either half to be complete (`buildYearTables`):

| Half | Comes from |
|------|------------|
| Figures | `sli_monthly` for a closed month, the live `MTD` tab for the running one |
| Targets | `sli_targets`, except for a month the record holds — a closed month's target was archived beside its figure, and a month is sourced once — and except for the month still running, whose targets come off the plan's own `DATA` tab (see below) |
| Provinces | `sli_targets`' own order, then any province only the record names |

The two guards that only apply to figures still apply, and both come from `buildOverrides`:

* a **collection-based plan** (SME) may only contribute its `NET`, so a record row written
  before the MRC columns existed carries no weight at all. See [YTD_SCOPING.md](./YTD_SCOPING.md)
  for that case in full.
* a month the record holds is sourced **whole**: a province the record does not list counts as
  zero for that month, and nothing is read beside it. That is why the annual target is taken
  from `sli_targets`' own twelve months rather than added up after the overrides — FIBERX's
  `Aurora` is 95 in `AUG`, a month the archive covers from a twelve-province list without it, so
  the effective series sums to 334 while the plan's year is 429.

`sli_monthly` is the app's **priority source**, and it is meant to hold every elapsed month.
It is one row per area per closed month with the month's **figure and target together**: the
archive job writes a month in the same run that writes `sli_mtd`, and the months that predate
the archive were backfilled out of the two year tabs (`supabase/seed-monthly-progress.sql`) —
2026 `JAN–JUL` for all three plans, and SME's `AUG` because its archived rows hold ticket
counts where the plan is measured in pesos. Both the Year-to-Date month strip and the
provincial grid read a month from there (`buildMonthlyOverrides` in
`src/utils/yearTables.js`). A row is read only when its `measure` matches the plan (`net` for
SME's collections, `count` otherwise), which is what keeps a month archived before the MRC
columns existed — SME's `2026-08`, a count with no NET — from being measured in the wrong units.

Each row also says which read wrote it (`source`): `archive` for the months the archive job
measured itself, `worksheet` for the months the backfill copied out of the year tabs. A month
is written whole by one side or the other, so the label is trustworthy month by month, and the
Developer console names the backfilled ones rather than counting somebody's worksheet cell as
the tracker's own measurement.

When the plan table cannot be read — offline with no cache, a 404, a fresh project — the section
is still built, from the record alone (`buildYearTables` with no `targetRows`): `sli_monthly`
supplies the months and the provinces it names, and the live `MTD` tab supplies the running
month's figure and target. There is no year to measure against, so everything that depends on
one is reported absent rather than partial (`annualTargetsKnown`), and the section says so on
screen — the plan-to-date headline needs only the months that have happened.

**The running month's targets are the one thing the year's plan does not state.** `sli_targets`
is a statement about the year: it was copied once out of `TARGET 2026` and is edited by hand,
so a month still being worked can outgrow it. That month lives on the plan's own `DATA` tab
(FIBERX DATA / BIDA DATA / SME DATA — the tab the velocity chart already reads), one row per
province per date, with the month's `TARGET` in its own column: `N` on FIBERX and BIDA, `P` on
SME, because the MRC columns push it two cells right. The app reads it at the latest date the
tab carries and uses those figures for the running month (`liveMonthTargets` in
`src/utils/yearTables.js`), which is what keeps the Monthly Progress strip agreeing with the
Month-to-Date card beside it.

SME's `OCT` is the case that made this necessary. Plan and tab agreed on 262,984 while the tab
held the old figure; the tab was raised to 307,529 on `Oct 7` and the plan was not, so the
strip read 262,984 for the rest of the month under a `MONTHLY TARGET` card reading 307,529.
FIBERX's `OCT` is the same defect one province wide — `Isabela` is 229 on the tab and 224 in
the plan. Only the provinces the tab names are replaced: it lists ten of the plan's thirteen
(`Cagayan`, `Kalinga` and `Apayao` have no rows there), and a province the tab does not track
keeps the plan's own figure rather than a zero nobody stated. From `SEP` on the plan itself
holds those three at zero, so the month totals as the tab states it. A month the archived
record already speaks for is left alone — a closed month is still sourced once, whole.

Where each month of the strip came from is reported month by month in the
**Developer console → Data source diagnostics → Monthly Progress**
(`summarizeMonthlyProgressSources` in `src/utils/yearTables.js`): the strip's own two figures
and the read behind each, so a month reading `sli_monthly` or `record` is accounted for and a
month reading `nothing read` is the one to chase — no read held it, so the cell is a zero
nobody measured.

Which year the province list and the targets came from is reported by the
**Developer console → Data source diagnostics → Year target plan** block, which is fed by the
`sli_targets` read itself (`fetchYearTargets` in `src/utils/archiveFetcher.js`): rows,
provinces × months, the annual total they add up to, whether the read came from Supabase or the
cache, whether the rows are the archive job's own or a backfill out of the worksheet, and the
same 'next conversion' countdown the archive schedule uses.

A closed month converts `ARCHIVE_AFTER_DAYS` days into the following month — the
`CONFIG` key the Apps Script reads (`ARCHIVE_AFTER_DAYS_KEY`, default `7`). The app never
archives anything; it mirrors the number as `ARCHIVE_AFTER_DAYS` in `src/config/plans.js`
so the console can date the next conversion. If the `CONFIG` value is changed, that
constant is the one place to update.

### 2. FIBERX SLI TRACKER DB

<https://docs.google.com/spreadsheets/d/1UUd8cpfKeOCBHANx9wmM7l1apFyDoZRv0dHZa2_bVr0>

Tabs: `FIBERX NEW REPORT`, `RAW DATA`, `MTD`, `CONFIG`

| Tab | gid | Read by |
|-----|-----|---------|
| `FIBERX NEW REPORT` | — | **Nothing in the app** — upstream encoding tab |
| `RAW DATA` | `486719298` | Daily / Provincial / Compare / Export |
| `MTD` | `1061751267` | Achievement, target, month-to-date figures — and, on SME, the `GROSS` / `NET` collection columns and a peso target |
| `CONFIG` | `1630783385` | **Developer console → Archive trim only.** The archive switches and `LAST_ARCHIVE`, the audit line the Apps Script writes; nothing on the dashboard reads it |

### 3. BIDA SLI TRACKER DB

<https://docs.google.com/spreadsheets/d/1FrEowZ9Zl0jMAyLDe4OZE2cQV04nIz-rjRkLi6uv99M>

Tabs: `BIDA NEW REPORT`, `RAW DATA`, `MTD`, `CONFIG`, `_ARCHIVE_BACKUP`

`RAW DATA` and `MTD` share FIBERX's gids (`486719298`, `1061751267`); `CONFIG` does **not**
(`1143583309`). `_ARCHIVE_BACKUP` holds the rows the archive copied before a hand-encoded
tab was purged, and is read by nothing.

### 4. SME SLI TRACKER DB

<https://docs.google.com/spreadsheets/d/10P3GatvwC76IujPpjHtqgyNjE71ChAoP_8Ln7BDcvTY>

Tabs: `SME NEW REPORT`, `RAW DATA`, `MTD`, `CONFIG`

`RAW DATA` and `MTD` share FIBERX's gids (`486719298`, `1061751267`); `CONFIG` is
`1236818076`.

> The three per-plan sheets share a structure and two gids, but every `CONFIG` tab has its
own — they were created independently. Check the gid before assuming it matches.

### 5. Supabase — GVSI NetPulse

<https://supabase.com/dashboard/project/fsebdacptgoknbjqdlor>

| Table | Read by | Notes |
|-------|---------|-------|
| `sli_raw_daily` | Daily / Provincial / Compare / Export, for **archived** months | one row per day × area, `is_overall_total` flagged |
| `sli_mtd` | Achievement, target, month picker, MoM delta, for **archived** months | one row per month × area, plus the month's overall total; `gross` / `net` hold SME's collections |
| `sli_monthly` | Year-to-Date strip and provincial grid, for **closed** months | one row per closed month × area with the figure and its target together; `measure` says `net` or `count`, `source` says who wrote it |
| `sli_targets` | Year-to-Date targets, province list and annual totals | one row per plan × month × area: the year's plan, copied once out of `TARGET 2026` |

All four are public-readable through the anon key; **writes need the service_role key**, which
lives only in the Apps Script's Script Properties — except `sli_targets`, whose only writer is
the seed above.

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
| Archive trim verdict (Developer console) | `DeveloperPanel` | Plan sheet → `CONFIG` (`LAST_ARCHIVE`), one tab per plan | Yes |
| Maintenance gate for non-Developers | `MaintenanceScreen` | Supabase RPC `presence_ping` → `maintenance` | No (shared) |
| Achievement Rate, Total Incoming, Total Completed, Monthly Target, To Go, Projected month-end | `ExecutiveOverview` | Plan sheet → `MTD` | Yes |
| Gross Collection, Net Collection, Monthly Target, Variance (SME only) | `ExecutiveOverview` | Plan sheet → `MTD` (`gross` / `net` / `target`); the same cards replace the count trio on a `collectionBased` plan | Yes |
| Month-over-month delta (`+x pts vs <month>`) | `ExecutiveOverview` | Plan sheet → `MTD` (month sections), plus Supabase `sli_mtd` for archived months | Yes |
| Month picker (which months are selectable) | `ExecutiveOverview` | Plan sheet → `MTD` month headers **+** Supabase archived months | Yes |
| **Any figure for a past month** | all of the above | Supabase `sli_mtd` (area rows + overall total) | Yes |
| **Daily / Provincial for a past month** | `ExecutiveOverview`, `DailyTable` | Supabase `sli_raw_daily`, merged into the sheet's `RAW DATA` rows | Yes |
| Daily To-Date cards (BF, INC, COMP ABL, COMP RJO, RJO, RJO FPMos, TOTAL RJO, Completed, CO) + 7-day trend arrows | `ExecutiveOverview` | Plan sheet → `RAW DATA` (selected date's block) | Yes |
| **30-day trend** sparkline | `ExecutiveOverview` | Shared → `<PLAN> DATA` | Yes |
| Provincial Breakdown table (all daily columns, AREA rows) | `DailyTable` | Plan sheet → `RAW DATA` (selected date's block) | Yes |
| Provincial Breakdown — `MTD` / `TARGET` / `%` columns | `DailyTable` | Plan sheet → `RAW DATA` (`mtd`, `target`, `pct` fields of the same block) | Yes |
| Provincial Breakdown — `GROSS` / `NET` columns (SME only) | `DailyTable` | Plan sheet → `RAW DATA` (`gross`, `net` fields of the same block), inserted before the pinned group | Yes |
| Provincial Breakdown — `7D TREND` per area | `DailyTable` | Plan sheet → `RAW DATA` (7-day window across blocks) | Yes |
| Date picker's list of available dates | `App` | Plan sheet → `RAW DATA` (`Date` column) | Yes |
| Compare view (all three plans side by side) | `CompareView` | **All three** plan sheets → `MTD` + `RAW DATA`; a `collectionBased` plan (SME) shows Net Collection and is left out of the count-based totals, with a note saying why | Yes (×3) |
| Installation SLA Breakdown (≤24h / ≤72h / >72h) | `AgingReport` | Shared → `COMPLETED AGING REPORT` | No (shared) |
| Executive Report (print / PDF) | `ExecutiveReportModal` | Plan sheet → `MTD` (areas + metrics); `RAW DATA` for the reference date. Provincial Standing is ranked, printed and paced on NET on a `collectionBased` plan (SME), on ticket completions otherwise | Yes |
| `Export` — "Export all RAW DATA as CSV" | `exportRawDataCSV` | Plan sheet → `RAW DATA` | Yes |
| Prefetch (background warm-up for all plans) | `prefetchAllPlans` | All three plan sheets → `MTD` + `RAW DATA` + shared aging/trend | Yes (×3) |

## Code map

| File | Responsibility |
|------|----------------|
| `src/config/plans.js` | Every URL: `AUTH_URL`, and per-plan `mtdUrl`, `rawUrl`, `agingUrl`, `trendUrl`, `sheetId`, `accentClasses`, plus `YTD_YEAR`. **This is the only place a sheet URL should live.** The two retired year tabs are absent on purpose |
| `src/utils/dataFetcher.js` | `fetchAllData` (live), `getCachedData` (cache-first), `prefetchAllPlans`, cache read/write |
| `scripts/targets-seed.cjs` | Prints `supabase/seed-year-targets.sql` from a `TARGET` CSV export — how a new year's plan is loaded, and how a corrected one is re-loaded |
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
| Archive keys | `gvsi_arch_idx_<plan>_v…` (month list, 5-minute TTL), `gvsi_arch_mon_<plan>_v…` (the Monthly Progress rows, 5-minute TTL — never remembered when empty) and `gvsi_arch_<mtd\|raw>_<plan>_<month>_v…` (**no TTL** — an archived month never changes, so it is fetched once per browser) |
| Year plan key | `gvsi_arch_tgt_<plan>_v…` — `sli_targets` rows for one plan, 5-minute TTL, likewise never remembered when empty |
| Versioning | The key embeds `APP_VERSION`, so a release retires the whole previous cache set and orphaned records are purged on version change |
| TTL | `CACHE_MAX_AGE` = **5 minutes**; older than that is treated as `stale-cache` |
| Refresh | The **Sync Data** button, the auto-refresh timer, or a hard reload. A manual sync forces the archive month list *and* the year plan, so a month archived or a target corrected server-side (see [`supabase/seed-year-targets.sql`](../supabase/seed-year-targets.sql)) appears at once instead of up to five minutes later |
| Prefetch | `prefetchAllPlans` warms the other two plans so Compare and plan switching render instantly |

> Because `trend` is a **separate cache key**, a client whose cache is still fresh (`< 5 min`) will
> not show the 30-day sparkline until the cache expires or **Sync Data** is pressed.

## Gotchas

- **`NEW REPORT` is never read by the app.** It is the source of truth; Apps Script turns it
  into `RAW DATA` and `MTD`. Editing it changes nothing until **Full Sync** runs. It is
  currently a live `=IMPORTRANGE(…)` mirror of the plan's `… DAILY` sheet, so edit the source
  sheet — and note that rows in a mirror cannot be deleted. What the archive does instead,
  once a closed month is verified in Supabase, is move the mirror's range start past it, so
  the window stops reaching back over months the app now reads from the archive.
- **`RAW DATA`, not `MTD`, drives the daily and provincial views** — and both are rebuilt from
  scratch on every script run, so never edit them by hand.
- **`MTD` and `RAW DATA` still live in the per-plan sheets** — but only for the live month once
  archiving is switched on. A closed month is read from Supabase, and the merge replaces any
  sheet rows for that month (the archive wins), so a month can never be counted twice even if
  the sheet still carries it — which is the normal state with `ARCHIVE_TRIM = FALSE` (for a
  mirror) or `ARCHIVE_PURGE = FALSE` (for a hand-encoded tab), and a transient one while a trim
  settles after it is.
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
