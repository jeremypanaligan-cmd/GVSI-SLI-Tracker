# GVSI SLI Tracker — Daily Report: SME Module

**Date:** 1 October 2026
**Prepared by:** Jeremy Panaligan
**System:** GVSI SLI Tracker — React/Vite PWA (GitHub Pages), fed by Google Sheets and the Apps Script
import, with a Supabase cold archive
**Release:** **v1.24.0** — committed, tagged and deployed today
**Subject:** SME's collection figures, and the Monthly Progress strip

---

## 1. Summary

Today's work was all on SME, and it started from one complaint: the money was being rounded. Net
Collection showed ₱41,988 for a month that collected ₱41,988.13 — and the sheet's own `RAW DATA` tab
was showing the rounded figure too, so the app never had the centavos to display in the first place.
Both ends are fixed, and the tracker and the sheet now agree down to the centavo.

Four things went out in v1.24.0, each one checked before it shipped:

1. **Net Collection keeps its centavos** — the Executive Overview card, and the NET column of the
   Provincial Breakdown, including the region total and the mobile card list.
2. **The sheet stops rounding NET** — `RAW DATA` column `O` now displays two decimals, which is the
   figure the app's CSV feed had been losing.
3. **Monthly Progress keeps them as well** — the year's delivered figures read `465,023.00` on a
   large screen, while the monthly target underneath stays a whole figure.
4. **A month's details open on tap** — the figures a desktop shows on hover can now be read on a
   phone, through a new panel for each month.

BIDA and FIBERX did not change. Their figures are ticket counts, and counts were never rounded.

---

## 2. What was wrong (changes 1 and 2)

The numbers were being rounded twice on their way from the sheet to the screen, so a month that
collected ₱41,988.13 came out as ₱41,988.

The first rounding was ours. The code that writes those figures was built for a ticket count, and it
drops everything after the decimal point — right for counts, wrong for money.

The second was in the sheet. `RAW DATA`'s `NET` column was set to show whole pesos. A cell's format
decides what it *displays*, and the tracker reads that sheet through its CSV export — which writes
out exactly what a cell shows. So the app was handed 41,988 and had nothing to work with. Nothing
was lost in the data itself: that cell has always held the centavos, and a manual download of the
sheet was showing the rounded figure for the same reason.

Both ends are fixed now. `GROSS`, the peso `TARGET` and every count are still whole numbers, which
is what they should be — but a peso amount the target is measured against reads the way the sheet
does.

---

## 3. Change 3 — Monthly Progress keeps the centavos

The Monthly Progress strip is the only place in the app where you read a whole year in pesos:
413,275 for January, 465,023 for August, straight from the sheet.

The delivered figure keeps its two decimals now (`465,023.00`) on a large screen, both in the cell
and in the hover text. The shortened version on a phone stays as it was — `465k` — because that one
is a quick look at the shape of the year, not something anyone audits. The monthly target underneath,
and the totals above the strip, are still whole figures, the same as the `TARGET` column and the
Monthly Target card. The only money figure here is the one saying what a month actually brought in.

---

## 4. Change 4 — a month's details on tap (new)

Until today the strip explained a month through a tooltip that appears when you hover over it. A
phone cannot hover, so the cell was a guess.

Every month cell is a button now. Tap it and you get that month's numbers — what it delivered, the
month's target, and the percentage between them. Those are the same three facts the desktop tooltip
carries, laid out where they can actually be read. A month that has not been reported yet says so,
instead of showing a zero that reads like a bad month.

On a phone it comes up as a sheet at the bottom of the screen; on a desktop it is a card in the
middle. Either way it closes on the backdrop, on `Escape`, or on the Close button. Desktop users
still get the hover tooltip, and the cells can be reached with the keyboard too.

---

## 5. Verification (evidence)

| Check | Result |
|-------|--------|
| Automated tests over the real components | **88 of 88 passed** — four small test harnesses, no production or archive data touched |
| Production build | Clean (`npm run build`, 72 modules, no errors) |
| Phone-size browser check (390×844) | Tapping August opens *Delivered 465,023.00 · Monthly target 419,464 · Of target 111%* |
| Desktop browser check (1280×860) | Strip reads `413,275.00 … 465,023.00`, with no overflow and no sideways scrolling |
| Check that nothing else moved | BIDA and FIBERX read exactly as before; no peso figure appears on a plan measured in tickets |
| Apps Script files | All three still match the shared template (`sync-gs-tail.cjs --check`) |
| Live deployment | `version.json` reads **1.24.0**; the GitHub release **GVSI SLI Tracker v1.24.0** is published |

The browser checks ran on SME's real year-to-date figures, taken from `YTD 2026` and `TARGET 2026`
and rendered on their own, so no archive or report data was involved.

---

## 6. Release record

- `b116ad5` — `feat(sme): unround the collection figures and make a month tappable` (7 files, +265/−17)
- `08bdcba` — `chore(release): v1.24.0`, carrying the version bump, the changelog promotion and the
  three Apps Script stamps
- Tag **v1.24.0**; the branch and the tag are pushed, and the deploy and the release both ran off them
- `package.json` and both version fields in the lock file read 1.24.0, and what was `[Unreleased]` in
  the changelog is now `## [1.24.0] — 2026-10-01`

---

## 7. Actions required / next steps

1. **Re-paste `SMESCRIPT.gs`** into the SME Apps Script project, then run **Full Sync** once.
   `Show Version` should read `1.24.0+22051347`. This is the step that makes change 2 real: the format
   is applied when the import runs, so refreshing the page will not change the sheet. FIBERX and BIDA
   do not need re-pasting — only the version digits in their stamps moved.
2. **September's archive is due on 7 October**, seven days into the month. It will be the first month
   archived with the plan's full list of areas.
3. Two documentation edits are waiting to be committed — a correction to the build id quoted in the
   1.24.0 changelog entry, and a note beside the code that generates that stamp. I will commit both
   before the next release.
4. One thing worth knowing: the release notes published on GitHub quote the build id from before the
   release (`1.23.0+22051347`), while the files themselves were stamped `1.24.0+22051347` when the
   release ran. Same code hash, later version — the version part names the release a file ships in.
   The release body can be edited by hand if those notes need to match exactly.

---

## 8. Impact

- SME's headline figure matches the sheet to the centavo now. Before this, the region total in the
  tracker could sit a few pesos off the sheet's own, because every province row had been rounded
  before the rows were added together. That gap is gone.
- Whoever is reading the tracker on a phone can open a month and see its numbers, instead of waiting
  until they are back at a desktop.
- Nothing else moved. No figure in the history changed, nothing had to be migrated, and BIDA and
  FIBERX read exactly as they did yesterday.

*For context, the previous release (v1.23.0, 30 September) settled BIDA's August at 523 and widened
the archive's area list. It is not repeated here.*
