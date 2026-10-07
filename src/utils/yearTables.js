/**
 * Year-to-date tables — what the year is measured against, and where each half comes from.
 *
 * Two sources, both keyed by plan, and neither of them the shared `YTD 2026` / `TARGET 2026`
 * worksheet the section used to read:
 *
 *   the plan    `sli_targets`: one row per plan x month x area, holding the target that month
 *               was asked for and the plan's own province order — the provinces the archive
 *               has never seen and the months still to come included. The worksheet was
 *               copied into it once (`supabase/seed-year-targets.sql`) and is never read again.
 *   the record  the app's own measurement of a month: `sli_monthly` for a closed month, and
 *               the live `MTD` tab for the one running.
 *
 * `buildYearTables` joins the two into the two blocks `computeYtd` takes — the plan's province
 * list and targets, the record's figures — and `computeYtd` only computes. It is pure,
 * deliberately: every defect found in this app so far has been arithmetic on real data, so the
 * maths is kept somewhere it can be called with fixed inputs and checked.
 *
 * See docs/YTD_SCOPING.md for why the plan is shaped this way, including the BIDA August
 * column that used to hold the August target rather than August's completions.
 */

import { ARCHIVE_AFTER_DAYS } from '../config/plans'

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

/**
 * Province keys have to survive a trailing space (`"Mountain Province "` in the year tabs the
 * plan was copied from, `"Mountain Province"` in the MTD tab) and inconsistent casing, because
 * these keys are what join the year's plan to the record.
 */
export function normalizeAreaKey(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

/** `SEP` → `Sep`, for the labels that face a reader. */
function monthAbbr(index) {
  const month = MONTHS[index] || ''
  return month ? month[0] + month.slice(1).toLowerCase() : ''
}

function sum(values) {
  return values.reduce((total, value) => total + (typeof value === 'number' ? value : 0), 0)
}

/**
 * `"August 2026"` → `{ monthIndex: 7, year: 2026 }`, or null.
 */
export function monthLabelParts(label) {
  const match = String(label || '').trim().match(/^([A-Za-z]+)\s+(\d{4})$/)
  if (!match) return null
  const monthIndex = MONTH_NAMES.findIndex((name) => name.toLowerCase() === match[1].toLowerCase())
  if (monthIndex < 0) return null
  return { monthIndex, year: Number(match[2]) }
}

/**
 * How far through the selected month the data reaches, 0–1, from a `"September 6, 2026"`
 * data label. Returns null when the date is not in the selected month, so the caller can
 * fall back to a conservative projection instead of inventing a fraction.
 */
export function monthProgress(dateLabel, monthYearLabel) {
  const parts = monthLabelParts(monthYearLabel)
  const match = String(dateLabel || '').trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/)
  if (!parts || !match) return null
  const dayIndex = MONTH_NAMES.findIndex((name) => name.toLowerCase() === match[1].toLowerCase())
  if (dayIndex !== parts.monthIndex || Number(match[3]) !== parts.year) return null
  const daysInMonth = new Date(parts.year, parts.monthIndex + 1, 0).getDate()
  return Math.min(Math.max(Number(match[2]) / daysInMonth, 0), 1)
}

/**
 * Which side of the split one province-month comes from: **the app's own record wins for any
 * month it holds** — the archived month in Supabase first, then the live `MTD` tab of a
 * running month — and `buildYearTables` puts no other figure in the block at all.
 *
 * The record side is the app's own measurement of that month, written at trim time and
 * immutable afterwards. Preferring the app's figure is the point of keeping an archive at all,
 * and since the shared worksheet left the data path there is no longer a second side for a
 * month the record holds.
 *
 * That is also what the third branch now means. `null` in a built block says "not reported",
 * not "zero", so a month no record covers reads 0 because nothing measured it — and the
 * provinces listed beside it are the ones that month's own record did not name.
 *
 * Making the worksheet the basis was tried and reverted. The mismatch that blamed the record
 * (SME's `MONTHLY PROGRESS` reading 174 where the worksheet said 465,023 for August) was never
 * a precedence problem: `buildOverrides` was feeding a **ticket count** into a series measured
 * in pesos. `recordValueFor` fixes that at the source — a collection-based plan contributes its
 * NET, and nothing at all when its row has no NET — so the record keeps its precedence and
 * SME's `2026-08` still cannot land in the wrong units: that archived row predates the MRC
 * columns, holds no NET, and contributes nothing.
 *
 * The month's source decides every province in it, not just the ones the record lists. A
 * province the record leaves out collected nothing that month, and reading another side's
 * figure anyway adds it to a month the record has already defined — which is how BIDA's
 * `2026-08` came to read 540. The archive was written from a twelve-province list with no
 * `Aurora`, so the tab's `Aurora` cell — the same 17 tickets the archive files under `Kalinga`
 * — was counted on top of the archive's own month. `covered` is that decision: the months the
 * record speaks for, whole.
 *
 * Which months those are is `buildMonthlyOverrides`' call, so a month the record holds but
 * cannot express in this plan's units (SME's `2026-08`, twelve ticket counts and no `NET`) is
 * not covered, and keeps the year's plan for its target.
 */
