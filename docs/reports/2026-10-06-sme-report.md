# GVSI SLI Tracker — Daily Report: SME Module

**Date:** 6 October 2026
**Prepared by:** Jeremy Panaligan
**System:** GVSI SLI Tracker — React/Vite PWA (GitHub Pages), fed by Google Sheets and the Apps Script
import, with a Supabase cold archive
**Release:** **v1.25.0**, then **v1.26.0** — both committed, tagged and deployed today
**Subject:** SME's Velocity chart — the graph that was not drawing, and the day behind each bar

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

BIDA and FIBERX were untouched by that fix: their thirty-day bar chart of ticket completions renders
exactly as it did yesterday.

A second change went out the same day, on top of it. **Every bar is tappable now** — on all three
plans — and opens that day's own figures: what the day collected (or completed), the rate it had to
meet, and the difference between them. The chart could only ever say that a day came in under the
line, which is what a rose bar means; the figure behind it was in the bar's hover text, which a phone
cannot reach.

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

## 5. Tapping a day in Velocity (new)

The chart could say that a day came in under the line — that is all a rose bar is. The figure behind
it lived in the bar's hover text, which a phone cannot reach and which a pointer gives only while it
stays still.

Every bar is a button now, on all three plans, and tapping one opens that day's own figures:

| | SME | FIBERX and BIDA |
|---|---|---|
| What it brought in | `Collected ₱1,428` | `Completed 17` |
| The rate it had to meet | `Required that day ₱11,022` | `Required that day 29` |
| The difference | `Short by ₱9,594` | `Short by 12` |
| Its share of the day's requirement | `13%` | `59%` |
| The running total through that day | `Month to date ₱20,975` | `Last 5 days 57` |

A day that met the rate reads `Above by` in green instead, and a month whose target is already
cleared says so rather than showing a shortfall of zero. The dialog closes on the backdrop, on
`Escape` or on the Close button — a sheet at the bottom of a phone, a centred card on a desktop, the
same shape a month already opens in from the Monthly Progress strip.

It is one shared component, so the three plans get it through the same switch that already decides
whether a plan is read in money or in tickets. Nothing is written twice.

---

## 6. Verification (evidence)

| Check | Result |
|-------|--------|
| Automated checks over the real components | **33 of 33 passed** — the day's figures, the month-to-date total, the window, the projection, and a ticket plan still drawing its 30 bars |
| The five daily figures against the sheet | 3,213.39 · 6,693.75 · 5,087.50 · 4,552.68 · 1,427.68 — **summing to the 20,975 the card shows** |
| The projection reproduced | ₱4,195/day actual, ₱11,022/day required, 26 days left — the same three figures the card had been showing |
| Desktop browser check (1280×900), live sheets | Five bars at **32 / 67 / 51 / 45 / 14 px** inside a 110 px chart, all under the required line, with peso tooltips |
| Ticket plans | 30 bars, no peso symbol, the `completed` wording unchanged — BIDA and FIBERX read as they did |
| Production build | Clean (`npm run build`, 72 modules, no errors) |
| Day dialog, live sheets | Tapping 5 October opens `Collected ₱1,428 · Required ₱11,022 · Short by ₱9,594 · 13% · Month to date ₱20,975`; tapping 2 October totals only the days before it — `₱9,907`, which is the 3,213.39 and 6,693.75 above it added together |
| Day dialog, three plans | **32 of 32 checks passed** across SME, FIBERX and BIDA — 5 day buttons on SME and 30 on each ticket plan, a peso figure on SME and none anywhere on a ticket plan |
| Closing the dialog | Backdrop, `Escape` and the Close button each close it; the card is 320×325 centred on a desktop and a bottom sheet at 390×844 |
| Apps Script files | All three still match the shared template (`sync-gs-tail.cjs --check`) |
| Live deployment | `version.json` reads **1.25.0**; the GitHub release **GVSI SLI Tracker v1.25.0** is published |

The browser check ran the Executive Overview against the live sheets on its own, so no archive or
report data was involved.

---

## 7. Release record

- **v1.25.0** — `feat(sme): chart a money plan's velocity in collections` (the four source files and
  the changelog), `docs(reports): the velocity chart, for the supervisor` (this report), and
  `chore(release): v1.25.0` with the version bump, the changelog promotion and the three Apps Script
  stamps
- **v1.26.0** — `feat(velocity): open a day's figures from its bar`, `docs(reports): the day's second
  change, in the same report`, and `chore(release): v1.26.0`
- Both tags are pushed; each branch push deploys and each tag push publishes its release
- `package.json` and both version fields in the lock file read **1.26.0**; the changelog carries
  `## [1.25.0] — 2026-10-06` and `## [1.26.0] — 2026-10-06`, and `[Unreleased]` is empty again

---

## 8. Actions required / next steps

1. **Re-paste `SMESCRIPT.gs`** into the SME Apps Script project, then run **Full Sync** once — still
   open from v1.24.0. `Show Version` should read `1.26.0+22051347`. This is what makes the centavos
   reach the sheet; the app is already reading them correctly. FIBERX and BIDA need no re-pasting —
   only the version digits in their stamps moved.
2. **September's archive is due tomorrow, 7 October**, seven days into the month. It will be the first
   month archived with the plan's full list of areas.
3. **The 30-DAY sparkline in SME's header still counts tickets.** It is a small trend line, labelled
   as completions, and it renders correctly — but on a page where every other figure is money, a
   counts sparkline is the one thing left in the other unit. Worth aligning when there is a reason to
   touch that header.

---

## 9. Impact

- The VELOCITY card now shows what it was always describing: how much SME is collecting a day against
  how much a day has to bring in. Before this it showed the figures and not the picture, and the one
  line that read as a trend — `Last 7 days: 3.6/day · slowing` — was comparing a count of tickets with
  a peso rate.
- October is visible a day at a time now: five bars for five days, each one read against the rate
  the rest of the month needs. The days that fell behind are the rose bars, and their length is the
  amount by which they fell behind.
- A day can be opened now instead of only being seen as short. Whoever is looking at a phone —
  which is where the tracker is read in the field — can tap a bar and read the day's collection, the
  rate it was asked for, and the gap between them, with the month's total through that day.
- Nothing else moved: BIDA and FIBERX's own numbers and wording are unchanged, no historical figure
  changed, and there was nothing to migrate.

*For context, the previous release (v1.24.0, 1 October) stopped SME's collection figures from being
rounded to whole pesos, in the app and in the sheet. It is not repeated here.*
