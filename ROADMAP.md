# GVSI SLI Tracker — Roadmap

Feature and architecture proposal for the next phase of the GVSI SLI Tracker dashboard.
This is a **planning document only** — no production code is defined here.

---

## 🧭 Current State

The dashboard is a *snapshot tool* — it answers **"where are we today?"** extremely well:

- **Tech Stack:** React 18, Vite, Tailwind CSS 3, Lucide React
- **Design System:** Frosted glassmorphism, cyber tech grid (`#070A0F`), responsive mobile modals, full light/dark mode
- **Data Logic:** Flat data model aggregated on the frontend; date-keyed RAW DATA blocks parsed from Google Sheets CSV; custom calendar `DatePicker` (desktop popover / mobile modal)
- **Multi-Plan:** FIBERX, BIDA, SME — each backed by its own Google Sheet with identical RAW DATA + MTD structure (`src/config/plans.js`)
- **Already shipped:** CSV export (`src/utils/exportCSV.js`), IndexedDB fallback cache, service-worker data cache, 5-min auto-refresh polling, INC-aware "Latest available" date logic, future-date row filter

## 🎯 Strategic Direction

The gap: the tracker does not yet answer the question executives actually ask next — **"are we getting better, and will we hit the number?"**

Every feature below converts the tracker from a *reporting screen* into a *decision screen*. The data model already supports this: RAW DATA is a full daily time series, and the MTD sheet holds multiple historical months. Most of the work is pure frontend math on data already being fetched.

---

## ✨ Feature Proposals

### 1. Momentum & Trend Analytics (WoW / MoM / DoD) — ⭐ Flagship

**Concept:** Add delta chips and mini sparklines wherever a number appears:

- **MTD hero card:** "Achievement Rate 30.5% ▲ +4.2 pts vs last month" (MoM), using the already-parsed `availableMonths` MTD sections
- **Daily To-Date cards:** each card (BF, INC, TOTAL COMPLETED, CARRY OVER) gets a DoD/WoW arrow + 7-day sparkline rendered from the date-keyed RAW DATA blocks
- **Provincial Breakdown:** a compact trend cell per area row (sparkline of the last 7 days of total completed) so lagging areas are visually obvious

**C-Suite value:** momentum is the difference between "we completed 531" and "we're accelerating/decelerating." Executives can spot a collapsing province before the monthly number misses.

**Technical feasibility & effort:** **Medium** — pure frontend, no schema or sheet changes. Needs a new `computeTrends()` util (group daily blocks by ISO week, diff MTD sections) and ~40 lines of SVG sparkline. The parser already returns everything needed.

**UI placement:** MTD hero card (delta pill beside the %), each Daily To-Date card footer, new "7-day trend" column in Provincial Breakdown (collapsible via the existing details toggle).

---

### 2. Run-Rate Projection & Health Alerts

**Concept:** Compute **projected month-end** = `totalCompleted ÷ daysElapsed × daysInMonth`, auto-flagging three statuses per area + overall: **On pace / Behind pace / Critical**. Add the same logic to Daily To-Date: "To hit target you need **X completions/day** for the remaining Y days." Reuse the existing INC-aware "Latest available" concept to flag stale-data days (days not yet keyed into the sheet).

**C-Suite value:** turns the achievement rate into an early-warning system. "Behind pace — needs 22/day for 18 days" is actionable; "30.5%" is not. The single highest-leverage addition for month-end-focused executives.

**Technical feasibility & effort:** **Low–Medium** — pure arithmetic on existing fields (target, lastMtd, days in month). "Days elapsed" must use the actual latest data date (respecting the future-date filter), not calendar today.

**UI placement:** MTD hero card (projected end-of-month line under the gauge + pace pill), per-area badge in Provincial Breakdown (`Behind ⚠` / `On pace ✓`), To-Go card enhancement showing the required daily rate.

---

### 3. One-Click Executive Report & Shareable Snapshots

**Concept:** Two halves:

1. **Print/PDF one-pager** — a print-optimized layout (`window.print()` + print CSS) rendering the current plan's MTD hero + Daily To-Date + top/bottom 5 provinces as a clean C-suite one-pager (CSV export already exists; this adds the visual artifact)
2. **Deep-link snapshots** — encode current state in the URL: `?plan=bida&date=2026-09-06&month=2026-08`. Opening the link restores plan, date, and month instantly — executives can share a live, self-updating link in chat instead of a stale PNG

