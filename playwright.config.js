import { defineConfig, devices } from '@playwright/test'
import { APP_URL, loadEnvFile } from './e2e/support/tracker.js'

/**
 * Playwright, pointed at the deployed app rather than a dev server.
 *
 * There is no `webServer` block on purpose. The gap this suite closes is that the dashboard
 * was only ever checked by reading its source and rendering it on a server — the sign-in gate
 * meant nobody had driven the real thing in a browser. A local Vite server would re-open that
 * gap: it serves a bundle this machine just built, while the claims worth testing are about
 * what GitHub Pages is serving right now, behind the real `verify_login` RPC.
 *
 * Point it somewhere else with E2E_BASE_URL (a preview deploy, a fork's Pages site):
 *
 *   npm run test:e2e
 *   E2E_BASE_URL=https://jeremypanaligan-cmd.github.io/GVSI-SLI-Tracker/ npm run test:e2e
 *
 * The signed-in test needs a real account — see `e2e/support/tracker.js` for where the
 * credentials come from and why they are not in the repository.
 */

// Loaded here as well as lazily by `credentials()`, so the base URL can come from the same
// gitignored file. Both calls are idempotent, and a worker inherits what this process set.
loadEnvFile()

export default defineConfig({
  testDir: './e2e',

  // One at a time. A sign-in opens a session row and shows the account in the Developer
  // roster, and the panel's tallies are per tab — two workers would be two browsers signing
  // in as the same person at the same moment for no gain.
  fullyParallel: false,
  workers: 1,

  // A smoke test that retries hides exactly the flakiness it exists to surface. Live data
  // moves; a failure here is worth reading, not worth re-running past.
  retries: 0,
  forbidOnly: !!process.env.CI,

  // The first load of a fresh profile pulls the plan's CSV exports from Google Sheets, and
  // the dashboard does not render until they land.
  timeout: 120_000,

  // A generous expect timeout, because most of these assertions wait on a network read
  // rather than on an animation.
  expect: { timeout: 30_000 },

  reporter: process.env.CI ? [['list'], ['github']] : [['list']],

  use: {
    baseURL: APP_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    // The desktop navbar (md+) is where the view tabs and the signed-in name live; the
    // phone layout hides the name and folds the actions into a menu.
    viewport: { width: 1280, height: 900 },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],
})
