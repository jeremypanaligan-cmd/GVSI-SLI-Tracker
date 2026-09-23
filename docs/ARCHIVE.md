# Cold archive — moving closed months to Supabase

The Google Sheets are the **live** source. Once a month is finished it is copied to
Supabase and taken out of the sheet, so the spreadsheet stops growing forever:

```
current month   → Google Sheet          (hot: RAW DATA + MTD, rebuilt every 5 min)
previous months → Supabase              (cold: sli_raw_daily + sli_mtd, immutable)
```

The app reads both and merges them on the fly — the month picker, achievement figures,
MoM delta, Daily To-Date and Provincial Breakdown all keep working for archived months.
See [DATASOURCE.md](./DATASOURCE.md) for the read side and
[`supabase/schema.sql`](../supabase/schema.sql) for the tables.

## When a month is archived

A month `M` becomes eligible on **day 7 of the following month** (`ARCHIVE_AFTER_DAYS`,
default 7): September is archived on October 7. On top of that the month must look
complete — either its last calendar day has been encoded, or encoding has already moved
on to a later month. A partial month is never frozen and purged.

The job runs daily at 02:00. If a run is missed, the next one picks up **every** month
that is due, oldest first, so nothing is skipped.

## What happens in one run

1. **Full Sync** first, so the archive never freezes a stale view of the month.
2. **Upload** the month's `RAW DATA` rows to `sli_raw_daily`, and the month's MTD figures
   to `sli_mtd` — both as upserts, so re-running is harmless. The MTD figures are
   **computed from the RAW rows just read**, not read back off the `MTD` tab (see below).
