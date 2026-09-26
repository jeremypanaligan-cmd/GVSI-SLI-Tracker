# YTD and Target — Scope

**Status: built** in the `[Unreleased]` section of the changelog — the Executive Overview
section and the Provincial table are live, under `src/components/YtdReport.jsx`,
`src/components/YtdTable.jsx` and `src/utils/yearTables.js`. The scoping below is kept as the
record of why it is shaped the way it is; *Decisions taken* at the end lists what was decided
while building it, including the two items that still need a decision from the sheet's owner.

> **Update, 2026-09-22 — three of these findings are closed, the scoping is kept as written.**
> The `YTD 2026` `AUG` column has been corrected in the sheet: Cagayan 131, Kalinga 5, Apayao 0
> and Aurora 17 are now real values rather than a copy of the target column, so the 1,044 and 354
> figures below are historical. The exclusion that kept those three provinces out of `RAW DATA`
> and `MTD` (and the reason the archive listed nine rows against a total of 523) has been removed
> from all three Apps Scripts — see [DATA_PIPELINE.md](./DATA_PIPELINE.md#the-area-list). BIDA's
> August block now imports all twelve provinces, and its rows sum to the sheet's own 523.

Sheet under discussion: **SLI TRACKER Database** (the shared workbook, the same one that
already holds the aging report and the trend tabs).

<https://docs.google.com/spreadsheets/d/1PGB2Mmo5Ka2NBfrlJWIF3V_X3Kxm6jepT5-eEYOC9bs>

| Tab | What it holds |
|---|---|
| `YTD 2026` | Actual installations per province, one column per month |
| `TARGET 2026` | Monthly target per province, one column per month |

Both are read as CSV export URLs, exactly like every other sheet in the app — no Sheets
API, no credentials. See [DATASOURCE.md](./DATASOURCE.md) for the existing source map.

## What is actually in the tabs

Verified against the live export.

- **Shape.** `YTD 2026` is 31 rows; `TARGET 2026` is 31 rows. Fourteen columns:
  `name | JAN … DEC | TOTAL`.
- **Two plan blocks per tab**, stacked in the same sheet:

  | Rows | Block |
  |---|---|
  | 1–15 | `BIDA YTD COMPLETED 2026` / `BIDA YTD TARGET 2026` — 13 provinces + `TOTAL` |
  | 16–31 | `FIBERX YTD COMPLETED 2026` / `FIBERX YTD TARGET 2026` — 13 provinces + `TOTAL` |

- **`TOTAL` is the sum of the month columns.** Spot-checked: BIDA Benguet 470 = 34+59+67+90
  +49+63+50+58; FIBERX Benguet 6,870 likewise. So neither tab needs re-summing in the app.
- **The completed side stops at AUG.** SEP–DEC are blank in both completed blocks — they are
  the months nobody has achieved yet. The target side is complete for all twelve (BIDA SEP is
  1,616), so a province's annual target is known on day one.
- **No SME block exists.** `grep -ci SME` returns **0** on both tabs.

## What this adds over what the app already has

| Need | Already in the app? |
|---|---|
| Current month's target, per province | **Yes** — the `TARGET` column of the `MTD` tab |
| Current month's completions | **Yes** — `MTD` tab / RAW DATA |
| Monthly target history (which month was expected to do what) | **No** |
| Targets for the months still ahead | **No** |
| Annual target per province | **No** |
| Completions for Jan–Jul 2026 | **No**, for any plan |

Confirmed: for all ten BIDA areas the tracker tracks, the `MTD` tab's current-month `TARGET`
equals the `TARGET 2026` cell for the same month and province — Benguet 64, Ilocos Sur 331,
Ilocos Norte 465, Isabela 477, Nueva Vizcaya 162, Quirino 47, Abra 16, Ifugao 26, Aurora 26,
Mountain Province 2. So the new sheet is **not** a second source of truth for the live month;
what it uniquely brings is the rest of the year and the year-to-date baseline.

That matters for the projection: the forward-looking half of it is only answerable from these
two tabs.

## Three things to settle before any YTD number is shown

### 1. BIDA's August column is the August target, copied

On `YTD 2026`, the BIDA AUG cell equals the BIDA AUG target cell **for all thirteen rows**,
and the block's `TOTAL` for AUG is 1,044 — identical to the target block's 1,044. Compare
that with the app's own record of August, which is already archived in Supabase:

| Area | `YTD 2026` AUG | App's archived Aug MTD | AUG target |
|---|---|---|---|
| Benguet | 58 | **31** | 58 |
| Ilocos Sur | 132 | **36** | 132 |
| Ilocos Norte | 176 | **53** | 176 |
| Nueva Vizcaya | 86 | **61** | 86 |
| Isabela | 180 | **149** | 180 |
| OVER ALL TOTAL | 1,044 | **387** | 1,044 |

FIBERX's August column is genuine — Benguet 706 against a 509 target, annual 2,543 against
1,953 — so this is a BIDA column, not a layout artifact. Unfixed, the YTD section would show
BIDA as having hit ~100% of every August target, and August alone would contribute 1,044 where
the app's own record says 387. **The sheet cell needs correcting, or the app must not read it.**

### 2. SME has nothing

Neither block exists for SME, and the app's plan switcher offers all three plans. Options in
*Open decisions* below.

### 3. The province list no longer matches the tracker

Both new tabs carry **13** provinces, including Cagayan, Kalinga and Apayao, which were removed
from the NEW REPORT pipeline. The tracker's BIDA `MTD` tab now lists **10** areas. Aurora is in
both. So a YTD table would show three rows with no current-month counterpart, and any
province-level join must be by normalised name — note both tabs spell `"Mountain Province "`
with a trailing space, while the `MTD` tab does not.

Two smaller constraints: the tabs are **year-specific** (`… 2026` in both the tab name and the
title cell), so the year must be an explicit constant in the code and the section must
disappear rather than mislabel when the app is pointed at another year; and the month header
may sit on the title row or on a `PROVINCE` row beneath it depending on the tab, so the parser
has to locate the `JAN…DEC` row rather than assume row 1.

## The YTD arithmetic

Per province, with `M` = the selected month:

```
ytdActual        = Σ actual(Jan … M)          ← sheet for closed months, live MTD for the current one
ytdTargetToDate  = Σ target(Jan … M)          ← same worksheet, target side
annualTarget     = target TOTAL column
remainingToAnnual= annualTarget − ytdActual
deficitToDate    = ytdTargetToDate − ytdActual          (negative = ahead)
requiredPerMonth = (annualTarget − ytdActual − target(M)) / monthsAfter(M)
projectedYearEnd = ytdActual + paceMonthly × monthsAfter(M)
```

Two deliberate choices in that sketch:

- **Pace is measured against the target *to date*, not the annual target.** In September, a
  province at 47% of its annual target is not failing — it has had eight months. Using
  `ytdTargetToDate` as the primary gauge keeps the badge honest; the annual figure is the
  secondary number, for the projection.
- **The current month's need already exists in the app.** `target(M) − MTD` from the `MTD` tab
  is the remainder for the month in progress, so it does not have to be smeared across the
  months that follow it. `monthsAfter(M)` counts only whole months still ahead.

Worked example — BIDA Benguet, September 2026:

```
ytdActual          470   (Jan–Aug, from the sheet)
annualTarget       715   (TOTAL column)
September target    64   (MTD tab = TARGET 2026 SEP)
remainingToAnnual  181
monthsAfter(Sep)     3   → Oct, Nov, Dec
requiredPerMonth  60.3
pace so far       58.8/mo  (470 ÷ 8)   → projected year-end 646, short by 69
```

If the recommended source rule is applied, August is the app's own 31 rather than the sheet's
58, so `ytdActual` becomes 443, `remainingToAnnual` 272 and `requiredPerMonth` 69.3. The
arithmetic is the same; only the August input changes.

### Where each month's actual comes from

`docs/DATASOURCE.md` already states the rule for this app: **the current month comes from the
sheet, closed months come from the record.** The YTD figure should follow the same rule rather
than inventing a third one:

| Months | Source |
|---|---|
| Jan – Jul 2026 | `YTD 2026` tab — the only place they exist |
| A month the app has archived | the app's own record (`sli_mtd`) — which also fixes finding #1 by construction |
| The selected month | the live `MTD` tab, so the YTD total never lags a month behind |

The middle row is much narrower than it looks. The archive currently holds **one** month — BIDA
`2026-08`; FIBERX and SME have no archived month at all. So for FIBERX and SME the sheet is not
a fallback, it is the only history, and the rule degrades cleanly to "sheet + live month". The
cost of the rule is one extra dependency (archive + sheet + live month have to agree on which
month is closed), which is the same dependency `mergeArchiveIntoCsv` already carries.

## Add-on 1 — Executive Overview: a YTD section

A third section under `Month-to-Date` and `Daily To-Date`, in
`src/components/ExecutiveOverview.jsx`. Same visual grammar as the existing MTD hero: a
plan-accented strip, one headline number, a progress bar, a row of small stat cards.

| Element | Content |
|---|---|
| Headline | `YTD achievement %` against target-to-date, with the same `HIT / LAG / MISS` badge |
| Progress bar | YTD actual against **annual** target, so the year is the thing being filled |
| Stat cards | YTD actual · Annual target · Remaining to target · Required pace per month |
| Pace verdict | on track / behind by *N* — from `deficitToDate`, not from a run-rate guess |
| Projection | projected year-end at the current monthly pace, and the shortfall or surplus |
| Month strip | twelve months, actual vs target, so a weak month is visible in place |
| Countdown | months left after the current one, next to the required pace |

Rules that carry over from the existing code: hide the **projection** half when the selected
month is not in the current year (the same reasoning that hides the 30-day sparkline for a
past month in `ExecutiveOverview.jsx`); keep the YTD actual visible in that case, because a
historical year-to-date is still a fact.

## Add-on 2 — Provincial Overview: a YTD table

The Provincial view today is `DailyTable` — the daily block, with `MTD · TARGET · %` pinned to
the right (`stickyRight`), an `OVER ALL TOTAL` row in the plan accent, a mobile card list under
`sm`, and search plus pace-filter chips. The YTD portion is best as a **sibling table** rather
than four more pinned columns: the daily table already demands `min-width: 1100px`, and the two
tables sort and filter on different things.

Recommended columns, then the optional ones:

| Column | Notes |
|---|---|
| `AREA` | sticky left, opaque, plan accent — same treatment as the daily table |
| `YTD` | actual, through the selected month |
| `TGT TO DATE` | Σ targets Jan…M — the fair yardstick |
| `%` | `YTD ÷ TGT TO DATE`, same `PctBadge` |
| `ANNUAL TGT` | from the `TOTAL` column |
| `REMAINING` | `annualTarget − ytdActual`, and the deficit-to-date in the tooltip |
| `REQ / MO` | pace required for the remaining whole months |
| `PROJ` | projected year-end at the current pace |
| `STATUS` | sticky right: on track / behind / at risk, following the existing pace-filter vocabulary |

Worth considering, in rough order of value:

1. **A status chip that matches the existing `PACE_FILTERS` values**, so the chips above the
   table filter the YTD table too instead of only the daily one.
2. **A per-province monthly sparkline** reusing `Sparkline` — the 30-day trend proved the
   component is cheap, and "which month collapsed" is the question a YTD total cannot answer.
3. **`BEHIND BY n` as its own column** rather than a tooltip — the number a manager acts on.
4. **Export and Copy Link for the YTD view**, reusing `exportCSV` / `copyLink`.
5. **Sorting by any numeric column**, as the daily table already does.
6. **A monthly `TARGET` column for the selected month** next to `TGT TO DATE`, to expose the
   two-part projection instead of hiding it.

## Implementation sketch

Small and additive; no change to the existing data path.

| File | Change |
|---|---|
| `src/config/plans.js` | two worksheet URLs (plan-agnostic, like `agingUrl`), plus the explicit `YTD_YEAR = 2026` |
| `src/utils/csvParser.js` | reuse as-is; the new tab needs a section split, not a new parser |
| new `src/utils/yearTables.js` | locate the month header row, split the plan blocks, normalise names, expose `parseYearTable()` and `computeYtd()` |
| `src/utils/dataFetcher.js` | fetch the two tabs best-effort (never fail the load), cache under versioned keys |
| `src/utils/dataSourceDiagnostics.js` | record the two reads, so the Developer console shows them beside the sheet and archive payloads |
| `src/components/YtdReport.jsx` | the Executive section |
| new `src/components/YtdTable.jsx` | the Provincial table |
| `src/App.jsx` | hold the parsed year tables in state and pass them down |

Three operational notes:

- **Cache these longer.** The rest of the data assumes five minutes (`CACHE_MAX_AGE`). An
  annual table changes at most once a month, so a day-long TTL removes two requests from every
  load. Keep them versioned like the other keys so a release still retires them.
- **Fetch them once, not per plan.** They are shared across plans the way `agingUrl` is — and
  that one is re-fetched inside `fetchAllData` for each plan today, which is a small existing
  inefficiency this feature would double.
- **The `OVER ALL TOTAL` row must follow the plan accent, opaque**, matching the fix already
  applied to the Provincial and SLA tables.

## Open decisions

1. **SME.** No target, no actuals, no block. Hide the YTD section for SME and say so in the UI,
   or ask for `SME YTD COMPLETED 2026` / `SME YTD TARGET 2026` blocks to be added to the two
   tabs (matching the existing layout) before building?
2. **BIDA's August column.** Correct the sheet, or let the app prefer its own archived month —
   which fixes it without anyone editing the sheet, at the cost of the sheet being silently
   ignored for August.
3. **The yardstick.** Target-to-date (recommended) or annual target as the headline percentage?
4. **Provinces dropped from the pipeline.** Should Cagayan, Kalinga and Apayao appear in the
   YTD table — their annual targets still exist and were partly achieved — or be filtered out
   so the table matches the tracker?
5. **Section or view.** The ask places YTD inside Executive and Provincial as a section. A
   fourth top-level tab would touch the navbar work done recently, so it is worth confirming
   that is *not* wanted.
6. **Year rollover.** A `2027` needs new tabs. Hard-code the year and hide the section when it
   does not match, or parameterise it now?
7. **Supabase.** YTD and TARGET are small and annual, so unlike RAW DATA they are not a size
   problem. Leave them in Sheets, or fold them into the archive so the app has one source for
   everything closed?

## Decisions taken while building

| Decision | What was done |
|---|---|
| SME | The section renders an explanation — *"the `YTD 2026` and `TARGET 2026` tabs cover BIDA and FIBERX only"* — rather than an empty table. Adding SME blocks to the two tabs would light it up with no code change |
| BIDA's August column | Not edited. The app prefers its own record for any month it holds, so August now comes from `sli_mtd` (31, 36, 53…), and the table says so. **The sheet cell is still wrong** and still needs correcting for anyone reading the tab directly |
| The yardstick | Two, both labelled: the headline against the **plan to date**, the bar against the **annual target**. The on pace / behind / critical verdict is judged on **finished months only** |
| SME's money target | SME now carries a monthly **peso** target and its MRC collections (`GROSS` / `NET`) in its own `MTD` / `RAW DATA` — see [DATA_PIPELINE.md](./DATA_PIPELINE.md#mtd-columns) — but there is still no `SME YTD COMPLETED 2026` block, so its YTD section stays hidden. The two are independent: the monthly collections answer the Executive and Provincial views, not the annual plan |
| Provinces dropped from the pipeline | **Kept**, so the table reproduces the sheet's own province set and the annual plan. Note the consequence: Cagayan, Kalinga and Apayao have no record in the app, so their August still comes from the worksheet and is still the target's copy — 354 of BIDA's 724 August figure. Filtering them out is a one-line change if that is preferred |
| Section or a fourth view | Sections. The navbar is untouched |
| Year rollover | `YTD_YEAR` is a constant in `src/config/plans.js`; outside that year the section disappears rather than mislabelling itself. A `2027` needs new tabs and one constant |
| Supabase | Left in Sheets. Annual tables are small, and unlike RAW DATA they are not a size problem |

## How it would be verified

1. Sheet sum-of-months equals `TOTAL`, per block, per province — the check that already caught
   finding #1.
2. The current-month target from `TARGET 2026` equals the `MTD` tab's `TARGET` for every area
   the tracker lists — confirmed for BIDA; repeat for FIBERX.
3. August's YTD component equals the archived `sli_mtd` row for `2026-08`, area by area.
4. The YTD `OVER ALL TOTAL` equals the sum of the province rows, and equals the sheet's own
   `TOTAL` row when the same month set is used.
5. The section disappears cleanly for a plan with no block (SME) and for an out-of-range year.
6. Mobile: no horizontal overflow, because the daily table's `min-width` is a knowable limit
   and the new table would carry its own.

There is no test runner in the project yet ([ROADMAP.md](./ROADMAP.md) item 2), so the maths
would be checked the way recent work was: a small throwaway SSR run against real numbers, plus
a browser pass. If this feature is built, `computeYtd()` is a good candidate for being the
first function in the project to have a real unit test — it is pure, and its edge cases
(zero target, December, a province with no live-month counterpart) are exactly where a
dashboard quietly tells the wrong story.
