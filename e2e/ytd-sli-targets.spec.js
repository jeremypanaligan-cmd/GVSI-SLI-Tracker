/**
 * End-to-end smoke test against the deployed app.
 *
 * What it is for: the Year-to-Date section was changed to take the year's targets and the
 * province list from Supabase (`sli_targets`) and to stop reading the `YTD 2026` /
 * `TARGET 2026` tabs at all — and every check of that change was made by reading the source
 * and rendering components on a server, because the dashboard sits behind a sign-in gate.
 * Nobody had driven the real thing in a browser. This does.
 *
 * Two tests, and the split is deliberate:
 *
 *   · one needs no account — it proves the deploy loads, the version gate lets the current
 *     build through, and the sign-in RPC is reachable and refusing a bad password. It is the
 *     part that can always run, on a fresh clone, with no secrets configured.
 *   · one signs in for real and checks the section against the database. It skips, with a
 *     reason, when no account is configured — a missing secret should not read as a failure.
 *
 * The signed-in test asserts provenance, not just numbers: the app must have read
 * `sli_targets` for the active plan, it must never touch either retired tab, and the figures
 * it renders must be the ones the database holds — computed here from `sli_targets` at run
 * time, so a corrected target does not have to be typed into the test as well.
 */
import { test, expect } from '@playwright/test'
import { DEFAULT_PLAN } from '../src/config/plans.js'
import {
  APP_URL,
  YTD_YEAR,
  credentials,
  fetchYearPlan,
  isRetiredTabUrl,
  maintenanceIsOn,
  monthKeyForIndex,
  toNumber,
} from './support/tracker.js'

/** The desktop view the section lives in, and the heading it renders under. */
const YTD_HEADING = { name: 'Year-to-Date', exact: true }

/**
 * Where every request the page made is kept.
 *
 * The retired tabs are the point: a request is the only place a source that has been removed
 * from the dashboard would still show up, because the section would keep rendering correctly
 * off the worksheet while it happened.
 */
function recordRequests(page) {
  const urls = []
  page.on('request', (request) => urls.push(request.url()))
  return urls
}

/**
 * Every read of one Supabase table, with its parsed body.
 *
 * The body is captured rather than only the URL because the app reads `sli_targets` as one
 * payload per plan — so the row count in the response is what proves the section was built
 * from the plan table instead of falling back to the tracker's own record.
 */
function recordRestReads(page, table) {
  const reads = []
  page.on('response', (response) => {
    const url = response.url()
    if (!url.includes(`/rest/v1/${table}`)) return
    const entry = { url, status: response.status(), rows: null }
    reads.push(entry)
    response
      .json()
      .then((body) => {
        if (Array.isArray(body)) entry.rows = body
      })
      .catch(() => {})
  })
  return reads
}

/**
 * The Year-to-Date section itself. `first()` because the section is matched by the heading it
 * contains, and an ancestor that also wraps it would otherwise match too — the outermost
 * match still contains the strip and the cards, so the reads below are the same either way.
 */
function ytdSection(page) {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', YTD_HEADING) })
    .first()
}

test('the deploy loads and the sign-in gate holds', async ({ page }) => {
  const requests = recordRequests(page)

  await page.goto(APP_URL)

  // The version gate is above the auth provider, so the login form appearing at all is also
  // the deploy saying it is the current build.
  const username = page.getByPlaceholder('e.g. JSP')
  await expect(username).toBeVisible()
  await username.fill('__e2e_smoke_no_such_account__')
  await page.locator('input[type="password"]').fill('not-the-password')
  await page.getByRole('button', { name: 'Sign in' }).click()

  // `verify_login` returns no rows for a mismatch and counts nothing, so a wrong password is
  // a safe thing to ask for — and the answer has to be the one that says the gate held.
  await expect(page.getByRole('alert')).toHaveText('Invalid username or password.')
  await expect(page.getByRole('heading', YTD_HEADING)).toHaveCount(0)

  expect(
    requests.filter((url) => url.includes('/rest/v1/rpc/verify_login')),
    'sign-in should be verified by the RPC, not in the browser alone',
  ).not.toHaveLength(0)
  expect(
    requests.filter(isRetiredTabUrl),
    'nothing may read the retired YTD 2026 / TARGET 2026 tabs',
  ).toHaveLength(0)
})

