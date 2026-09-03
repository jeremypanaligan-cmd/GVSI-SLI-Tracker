# GVSI SLI Tracker — Changelog

All notable changes to the **GVSI SLI Tracker** Progressive Web App are documented here.

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
