# GVSI SLI Tracker — Daily Report: SME Module

**Date:** 6 October 2026
**Prepared by:** Jeremy Panaligan
**System:** GVSI SLI Tracker — React/Vite PWA (GitHub Pages), fed by Google Sheets and the Apps Script
import, with a Supabase cold archive
**Release:** **v1.25.0** — committed, tagged and deployed today
**Subject:** SME's Velocity chart — the graph that was not drawing

---

## 1. Summary

The complaint was short and exact: *"walang nag re-render na graph sa SME > Executive Overview >
Velocity"* — the VELOCITY card was drawing everything except the graph. The heading, the
`Well under pace` chip, `Day 5 of 31 · 26 left`, the ACTUAL and REQUIRED cards, the amber dashed
line, the two dates and the caption were all there. Between the line and the dates there was
nothing.

It was not a rendering fault. **The bars were being plotted in the wrong unit.** They were a count of
ticket completions — 0 to 12 a day — drawn to scale against a peso requirement of ₱11,022 a day. Every
bar came out at about **1.6 pixels**, in the same dark red as the card behind it, so the chart looked
empty while all of its furniture was in place.

v1.25.0 charts SME's velocity in the measure the plan is actually read in — **collections**, not
tickets — and writes the figures around the chart as peso amounts. The card now shows five bars, each
one a day's collection, sitting visibly under the required line.

BIDA and FIBERX are untouched: their thirty-day bar chart of ticket completions renders exactly as it
did yesterday.

---

## 2. What was wrong

SME is the one plan measured in money. Its target (₱307,529) is a peso figure and its progress is
read against **NET** — the month's collection. So the pace in the VELOCITY card is a rate in money:
₱20,975 collected ÷ 5 days = **₱4,195/day**, against the **₱11,022/day** the remaining 26 days need.

The chart beside those two figures was fed from a different column — `TOTAL COMPLETED`, a count of
installations. On the morning it was reported those counts were running 0 to 12 a day, and the card's
own "Last 7 days: 3.6/day" line was reading the same counts.

A bar is drawn as a share of the tallest thing on the chart, and the tallest thing was the required
line at ₱11,022. A bar of 4 installations therefore worked out to 0.03% of the chart's height. The
code floors a bar at 1.5% so a zero day still shows something — so every bar sat on that floor: about
1.6 pixels, in a rose tint at half opacity, on a dark card. Invisible.

Nothing was missing from the data. The chart had been comparing an amount with a count since it was
built; on every plan where both sides are counts, it worked.

---

## 3. The fix — a money plan's velocity is money

The chart's bars are now the day's collection, taken from the month's running `NET` counter.

That counter is a **month-to-date total, not a daily figure** — 30 September closes at ₱324,195.54 and
1 October opens at ₱3,213.39. So one day's collection is the counter's step since the reading before
it, and October's five days come out as:

| Day | Collected |
|-----|-----------|
| 1 October | ₱3,213 |
| 2 October | ₱6,694 |
| 3 October | ₱5,088 |
| 4 October | ₱4,553 |
| 5 October | ₱1,428 |
| **Month to date** | **₱20,975** |

That total is the same ₱20,975.00 the NET COLLECTION card above it already shows, which is the check
that the bars and the headline are telling one story.

The step can only be taken **inside one month**: subtracting September's closing total from October's
first reading would hand October's first day a large negative figure. That is why the axis on SME now
runs **1 Oct → 5 Oct** and the caption counts *collections*, where a ticket plan keeps its 30 days of
*completions*. The window is the month because the counter is the month.

---

## 4. The figures around the chart

Once the bars were in money, everything read against them had to follow.

- **The ACTUAL and REQUIRED cards** read `₱4,195/day` and `₱11,022/day` — the same values as before,
  now written as the amounts they are.
- **The drift line** reads `vs even track: -₱28,626`, where it previously read `-28,626`.
- **Each bar's tooltip** reads `October 5, 2026 — ₱1,428 collected (under the ₱11,022/day required)`.
- **The `accelerating` / `slowing` verdict waits for a run of days.** Early in the month a money
  plan's recent window is the whole month, so comparing it with the month-to-date rate was comparing
  a figure with itself; it now appears once there are days behind the window. On the morning it was
  reported this line was reading `3.6/day · slowing` — a count of tickets compared against a peso
  rate, which could only ever say "slowing".

---

## 5. Verification (evidence)

| Check | Result |
|-------|--------|
| Automated checks over the real components | **33 of 33 passed** — the day's figures, the month-to-date total, the window, the projection, and a ticket plan still drawing its 30 bars |
| The five daily figures against the sheet | 3,213.39 · 6,693.75 · 5,087.50 · 4,552.68 · 1,427.68 — **summing to the 20,975 the card shows** |
| The projection reproduced | ₱4,195/day actual, ₱11,022/day required, 26 days left — the same three figures the card had been showing |
| Desktop browser check (1280×900), live sheets | Five bars at **32 / 67 / 51 / 45 / 14 px** inside a 110 px chart, all under the required line, with peso tooltips |
| Ticket plans | 30 bars, no peso symbol, the `completed` wording unchanged — BIDA and FIBERX read as they did |
| Production build | Clean (`npm run build`, 72 modules, no errors) |
| Apps Script files | All three still match the shared template (`sync-gs-tail.cjs --check`) |
| Live deployment | `version.json` reads **1.25.0**; the GitHub release **GVSI SLI Tracker v1.25.0** is published |

The browser check ran the Executive Overview against the live sheets on its own, so no archive or
report data was involved.

---

## 6. Release record

- `feat(sme): chart a money plan's velocity in collections` — the four source files and the changelog
- `docs(reports): the velocity chart, for the supervisor` — this report
- `chore(release): v1.25.0` — the version bump, the changelog promotion and the three Apps Script
  stamps
- Tag **v1.25.0**; the branch and the tag are pushed, and the deploy and the release both ran off them
- `package.json` and both version fields in the lock file read 1.25.0, and what was `[Unreleased]` in
  the changelog is now `## [1.25.0] — 2026-10-06`

---

## 7. Actions required / next steps

1. **Re-paste `SMESCRIPT.gs`** into the SME Apps Script project, then run **Full Sync** once — still
   open from v1.24.0. `Show Version` should read `1.25.0+22051347`. This is what makes the centavos
   reach the sheet; the app is already reading them correctly. FIBERX and BIDA need no re-pasting —
   only the version digits in their stamps moved.
2. **September's archive is due tomorrow, 7 October**, seven days into the month. It will be the first
   month archived with the plan's full list of areas.
3. **The 30-DAY sparkline in SME's header still counts tickets.** It is a small trend line, labelled
   as completions, and it renders correctly — but on a page where every other figure is money, a
   counts sparkline is the one thing left in the other unit. Worth aligning when there is a reason to
   touch that header.

---

## 8. Impact

- The VELOCITY card now shows what it was always describing: how much SME is collecting a day against
  how much a day has to bring in. Before this it showed the figures and not the picture, and the one
  line that read as a trend — `Last 7 days: 3.6/day · slowing` — was comparing a count of tickets with
  a peso rate.
- October is visible a day at a time now: five bars for five days, each one read against the rate
  the rest of the month needs. The days that fell behind are the rose bars, and their length is the
  amount by which they fell behind.
- Nothing else moved: BIDA and FIBERX read exactly as they did, no historical figure changed, and
  there was nothing to migrate.

*For context, the previous release (v1.24.0, 1 October) stopped SME's collection figures from being
rounded to whole pesos, in the app and in the sheet. It is not repeated here.*
