# YTD and Target — Scope

**Status: built** in the `[Unreleased]` section of the changelog — the Executive Overview
section and the Provincial table are live, under `src/components/YtdReport.jsx`,
`src/components/YtdTable.jsx` and `src/utils/yearTables.js`. The scoping below is kept as the
record of why it is shaped the way it is; *Decisions taken* at the end lists what was decided
while building it, including the two items that still need a decision from the sheet's owner.

> **Update, 2026-10-07 — the two tabs are retired, and the app no longer reads either one.**
> The scoping below is kept as the record of what the worksheet held and why the app read it
> the way it did; none of it describes a live read any more. The last two things only the
> worksheet still held — the **annual targets** (and the months still to come) and the
> **province list** — were copied into `sli_targets`, one row per plan × month × area, by
> `scripts/targets-seed.cjs` (`supabase/seed-year-targets.sql`), and `src/utils/yearTables.js`
> now builds the section from that table plus the app's own record:
>
> - **figures** — `sli_monthly` for a closed month, the live `MTD` tab for the running one. A
>   month the record holds is sourced whole, so a province it does not list is zero for that
>   month;
> - **monthly targets** — the record's own where it holds the month (archived beside the
>   figure), `sli_targets`' otherwise;
> - **annual targets** — summed from `sli_targets`' twelve months for that province, never from
>   the effective series. The difference is real: FIBERX's `Aurora` is 95 in `AUG`, a month the
>   archive covers from a twelve-province list without her, so the plan's year is 429 while the
>   overridden series adds up to 334;
> - **province list** — `sli_targets`' own `row_order`: thirteen provinces, including Cagayan,
>   Kalinga and Apayao, which no `RAW DATA` block carries.
>
> The section was verified figure-for-figure against this worksheet path before the tabs were
> dropped: 3,264 checks over three plans and three months, comparing every row field, every
> month of the strip, the annual totals and the rendered Year-to-Date report and table — no
> differences. The worksheet itself is untouched and still the place a human edits the plan; it
> is simply copied in rather than read, which is why the path is retired rather than the sheet.
>
> **Update, 2026-09-22 — three of these findings are closed, the scoping is kept as written.**
> The `YTD 2026` `AUG` column has been corrected in the sheet: Cagayan 131, Kalinga 5, Apayao 0
> and Aurora 17 are now real values rather than a copy of the target column, so the 1,044 and 354
> figures below are historical. The exclusion that kept those three provinces out of `RAW DATA`
> and `MTD` (and the reason the archive listed nine rows against a total of 523) has been removed
> from all three Apps Scripts — see [DATA_PIPELINE.md](./DATA_PIPELINE.md#the-area-list). BIDA's> August block now imports all twelve provinces, and its rows sum to the sheet's own 523.
>
> **Update, 2026-09-29 — the mismatch was units, not precedence; the record still wins.**
> SME's `MONTHLY PROGRESS` read 174 where `YTD 2026` says 465,023 for August, which put the
> blame on the record-first rule. The rule was innocent. SME's archived `2026-08` row is a
> **ticket count** (`last_mtd` 174, with `gross` and `net` null, written before the MRC columns
> existed), and it was landing in a series measured in **pesos**. Two rules now hold, and the
> first is unchanged from what is described above:
>
> - **The tracker's own record wins for any month it holds** — the archived month in Supabase
>   first, then the live `MTD` tab of a running month — and the worksheet fills only what the
>   record does not carry. The record is the app's own measurement, taken at trim time and
>   immutable afterwards; the worksheet is a cell somebody maintains. A blank cell means "not
>   reported yet", which is exactly why the province rows of both completed blocks leave
>   `SEP`–`DEC` empty, and it is what makes that signal usable.
> - **A collection-based plan contributes NET, never a count.** `buildOverrides` now takes the
>   plan's basis, so SME can only ever add money to the series; a record row with no NET at all
>   contributes nothing rather than standing in for pesos. That is what fixes August: the
>   archived row has no NET, so it carries no weight and the month falls to the worksheet on its
>   own merits — and once a month is archived with its MRC columns present, the record takes over
>   again without any further change.
>
> Checked against the live exports: SME and BIDA both reproduce `YTD 2026` exactly for `JAN`–`JUL`
> and `TARGET 2026` for all twelve months, with `AUG` supplied by the archive and `SEP` by the
> live `MTD` tab (SME 290,900; BIDA 341).
>
> **One consequence to know about, and it is now reported rather than silent.** The archived
> `2026-08` rows for all three plans were written from a twelve-province area list with no
> `Aurora`, so August's record covers 12 of the 13 provinces the worksheet carries.
>
> **Update, 2026-09-30 — the record decides the whole month, so BIDA's August reads 523.**
> Precedence is per **month**, not per province: once the record speaks for a month, every
> province in that month comes from it, and a province the record does not list counts as zero
> in it. Reading the worksheet for exactly the provinces the record leaves out is what produced
> **540** — the wrong answer — because it added half of one source's month to all of the other's.
> On BIDA the two halves were the same tickets anyway: `sli_mtd` holds twelve rows for `bida` /
> `2026-08` (Abra 16, Apayao 5, Benguet 31, Cagayan 131, Ifugao 10, Ilocos Norte 53, Ilocos Sur
> 36, Isabela 149, Kalinga 17, Mountain Province 0, Nueva Vizcaya 61, Quirino 14), they sum to
> **523**, and the archive's own `OVER ALL TOTAL` row for that month already said `523`. The tab's
> August column totals 523 as well: its `Aurora` cell holds the same `17` the archive files under
> `Kalinga`, with `Kalinga` carrying the `5` that sits on `Apayao` in the archive. Both sources
> agree on the month; only their province labels disagree on three rows, and the region figure
> must not be their sum. So the console's `partialMonths` report now says the `Aurora 17` is
> **withheld** rather than added, and the province-level disagreement is still reported by
> `summarizeSourceClashes` (`Kalinga` 5 against 17, `Apayao` 0 against 5).
>
> **Settled, 2026-09-30 — the sheet was corrected, and the two sides now agree.** `YTD 2026`'s
> `AUG` column was adjusted by hand to the record's own reading — `Aurora` 0, `Kalinga` 17,
> `Apayao` 5, `Cagayan` 131 — so all thirteen provinces read the same on both sides, the region
> is still 523, and the console has **nothing left to report** for August: no province-month
> disagreement, and no covered area holding a non-zero cell the record leaves out. The record was
> right and the three cells had each taken a neighbour's figure; the giveaway was `Aurora`, who
> is 0 in every other month of the year and whose target plan only starts in `SEP`.
>
> `2026-08` was deliberately **not** re-archived: the two sides now agree with or without the
> missing row, so the archive's twelve rows stay as they are and September's archive — due seven
> days into October, and written with the plan's full area list (see [ARCHIVE.md](./ARCHIVE.md))
> — is the first month that carries `Aurora` in the record.
>
> **Update, 2026-09-29 — the console reports the months the two sides disagree about.**
> Precedence makes a disagreement invisible, because a month the record holds is never read from
> the worksheet: the dashboard shows one figure and the other is silently unused.
> `summarizeSourceClashes()` compares every province-month both sides hold and the **Data source
> diagnostics** section of the Developer console reports the gaps — with the 12% VAT marker
> spelled out, since `GROSS = NET × 1.12` exactly. It also reports a second, quieter case: a
> record month that cannot be expressed in the plan's units at all (SME's `2026-08`, twelve
> ticket counts with no `NET`), which is not a disagreement but is the reason that month's
> archive row can say nothing. On today's data it finds BIDA's August — `Kalinga` 5 in the
> worksheet against 17 in the record, `Apayao` 0 against 5 — and the sheet's own `TOTAL` row
> agrees with either pairing, so nothing else would have caught it. Reported for that province
> pair; it no longer changes a region figure, because the month's source decides the whole month
> (see the 2026-09-30 update above).

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
| Any month `YTD 2026` carries | the `YTD 2026` tab, full stop (superseded 2026-09-29 — see the update note) |
| A month it leaves blank, and the app has archived | the app's own record (`sli_mtd`), in the plan's own units |
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
| BIDA's August column | Corrected in the sheet on 2026-09-22, which retired the need for a workaround — but the record-first rule stays, because it was never what caused the August mismatch. See the update note at the top |
| The yardstick | Two, both labelled: the headline against the **plan to date**, the bar against the **annual target**. The on pace / behind / critical verdict is judged on **finished months only** |
| SME's money target | SME now carries a monthly **peso** target and its MRC collections (`GROSS` / `NET`) in its own `MTD` / `RAW DATA` — see [DATA_PIPELINE.md](./DATA_PIPELINE.md#mtd-columns) — but there is still no `SME YTD COMPLETED 2026` block, so its YTD section stays hidden. The two are independent: the monthly collections answer the Executive and Provincial views, not the annual plan |
| Provinces dropped from the pipeline | **Kept**, so the table reproduces the sheet's own province set and the annual plan. Cagayan, Kalinga and Apayao have no row in the *live* `MTD` tab, so their running month comes from the worksheet; August does have them, archived. `Aurora` is the reverse — in the worksheet, absent from the archived months — see the update note at the top. Filtering any of them out is a one-line change if that is preferred |
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