3. **Verify** by reading the counts *and* a checksum back from Supabase.
4. **Shrink — one switch per shape.** Two independent settings decide this, and step 3 has
   to have matched either way:
   * on a **hand-encoded** tab, `ARCHIVE_PURGE = TRUE` deletes the month's day blocks;
   * on a **mirror**, `ARCHIVE_TRIM = TRUE` (the default) moves the `IMPORTRANGE` window
     past the archived month.

   With both `FALSE` the month stays in the sheet and the next run re-verifies the same
   rows. See [Two ways to shrink a sheet](#two-ways-to-shrink-a-sheet).
5. **Audit** — a `LAST_ARCHIVE` line is written to the `CONFIG` tab.

> **Why `NEW REPORT` and not just `RAW DATA`:** the import clears and rebuilds `RAW DATA`
> from `NEW REPORT` on every run — every 5 minutes, and on every sheet edit. An old month
> left in `NEW REPORT` always comes back. Retiring it from `NEW REPORT` is the only step
> that actually shrinks the spreadsheet, which is why the trim — not the upload — is the
> step that matters.

> **Why a run can look like it deleted something:** `RAW DATA` and `MTD` are cleared and
> rebuilt by every Full Sync, and the archive runs one before it reads the month. Watching
> a manual run, both tabs look blank for a few seconds. That is normal and nothing is lost.

### Two ways to shrink a sheet

Either switch asks the sheet to stop carrying the month — `ARCHIVE_PURGE` for a tab someone
typed, `ARCHIVE_TRIM` for a mirror. *How* that happens depends on what `NEW REPORT` actually
is, and the two are deliberately separate: a window move is one cell write that **Restore
Full History** undoes, while deleting rows is neither reversible nor recoverable from the
sheet. A deletion therefore stays opt-in, and a move does not.

| Sheet | How it shrinks | What is written |
|---|---|---|
| **hand-encoded** — cells someone typed | the month's day blocks are **deleted** | `deleteRows`, after copying them into `_ARCHIVE_BACKUP` |
| **a mirror** — one spilled `=IMPORTRANGE(…)` | the range's **start row moves** past the archived month | `A1` only: `"'BIDA DAILY'!A1:M"` → `"'BIDA DAILY'!A19:M"` |

A mirror cannot be deleted from. Its rows are the *output* of an array formula, so removing
them does not remove data — it tears the formula out of `A1`, which is what happened to
BIDA on 2026-09-21 and had to be pasted back by hand. Moving the range instead leaves the
mirror a plain `IMPORTRANGE`: every row still arrives with the sheet's own types, nothing is
re-parsed, and the block layout of the report is untouched. The spreadsheet gets smaller
because the window no longer reaches back over the archived months — the effect `deleteRows`
would have had, without touching the formula's identity.

#### Where the new start row comes from

Not from the mirror. The script opens the **source** spreadsheet — the id and tab name are
read out of the formula itself — and finds the first day block of the month after the
archived one, so the answer is exact and survives someone deleting rows near the top of
`BIDA DAILY`. If the source cannot be opened the row is counted in the mirror instead (the
two agree while the mirror's row 1 is the source's row 1), and the audit line says which one
was used.

#### The guards

The window moves only when all of these hold:

| Guard | Why |
|---|---|
| Every month older than the new start was archived **in this same run** | otherwise narrowing would drop a month from the sheet that Supabase does not have |
| There is a later month to start at | otherwise the window would become empty |
| The new start row is past the current one | it never moves backwards |
| After writing, the spill lands on that month | `IMPORTRANGE` recalculates asynchronously; if it does not settle within 20s the **old formula goes back** |

The last one is why the trim is safe to run unattended: what the sheet shows is checked
against what the formula says, and a mismatch is repaired rather than reported.

> **The window can lag by a day, on purpose.** A month is only skipped past once the *next*
> month has rows to start at. Archive August and September on October 7 while October has
> not been filled yet, and the run reports
> `walang buwan na mas bago sa 2026-09 … hindi ito tinatrim` and leaves the sheet alone. The
> next day, with October's first block present, it trims once and both months are gone.
> Refusing beats an empty mirror, which would leave `RAW DATA` and `MTD` with nothing while
> the team is still filling the new month.

#### Doing it by hand

Two menu items, neither of which touches Supabase:

* **Preview Formula Trim** — what the window would become, and the guards' verdicts,
  without writing anything.
* **Restore NEW REPORT Formula (full history)** — puts the range back to `A1:M`, so the sheet
  holds every month again. It rebuilds `RAW DATA` and `MTD` too. The next archive run trims
  it again while `ARCHIVE_TRIM = TRUE`.

Two settings have to agree before any window moves, and they answer different questions:

| Setting | Where | Question it answers |
|---|---|---|
| `ARCHIVE_TRIM` | `CONFIG` tab, default **`TRUE`** | should this run shrink a sheet at all? |
| `PLAN_SHEET_TRIM_ENABLED` | the generated tail, per plan | has *this* plan's history actually reached Supabase yet? |

The per-plan flag is `true` for all three plans — **BIDA, FIBERX and SME** — so each one
lets go of a month as soon as Supabase is verified to hold it. Neither flag is
`ARCHIVE_PURGE` — that one has nothing to do with mirrors.

The window is read from the plan's own `A1`, and the start row is optional there: `'FIBERX
DAILY'!A:M` and `'SME DAILY'!A:M` name the same window as `A1:M`, so they are read as row 1
rather than refused. Whatever is read, the formula written back is always the explicit
`A19:M` form. (Google's own `xlsx` export wraps this cell in
`IFERROR(__xludf.DUMMYFUNCTION("IMPORTRANGE(…)"), <cached value>)`; that wrapper is export
noise, not the formula in the sheet — `A1` really holds a plain `IMPORTRANGE`.)

### The gate

Step 4 does not run unless step 3 matched on **both** tables:

| Check | Why |
|---|---|
| Row count (area rows + `OVER ALL TOTAL`) | catches a partial upload |
| Sum of `TOTAL COMPLETED` for area rows | catches a truncated or garbled write |

On a mismatch the run stops, shrinks nothing, and writes the details into `LAST_ARCHIVE`
(`VERIFICATION FAILED — WALANG BINURA AT WALANG TRIM`). The archive is the backup, so the
shrink step is allowed to be strict.

The `OVER ALL TOTAL` row is archived by design, flagged `is_overall_total`. It is *not*
always the sum of the area rows (BIDA August: total `387`, area sum `370`) and it is the
number the dashboard showed while the month was live, so recomputing it would silently
change closed-month figures.

### Why the MTD figures are computed, not read off the sheet

`MTD` is one of the two tabs every Full Sync **clears and rebuilds**, and nothing serialises
the archive against a sync running at the same time. Reading `MTD` therefore had a window in
which the tab is empty — and an empty read looked exactly like a valid one: the `sli_mtd`
upsert was a no-op that still returned HTTP 200, and a gate comparing `0 === 0` called it
verified. The purge would then delete a month whose MTD figures had never been archived,
leaving the app with a month it could not see.

On 2026-09-21 that window was hit twice on BIDA August. Nothing was lost — the second time
the gate refused the purge — but the dependency itself is the bug. The MTD figures are
nothing more than sums over `RAW DATA`: each area summed across the month's days, with
`LAST MTD`, `TARGET` and `LAST %` taken from the last day. So the archive derives them from
the rows it already holds instead of asking the sheet a second time.

A derived row is checked against the live `MTD` tab for all three plans and every month the
sheets hold — identical on every field. Two details are deliberately carried over from
`generateMTDReport()`: the area list is the **last day's** areas rather than the union of
all days, and the `OVER ALL TOTAL` sums **every** area on every day, listed or not, because
that is how the sheet builds its total.

## Setup (once per plan spreadsheet)

### 1. Script Properties

Apps Script editor → **Project Settings → Script Properties**:

| Property | Value |
|---|---|
| `SUPABASE_URL` | `https://fsebdacptgoknbjqdlor.supabase.co` |
| `SUPABASE_SERVICE_KEY` | the **service_role** secret key (Supabase → Project Settings → API keys) |
| `ALERT_EMAIL` | optional — archive failures are mailed here |

The service_role key is used because it is the only key allowed to write archive rows.
It stays in Script Properties and never ships to the browser: the anon key inside the app
bundle deliberately has no write access to any table.

### 2. CONFIG tab

| SETTING | VALUE | Meaning |
|---|---|---|
| `ARCHIVE_ENABLED` | `TRUE` / `FALSE` | `FALSE` (the default) makes the job inert |
| `ARCHIVE_AFTER_DAYS` | `7` | days into the next month before a month is archived |
| `ARCHIVE_DRY_RUN` | `TRUE` / `FALSE` | report only — no upload, no delete |
| `ARCHIVE_PURGE` | `TRUE` / `FALSE` | **`FALSE` (the default).** `TRUE` shrinks a **hand-encoded** tab by deleting the month's day blocks. Does not affect a mirror |
| `ARCHIVE_TRIM` | `TRUE` / `FALSE` | **`TRUE` (the default).** Moves a **mirror's** `IMPORTRANGE` window past the archived month once it is verified. Does not affect a hand-encoded tab. Missing row = `TRUE` |
| `LAST_ARCHIVE` | *(written by the script)* | audit line of the last run |

The two switches are asymmetric on purpose. Deleting rows is opt-in: copying a month to
Supabase is additive and easy to check afterwards, while removing it from the sheet is
neither, so `ARCHIVE_PURGE` stays `FALSE` until someone asks for it by name. Moving a
mirror's window is the opposite — the month is already verified in Supabase before one cell
changes, the change is a single range, and **Restore Full History** puts it back — so
`ARCHIVE_TRIM` is `TRUE` from the start, which is the whole point of archiving: the sheet
stops carrying a year of months, and the app reads the older ones from Supabase.

With `ARCHIVE_TRIM` off, the sheet stays the record of every month and Supabase is a second
copy the app reads from — which also means each run re-uploads and re-verifies the same
months, and the sheet keeps growing as before.

> **A mirror is never deleted from.** `BIDA NEW REPORT` (and its siblings) is one
> `=IMPORTRANGE("…", "'BIDA DAILY'!A1:M")` — `'FIBERX DAILY'!A:M` on FIBERX, the same window
> written with whole columns — spilling the whole report, so its rows are the
> *output* of an array formula rather than cells anyone typed. `planSheetIsFormulaDriven_()`
> classifies the tab before anything destructive runs: a formula means the window moves, and
> `deleteRows` is not called at all; a tab with no formula takes the delete path and is
> copied to `_ARCHIVE_BACKUP` first.
>
> This is also where the space problem lives. The mirror pulls the source's **entire**
> history into the sheet, so the only thing that can shrink the plan's `RAW DATA` / `MTD` is
> narrowing the window — which is what `PLAN_SHEET_TRIM_ENABLED` allows for BIDA, FIBERX and
> SME.

### 3. Managed triggers

Run **GVSI Auto-DB → Setup Managed Triggers**. It reconciles exactly three triggers and
leaves every other trigger in the project alone:

| Trigger | Schedule | Function |
|---|---|---|
| `autoSync` | every 5 minutes | `autoSync` |
| `archiveClosedMonths` | daily 02:00 | `archiveClosedMonths` |
| on change | spreadsheet edit | `fullSync` |

> The on-change trigger is created **by code** now. It used to be added by hand in the
> Triggers page, and the old `setupAutoTrigger()` deleted *every* project trigger before
> installing its timer — so re-running setup quietly removed it. `setupAutoTrigger()` and
> `stopAutoTrigger()` still exist, but they delegate to the managed versions.

Both shapes of the shrink are sheet changes — `deleteRows` deletes, and rewriting `A1`
recalculates — so the on-change `fullSync` fires either way. That is harmless (the work is
idempotent) and the archive runs one explicit `fullSync` afterwards to leave a known state.

### 4. First run

1. **GVSI Auto-DB → Test Supabase Connection** — confirms that `SUPABASE_URL` and the key
   in Script Properties can actually reach the archive tables and write to them, and names
   the key's role, so a pasted `anon` key is reported as exactly that instead of as a
   mystery permission error. Nothing is uploaded and nothing is stored.
2. Set `ARCHIVE_DRY_RUN = TRUE` (leave `ARCHIVE_ENABLED` as it is).
3. **GVSI Auto-DB → Archive Dry Run** and read the `LAST_ARCHIVE` line in `CONFIG`: it
   reports how many rows would be uploaded, and either the `NEW REPORT` rows that would be
   deleted or the window the formula would move to, without touching anything.
4. **GVSI Auto-DB → Preview Formula Trim** for the window on its own, with each guard's
   verdict spelled out.
5. When the numbers look right, set `ARCHIVE_ENABLED = TRUE` and `ARCHIVE_DRY_RUN = FALSE`.
   A **mirror** then starts shrinking on its own (`ARCHIVE_TRIM` defaults to `TRUE`); a
   **hand-encoded** tab still needs `ARCHIVE_PURGE = TRUE` before it will delete anything.

To backfill an existing history, set `ARCHIVE_ENABLED = TRUE` and run
**Archive Closed Months to Supabase** by hand — every due month is archived in order.

#### Checking it from outside Apps Script

The editor gives you no way to exercise the gate end to end: a dry run does not upload,
and a live run purges. `scripts/apps-script/verify-archive.cjs` closes that gap by running
the plan's `.gs` verbatim in Node against the live CSV exports and the real Supabase
project, with Apps Script stubbed out and every `deleteRows` recorded instead of applied:

```bash
node scripts/apps-script/verify-archive.cjs bida            # dry run, offline, no writes
node scripts/apps-script/verify-archive.cjs bida --dump     # + every shaped row
node scripts/apps-script/verify-archive.cjs bida --gate-view # + what the gate measures
node scripts/apps-script/verify-archive.cjs bida --connection # the menu's connection test
node scripts/apps-script/verify-archive.cjs bida --as-of 2026-10-07  # run as if it were that day

# the full path, including the upload, needs the privileged key in your shell:
SUPABASE_URL=… SUPABASE_SERVICE_KEY=… node scripts/apps-script/verify-archive.cjs bida --upload
```

It prints which months are due, the rows and checksums for each, the exact `NEW REPORT` rows
a purge would delete, and — with `--upload` — the real count-and-checksum verdict.

The window trim is exercised the same way, because it is the one part that cannot be tried
in the editor: `BIDA NEW REPORT` is seeded with the `IMPORTRANGE` the spreadsheet really
holds and made to spill from the live source, so moving the range really does change the
rows. The run then asserts the new start row against the source, that the archived month is
gone from the window, that `deleteRows` was **not** used, that a month left behind blocks the
trim, that the old formula comes back when the spill does not land, that a hand-encoded tab
still deletes, and that the restore menu item puts the whole history back.

`CONFIG` is supplied in memory, so `LAST_ARCHIVE` and the real `CONFIG` tab are never
touched, and the `service_role` key stays in your environment rather than in this repo.

`--connection` runs the same function the menu item runs, without reading a single sheet
(handy when the spreadsheet is the thing that is broken). Point it at the **anon** key to
see the rejection you would get from a mis-pasted key — that is the fastest way to tell a
wrong key from a wrong URL.

`--as-of YYYY-MM-DD` moves the sandbox's clock and prints a cut-off table, so "what happens
on the 7th" can be answered today. The **cut-off** column is exact (it is the same
`archiveCutoff_` the job calls), but **COMPLETE** is judged from the rows in the sheet *now*,
so a month that is still being written reads as incomplete until the next month has rows.
Treat the cut-off as the answer, and the completion flag as a preview.

