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
```

## Sheets

| Sheet | Who writes it | Purpose |
|-------|---------------|---------|
| `…  NEW REPORT` | Encoders, by hand | Source of truth. One block per day, one row per area. |
| `RAW DATA` | Apps Script (`Import`) | Normalized continuous table: one row per date + area. **What the app reads for daily/provincial views.** |
| `MTD` | Apps Script (`Generate MTD`) | Month-to-date summary. **What the app reads for achievement / target figures.** |
| `CONFIG` | Apps Script (once) + you | Settings for the scripts — currently the list of retired areas. Not read by the app. |
| `Login Credentials` | You, by hand | `Username` / `PasswordHash` (lowercase SHA-256 hex) / `FullName` / `Role` for the app's login gate. Lives in the **shared SLI TRACKER Database**, not in a plan sheet. |
| `COMPLETED AGING REPORT` | Not managed here | Feeds the app's `SLA` view. Lives in the **shared SLI TRACKER Database**. The scripts do not touch it. |
| `FIBERX / BIDA / SME DATA` | Not managed here | The app's rolling 30-day trend. Live in the **shared SLI TRACKER Database**, one tab per plan. The scripts do not touch them. |

`RAW DATA` and `MTD` are **fully cleared and rebuilt** on every run — never edit them by hand.

## Apps Script files

Each plan has its own spreadsheet and its own Apps Script project:

| Plan | Spreadsheet | Script to paste into `Extensions → Apps Script` |
|------|-------------|--------------------------------------------------|
| FIBERX | [FIBERX SLI Tracker DB](https://docs.google.com/spreadsheets/d/1UUd8cpfKeOCBHANx9wmM7l1apFyDoZRv0dHZa2_bVr0/edit) | `FIBERXSCRIPT.gs` |
| BIDA | [BIDA SLI Tracker DB](https://docs.google.com/spreadsheets/d/1FrEowZ9Zl0jMAyLde4OZE2cQV04nIz-rjRkLi6uv99M/edit) | `BIDASCRIPT.gs` |
| SME | [SME SLI Tracker DB](https://docs.google.com/spreadsheets/d/10P3GatvwC76IujPpjHtqgyNjE71ChAoP_8Ln7BDcvTY/edit) | `SMESCRIPT.gs` |

The three files are identical apart from the plan name — a fix must be applied to all three.
`scripts/MTD.gs` + `scripts/SETUP_GUIDE.md` are the **legacy single-plan (FIBERX v1)** path and
are no longer used.

## Step 1 — Import: NEW REPORT → RAW DATA

`importFiberxToRawData()` (named per plan, e.g. `importBIDAToRawData`)

1. `RAW DATA` is cleared completely, then the header row is written to row 1.
2. Walks the NEW REPORT rows. The current date comes from each day's block header:
   `SLI DAILY TRACKING REPORT as of __Sept. 1, 2026__`.
3. Writes one row per area per day, in sheet order, plus the `OVER ALL TOTAL` row.
4. Areas listed in `CONFIG` are skipped (see below).
5. Writes data from row 2 down and reapplies number formatting.

### Column mapping

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
| N `TARGET` | L | |
| O `%` | M | |

## Step 2 — Generate: RAW DATA → MTD

`generateMTDReport()`

1. The `MTD` sheet is cleared, then rebuilt from scratch.
2. Rows are grouped by month (oldest → newest), each month getting a merged month title row and
   a header row.
3. **The area list for a month is taken from that month's last day block.** A province that
   appears on the last day appears in the month; areas listed in `CONFIG` never do.
4. Values that accumulate over the month are summed across every day of the month; snapshot
   values (`LAST MTD`, `TARGET`, `LAST %`) are taken from the last day.
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
| H `LAST MTD` | From the last day of the month |
| I `TARGET` | From the last day of the month |
| J `LAST %` | Achievement % from the last day |
| K `TOTAL INCOMING` | Sum of `INC` for the month |

## Step 3 — The app reads it

`src/config/plans.js` points each plan at the Google Sheet CSV export endpoints — `RAW DATA`
(gid `486719298`) and `MTD` (gid `1061751267`) in that plan's own sheet, plus the shared aging
report (gid `766491804`) and the plan's `<PLAN> DATA` trend tab in the SLI TRACKER Database.
The full tab-by-tab mapping is in [DATASOURCE.md](./DATASOURCE.md).
Results are cached (localStorage + IndexedDB) behind a versioned key, so after a sync use the
app's **Sync Data** button (or a hard reload) to pull fresh numbers.

## The CONFIG tab

Retired areas are configured **in the spreadsheet**, not in the code. The scripts read the
`CONFIG` tab and skip those areas during the import *and* during MTD generation — so they are
absent from the reports and from the `OVER ALL TOTAL` totals.

### Format

| | A | B |
|---|---|---|
| **1** | `SETTING` | `VALUE` |
| **2** | `EXCLUDED_AREAS` | `CAGAYAN, APAYAO, KALINGA` |

### Rules

- **Separators** — comma, semicolon, slash or a new line: `Cagayan, Apayao`, `Cagayan; Apayao`.
- **One area per row** — repeat the key on consecutive rows instead of listing them in one cell.
- **Loose key matching** — `EXCLUDED_AREAS`, `excluded_areas`, `Excluded Areas` and
  `EXCLUDED_AREA` all work (case and spaces are ignored).
- **Blank value = exclude nothing** — every area is reported.
- **Missing tab or missing key = safe fallback** — the built-in default
  (`CAGAYAN, APAYAO, KALINGA`) is used, so a deleted tab can never silently blank out the reports.
- Names are matched case-insensitively, so `Cagayan` and `CAGAYAN` are the same.
- Settings are read **once per sync run**, so adding areas costs nothing at runtime.

### Creating it

Reload the spreadsheet, then **GVSI Auto-DB → Setup / Edit CONFIG Sheet**. This creates the tab
with the header and the current list, and reports what is configured. Existing values are never
overwritten — edit column B and run **Full Sync**.

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
| Setup Auto-Trigger (Every 5 min) | Full sync on a 5-minute timer |
| Stop Auto-Trigger | Remove the timer |

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| A retired province still appears in MTD or in the app | Run **Full Sync** — `MTD` and the app read `RAW DATA`, and only the import rewrites it. |
| A province is back after you removed it from NEW REPORT | Check `CONFIG` — a blank/missing list falls back to the built-in default. |
| `#REF!` / `#DIV/0!` in NEW REPORT or `RAW DATA` | Broken formulas at the source (usually after deleting rows/columns). Fix the formula; the scripts only pass the value through. |
| Numbers look wrong for `LAST %` | It is the last day's `%` from the sheet, not recalculated by the script. |
| The app still shows old figures | Cached — press **Sync Data** in the navbar or hard-reload. |
| A newly added province is missing | It must appear in the **last day block** of the month before it shows in MTD. |
