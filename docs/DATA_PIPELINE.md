# GVSI SLI Tracker — Data Pipeline

How daily SLI data travels from the encoding sheet to the dashboard, and what to do when a
province is added or retired.

```
FIBERX / BIDA / SME NEW REPORT   ──┐
   (daily encoding, source of truth)│  Import  (Apps Script)
                                    ▼
                                 RAW DATA   ──┐
                            (one row per day) │  Generate MTD  (Apps Script)
                                              ▼
                                            MTD   ──┐
                                     (month-to-date)│  CSV export
                                                    ▼
                                        GVSI SLI Tracker (this app)
                                                    ▲
   closed months ── Archive (Apps Script) ──▶ Supabase (sli_raw_daily + sli_mtd)
                   then PURGED from NEW REPORT          read as CSV-shaped rows
```

Once a month is finished it leaves the spreadsheet entirely and the app reads it from
Supabase instead. See [ARCHIVE.md](./ARCHIVE.md) for that job and
[DATASOURCE.md](./DATASOURCE.md) for which side the app reads for which month.

## Sheets

| Sheet | Who writes it | Purpose |
|-------|---------------|---------|
| `…  NEW REPORT` | `=IMPORTRANGE(…)` from the plan's `… DAILY` sheet | Source of truth. One block per day, one row per area. A **live mirror**, so its rows are formula output and cannot be deleted — the archive narrows its range instead, on the plans where `PLAN_SHEET_TRIM_ENABLED` allows it. See [ARCHIVE.md](./ARCHIVE.md). |
| `RAW DATA` | Apps Script (`Import`) | Normalized continuous table: one row per date + area. **What the app reads for daily/provincial views, for the live month.** |
| `MTD` | Apps Script (`Generate MTD`) | Month-to-date summary. **What the app reads for achievement / target figures, for the live month.** |
| Supabase `sli_raw_daily` / `sli_mtd` | Apps Script (`Archive`) | The same two shapes for **closed** months. Taken out of the sheet only when `ARCHIVE_PURGE = TRUE` (off by default): the day blocks are deleted on a hand-encoded tab, or dropped by moving the `IMPORTRANGE` window's start row on a mirror. |
| `_ARCHIVE_BACKUP` | Apps Script (`Archive`) | Temporary pre-purge copy of the deleted `NEW REPORT` rows, on the hand-encoded path only — a mirror is never deleted from, so nothing needs backing up. Safe to delete. |
| `CONFIG` | Apps Script (once) + you | Archive settings (`ARCHIVE_*`) and the `LAST_ARCHIVE` audit line. **No area list lives here any more** — see [The area list](#the-area-list). Not read by the app. |
| `Login Credentials` | You, by hand | `Username` / `PasswordHash` (lowercase SHA-256 hex) / `FullName` / `Role` for the app's login gate. Lives in the **shared SLI TRACKER Database**, not in a plan sheet. |
| `COMPLETED AGING REPORT` | Not managed here | Feeds the app's `SLA` view. Lives in the **shared SLI TRACKER Database**. The scripts do not touch it. |
| `FIBERX / BIDA / SME DATA` | Not managed here | The app's rolling 30-day trend. Live in the **shared SLI TRACKER Database**, one tab per plan. The scripts do not touch them. |

`RAW DATA` and `MTD` are **fully cleared and rebuilt** on every run — never edit them by hand. From
the month after archiving is switched on, they only ever hold the live month.

## Apps Script files

Each plan has its own spreadsheet and its own Apps Script project:

| Plan | Spreadsheet | Script to paste into `Extensions → Apps Script` |
|------|-------------|--------------------------------------------------|
| FIBERX | [FIBERX SLI Tracker DB](https://docs.google.com/spreadsheets/d/1UUd8cpfKeOCBHANx9wmM7l1apFyDoZRv0dHZa2_bVr0/edit) | `FIBERXSCRIPT.gs` |
| BIDA | [BIDA SLI Tracker DB](https://docs.google.com/spreadsheets/d/1FrEowZ9Zl0jMAyLde4OZE2cQV04nIz-rjRkLi6uv99M/edit) | `BIDASCRIPT.gs` |
| SME | [SME SLI Tracker DB](https://docs.google.com/spreadsheets/d/10P3GatvwC76IujPpjHtqgyNjE71ChAoP_8Ln7BDcvTY/edit) | `SMESCRIPT.gs` |

The three files are identical apart from the plan name. Everything from the
`TRIGGERS & MENU` marker to the end of the file is **generated** from one template, so a fix
there is one edit plus one command — see [ARCHIVE.md](./ARCHIVE.md#the-three-script-files):

```bash
node scripts/apps-script/sync-gs-tail.cjs          # render the template into all three
node scripts/apps-script/sync-gs-tail.cjs --check   # fail if they have drifted
```

`scripts/MTD.gs` + `scripts/SETUP_GUIDE.md` are the **legacy single-plan (FIBERX v1)** path and
are no longer used.

## Step 1 — Import: NEW REPORT → RAW DATA

`importFiberxToRawData()` (named per plan, e.g. `importBIDAToRawData`)

1. `RAW DATA` is cleared completely, then the header row is written to row 1.
2. Walks the NEW REPORT rows. The current date comes from each day's block header:
   `SLI DAILY TRACKING REPORT as of __Sept. 1, 2026__`.
3. Writes one row per area per day, in sheet order, plus the `OVER ALL TOTAL` row.
4. **Nothing is filtered** — every row the block lists is imported (see [The area list](#the-area-list)).
5. Writes data from row 2 down and reapplies number formatting.

### Column mapping

Up to `MTD` the two layouts are identical. They part company at `TARGET`: **SME's MRC block**
inserted a `GROSS` and a `NET` column, pushing `TARGET` and `%` two places right (17 columns in
all), while BIDA and FIBERX keep the 15-column shape. The import reads each header **by name**,
so the same script serves both — a header a sheet does not have simply reads as blank.

| RAW DATA | ← NEW REPORT | Notes |
|----------|--------------|-------|
| A `Date` | day block header | from `as of __…__` |
| B `AREA` | A `AREA` | |
| C `BF` | B `BF` | |
| D `INC` | C `INC` | |
| E `Total Jo` | D `TOTAL` | |
| F `COMPLETED FROM TOTAL` | E | |
| G `COMPLETED FROM RJO` | F | |
| H `TOTAL COMPLETED` | G | |
| I `RJO INCOMING` | H `RJO THIS MO.` | |
| J `RJO REDISPATCHED` | I | |
| K `TOTAL RJO` | — | computed: H + I |
| L `Carry Over` | J `CARRY OVER` | |
| M `MTD` | K | |
| N `GROSS` | L `GROSS` | **SME only.** Month-to-date gross collection (MRC) |
| O `NET` | M `NET` | **SME only.** What the target is measured against |
| N `TARGET` | L `TARGET` | BIDA / FIBERX. **SME: column P** |
| O `%` | M `%` | BIDA / FIBERX. **SME: column Q**, the sheet's own text |

> On SME the target is a **peso** figure and the achievement `%` is `NET ÷ TARGET` — not
> `GROSS`, and not the counts on the left. A month whose target is not filled yet reads `0`,
> and its `%` is `#DIV/0!`; the app shows those as `—` rather than `0%`.

## Step 2 — Generate: RAW DATA → MTD

`generateMTDReport()`

1. The `MTD` sheet is cleared, then rebuilt from scratch.
2. Rows are grouped by month (oldest → newest), each month getting a merged month title row and
   a header row.
3. **The area list for a month is taken from that month's last day block.** A province that
   appears on the last day appears in the month — the sheet is the only area list there is.
4. Values that accumulate over the month are summed across every day of the month; snapshot
   values (`LAST MTD`, `GROSS`/`NET`, `TARGET`, `LAST %`) are taken from the last day a
   target is filled on. `LAST MTD` and `TARGET`
   of the `OVER ALL TOTAL` row come from the **sheet's own total row**, not from a re-sum, so
   that row must list every row the total counted.
5. An `OVER ALL TOTAL` row (black/teal styling) closes each month section.

### MTD columns

| Column | Description |
|--------|-------------|
| A `AREA` | Province name |
| B `COMPLETED FROM TOTAL` | Sum of the month |
| C `COMPLETED FROM RJO` | Sum of the month |
| D `TOTAL COMPLETED` | Sum of the month |
| E `THIS MO. RJO` | Sum of `RJO INCOMING` |
| F `PREV MOS. RJO` | Sum of `RJO REDISPATCHED` |
| G `TOTAL RJO` | E + F |
| H `LAST MTD` | From the last day that carries a target |
| I `GROSS` | **SME only.** From the last day that carries a target |
| J `NET` | **SME only.** From the last day that carries a target |
| I `TARGET` | From the last day that carries a target. **SME: column K** |
| J `LAST %` | Achievement % from that same day. **SME: column L** |
| K `TOTAL INCOMING` | Sum of `INC` for the month. **SME: column M** |

On SME the snapshot columns (`LAST MTD`, `GROSS`, `NET`, `TARGET`, `LAST %`) come from the
**last day of the month whose `TARGET` is filled**, not the literal last row: Sept 26–30 sit
in SME's block with `TARGET = 0` and `% = #DIV/0!` until MRC is encoded, and reading those
would report every area at `0%` for the second half of the month. The archive applies the
same rule when it derives these rows.

## Step 3 — Archive: a closed month moves to Supabase

`archiveClosedMonths()` — see [ARCHIVE.md](./ARCHIVE.md) for the full runbook.

A month is due on **day 7 of the following month** (`ARCHIVE_AFTER_DAYS`) and only when it
looks complete. The job then uploads that month's `RAW DATA`, plus the MTD figures it
**computes from those same rows** rather than re-reading the `MTD` tab — that tab is cleared
and rebuilt by every Full Sync, so reading it was a race the archive could lose. It then
**verifies the row counts and a checksum against Supabase**.

Only then does it shrink anything, and **which switch decides depends on what the tab is**:

| `NEW REPORT` is… | Setting | Default | What happens |
|---|---|---|---|
| a **mirror** (one spilled `IMPORTRANGE`) | `ARCHIVE_TRIM` | **`TRUE`** | the range's start row moves past the archived month — one cell, undone by **Restore Full History** |
| **hand-encoded** (cells someone typed) | `ARCHIVE_PURGE` | `FALSE` | the month's day blocks are deleted |

The asymmetry is deliberate. Moving a window is reversible and happens only after the month
is verified in Supabase, so it is on by default; deleting rows is not reversible from the
sheet, so it stays opt-in. Either way `NEW REPORT` stops carrying the month and a Full Sync
rebuilds `RAW DATA` and `MTD` without it. With both switches off the archive copies a month
to Supabase and leaves the sheet alone — the sheet stays the record of every month and
Supabase is a second copy the app reads from.

> Retiring the month from `NEW REPORT` — not `RAW DATA` — is the point. The import rebuilds
> `RAW DATA` from `NEW REPORT` every 5 minutes and on every sheet edit, so a month left in
> `NEW REPORT` always comes back.

The app merges the archived months back in before parsing, so the month picker, MoM delta and
every past-month view keep working exactly as before.

## Step 4 — The app reads it

`src/config/plans.js` points each plan at the Google Sheet CSV export endpoints — `RAW DATA`
(gid `486719298`) and `MTD` (gid `1061751267`) in that plan's own sheet, plus the shared aging
report (gid `766491804`) and the plan's `<PLAN> DATA` trend tab in the SLI TRACKER Database.
Archived months come from Supabase instead (`src/config/supabase.js`), merged on top of the
sheet rows. The full mapping is in [DATASOURCE.md](./DATASOURCE.md).
Results are cached (localStorage + IndexedDB) behind a versioned key, so after a sync use the
app's **Sync Data** button (or a hard reload) to pull fresh numbers.

## The area list

There is **no area list in the scripts**, and no province is excluded by name. The import copies
every row a day's block in NEW REPORT carries, in sheet order, so a province is added or dropped
by editing that sheet — the reports follow on the next **Full Sync**, with no code edit and no
setting to remember.

That is not only about flexibility. A block's `OVER ALL TOTAL` row is copied from the sheet
**unchanged**, and `MTD` takes its `LAST MTD` from that same row. An exclusion list made the two
disagree: BIDA's August block totalled **523** while the imported rows summed to **370**, because
Cagayan, Kalinga and Apayao were filtered out *after* the sheet's total had counted them — and
the panel's `OVER ALL TOTAL` said 523 for a month whose rows added up to 370. Importing every row
brings the rows and the total back into agreement (all twelve August rows sum to 523).

> **To retire a province, remove it from NEW REPORT** (or from the `… DAILY` sheet it mirrors).
> The next Full Sync drops it from `RAW DATA` and `MTD` — and, because `OVER ALL TOTAL` comes
> from the sheet, its numbers leave the total with it.

### The `CONFIG` tab (archive settings)

The tab still exists, but only for the archive: `ARCHIVE_ENABLED`, `ARCHIVE_AFTER_DAYS`,
`ARCHIVE_DRY_RUN`, `ARCHIVE_PURGE`, `ARCHIVE_TRIM`, plus `LAST_ARCHIVE` as a read-only audit
line. Anything the archive reads is optional — the script falls back to its own default when a
key is missing, which is why a missing `ARCHIVE_TRIM` row already means `TRUE`.

Reload the spreadsheet, then **GVSI Auto-DB → Setup / Edit CONFIG Sheet**. It creates the tab if
needed, seeds a missing key with the value the archive already falls back to, and **never
overwrites an existing value**.

## Full Sync is required

> **Generate MTD Report alone is not enough.**

`MTD` does **not** read NEW REPORT — it reads `RAW DATA`. So after editing NEW REPORT you must
run **Full Sync (Import + MTD)** (or `Import` then `Generate MTD`), otherwise `RAW DATA` still
holds the previous state and the MTD rebuild reproduces it. Import also rebuilds the sheet the
app's daily/provincial views read, so a stale `RAW DATA` shows up in the UI too.

The optional auto-trigger (`Setup Auto-Trigger`) runs the same full sync on a 5-minute timer.

## Menu reference

| Menu item | Function |
|-----------|----------|
| Import … to RAW DATA | Rebuild `RAW DATA` from NEW REPORT |
| Generate MTD Report | Rebuild `MTD` from `RAW DATA` |
| Full Sync (Import + MTD) | Both, in order — use this one |
| Setup / Edit CONFIG Sheet | Create/report the `CONFIG` tab |
| Setup Managed Triggers | Reconcile the three managed triggers (5-minute sync, daily archive, on-change full sync) |
| Stop Managed Triggers | Remove those three only |
| Archive Closed Months to Supabase | Archive + purge every month that is due |
| Archive Dry Run | The same, but uploads and deletes nothing |

> `Setup Auto-Trigger` / `Stop Auto-Trigger` still exist for muscle memory, but they now do
exactly what the managed versions do — the old one removed **every** project trigger, including
the on-change `fullSync`.

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| A province you removed still appears in MTD or in the app | Run **Full Sync** — `MTD` and the app read `RAW DATA`, and only the import rewrites it. If it persists, the province is still in that day's NEW REPORT block. |
| A past month is missing from the app | Its archive rows are in Supabase but the browser could not reach it, or `ARCHIVE_ENABLED` has never been set. Check the `LAST_ARCHIVE` line in `CONFIG`. |
| Rows and `OVER ALL TOTAL` disagree in `RAW DATA` or `MTD` | The sheet's own total counts a row the block no longer lists. The scripts import and copy rows verbatim, so fix the block (or its total formula) in NEW REPORT. |
| `#REF!` / `#DIV/0!` in NEW REPORT or `RAW DATA` | Broken formulas at the source (usually after deleting rows/columns). Fix the formula; the scripts only pass the value through. |
| Numbers look wrong for `LAST %` | It is the last day's `%` from the sheet, not recalculated by the script. |
| The app still shows old figures | Cached — press **Sync Data** in the navbar or hard-reload. |
| A newly added province is missing | It must appear in the **last day block** of the month before it shows in MTD. |