**C-Suite value:** meeting-ready artifact in one click, and self-updating links that always show fresh data.

**Technical feasibility & effort:** **Medium** — print CSS is low effort; deep links need a small `useUrlState` hook (read params on load, push on change) layered over existing plan/date/month state. Watch the `base: '/GVSI-SLI-Tracker/'` path for clean URL construction.

**UI placement:** new "Export ▾" menu in the header (PDF via print, CSV per plan, **Copy snapshot link**), plus a subtle "Open in report view" icon in the Provincial Breakdown header.

---

### 4. Portfolio Compare Mode (multi-plan + area filtering)

**Concept:** A "Compare" toggle in the header rendering all 3 plans (FIBERX / BIDA / SME) side-by-side — compact MTD cards per plan (achievement rate, total completed, target, to go) in a 3-column grid, each in its plan accent color. Below it, an optional combined **portfolio totals** row (sum across plans — defensible since all three share identical schemas). Also add cluster/area filter chips + search in Provincial Breakdown (areas are already dynamically detected per plan).

**C-Suite value:** today the portfolio view requires 3 clicks and mental math; this makes the whole service-line book visible on one screen — where is the gap, and which plan carries it.

**Technical feasibility & effort:** **Medium** — all three sheets parse into identical structures; the comparison view is a thin aggregation layer + a fetch-all-plans mode in `dataFetcher` (the service-worker data cache already exists, so the two extra fetches are cheap after first load).

**UI placement:** header toggle `Single ▾ | Compare`; compare mode replaces the hero with a 3-column plan grid; Provincial Breakdown toolbar gains cluster chips + search box.

---

### 5. Instant-State Pack (persistence + prefetch + sticky columns)

**Concept:** Three performance/UX hardening items bundled:

1. **URL + localStorage state persistence** (plan, selected date, month/year, theme) so a refresh or reopen restores exactly where the user was
2. **Background prefetch** — after first load, silently fetch + cache the other two plans' CSVs into the existing IndexedDB/service-worker cache so plan switching is near-instant
3. **Sticky AREA column** in Provincial Breakdown (horizontal scroll keeps province names pinned) — directly addresses the column-mixing scroll issue

**C-Suite value:** zero-friction exploration — no waiting on spinners, state survives refreshes, tables stay readable.

**Technical feasibility & effort:** **Low–Medium** — all incremental over existing infrastructure (IndexedDB fallback, SW data cache, CSV parsers). Sticky first column is a CSS `sticky left-0` on the first `<th>/<td>` plus an opaque background to mask overlap.

**UI placement:** invisible (architecture) + Provincial Breakdown table.

---

## 🗺️ Suggested Sequencing

| Phase | Features | Rough effort | Outcome |
|-------|----------|--------------|---------|
| **Phase 1 (1–2 days)** | F5 persistence/prefetch + F2 projection | Low–Medium | Faster + actionable today |
| **Phase 2 (3–5 days)** | F1 trend analytics + F3 print/report | Medium | Decision-grade dashboard |
| **Phase 3 (next week)** | F4 compare mode | Medium | Portfolio command center |

> **Note:** F1 and F2 share a `computeTrends` / `projectRunRate` math layer — build them together to avoid duplicated logic.

## 🚀 Stretch Goals (beyond this roadmap)

- Export run-rate projections to the MTD sheet via Apps Script so the *sheet itself* carries pace flags
- Weekly email digest from Apps Script (Triggers already exist for auto-sync)
- Per-area alert thresholds configurable in `src/config/plans.js`

---

## 📋 Phase 1 — Detailed Scope

> Elaborated scope for the first implementation phase. **Planning only** — no production code.

### Overview

Three workstreams, all incremental over the existing architecture (no Google Sheets / Apps Script / schema changes):

1. **State Persistence** — restore app state (plan, date, month, view) on refresh/reopen, and share it via URL links
2. **Background Prefetch** — fast plan switching (FIBERX ↔ BIDA ↔ SME) without waiting on the network
3. **Run-Rate Projection** — tell the executive whether the month-end target is on pace, and what daily rate is needed