test('the Year-to-Date section is built from sli_targets', async ({ page, request }) => {
  const { username, password } = credentials()
  test.skip(
    !username || !password,
    'Set E2E_USERNAME and E2E_PASSWORD (or a gitignored .env.e2e) to run the signed-in checks.',
  )

  // Maintenance blocks everyone but a Developer, and this account may be either — a window
  // would fail the run for a reason that says nothing about sli_targets.
  if (await maintenanceIsOn(request)) {
    test.skip(true, 'Maintenance mode is on, so the dashboard is gated for this account.')
  }

  const requests = recordRequests(page)
  const targetReads = recordRestReads(page, 'sli_targets')

  await page.goto(APP_URL)
  await page.getByPlaceholder('e.g. JSP').fill(username)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()

  // Either the dashboard replaces the sign-in screen, or an alert says why it did not.
  // Waiting for the heading alone would turn a refused sign-in into a two-minute timeout.
  const refused = page.getByRole('alert')
  const section = ytdSection(page)
  const signInState = async () => {
    if (await refused.isVisible().catch(() => false)) return 'refused'
    if (await section.isVisible().catch(() => false)) return 'dashboard'
    return 'waiting'
  }
  await expect
    .poll(signInState, { timeout: 90_000, message: 'the sign-in screen never resolved' })
    .not.toBe('waiting')
  if ((await signInState()) === 'refused') {
    throw new Error(`Sign-in was refused: ${(await refused.innerText()).trim()}`)
  }
  await expect(section).toBeVisible()

  // ── What the database holds, read independently of the app ─────────────────
  //
  // The default plan is what a fresh profile opens on, so that is the plan the section is
  // showing. If that ever stops being true the figures below stop matching, loudly.
  const plan = await fetchYearPlan(request, DEFAULT_PLAN)
  expect(plan.rowCount, `${DEFAULT_PLAN} should hold a row per month x province`).toBe(
    plan.months.length * plan.areas.length,
  )
  expect(plan.months.length, 'the year plan should cover twelve months').toBe(12)
  expect(plan.annualTotal, 'sli_targets should hold a year of targets').toBeGreaterThan(0)

  // ── The section was built from that table ─────────────────────────────────
  const reads = targetReads.filter((read) => read.url.includes(`plan=eq.${DEFAULT_PLAN}`))
  expect(
    reads.length,
    `the app should have read sli_targets for ${DEFAULT_PLAN}`,
  ).toBeGreaterThan(0)
  expect(reads[0].status, `sli_targets read answered ${reads[0].status}`).toBe(200)
  await expect
    .poll(() => reads[0].rows?.length ?? 0, { timeout: 15_000 })
    .toBe(plan.rowCount)

  expect(
    requests.filter(isRetiredTabUrl),
    'the section must not read the retired YTD 2026 / TARGET 2026 tabs',
  ).toHaveLength(0)

  // ── And the figures on screen are that table's ────────────────────────────
  await expect(section).not.toContainText('could not be read')

  const titles = await section.evaluate((node) =>
    [...node.querySelectorAll('button[title]')]
      .map((button) => button.getAttribute('title'))
      .filter((title) => /^[A-Z][a-z]{2} · /.test(title)),
  )
  expect(titles, 'the Monthly Progress strip should hold a cell per month').toHaveLength(12)

  // A month that has not been reached has no record and no override, so its target can only
  // have come from the year plan — which is the claim being tested.
  //
  // A closed month is deliberately not asserted, because the tracker's own record wins for it
  // and its cell is allowed to disagree with the plan. August 2026 is the case in hand: the
  // plan holds 2,048 for that month and the strip reads 1,953, because the archive covers it
  // from a twelve-province list with no Aurora, whose August target is 95. Asserting all
  // twelve cells would fail on the difference the app is right to show — see the stated-annual
  // note in docs/YTD_SCOPING.md.
  const future = titles
    .map((title, index) => ({ title, index, match: title.match(/· target ([\d,]+), not yet reached$/) }))
    .filter((cell) => cell.match)
  expect(future.length, 'the year should still have months ahead of it').toBeGreaterThan(0)

  for (const { title, index, match } of future) {
    const key = monthKeyForIndex(index, YTD_YEAR)
    expect(
      toNumber(match[1]),
      `"${title}" should be the ${key} target in sli_targets`,
    ).toBe(plan.byMonth[key])
  }

  const annualLabel = await section.evaluate((node) => {
    const label = [...node.querySelectorAll('p')].find(
      (element) => element.textContent.trim() === 'Annual Target',
    )
    if (!label) return null
    const card = label.parentElement
    const value = card?.querySelector('span')
    return value ? value.textContent.trim() : null
  })
  expect(annualLabel, 'the Annual Target card should be on screen').not.toBeNull()
  expect(
    toNumber(annualLabel),
    'the Annual Target card should be the year plan, added up',
  ).toBe(plan.annualTotal)
})
