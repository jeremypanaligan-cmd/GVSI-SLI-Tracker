# GVSI SLI Tracker — UI Improvement To-Do List

A prioritized backlog of UI/UX improvements for the dashboard. Each item lists the
problem, the proposed solution, and the rough effort. Check items off as they land.

---

## 1. Header Decluttering (2-Tier App Bar) — 🔥 Priority ✅ DONE

**Problem:** On mobile the top header is a cramped multi-row wrap — brand +
3 plan pills + Compare + Theme + Report + Export + Sync all compete for ~360px.
Users report the top "tab" feels too compressed.

**Proposed solution — 2-tier responsive header:**
- **Tier 1 (brand row, mobile):** SLI logo + "GVSI SLI Tracker" + compact status
  pill (pulsing dot + "Live") + Theme toggle — clean, 4 elements.
- **Tier 2 (action bar, mobile):** horizontally scrollable strip
  (`overflow-x-auto` + hidden scrollbar) with the plan tabs (FIBERX/BIDA/SME) +
  Compare + Report + Export + Sync as icon+label buttons.
- **Desktop:** unchanged single row.

**Alternative (smaller change):** collapse Report / Export / Sync / Theme into one
overflow menu (⋮) — fewer visible controls, 2 taps to reach actions.

**Effort:** Medium (layout-only, no data logic changes). Files: `App.jsx`.

**✅ Landed:** 2-tier app bar shipped — brand row + scrollable action strip on
mobile; single row on desktop; shared `headerActions` for both breakpoints.

---

## 2. Mobile Status Pill ✅ DONE

**Problem:** the countdown / time-ago pill is `hidden sm:flex` — mobile users get
no "last sync" / freshness indicator.

**Solution:** compact version in Tier 1 on mobile: pulsing green dot + "Live" +
`time ago` (e.g. "Live • 2m ago"), with full countdown on sm+.

**Effort:** Low. Files: `App.jsx`.

**✅ Landed:** compact pill (pulsing dot + time-ago, e.g. "just now") in Tier 1
on mobile; full countdown pill retained on desktop.

## 3. Copy Snapshot Link — Quick Win ✅ DONE

**Problem:** URL state persistence exists (Phase 1), but there is no way for an
executive to *grab* the current state as a shareable link. (Roadmap F3 part 2 —
not yet done.)

**Solution:** "Copy link" button (header or Report modal) that copies
`?plan=&date=&month=&view=` for the current screen; toast "Link copied".
Self-updating link — always shows fresh data when opened.

**Effort:** Low. Files: `App.jsx`, new small `CopyLink` helper/component.

**✅ Landed:** Copy Link button in the shared header actions (mobile strip +
desktop row); new `src/utils/copyLink.js` (Clipboard API + execCommand
fallback); "Link copied" toast (~2.2s auto-dismiss).

---

## 4. Compare Mode Mobile Polish ✅ DONE

**Problem:** on phones the 3 plan cards stack vertically — long scroll to compare.

**Solution:** horizontal snap-scroll carousel on mobile (`scroll-snap-type: x
mandatory`, snap per card, swipe between FIBERX / BIDA / SME); grid stays on
sm+.

**Effort:** Low–Medium. Files: `CompareView.jsx`.

**✅ Landed:** snap carousel (`snap-x snap-mandatory`, cards `snap-start`
w-[85%] with next-plan peek) + tappable scroll-indicator dots with active
state; grid unchanged on sm+.

---

## 5. DatePicker Quick Jump ✅ DONE

**Problem:** navigating back to the current month from an old date requires many
clicks.

**Solution:** "Today" button + month/year quick-select in the calendar header;
keep the existing `< Month Year >` arrows.

**Effort:** Low. Files: `DatePicker.jsx`.

**✅ Landed:** month/year label opens a quick selector (year stepper +
12-month grid, current month highlighted); Today button jumps to the
current month and selects today when it has data.

---

## 6. Table UX Hardening ✅ DONE

**Problem:** numeric column widths shift between rows/sorts; the far-right
columns (MTD / TARGET / %) scroll out of sight.

**Solution (landed):**
- **Fixed column widths** — every column has a consistent `width`
  (72–150px) so numbers stay aligned while sorting
- **Right-sticky MTD · TARGET · % columns** — mirror the AREA sticky
  column (offsets 180 / 84 / 0px) with a left shadow-fade; solid per-row
  backgrounds keep them opaque while the middle columns scroll
- PACE and 7D TREND moved before the sticky group so they're never
  covered; OVER ALL TOTAL row gets the same teal sticky treatment

**Effort:** Medium. Files: `DailyTable.jsx`.

---

## 7. Installation SLA Breakdown Module ✅ DONE

New standalone module (shared across FIBERX + BIDA + SME) reading the
**COMPLETED AGING REPORT** tab (PROVINCE / ≤24h / ≤72h / >72HRS):
- Summary stat cards (Total Aging + 3 buckets with % share)
- Sortable + searchable province table with per-province TOTAL and the
  sheet's OVERALL TOTAL footer row
- **Plan-agnostic:** always renders the same report regardless of the
  active plan; data source currently lives in the FIBERX sheet
- SLA action in the desktop header + mobile ⋮ menu; **SLA tab** added
  to the mobile bottom bar (5 tabs)
- Best-effort fetch — a missing tab never fails the main load

Files: `AgingReport.jsx` (new), `plans.js`, `dataFetcher.js`,
`dataProcessor.js`, `App.jsx`.

---

## 8. Provincial Breakdown — Mobile Card List ✅ DONE

Two-line card rows on mobile (< sm), Lumen Billing list style:
- Left: province (bold) + pace badge + `MTD x · TGT y`
- Right: achievement % (HIT/LAG/MISS colored) + `CO n`
- OVER ALL TOTAL pinned as a teal card; search + pace chips apply to both
  layouts; desktop keeps the full sortable table

Files: `DailyTable.jsx`.

---

## 9. Mobile Date Bar & Card Readability ✅ DONE

- "Latest available" badge moved AFTER the date picker on mobile
  (`[<] [date] [>] [badge]`) so the date control never shifts; desktop
  keeps badge-first via `sm:order-first`
- Mobile card `MTD x · TGT y` enlarged to `text-xs` bold white for
  low-vision readability

Files: `DatePicker.jsx`, `DailyTable.jsx`.

---

## 10. SLA Table — Mobile Card List ✅ DONE

Installation SLA Breakdown now uses the same two-line card list on
mobile as the Provincial Breakdown (province + `≤24h`/`≤72h`/`>72h`
color-coded buckets | TOTAL), with OVERALL TOTAL pinned as a teal card;
desktop keeps the full sortable table.

Files: `AgingReport.jsx`.

---

## Backlog / Stretch (not prioritized)

- Export run-rate projections to the MTD sheet via Apps Script (pace flags in the sheet)
- Weekly email digest from Apps Script (auto-sync triggers already exist)
- Per-area alert thresholds configurable in `src/config/plans.js`
- Quick plan-switch from the Executive Report modal