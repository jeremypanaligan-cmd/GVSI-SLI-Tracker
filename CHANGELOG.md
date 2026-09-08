# GVSI SLI Tracker — Changelog

All notable changes to the **GVSI SLI Tracker** Progressive Web App are documented here.

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
