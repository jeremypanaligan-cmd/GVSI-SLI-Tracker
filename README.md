# GVSI SLI Tracker

A lightweight Progressive Web App (PWA) that tracks Service Line Installation (SLI) daily data from public Google Sheets.

## Features

- **Live Data** — Fetches SLI tracking data directly from Google Sheets CSV export
- **Grouped Layout** — Data grouped by Cluster (1–4) and Area with subtotals
- **Color-Coded Badges** — Achievement rates highlighted:
  - 🟢 **Green** — ≥100% (Target Hit)
  - 🟡 **Amber** — 80–99.9% (Lagging)
  - 🔴 **Red** — <80% (Critical)
- **Offline Support** — Service Worker caches data for offline viewing
- **Responsive** — Works on desktop, tablet, and mobile
- **Dark Theme** — Slate/Cyan high-contrast design

## Quick Start

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Tech Stack

- React 18 + Vite
- Tailwind CSS 3
- Vanilla CSV parser (no external deps)
- Service Worker for offline caching
- localStorage for data persistence

## Data Sources

Each plan has its own Google Sheet for daily tracking, plus one shared database for
cross-plan data. Sheets are read through the CSV export endpoint, from URLs declared in
`src/config/plans.js`:

| Spreadsheet | Holds |
|-------------|-------|
| [SLI TRACKER Database](https://docs.google.com/spreadsheets/d/1PGB2Mmo5Ka2NBfrlJWIF3V_X3Kxm6jepT5-eEYOC9bs/edit) *(shared)* | `COMPLETED AGING REPORT`, `FIBERX/BIDA/SME DATA` |
| [FIBERX SLI Tracker DB](https://docs.google.com/spreadsheets/d/1UUd8cpfKeOCBHANx9wmM7l1apFyDoZRv0dHZa2_bVr0/edit) | `FIBERX NEW REPORT`, `RAW DATA`, `MTD` |
| [BIDA SLI Tracker DB](https://docs.google.com/spreadsheets/d/1FrEowZ9Zl0jMAyLDe4OZE2cQV04nIz-rjRkLi6uv99M/edit) | `BIDA NEW REPORT`, `RAW DATA`, `MTD` |
| [SME SLI Tracker DB](https://docs.google.com/spreadsheets/d/10P3GatvwC76IujPpjHtqgyNjE71ChAoP_8Ln7BDcvTY/edit) | `SME NEW REPORT`, `RAW DATA`, `MTD` |

**Supabase** (`src/config/supabase.js`) is the second source and holds two things:

- the **cold archive** — a finished month is copied there and purged from the sheet, so the
  spreadsheets stop growing forever. The app merges the archived months back in, so past-month
  figures keep working. See **[Cold archive](docs/ARCHIVE.md)**.
- **accounts, sessions, presence and the maintenance switch** — see
  **[Accounts and the Developer console](docs/DEVELOPER.md)**.

Which source each screen reads, and which cache key it lands in, is listed in
**[Data Sources](docs/DATASOURCE.md)**.

## Access (Login)

The dashboard sits behind a username/password screen. Accounts live in the `sli_users` table
of the Supabase project (`username`, `password_hash`, `full_name`, `role`, `is_active`), and
the password is verified **inside Postgres** by the `verify_login` function — the app sends the
SHA-256 of what was typed and never sees a stored hash. A successful sign-in opens a session
row and returns a token.

A session lasts 30 days on the device, or 12 hours when "Keep me signed in" is off. Sign out
from the desktop navbar utility group or the mobile ⋮ menu.

Users with `role = Developer` get a **Developer console** — who is signed in right now and for
how long, recent sessions, and a **maintenance mode** switch that blocks everyone else. See
**[Accounts and the Developer console](docs/DEVELOPER.md)**.

> **⚠️ Still a convenience gate, not security.** The check runs in the browser and the dashboard
> data comes from public sheet exports, so anyone willing to edit the JavaScript can bypass it —
> and maintenance mode is a coordination tool, not an access control. What did change: password
> hashes are no longer downloadable (the old `Login Credentials` tab was link-shared), the role
> is checked server-side for Developer actions, and sessions can be revoked.
>
> Change the migrated passwords: the old hashes were publicly readable, and the scheme is
> unsalted SHA-256.

## Documentation

- **[Data Pipeline](docs/DATA_PIPELINE.md)** — how `NEW REPORT` becomes `RAW DATA` and `MTD`
  through Apps Script, the `CONFIG` tab for retired areas, and why a **Full Sync** is required
  after editing the sheet.
- **[Data Sources](docs/DATASOURCE.md)** — which spreadsheet tab or Supabase table every screen
  reads from, and how each source is cached and refreshed.
- **[Cold archive](docs/ARCHIVE.md)** — moving a finished month to Supabase, the verification
  gate, and how to run or roll back an archive.
- **[Accounts and the Developer console](docs/DEVELOPER.md)** — roles, sessions, presence,
  maintenance mode and what the public anon key can and cannot reach.
- **[Roadmap](docs/ROADMAP.md)** — known upgrades that are not built yet, with the evidence
  for each, ordered by what is worth doing first.
- **[CHANGELOG](CHANGELOG.md)** — release notes.

## Releasing

Bump `version` in `package.json` — that is the only change needed. At dev/build time it
drives everything else:

- the injected `__APP_VERSION__` in app code (e.g. the service worker registration URL)
- the service worker cache names, read by `public/sw.js` from its own `?v=` query
- the `{{VERSION}}` placeholder in `public/manifest.json` (icon cache-buster)
- the versioned data-cache keys, plus the sweep that retires the previous version
- **`version.json`**, written next to `manifest.json` at build time — the file the running
  app compares itself against before it lets anyone in

Nothing else has to be kept in sync by hand.

### The update gate

`version.json` is fetched on every launch (and whenever the app returns to the foreground)
with `cache: 'no-store'` and a unique query, so no cache layer can answer it. If the version
it holds is not the one the device is running, **the app does not start**: it shows an
"Update required" screen whose only way forward is to unregister the service worker, drop
the caches and reload onto the new build. The login form is behind that gate on purpose —
a stale bundle is what breaks sign-in, because it points at the previous credentials source.

Two properties keep the gate from becoming its own outage: an unreachable or absent
`version.json` counts as "cannot tell" and never blocks, and only a **known** different
version blocks. See `src/utils/appUpdate.js` for the reasoning.

> The release that first ships this gate cannot gate itself: devices still on the previous
> build have no gate to show. Those users need one manual refresh, and every release after
> that is covered.
