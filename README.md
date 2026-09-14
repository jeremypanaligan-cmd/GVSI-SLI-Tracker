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
cross-plan data. All are read through the CSV export endpoint, from URLs declared in
`src/config/plans.js`:

| Spreadsheet | Holds |
|-------------|-------|
| [SLI TRACKER Database](https://docs.google.com/spreadsheets/d/1PGB2Mmo5Ka2NBfrlJWIF3V_X3Kxm6jepT5-eEYOC9bs/edit) *(shared)* | `Login Credentials`, `COMPLETED AGING REPORT`, `FIBERX/BIDA/SME DATA` |
| [FIBERX SLI Tracker DB](https://docs.google.com/spreadsheets/d/1UUd8cpfKeOCBHANx9wmM7l1apFyDoZRv0dHZa2_bVr0/edit) | `FIBERX NEW REPORT`, `RAW DATA`, `MTD` |
| [BIDA SLI Tracker DB](https://docs.google.com/spreadsheets/d/1FrEowZ9Zl0jMAyLDe4OZE2cQV04nIz-rjRkLi6uv99M/edit) | `BIDA NEW REPORT`, `RAW DATA`, `MTD` |
| [SME SLI Tracker DB](https://docs.google.com/spreadsheets/d/10P3GatvwC76IujPpjHtqgyNjE71ChAoP_8Ln7BDcvTY/edit) | `SME NEW REPORT`, `RAW DATA`, `MTD` |

Which tab each screen reads, and which cache key it lands in, is listed in
**[Data Sources](docs/DATASOURCE.md)**.

## Access (Login)

The dashboard sits behind a username/password screen. Credentials live in the
**`Login Credentials`** tab of the shared **SLI TRACKER Database**
(`Username | PasswordHash | FullName | Role`, where the hash is the lowercase SHA-256 hex of
the password) and are verified in the browser.
A session lasts 30 days on the device, or 12 hours when "Keep me signed in" is off. Sign out
from the desktop navbar utility group or the mobile ⋮ menu.

> **⚠️ This is a convenience gate, not security.** The credentials tab is publicly readable
> through the CSV export, the hashes carry no salt or key stretching, and the check runs in the
> browser — so it can be bypassed, and its hashes can be brute-forced offline. Don't put
> anything sensitive behind it.

## Documentation

- **[Data Pipeline](docs/DATA_PIPELINE.md)** — how `NEW REPORT` becomes `RAW DATA` and `MTD`
  through Apps Script, the `CONFIG` tab for retired areas, and why a **Full Sync** is required
  after editing the sheet.
- **[Data Sources](docs/DATASOURCE.md)** — which spreadsheet tab every screen reads from, and
  how each source is cached and refreshed.
- **[CHANGELOG](CHANGELOG.md)** — release notes.

## Releasing

Bump `version` in `package.json` — that is the only change needed. At dev/build time it
drives everything else:

- the injected `__APP_VERSION__` in app code (e.g. the service worker registration URL)
- the service worker cache names, read by `public/sw.js` from its own `?v=` query
- the `{{VERSION}}` placeholder in `public/manifest.json` (icon cache-buster)
- the versioned data-cache keys, plus the sweep that retires the previous version

Nothing else has to be kept in sync by hand.