### How the write check works

The archive tables are **readable** by the public `anon` key on purpose, so a read alone
proves almost nothing. The write check sends an **empty row** (`{}`) as an upsert: Postgres
checks the `INSERT` privilege and RLS *before* it evaluates constraints, so a key that may
write gets `23502` (not-null violation) and **nothing is stored**, while a key that may not
gets `42501` — which covers both a missing grant and an RLS violation, and is exactly what
the `anon` key produces. Not-null is the probe on purpose: it aborts the whole statement, so
no probe row can survive a partial success.

## The three script files

`FIBERXSCRIPT.gs`, `BIDASCRIPT.gs` and `SMESCRIPT.gs` are identical apart from the plan
name, and the whole `TRIGGERS & MENU` section down is **generated**:

```
scripts/apps-script/gs-tail.template.txt   ← edit this
scripts/apps-script/sync-gs-tail.cjs       ← node scripts/apps-script/sync-gs-tail.cjs
```

`{{PLAN_ID}}`, `{{PLAN_LABEL}}`, `{{PLAN_SHEET_CONST}}`, `{{IMPORT_FN}}` and
`{{PLAN_TRIM_ENABLED}}` are filled in per plan — `PLAN_TRIM_ENABLED` is `true` for all
three today. It is a per-plan constant rather than a `CONFIG` row because it answers "has
*this* plan's history actually reached Supabase yet?", which `ARCHIVE_TRIM` cannot answer.
Run the sync script after any edit to the template, then paste the three files into their
Apps Script projects. `--check` fails when the three have drifted.