function actualCellRule(actualBlock, overrides, covered, key, index) {
  const override = overrides?.[index]?.[key]
  if (typeof override === 'number' && Number.isFinite(override)) return { value: override, fromRecord: true }
  if (covered.has(index)) return { value: 0, fromRecord: true }
  // Nothing else measures a month now, so this reads the block's own null — a month no row
  // covers. Read rather than assumed, so a figure the block does hold is never dropped.
  const claimed = actualBlock.areas[key]?.monthly?.[index]
  return { value: typeof claimed === 'number' ? claimed : 0, fromRecord: false }
}

/**
 * The target side of the same rule, over the archive's own monthly targets.
 *
 * A closed month's target is archived beside its figure (`sli_monthly`), and where the record
 * holds a month its targets win the way its figures do — a month is sourced once, never cell
 * by cell. Both sides cover the same months by construction: the rows come from one table, so
 * a month the record can state has a target beside its figure.
 *
 * A month the record cannot express — SME's August, whose rows predate the MRC columns —
 * contributes nothing here either, and keeps the plan's own target for that month rather than a
 * zero that would read as "no target was ever set".
 */
function targetCellRule(targetBlock, targetOverrides, coveredTargets, key, index) {
  const override = targetOverrides?.[index]?.[key]
  if (typeof override === 'number' && Number.isFinite(override)) return override
  if (coveredTargets.has(index)) return 0
  return targetBlock.areas[key]?.monthly?.[index] ?? 0
}

/**
 * The months the record speaks for, read off the overrides themselves.
 *
 * `buildOverrides` writes an entry for a month only when it found at least one figure this plan
 * can use, and leaves the month out entirely when it found none — SME's archived `2026-08` holds
 * twelve ticket counts and no `NET`, so it contributes nothing and the month keeps the year's
 * plan for its target. Deriving the set here rather than taking it from a second caller is what
 * keeps the two from disagreeing about which months have a record behind them.
 */
function coveredMonthsOf(overrides) {
  const covered = new Set()
  for (const [month, byArea] of Object.entries(overrides || {})) {
    if (Object.keys(byArea || {}).length > 0) covered.add(Number(month))
  }
  return covered
}

/**
 * The day a closed month becomes eligible for archiving: `afterDays` days into the month
 * after it, mirroring `archiveCutoff_` in the Apps Script. December rolls into the next
 * January, which is why this takes the year rather than assuming the one it is given.
 */
export function archiveDate(year, monthIndex, afterDays = ARCHIVE_AFTER_DAYS) {
  return new Date(year, monthIndex + 1, afterDays)
}

/**
 * The figure a plan's year-to-date actual is measured in.
 *
 * A collection-based plan (SME) is measured in money — `extractExecutiveMetrics` and
 * `computeAreaPace` both pace NET against the peso target — so its contribution has to be
 * NET as well. Reading `lastMtd` there drops a ticket count next to eleven months of pesos:
 * SME's archived `2026-08` row holds `last_mtd` 174 where the worksheet's August is
 * 465,023, which is the mismatch the `MONTHLY PROGRESS` strip was showing.
 *
 * A record row with no NET at all contributes nothing rather than its count. A month with no
 * figure is honest; a count standing in for pesos is not.
 */