### Verified Data-Flow Facts (basis for this scope)

- `App.jsx` owns all view state: `activePlan`, `selectedDate`, `selectedMonthYear`, `view`, `autoRefreshEnabled`. Theme lives in `ThemeContext` under key `gvsi_theme`.
- `dataFetcher.js` already has plan-scoped caching (`saveCache`/`readCache`, localStorage→IndexedDB fallback, cache keys like `gvsi_mtd_<plan>_v6`).
- `parseMTDData` returns per-month sections + `overallTotal { lastPct, lastMtd, target, toGo, totalIncoming }` and `availableMonths`.
- `parseRawDailyData` returns `{ blocks, dates }` (chronological); `findLatestDataDate` gives the INC-aware "real data" date.
- `extractExecutiveMetrics(mtdData, dailyBlock)` is the single source of MTD + daily metrics fed to `ExecutiveOverview`.

---

### WS1 — URL + localStorage State Persistence

**Problem:** Only the plan persists today (`gvsi_active_plan`). Date, month/year, and view reset on refresh, and there is no way to share a specific state (e.g. "BIDA on September 6") via link.

**New file: `src/utils/urlState.js`**

| Function | Purpose |
|---|---|
| `readUrlState()` | Parse `?plan=&date=&month=&view=` from `location.search` (works with `/GVSI-SLI-Tracker/` base path) |
| `writeUrlState(state)` | Update URL via `history.replaceState` (**never** `pushState` — date stepping would spam history entries) |
| `parseDateParam(s)` / `formatDateParam(dateStr)` | Convert `YYYY-MM-DD` ↔ `"September 6, 2026"` — internal dates stay in display format |
| `parseMonthParam(s)` / `formatMonthParam(monthStr)` | Convert `YYYY-MM` ↔ `"September 2026"` |
| `STATE_STORAGE_KEYS` | `gvsi_selected_date`, `gvsi_selected_month`, `gvsi_selected_view` |

**Why `replaceState`?** `pushState` creates a history entry per date-step click, trapping users in the Back button. `replaceState` updates the URL without polluting history.

**Why `YYYY-MM-DD` in the URL?** Display strings like `"September 6, 2026"` contain spaces and need encoding; `2026-09-06` is standard, sortable, and machine-readable.

**`App.jsx` changes:**

| Task | Detail |
|---|---|
| Initial-state resolver | Priority: **URL params → localStorage → existing defaults**, resolved in `useState(() => ...)` initializers to avoid a flash of wrong data |
| URL sync effect | One `useEffect` on `[activePlan, selectedDate, selectedMonthYear, view]` → `writeUrlState()` + localStorage writes |
| Validation after data load | If a URL-restored date is missing from `availableDates` or month from `availableMonths`, fall back to `findLatestDataDate` / `findClosestDate` / current month — drop invalid params silently, never crash |
| Plan switch | Keep `gvsi_active_plan`; extend persistence to the other 3 keys |

**Edge cases:** unknown plan → default; invalid date/month → sensible default; failed fetch with URL params → existing error/cached path; theme intentionally **not** in the URL (user preference, not shareable state).

**Acceptance:** refresh restores exact view/date/month; `?plan=bida&date=2026-09-06&month=2026-09` opens BIDA on that date; no new history entries.

---

### WS2 — Background Prefetch of Other Plans

**Problem:** Plan switching today shows a full skeleton while fetching 2 CSVs (MTD + RAW). With January–December RAW DATA coming, the data is ~3× larger and the wait will grow.

**`dataFetcher.js` changes:**

| Function | Detail |
|---|---|
| `prefetchAllPlans(excludePlanId)` | Iterate `PLAN_ORDER`, skip the active plan, call `fetchAllData(planId)` fire-and-forget (writes cache only, no UI state). Guard with module-level `prefetching = new Set()` for dedupe; skip when `!navigator.onLine` |
| `getCachedData` | No change — already the fast read path |
| Config flag | `PREFETCH_ENABLED` const (default `true`) in `dataFetcher.js` or `plans.js` |

**Why this is safe:** `fetchAllData` already calls `saveCache`, so background fetches auto-persist to localStorage/IndexedDB. The auto-refresh polling refreshes the **active plan only** — prefetched data may be a few minutes stale, which is acceptable (better a slightly stale render than a skeleton).