## Backups and rollback

* Before deleting, the purge copies the affected `NEW REPORT` rows into a
  `_ARCHIVE_BACKUP` tab (values only). It is overwritten by the next purge and is safe to
  delete once you are happy with the run. This is the hand-encoded path only — a mirror is
  never deleted from, so nothing needs backing up: the source sheet still holds every row.
* Supabase already holds the verified, complete copy of the month — that is the real
  backup, and it is what makes the strict purge gate acceptable.
* **Re-import trick:** to re-run the archive for a month (for example after changing the
  columns), set `ARCHIVE_ENABLED = TRUE` and `ARCHIVE_DRY_RUN = FALSE` and call
  `archiveClosedMonths()` — the upsert repairs the rows in place. That only works while the
  month is still in the sheet, so a month already **trimmed** out of the window cannot be
  re-archived this way; it is frozen in Supabase and the way to change it is a direct row
  update there. Restoring a month *back* into the sheet is
  **Restore NEW REPORT Formula (full history)**, which returns the window to `A1:M`.

## How a past month reaches the browser

Archived rows are fetched straight from Supabase with the public anon key and cached in the
browser, because a finished month never changes:

* **the month index** has a 5-minute TTL — a newly archived month shows up on its own
* **a month's rows** are cached under a key that carries the app version, so a release
  retires the whole set at once and orphaned versions are swept