function recordValueFor(area, collectionBased) {
  if (!collectionBased) return area?.lastMtd
  return Number.isFinite(area?.net) ? area.net : null
}

/**
 * Turn parsed MTD sections — the app's own record, live and archived — into the per-month
 * override map `computeYtd` expects:
 *
 *   { [monthIndex]: { [areaKey]: actual } }
 *
 * Only months in `year` are kept. This is the one place that decides what counts as "the
 * app's own record", so it lives here rather than inline in the component tree.
 *
 * @param {object}  sections  `mtdData.sections`, keyed by month label
 * @param {number}  [year]
 * @param {object}  [options]
 * @param {boolean} [options.collectionBased] the plan is measured in money (SME), so the
 *                                            override has to be its NET, not its count
 */
export function buildOverrides(sections, year, { collectionBased = false } = {}) {
  const out = {}
  for (const [label, section] of Object.entries(sections || {})) {
    const parts = monthLabelParts(label)
    if (!parts || (year != null && parts.year !== year)) continue
    const byArea = {}
    for (const area of section?.areas || []) {
      const value = recordValueFor(area, collectionBased)
      if (Number.isFinite(value)) byArea[normalizeAreaKey(area.area)] = value
    }
    if (Object.keys(byArea).length > 0) out[parts.monthIndex] = byArea
  }
  return out
}

/**
 * Turn the Monthly Progress record — `sli_monthly`, one row per closed month x area — into
 * the two maps `computeYtd` takes:
 *
 *   values   { [monthIndex]: { [areaKey]: delivered } }
 *   targets  { [monthIndex]: { [areaKey]: target } }
 *   sources  { [monthIndex]: 'archive' | 'worksheet' }   which read put the month there
 *
 * This is the table the strip would rather read for a past month: the figure and the target
 * in one row, written by the archive job the moment it writes `sli_mtd`, so the year-to-date
 * section no longer needs the `YTD 2026` / `TARGET 2026` worksheet to describe a closed
 * month. The live month comes from the record, the months still to come from the year's plan.
 *
 * A row is only usable in the plan's own units. `measure` travels with the row — `net` for
 * SME's collections, `count` for everyone else's tickets — and a row whose measure does not
 * match the plan is dropped whole, figure *and* target, so the month keeps the year's plan for
 * its target instead of being read in the wrong basis. That guard is what keeps SME's
 * `2026-08`, which was archived before the MRC columns existed, out of the year-to-date
 * figures instead of putting a 174 beside the worksheet's 465,023.
 *
 * @param {object[]} rows  `sli_monthly` rows for one plan
 * @param {object}   [options]
 * @param {number}   [options.year]             only months in this year are kept
 * @param {boolean}  [options.collectionBased]  the plan is measured in money (SME)
 * @returns {{ values: object, targets: object, sources: object }}
 */
export function buildMonthlyOverrides(rows, { year = null, collectionBased = false } = {}) {
  const measure = collectionBased ? 'net' : 'count'
  const values = {}
  const targets = {}
  // Where each month's row came from: the archive job's own projection of a month it
  // verified, or the backfill that copied a month out of the shared year tabs. Read from the
  // row rather than assumed, so the Developer console can say which — a month the tracker
  // measured and a month somebody's worksheet supplied are not the same claim. A month is
  // written whole by one side or the other (`supabase/seed-monthly-progress.sql` only touches
  // a month the plan cannot already read), so in practice every row of a month agrees.
  const sources = {}

  for (const row of rows || []) {
    if (String(row?.measure || '') !== measure) continue
    const parts = monthLabelParts(row.month_label)
    if (!parts || (year != null && parts.year !== year)) continue
    const key = normalizeAreaKey(row.area)
    if (!key) continue

    const value = Number(row.value)
    if (Number.isFinite(value)) {
      if (!values[parts.monthIndex]) values[parts.monthIndex] = {}
      values[parts.monthIndex][key] = value
      // 'worksheet' wins any disagreement: if any row of the month was copied out of the
      // tabs, the month is not wholly the tracker's own measurement.
      if (sources[parts.monthIndex] !== 'worksheet') {
        sources[parts.monthIndex] = String(row.source || '') === 'worksheet' ? 'worksheet' : 'archive'
      }
    }
    const target = Number(row.target)
    if (Number.isFinite(target)) {
      if (!targets[parts.monthIndex]) targets[parts.monthIndex] = {}
      targets[parts.monthIndex][key] = target
    }
  }

  return { values, targets, sources }
}

