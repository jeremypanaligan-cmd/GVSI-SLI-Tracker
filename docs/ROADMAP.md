# Roadmap

Possible upgrades, not commitments. Each item says what it is, why it matters — the evidence
being a file, a line, a measurement or an incident — and what "done" looks like.

Items are ordered inside each tier by what they are worth doing, not by how hard they are.

| Tier | Meaning |
|---|---|
| 🔴 | Correctness or security. Fix before adding features. |
| 🟠 | Operations. Costs time on every release or every run. |
| 🟢 | Analytics. What the dashboard could answer and cannot yet. |
| 🔵 | Architecture. Larger changes that make the rest cheaper. |

## Start here

1. **[The `Login Credentials` tab is still in a published sheet](#1-the-login-credentials-tab-is-still-in-a-published-sheet)** — quick, and it removes a public copy of every password hash.
2. **[There are no tests](#2-there-are-no-tests)** — every bug found so far has been in data logic, never in the UI.

---

## 🔴 Correctness and security

### 1. The `Login Credentials` tab is still in a published sheet

`AUTH_URL` (`src/config/plans.js`) points at the `Login Credentials` tab of spreadsheet
`1PGB2Mmo5Ka2NBfrlJWIF3V_X3Kxm6jepT5-eEYOC9bs`. Logins now go through the `verify_login`
RPC, and `SUPABASE_ENABLED` is a hardcoded `true` (`src/config/supabase.js`), so that code
path is unreachable and the bundler drops it — the tab's `gid` does **not** appear in the
built bundle.

The sheet ID still does, because `agingUrl` and `trendUrl` are live features reading other
tabs of the same spreadsheet. So the ID is public, and a tab holding unsalted SHA-256
password hashes sits inside the workbook it points at. Anyone with the bundle can find the
sheet; the only remaining obstacle is guessing a `gid`.

Two halves, both cheap:

- **Relocate or delete the tab.** `docs/DEVELOPER.md` already tells readers credentials are
  "not in the shared Google Sheet any more" — that sentence is only true of the app's
  behaviour, not of the spreadsheet.
- **Delete the legacy auth code** — `AUTH_URL`, `fetchCredentials`, `verifyCredentials` and
  `legacySignIn` in `src/utils/auth.js`. Dead code guarded by a constant is a divergence
  risk: nobody notices when it rots.

**Done when:** the hash list is not reachable through any URL the shipped bundle exposes,
and no module imports `AUTH_URL`.

### 2. There are no tests

`package.json` has no test script and no test runner, and there are zero test files. Every
bug found while building the archive was in data logic, never in a component:

- the month projection still rendering for a closed month
- `handleMonthChange` and `loadData` closing over a stale `activePlan`
- which archived months of raw rows to load, and which sheet sections to drop
- the MTD figures derived from RAW rows matching the `MTD` tab exactly

Those are pure functions with subtle rules, which is the cheapest kind of code to test and
the most expensive to get wrong. Good first targets: `deriveMtdArchiveRows_`,
`dropArchivedRawRows`, `dropArchivedMtdSections`, `monthLabelToKey`, `rawMonthsToLoad`, and
the past-month projection rule.

**Done when:** `npm test` runs in CI and covers those, including the month-boundary cases.

### 3. No `LockService`, so two executions contend

The installable `onChange` trigger runs `fullSync` on **every** spreadsheet edit — including
editing the `CONFIG` tab — and a scheduled run calls `fullSync` again before archiving.
Nothing in the three plan scripts takes a script lock, so two executions can interleave on
the same spreadsheet. That contention is what produced `Service Spreadsheets timed out`.

The archive gate now makes the failure mode safe (it refuses instead of deleting), but the
race is still there and still slows every run.

**Done when:** `fullSync` (and the archive) takes a script lock, so the second execution
waits instead of interleaving.

## 🟠 Operations

### 4. Pasting three `.gs` files by hand

The plan scripts live in the repo and are deployed by copy-paste into the Apps Script
editor. There is no check that what runs is what the repo says, and this has already bitten
us: a completed guard sat undeployed while a scheduled run used the previous code, and the
only way to tell was to read the audit trail afterwards.

**Done when:** `clasp push` (or an equivalent) deploys all three, or a small script reports
which functions differ between the repo and the deployed project.

### 5. `applyMTDFormatting` still makes ~160 sheet calls

`generateMTDReport` was rewritten to build its grid in memory and write once, which cut the
round trips between `clear()` and the last value from **29 to 1**. The total only fell from
185 to 164, because the formatting pass is now the dominant cost — and unlike the old blank
window, it is still pure running time against the six-minute limit.

**Done when:** the formatting pass is a handful of range operations rather than ~160.

### 6. FIBERX and SME archives are not active

Only BIDA has `ARCHIVE_ENABLED = TRUE` with `ARCHIVE_DRY_RUN = FALSE`. The other two are
still dry-run, so their closed months stay in their sheets and grow.

**Done when:** both have archived at least one real month and the verification gate has
passed for each.

### 7. A release is still four manual steps

Today a release means bumping `package.json`, promoting the CHANGELOG's `[Unreleased]`
section to `[x.y.z]`, committing, and pushing a tag. The release workflow then verifies the
tag agrees with `package.json` and publishes the notes from the promoted section — so the
automation exists, but the steps that feed it are done by hand in a fixed order.

**Done when:** `npm run release <version>` bumps, promotes, commits, tags and pushes. The
existing `scripts/extract-changelog-section.cjs` already reads the section the workflow
needs, so this is mostly assembling parts that exist.

---

## 🟢 Analytics

### 8. A per-province trailing trend

The 30-day sparkline is portfolio-level. The most common question this report invites —
*is this one province slipping, or is everyone?* — cannot be answered from the dashboard
today. The RAW DATA already carries every area for every day, so the data is present and
only the view is missing.

**Done when:** selecting a province shows its own trailing window, not just its current row.

### 9. Pace alerting per province

The velocity report knows the required daily rate for the portfolio. A province that is
behind that pace is visible only by reading the table and doing the arithmetic. Flagging the
ones below pace would turn a table into a worklist.

**Done when:** provinces below the required rate are marked wherever they appear, from the
same rule the velocity report uses.

### 10. Export the current view

There is no way to get a table out of the app. Management reporting still means
screenshots. Excel or PDF export of the visible view would remove that step.

**Done when:** the current table can be exported with its selected month, plan and filters.

### 11. SLA breach drill-down

The Installation SLA Breakdown buckets tickets by age; it does not say **which** tickets are
in the oldest bucket, or which area they belong to. That is the next question after "how
many breached".

**Done when:** a bucket can be opened to see the jobs inside it, grouped by area.

### 12. Project the month from trailing velocity, not linear pace

The month-end projection is linear: completed so far, divided by elapsed days, extrapolated.
A team that started slowly and accelerated is projected as if it never accelerated. The
velocity report already computes a trailing 7-day rate.

**Done when:** the projection uses the trailing rate, and the Executive card says which
basis it used.

---

## 🔵 Architecture

### 13. One chunk holds the whole app

The production build is a single `index-*.js` of about 334 kB (93 kB gzip) containing every
screen, including the ones most sessions never open: `CompareView`, `AgingReport` and
`DeveloperPanel`. `React.lazy` on those three would cut the first load meaningfully, and the
Developer console in particular is opened by a handful of accounts.

**Done when:** the initial chunk excludes the screens that are not on the default view.

### 14. Supabase for the live month too

Closed months come from Supabase; the current month still comes from the Google Sheet's CSV
export, which is a published link rather than an API — no shaping, no filtering, the whole
tab every time. Moving the live month to Supabase as well would make the sheet purely an
input, and the app independent of the export URL and its five-minute rebuild cycle.

This is the natural end state of the cold-archive design, and the largest item here.

**Done when:** no dashboard request reads a spreadsheet CSV.

### 15. Real offline support

The service worker is cache-first for assets, so the app opens without a network — but the
data is fetched on load, so an offline open shows an error rather than the last known
figures. For a dashboard people check on site visits, the cached view is worth having.

**Done when:** opening offline renders the last cached month with a clear "as of" marker.

### 16. Supabase Auth instead of custom session tokens

Sessions are built on a hand-rolled `verify_login` RPC returning a token, with presence,
revocation and maintenance checks layered on top. It works, and it was the right call when
the alternative was a public hash list. Supabase Auth would replace the token plumbing with
a maintained implementation and give password reset and rotation for free.

**Done when:** sessions are issued by Supabase Auth and the custom token path is gone.

### 17. Role-based views

`sli_users.role` exists and `Developer` unlocks the console, but nothing else is gated: a
`Supervisor` and a `Viewer` see the same thing. Deciding what each role should see is a
product question; the column to support the answer is already there.

**Done when:** at least one role difference is enforced and documented.

### 18. An audit trail of exports and views

Presence records who is signed in. Nothing records who exported a month, or who looked at a
closed one. For figures that go into customer-facing reporting, that history is worth having.

**Done when:** exports and month changes are recorded, and a Developer can read them.

---

## Done

Kept here so the same ground is not re-covered.

- **Closed months move to Supabase**, with a verification gate that counts and checksums
  before deleting anything, and `OVER ALL TOTAL` archived verbatim (`docs/ARCHIVE.md`).
- **MTD figures are computed from the RAW rows** the archive run already holds, instead of
  re-reading the `MTD` tab — the tab could be caught blank mid-rebuild.
- **The archive refuses rather than damages**: an empty read, or a count/checksum mismatch,
  results in `VERIFICATION FAILED — WALANG BINURA AT WALANG TRIM`.
- **The sheet can shrink past a year**: on a mirror the archive moves the `IMPORTRANGE`
  window's start row past the archived months instead of deleting formula output — the goal
  the sheet could not previously meet at all. Gated by `ARCHIVE_TRIM` (on by default; a move
  is reversible) and per-plan `PLAN_SHEET_TRIM_ENABLED`, guarded by the checksum, a gap check
  and a post-write spill check (`docs/ARCHIVE.md`).
- **`generateMTDReport` writes its grid once**, so the report is never blank while it
  rebuilds, and a blank `RAW DATA` no longer wipes the previous one.
- **Accounts, sessions and maintenance mode** moved off the sheet and onto Supabase
  (`docs/DEVELOPER.md`).
- **The Developer console** reports the running build, the archived months, and per plan
  which months come from Supabase and which from the sheet.
- **Every user-facing string is professional English.**
- **Release automation**: a `v*` tag publishes a GitHub Release whose notes are the matching
  CHANGELOG section, and `package.json` is the single source of the version.