**`App.jsx` — instant plan switch (cache-first render):**

```
Click BIDA
  ├─ 1. getCachedData('bida') → cache exists?
  │     ├─ YES → render cached data immediately (no skeleton)
  │     └─ NO  → skeleton (first visit only)
  └─ 2. fetchAllData('bida') in background → replace state when it arrives
```

**Edge cases:** offline → skip prefetch; plan switched mid-prefetch → `Set` dedupe; prefetch failure → `console.warn` only, never in UI; localStorage full → existing IndexedDB fallback.

**Acceptance:** after first load BIDA/SME caches are warm; plan switching shows no skeleton after the first visit; no duplicate fetches for the active plan.

---

### WS3 — Run-Rate Projection & Health Alerts

**Problem:** Achievement rate is a snapshot. It doesn't answer "will we hit the month target?" or "which areas are behind pace?"

**The math (example: FIBERX, Sep 6 2026 — the latest date with real data):**

```
daysElapsed   = day-of-month(latestDataDate) = 6
 daysInMonth   = 30 (September)
daysRemaining = 30 − 6 = 24
projected     = totalCompleted ÷ 6 × 30
requiredDaily = (target − totalCompleted) ÷ 24
pacePct       = (totalCompleted ÷ target) ÷ (6 ÷ 30) × 100
```

**Pace flags (mirror existing badge thresholds):**

| pacePct | Status | Badge |
|---|---|---|
| ≥ 100% | On pace | 🟢 Emerald |
| 80–99.9% | Behind pace | 🟡 Amber |
| < 80% | Critical | 🔴 Rose |
| totalCompleted ≥ target | Target hit | 🟢 Emerald (HIT) |

**⚠️ Critical detail:** `daysElapsed` must use the **INC-aware latest data date** (`findLatestDataDate`), not calendar today — delayed sheet entries would otherwise skew the projection.

**New exports in `dataProcessor.js`:**

| Function | Spec |
|---|---|
| `projectRunRate(ot, latestDateStr)` | Overall projection for the MTD hero card (`ot` = `overallTotal`) |
| `computeAreaPace(areaMtdRow, latestDateStr)` | Same math per area, from that month's MTD section area rows |
| `getPaceBadgeStyle(pace)` | Reuse the existing badge color system |

**Guards (no NaN/Infinity):** `daysElapsed = 0` → `null`; `target = 0` → `null`; `daysRemaining = 0` (last day) → "Final day" state; `daysElapsed < 3` → show but flag as "early estimate".

**UI placement:**

| Where | What renders |
|---|---|
| MTD Hero Card (Executive Overview) | "Projected month-end: 1,204" under the gauge + pace pill |
| To-Go Card | Subtext "Need 22/day for 24 days" |
| Provincial Breakdown | Per-area pace badge column, collapsible like the existing details toggle |

**Acceptance:** sensible projection + pace pill for Sep 6 (FIBERX); an area at 60% of proportional pace shows amber/rose; no `NaN`/`Infinity` anywhere; delayed sheet entries don't skew the projection.

---

### Combined Task List

| # | Task | Files | Effort |
|---|---|---|---|
| 1 | Create `urlState.js` (read/write/parse helpers + storage keys) | **new file** | Low |
| 2 | Wire initial-state resolver + URL sync effect + validation | `App.jsx` | Medium |
| 3 | Add `prefetchAllPlans()` + dedupe guard + offline skip | `dataFetcher.js` | Low |
| 4 | Prefetch triggers + instant plan switch (cache-first render) | `App.jsx` | Medium |
| 5 | Add `projectRunRate`, `computeAreaPace`, `getPaceBadgeStyle` | `dataProcessor.js` | Medium |
| 6 | Projection UI: hero projected line + pace pill + To-Go daily rate | `ExecutiveOverview.jsx` | Medium |
| 7 | Per-area pace badges sa Provincial Breakdown | `DailyTable.jsx`, `SLITable.jsx` | Medium |
| 8 | `npm run build` + manual QA | — | Low |

**Dependency map:** Tasks 1–2, 3–4, and 5–7 are independent — parallelizable. Task 8 is last. Total ~2 days, low risk (no backend/sheet changes).