/**
 * The year's target plan, read out of `sli_targets`, in the block shape `computeYtd` takes.
 *
 * One row per plan x month x area. The province list and its order come out of the rows
 * themselves — `row_order` is the plan's own listing, and it is wider than the archive's: this
 * is how Cagayan, Kalinga and Apayao stay in the grid, and how `Aurora` keeps its place on a
 * plan whose year for that province is zero. A list built from the record alone would be the
 * archive's own provinces and nothing else.
 *
 * The annual target is the sum of the province's twelve rows — the figure the worksheet's
 * `TOTAL` column prints, and the one the seed generator refuses to differ from — and it is
 * written into `total` here rather than left for `computeYtd` to add up.
 *
 * That is not the same sum. Once the overrides are applied a month the record holds zeroes
 * every province the record does not list (`targetCellRule`), which is right for the month and
 * wrong for the year: FIBERX's `Aurora` is 0 for `JAN`–`JUL`, 95 in `AUG` — a month the archive
 * covers from a twelve-province list with no `Aurora` — and 83 a month from there, so the
 * plan's year is 429 while the effective series adds up to 334. The annual target is a fact
 * about the plan, so it is stated by the plan.
 *
 * @param {object[]} rows  `sli_targets` rows for one plan
 * @param {object}   options
 * @param {string}   options.planId
 * @param {number}   [options.year]  only months in this year are kept
 * @returns {null|object} null when the plan has no row in this year
 */
export function buildYearPlanTable(rows, { planId, year = null } = {}) {
  const order = []
  const names = {}
  const monthly = {}

  const table = [...(rows || [])].sort((a, b) => (a?.row_order ?? 0) - (b?.row_order ?? 0))
  for (const row of table) {
    const parts = monthLabelParts(row?.month_label)
    if (!parts || (year != null && parts.year !== year)) continue
    const key = normalizeAreaKey(row.area)
    if (!key) continue
    if (!monthly[key]) {
      names[key] = String(row.area || key).trim()
      order.push(key)
      monthly[key] = MONTHS.map(() => null)
    }
    const target = Number(row.target)
    if (Number.isFinite(target)) monthly[key][parts.monthIndex] = target
  }

  if (order.length === 0) return null

  return {
    year,
    months: MONTHS,
    // Shaped exactly like the target block `computeYtd` was handed when it came off the
    // worksheet — one block per plan under `plans` — so it cannot tell the difference.
    plans: {
      [planId]: {
        kind: 'target',
        order,
        areas: Object.fromEntries(order.map((key) => [key, {
          name: names[key],
          key,
          monthly: monthly[key],
          total: sum(monthly[key]),
        }])),
        overall: {
          monthly: MONTHS.map((_, index) => sum(order.map((key) => monthly[key][index] ?? 0))),
          total: null,
        },
      },
    },
  }
}

/**
 * The two blocks `computeYtd` takes, built out of the year's target plan and the app's own
 * record.
 *
 * Each half comes from the side that owns it:
 *
 *   provinces  the plan (`sli_targets`), in its own `row_order` — then any province the record
 *              names that the plan does not, so a mislabelled area shows up rather than
 *              vanishing
 *   targets    the plan, except for a month the record holds: a closed month's target was
 *              archived beside its figure (`sli_monthly`) and the two are read together, so a
 *              month is sourced once and never cell by cell
 *   figures    the record alone: `sli_monthly` for a closed month and the live `MTD` tab for
 *              the running one, which is also the only place the running month's target is
 *              carried
 *
 * `annualTargetsKnown` says which of the two things this is. Without the plan there is no
 * province list and no year to measure against, so the section is still built — every month the
 * record holds, plus the live month's own target off the `MTD` tab — and everything measured
 * against the year reports absent rather than partial (`computeYtd`). A plan with no plan table
 * and no record has nothing at all and returns null: an absent section is better than an empty
 * one.
 *
 * @param {object}   args
 * @param {string}   args.planId
 * @param {object[]} [args.rows]              `sli_monthly` rows for this plan
 * @param {object[]} [args.targetRows]        `sli_targets` rows for this plan
 * @param {object}   [args.sections]          `mtdData.sections` — the live `MTD` tab
 * @param {number}   [args.year]              only months in this year are kept
 * @param {boolean}  [args.collectionBased]   the plan is measured in money (SME)
 * @returns {null|{ actual: object, target: object, annualTargetsKnown: boolean }}
 */
