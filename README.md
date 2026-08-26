# GVSI SLI Tracker

A lightweight Progressive Web App (PWA) that tracks Service Line Installation (SLI) daily data from a public Google Sheet.

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

## Data Source

Google Sheet: [GVSI SLI Tracking](https://docs.google.com/spreadsheets/d/1C12JsfTZk_5P-yZ7oJliTrE0xl22PPeVVJMQQOzOYVs/edit?gid=331762489#gid=331762489)

Data is fetched via the CSV export endpoint (gid=331762489).
