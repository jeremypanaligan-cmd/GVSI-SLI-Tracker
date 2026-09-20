# Cold archive — moving closed months to Supabase

The Google Sheets are the **live** source. Once a month is finished it is copied to
Supabase and deleted from the sheet, so the spreadsheet stops growing forever:

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
4. **Purge — only when asked.** With `ARCHIVE_PURGE = TRUE` *and* step 3 matched, the
   month's day blocks are deleted from `NEW REPORT`, then a Full Sync rebuilds `RAW DATA`
   and `MTD` without them. With `ARCHIVE_PURGE` unset or `FALSE` the run stops here: the
   month stays in the sheet and the next run re-verifies the same rows.
5. **Audit** — a `LAST_ARCHIVE` line is written to the `CONFIG` tab.

> **Why purge `NEW REPORT` and not just `RAW DATA`:** the import clears and rebuilds
> `RAW DATA` from `NEW REPORT` on every run — every 5 minutes, and on every sheet edit.
> An old month left in `NEW REPORT` always comes back. Cleaning `NEW REPORT` is the only
> step that actually shrinks the spreadsheet. This is why purge is the switch that matters:
> the sheet cannot be kept small without deleting from `NEW REPORT`.

> **Why a run can look like it deleted something:** `RAW DATA` and `MTD` are cleared and
> rebuilt by every Full Sync, and the archive runs one before it reads the month. Watching
> a manual run, both tabs look blank for a few seconds. That is normal and nothing is lost.

### The gate

Step 4 does not run unless step 3 matched on **both** tables:

| Check | Why |
|---|---|
| Row count (area rows + `OVER ALL TOTAL`) | catches a partial upload |
| Sum of `TOTAL COMPLETED` for area rows | catches a truncated or garbled write |

On a mismatch the run stops, deletes nothing, and writes the details into
`LAST_ARCHIVE`. The archive is the backup, so the purge is allowed to be strict.

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
| `ARCHIVE_PURGE` | `TRUE` / `FALSE` | **`FALSE` (the default) keeps the month in the sheet.** Copy only |
| `LAST_ARCHIVE` | *(written by the script)* | audit line of the last run |

`ARCHIVE_PURGE` is opt-in on purpose: copying a month to Supabase is additive and easy to
check afterwards, while a delete is neither. With purge off the sheet stays the record of
every month and Supabase is a second copy the app reads from — which also means each run
re-uploads and re-verifies the same months, and the sheet keeps growing as before.

> **A sheet filled by a formula cannot be purged, and the archive now refuses to try.**
> `BIDA NEW REPORT` (and its siblings) is one `=IMPORTRANGE("…", "BIDA DAILY'!A:M")`
> spilling the whole report, so its rows are the *output* of an array formula rather than
> cells anyone typed. Deleting them does not remove data — it tears the formula out of `A1`,
> which is what happened to BIDA on 2026-09-21 and had to be pasted back by hand. The archive
> checks the sheet before deleting; finding a formula, it uploads, verifies, and reports
> `walang binura — gawa ng formula ang BIDA NEW REPORT (IMPORTRANGE) …`. A month like that
> has to be removed from the sheet the formula points at.
>
> This is also where the space problem actually lives now. The mirror pulls the source's
> **entire** history into the sheet, so nothing the archive does here can shrink the plan's
> `RAW DATA` / `MTD`; that has to happen in the `… DAILY` sheet the formula reads from.

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

Deleting rows in `NEW REPORT` is itself a sheet change, so the purge also fires the
on-change `fullSync`. That is harmless (the work is idempotent) and the archive runs one
explicit `fullSync` afterwards to leave a known state.

### 4. First run

1. **GVSI Auto-DB → Test Supabase Connection** — confirms that `SUPABASE_URL` and the key
   in Script Properties can actually reach the archive tables and write to them, and names
   the key's role, so a pasted `anon` key is reported as exactly that instead of as a
   mystery permission error. Nothing is uploaded and nothing is stored.
2. Set `ARCHIVE_DRY_RUN = TRUE` (leave `ARCHIVE_ENABLED` as it is).
3. **GVSI Auto-DB → Archive Dry Run** and read the `LAST_ARCHIVE` line in `CONFIG`: it
   reports how many rows would be uploaded and how many `NEW REPORT` rows would be
   deleted, without touching anything.
4. When the numbers look right, set `ARCHIVE_ENABLED = TRUE` and `ARCHIVE_DRY_RUN = FALSE`.

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

It prints which months are due, the rows and checksums for each, the exact `NEW REPORT`
rows the purge would delete, and — with `--upload` — the real count-and-checksum verdict.
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

`{{PLAN_ID}}`, `{{PLAN_LABEL}}`, `{{PLAN_SHEET_CONST}}` and `{{IMPORT_FN}}` are filled in
per plan. Run the sync script after any edit to the template, then paste the three files
into their Apps Script projects. `--check` fails when the three have drifted.

## Backups and rollback

* Before deleting, the purge copies the affected `NEW REPORT` rows into a
  `_ARCHIVE_BACKUP` tab (values only). It is overwritten by the next purge and is safe to
  delete once you are happy with the run.
* Supabase already holds the verified, complete copy of the month — that is the real
  backup, and it is what makes the strict purge gate acceptable.
* **Re-import trick:** to re-run the archive for a month (for example after changing the
  columns), set `ARCHIVE_ENABLED = TRUE` and `ARCHIVE_DRY_RUN = FALSE` and call
  `archiveClosedMonths()` — the upsert repairs the rows in place. Restoring a month *back*
  into the spreadsheet is a manual copy from Supabase: check `sli_raw_daily` for that
  `month_key`, rebuild day blocks and re-run Full Sync.

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
| `VERIFICATION FAILED — WALANG BINURA` | Counts or checksum did not match. Nothing was deleted. Read the line, then re-run — the upsert repairs the rows. |
| The month is still in the sheet after a successful run | Check the `LAST_ARCHIVE` line: a month is only archived when it looks complete. |
| Numbers for an archived month look wrong in the app | The app reads that month from Supabase. Confirm the row counts with `select plan, month_key, count(*) from sli_raw_daily group by 1,2`. |
| A province is missing from an archived month | It was missing in `RAW DATA` at archive time — the archive is a faithful copy, gaps included. |
| The app shows an archived month's figures but no daily/provincial data | The browser could not reach Supabase; the app fell back to sheet-only. A reload fixes it once the connection is back. |