export function buildYearTables({
  planId, rows = [], targetRows = [], sections = null, year = null, collectionBased = false,
}) {
  const measure = collectionBased ? 'net' : 'count'
  const plan = buildYearPlanTable(targetRows, { planId, year })
  const order = []
  const names = {}
  const actualMonthly = {}
  const targetMonthly = {}

  // The plan's own year per province, where it states one. Carried through to the block's
  // `total` rather than recomputed from the effective series, which the overrides can shorten
  // — see `buildYearPlanTable` on FIBERX's Aurora.
  const annualTargets = {}

  const claim = (key, name) => {
    if (!key || actualMonthly[key]) return
    names[key] = String(name || key).trim()
    order.push(key)
    actualMonthly[key] = MONTHS.map(() => null)
    targetMonthly[key] = MONTHS.map(() => null)
  }

  const monthOf = (row) => {
    const parts = monthLabelParts(row?.month_label)
    if (!parts || (year != null && parts.year !== year)) return null
    return parts.monthIndex
  }

  // The year's plan first, so the grid comes out in the plan's own order rather than in the
  // order the first archived month happened to list its provinces.
  const planBlock = plan?.plans?.[planId]
  for (const key of planBlock?.order || []) {
    claim(key, planBlock.areas[key].name)
    if (Number.isFinite(planBlock.areas[key].total)) annualTargets[key] = planBlock.areas[key].total
    for (let index = 0; index < MONTHS.length; index++) {
      const target = planBlock.areas[key].monthly[index]
      if (typeof target === 'number' && Number.isFinite(target)) targetMonthly[key][index] = target
    }
  }

  // `sli_monthly`: every closed month's figure, oldest month first, so a province only the
  // record names lands after the plan's own list.
  const table = [...rows].sort((a, b) => (
    String(a?.month_key || '').localeCompare(String(b?.month_key || ''))
    || (a?.row_order ?? 0) - (b?.row_order ?? 0)
  ))
  for (const row of table) {
    if (String(row?.measure || '') !== measure) continue
    if (String(row?.area || '').trim().toUpperCase() === 'OVER ALL TOTAL') continue
    const index = monthOf(row)
    if (index == null) continue
    const key = normalizeAreaKey(row.area)
    if (!key) continue
    claim(key, row.area)
    const value = Number(row.value)
    if (Number.isFinite(value)) actualMonthly[key][index] = value
    // The record's target for the month wins the way its figure does.
    const target = Number(row.target)
    if (Number.isFinite(target)) targetMonthly[key][index] = target
  }

  // The live `MTD` tab: provinces the table has not named, the running month's figure, and
  // its target — the one figure the record carries that `sli_monthly` never can.
  for (const [label, section] of Object.entries(sections || {})) {
    const index = monthOf({ month_label: label })
    if (index == null) continue
    for (const area of section?.areas || []) {
      const key = normalizeAreaKey(area?.area)
      if (!key) continue
      claim(key, area.area)
      const value = recordValueFor(area, collectionBased)
      if (Number.isFinite(value) && actualMonthly[key][index] == null) {
        actualMonthly[key][index] = value
      }
      if (Number.isFinite(area.target) && targetMonthly[key][index] == null) {
        targetMonthly[key][index] = area.target
      }
    }
  }

  if (order.length === 0) return null

  const block = (kind, monthly, totals = {}) => ({
    kind,
    order: [...order],
    areas: Object.fromEntries(order.map((key) => [key, {
      name: names[key],
      key,
      monthly: monthly[key],
      // The plan's own year where it states one; unknown (null) otherwise, which `computeYtd`
      // reads as "add up the months you were handed".
      total: totals[key] ?? null,
    }])),
    overall: {
      monthly: MONTHS.map((_, index) => sum(order.map((key) => monthly[key][index] ?? 0))),
      total: null,
    },
  })

  const shaped = (kind, monthly, totals = {}) => ({
    year,
    months: MONTHS,
    plans: { [planId]: block(kind, monthly, totals) },
  })

  return {
    planId,
    year,
    // True when the year itself is known: the annual targets, the months still to come and
    // the province list all come off the same plan table.
    annualTargetsKnown: planBlock != null,
    actual: shaped('completed', actualMonthly),
    target: shaped('target', targetMonthly, annualTargets),
  }
}