The version in the key is the only thing that retires them, and that has one consequence
worth knowing during testing: **correcting or deleting archive rows in Supabase does not
reach a browser that already cached them.** The stale copy survives until the cache
version changes — bump the version, or clear the site's storage. Treat a month as frozen
the moment it is archived; if it is wrong, fix the sheet and re-run the archive.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `LAST_ARCHIVE` says `ARCHIVE_ENABLED is not TRUE` | Set `ARCHIVE_ENABLED = TRUE` in `CONFIG`. |
| `Kulang ang SUPABASE_URL / SUPABASE_SERVICE_KEY` | Add both to Script Properties (step 1). |
| The connection test says the key's role is `anon` | The public app key was pasted instead of the `service_role` secret. Get it from Supabase → Project Settings → API keys. |
| The connection test says `walang pahintulot (HTTP 401 / 42501)` on `write` while `read` is OK | The key reached the project but may not write. Same cause as above; `read` passing is expected and is not a sign that the key is right. |
| The connection test says `hindi mahanap ang table` | The migration was never applied to this project, or `SUPABASE_URL` points at a different one. |
| `VERIFICATION FAILED — WALANG BINURA AT WALANG TRIM` | Counts or checksum did not match. Nothing was deleted and no window moved. Read the line, then re-run — the upsert repairs the rows. |
| The month is still in the sheet after a successful run | Check the `LAST_ARCHIVE` line: a month is only archived when it looks complete. |
| The month is still in the sheet although it should have shrunk | Read the `LAST_ARCHIVE` line: either verification failed, or the window had no later month to start at, or the spill did not settle and the old formula was restored, or the switch for that sheet's shape is off (`ARCHIVE_TRIM` for a mirror, `ARCHIVE_PURGE` for a hand-encoded tab). |
| `Formula trim: hindi isinagawa — may buwan pang hindi archived bago ang …` | The sheet still holds a month Supabase does not, so narrowing would drop it. Archive that month (or raise `ARCHIVE_AFTER_DAYS`), then re-run. Nothing was changed. |
| `Formula trim: hindi isinagawa — walang buwan na mas bago sa …` | Expected right after the newest month is archived: the window waits for the next month's first rows. See [Two ways to shrink a sheet](#two-ways-to-shrink-a-sheet). |
| Numbers for an archived month look wrong in the app | The app reads that month from Supabase. Confirm the row counts with `select plan, month_key, count(*) from sli_raw_daily group by 1,2`. |
| A province is missing from an archived month | It was missing in `RAW DATA` at archive time — the archive is a faithful copy, gaps included. |
| The app shows an archived month's figures but no daily/provincial data | The browser could not reach Supabase; the app fell back to sheet-only. A reload fixes it once the connection is back. |