/**
 * Where each month of the Monthly Progress strip came from.
 *
 * The strip is a row of cells, one per month, and each cell has two figures that can come
 * from two different places: the month's delivered total, and the target under it. This
 * reports, month by month, which side supplied each, for the one row a reader actually looks
 * at first.
 *
 * It takes the computed year (`ytd`) rather than recomputing anything, so the figures shown
 * here are the strip's own and the two cannot drift apart. The attribution is read off the
 * same maps `computeYtd` was handed, in the same precedence order:
 *
 *   figure   the archived month in `sli_monthly`, else the record (the live `MTD` tab, or the
 *            archive's `sli_mtd` rows), else nothing at all
 *   target   the archived month in `sli_monthly` beside that figure, else the year's plan
 *            (`sli_targets`)
 *
 * The third figure state is not a source: it means no read carried the month, so the strip is
 * showing a zero nothing measured. It is named rather than folded in for that reason.
 *
 * A month reading `sli_monthly` says one more thing about itself, because the table says it:
 * whether the archive job wrote the month from rows it had just verified, or whether the
 * backfill copied it out of the year tabs (`source`). Both are the table speaking, and only
 * the first is the tracker's own measurement — so the second is named rather than folded in.
 *
 * Observation only — nothing reads this back, it is rendered in the Developer console.
 *
 * @param {object} args
 * @param {object} args.ytd             a `computeYtd` result, for the strip's own figures
 * @param {object} [args.overrides]     the record's figures, what `computeYtd` was given
 * @param {object} [args.monthly]       `buildMonthlyOverrides` output — the `sli_monthly` side
 * @param {number} [args.liveMonthIndex] the month the sheet is still serving, if known
 * @param {number} [args.year]
 * @returns {null|object} null when there is no year to report on
 */
export function summarizeMonthlyProgressSources({
  ytd, overrides = {}, monthly = {}, liveMonthIndex = null, year = null,
}) {
  if (!ytd?.overall?.series) return null

  const tableValues = monthly?.values || {}
  const tableTargets = monthly?.targets || {}
  const holds = (map, index) => Object.keys(map?.[index] || {}).length > 0

  const months = []
  for (let index = 0; index <= ytd.monthIndex; index++) {
    const fromTable = holds(tableValues, index)
    const fromRecord = holds(overrides, index)
    const source = fromTable ? 'monthly' : fromRecord ? 'record' : 'uncovered'
    months.push({
      index,
      label: MONTHS[index],
      name: MONTH_NAMES[index],
      // The strip's own cell: the delivered total and the target beneath it.
      value: ytd.overall.series.actual[index] ?? null,
      target: ytd.overall.series.target[index] ?? null,
      source,
      // Which read put the month in the table: the archive job's own projection, or the
      // backfill that copied it out of the year tabs.
      tableSource: fromTable ? (monthly?.sources?.[index] || 'archive') : null,
      // Where the record's month came from: only the live month is still on the sheet's
      // `MTD` tab, so any other month it holds is the archive's `sli_mtd` rows.
      recordVia: source === 'record' ? (index === liveMonthIndex ? 'live' : 'archive') : null,
      // The target under the cell: the archived one beside the figure, or the year's plan.
      targetSource: holds(tableTargets, index) ? 'monthly' : 'plan',
      live: index === liveMonthIndex,
    })
  }

  const count = (source) => months.filter((month) => month.source === source).length
  const backfilled = months.filter((month) => month.source === 'monthly' && month.tableSource === 'worksheet').length

  return {
    year,
    months,
    totals: {
      months: months.length,
      monthly: count('monthly'),
      record: count('record'),
      // Months neither side holds. They read as zero, which is the one thing about the strip
      // that is worth watching: a month the archive missed and the backfill never covered.
      uncovered: count('uncovered'),
      // Of the months the table holds, the ones the backfill copied out of the year tabs
      // rather than the ones the archive job measured itself.
      backfilled,
    },
  }
}

/**
 * The year-to-date position for one plan.
 *
 * Source rule, matching the rest of the app (docs/DATASOURCE.md): **the app's own record wins
 * for any month it holds** — the archived month in Supabase first, then the live `MTD` tab of
 * a running month — and the year's plan (`sli_targets`) supplies every target the record does
 * not, including the months still to come. `buildOverrides` decides what the record may
 * contribute, so a collection-based plan can only ever add pesos; see `actualCellRule` for why
 * that guard is what keeps the precedence safe.
 *
 * Both blocks are built by `buildYearTables` and neither is required to be complete: the
 * figures are the record's, the targets are the plan's, and the two are joined here.
 *
 * @param {object}   args
 * @param {object}   args.actual        the record's figures, as `buildYearTables` shaped them
 * @param {object}   args.target        the year's plan targets, same shape
 * @param {string}   args.planId
 * @param {number}   args.monthIndex    selected month, 0-based
 * @param {object}   [args.overrides]   `{ [monthIndex]: { [areaKey]: actual } }` from the
 *                                      live/archived MTD record
 * @param {object}   [args.targetOverrides] `{ [monthIndex]: { [areaKey]: target } }` from the
 *                                      archived Monthly Progress record (`sli_monthly`), so a
 *                                      closed month's target comes from the same source as
 *                                      its figure instead of the year's plan
 * @param {number}   [args.progress]    fraction of the selected month elapsed, 0–1
 * @param {boolean}  [args.annualTargetsKnown] false when the annual targets are not available
 *                                      — the year's plan (`sli_targets`) could not be read, so
 *                                      the section was built from the record alone. Everything
 *                                      measured against the year then reports absent (`null`)
 *                                      rather than measured against the months the record
 *                                      happens to hold; the plan-to-date yardstick is
 *                                      unaffected and still shown.
 * @returns {null|object} null when the plan has no block in either source
 */
export function computeYtd({ actual, target, planId, monthIndex, overrides = {}, targetOverrides = {}, progress = null, annualTargetsKnown = true }) {
  const actualBlock = actual?.plans?.[planId]
  const targetBlock = target?.plans?.[planId]
  if (!actualBlock || !targetBlock) return null
  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) return null

  // Target order first — it is the full province list, and it is the one the plan is
  // written in. Anything the record adds on its own is appended.
  const order = [...new Set([...targetBlock.order, ...actualBlock.order])]
  const closedRecordMonths = new Set()
  const covered = coveredMonthsOf(overrides)

  const targetCovered = coveredMonthsOf(targetOverrides)

  const actualFor = (key, index) => actualCellRule(actualBlock, overrides, covered, key, index)
  const targetFor = (key, index) => targetCellRule(targetBlock, targetOverrides, targetCovered, key, index)

  /**
   * Build one row (a province, or the overall roll-up) from full 12-month series. Only the
   * months up to and including the selected one count towards anything; later months are
   * kept for the month strip.
   */
  const buildRow = (key, name, seriesActual, seriesTarget, annualTarget) => {
    const through = seriesActual.slice(0, monthIndex + 1)
    const targetThrough = seriesTarget.slice(0, monthIndex + 1)

    const ytd = sum(through)
    const planToDate = sum(targetThrough)
    // The verdict is judged on *finished* months only, so a province is not called
    // "behind" on the 2nd of the month for not having delivered the whole month yet.
    const completedActual = sum(seriesActual.slice(0, monthIndex))
    const completedTarget = sum(seriesTarget.slice(0, monthIndex))
    const completedMonths = monthIndex

    const monthsAfter = 11 - monthIndex
    const currentActual = through[monthIndex] ?? 0
    const currentTarget = targetThrough[monthIndex] ?? 0
    const currentRemaining = Math.max(currentTarget - currentActual, 0)
    // Absent, not zero: without the annual targets a "remaining" is the distance to a figure
    // nobody stated, and a "% of target" can read as 100% of a year that has two months left.
    const remaining = annualTargetsKnown ? Math.max(annualTarget - ytd, 0) : null
    const remainingAfterCurrent = annualTargetsKnown ? Math.max(annualTarget - ytd - currentRemaining, 0) : null
    const requiredPerMonth = annualTargetsKnown && monthsAfter > 0 ? remainingAfterCurrent / monthsAfter : null

    const pct = annualTargetsKnown && annualTarget > 0 ? (ytd / annualTarget) * 100 : null
    const pctOfPlan = planToDate > 0 ? (ytd / planToDate) * 100 : null
    const deficit = planToDate - ytd

    // Average over finished months when there are any — the selected month is partial, so
    // including it would drag the rate down and understate the year-end figure.
    const paceMonthly = completedMonths > 0 ? completedActual / completedMonths : ytd / (monthIndex + 1)
    const monthsAhead = monthsAfter + (progress != null ? Math.max(1 - progress, 0) : 0)
    const projected = ytd + paceMonthly * monthsAhead
    const projectedPct = annualTargetsKnown && annualTarget > 0 ? (projected / annualTarget) * 100 : null

    // The verdict needs a denominator. A province whose target has not started yet — BIDA's
    // Aurora is 0 for JAN–AUG and 26/28/25/26 from SEP on — cannot be on pace or behind, and
    // guessing either would be a lie. So say why instead of leaving a bare dash, which reads
    // as "missing data" rather than "nothing to judge yet".
    let pace = null
    let paceNote = null
    if (annualTarget <= 0) paceNote = 'No target'
    else if (completedMonths === 0) paceNote = 'Too early'
    else if (completedTarget <= 0) paceNote = `Starts ${monthAbbr(monthIndex)}`
    else {
      pace = completedActual >= completedTarget ? 'on-pace'
        : completedActual >= completedTarget * 0.8 ? 'behind'
          : 'critical'
    }

    return {
      key,
      name,
      ytd,
      planToDate,
      annualTarget,
      remaining,
      deficit,
      pct,
      pctOfPlan,
      // Whether there was a whole-year target to measure `pct`, `remaining` and
      // `requiredPerMonth` against. False means those three are absent on purpose.
      annualTargetKnown: annualTargetsKnown,
      currentActual,
      currentTarget,
      currentRemaining,
      requiredPerMonth,
      remainingAfterCurrent,
      completedActual,
      completedTarget,
      completedMonths,
      paceMonthly,
      projected,
      projectedPct,
      pace,
      // Why there is no `pace`, when there isn't one. Rendered in place of the verdict.
      paceNote,
      series: {
        actual: seriesActual.slice(0, monthIndex + 1),
        target: seriesTarget,
      },
    }
  }

  const areas = order.map((key) => {
    const name = targetBlock.areas[key]?.name || actualBlock.areas[key]?.name || key
    const seriesActual = MONTHS.map((_, index) => actualFor(key, index).value)
    for (let index = 0; index < monthIndex; index++) {
      if (actualFor(key, index).fromRecord) closedRecordMonths.add(index)
    }
    const seriesTarget = MONTHS.map((_, index) => targetFor(key, index))
    const annualTarget = targetBlock.areas[key]?.total ?? sum(seriesTarget)
    return buildRow(key, name, seriesActual, seriesTarget, annualTarget)
  })

  const overallSeriesActual = MONTHS.map((_, index) => sum(areas.map((area) => area.series.actual[index] ?? 0)))
  const overallSeriesTarget = MONTHS.map((_, index) => sum(areas.map((area) => area.series.target[index] ?? 0)))
  const overall = buildRow(
    'overall',
    'OVER ALL TOTAL',
    overallSeriesActual,
    overallSeriesTarget,
    sum(areas.map((area) => area.annualTarget)),
  )

  return {
    planId,
    year: actual.year ?? target.year ?? null,
    monthIndex,
    monthsAfter: 11 - monthIndex,
    months: MONTHS,
    areas,
    overall,
    // Months whose figure came from the record — surfaced in the UI, because that is the
    // difference between "somebody's cell says so" and "the tracker measured it". A month
    // the record holds is the tracker's own; every figure in the grid is, now that the
    // worksheet is out of the data path, and this is what says so.
    closedRecordMonths: [...closedRecordMonths].sort((a, b) => a - b),
    annualTargetKnown: annualTargetsKnown,
    progress,
  }
}
