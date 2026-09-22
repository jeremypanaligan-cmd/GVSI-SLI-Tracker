/**
 * Year-to-date tables — the `YTD 2026` and `TARGET 2026` tabs of the shared workbook.
 *
 * Both tabs hold a block per plan, one province per row, one month per column:
 *
 *   BIDA YTD COMPLETED 2026,,,,,,,,,,,,,
 *   PROVINCE,JAN,FEB,…,DEC,TOTAL
 *   Benguet,34,59,…
 *   …
 *   TOTAL,761,994,…
 *   (blank rows)
 *   FIBERX YTD COMPLETED 2026
 *   …
 *
 * The block title and the month header can also arrive on the same row — Google's gviz
 * view of the same tab renders it that way — so nothing here assumes which row carries
 * what. Find the row that names the months, and the block above it is the plan.
 *
 * `parseYearTable` only parses; `computeYtd` only computes. Both are pure, deliberately:
 * every defect found in this app so far has been arithmetic on real spreadsheets, so the
 * maths is kept somewhere it can be called with fixed inputs and checked.
 *
 * See docs/YTD_SCOPING.md for what these sheets contain, including the BIDA August column
 * that holds the August target rather than August's completions.
 */

import { parseCSV } from './csvParser'
import { ARCHIVE_AFTER_DAYS } from '../config/plans'

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

/** `BIDA YTD COMPLETED 2026` / `FIBERX YTD TARGET 2026` — the block title. */
const BLOCK_TITLE = /^(BIDA|FIBERX|SME)\s+YTD\s+(COMPLETED|TARGET)\b/i

/**
 * Province keys have to survive a trailing space (`"Mountain Province "` in both tabs,
 * `"Mountain Province"` in the MTD tab) and inconsistent casing, because these keys are
 * what join the two year tabs to the live month.
 */
export function normalizeAreaKey(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function num(cell) {
  if (cell === null || cell === undefined) return null
  const s = String(cell).replace(/[,\s]/g, '')
  if (s === '') return null
  const value = Number(s)
  return Number.isFinite(value) ? value : null
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
 * Parse one of the year tabs.
 *
 * @param {string} csvText - the raw CSV export
 * @returns {null|{
 *   year: number|null,
 *   plans: { [planId]: {
 *     kind: 'completed'|'target',
 *     order: string[],
 *     areas: { [key]: { name: string, key: string, monthly: (number|null)[], total: number|null } },
 *     overall: { monthly: (number|null)[], total: number|null } | null,
 *   } }
 * }}
 */
export function parseYearTable(csvText) {
  if (!csvText || !csvText.trim()) return null

  // The shared parser, not a split on commas: the export quotes some fields, and a
  // quoted total with a thousands separator would otherwise split into two cells.
  const rows = parseCSV(csvText).allRows || []

  const plans = {}
  let year = null
  let current = null
  let monthCols = null // month index → column index
  let totalCol = -1

  for (const cells of rows) {
    if (!cells.some((cell) => cell !== '')) continue

    const first = cells[0] || ''

    const title = first.match(BLOCK_TITLE)
    if (title) {
      current = {
        kind: title[2].toLowerCase() === 'target' ? 'target' : 'completed',
        order: [],
        areas: {},
        overall: null,
      }
      plans[title[1].toLowerCase()] = current
      const titleYear = Number(first.match(/(\d{4})\s*$/)?.[1])
      if (year == null && Number.isFinite(titleYear)) year = titleYear
      monthCols = null
      totalCol = -1
    }

    // Header row — the one that names the months. May be the block title's own row.
    if (cells.includes('JAN') || cells.includes('DEC')) {
      monthCols = MONTHS.map((month) => cells.indexOf(month))
      totalCol = cells.indexOf('TOTAL')
      continue
    }

    if (!current || !monthCols) continue
    if (first === '') continue

    const rowData = {
      monthly: monthCols.map((col) => (col >= 0 ? num(cells[col]) : null)),
      total: totalCol >= 0 ? num(cells[totalCol]) : null,
    }

    if (first.toUpperCase() === 'TOTAL') {
      current.overall = rowData
      continue
    }

    const key = normalizeAreaKey(first)
    if (!key) continue
    current.areas[key] = { name: first, key, ...rowData }
    if (!current.order.includes(key)) current.order.push(key)
  }

  if (Object.keys(plans).length === 0) return null
  return { year, months: MONTHS, plans }
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
 * Which side of the split one province-month comes from: the app's own record (the live
 * MTD section of a running month, or an archived one) wins, and the `YTD 2026` worksheet
 * fills anything the record does not hold.
 *
 * One definition on purpose. `computeYtd` uses it to decide what to display and
 * `summarizeWorksheetDependency` uses it to report on what was displayed, so the two can
 * never disagree about what "the worksheet supplied this" means.
 */
function actualCellRule(actualBlock, overrides, key, index) {
  const override = overrides?.[index]?.[key]
  if (typeof override === 'number' && Number.isFinite(override)) return { value: override, fromRecord: true }
  const value = actualBlock.areas[key]?.monthly?.[index]
  return { value: typeof value === 'number' ? value : 0, fromRecord: false }
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
 * Who supplies the year-to-date actuals: the tracker's own record, or the `YTD 2026`
 * worksheet?
 *
 * The dashboard cannot answer this — an actual is an actual, whichever tab it came from —
 * yet the answer decides whether a figure is the tracker's own measurement or someone
 * else's cell, and it shrinks every month as the archive fills. So it is reported instead:
 * the Developer console renders this.
 *
 * One entry per province and one per elapsed month, applying exactly the rule
 * `computeYtd` applies.
 *
 * The target side is deliberately not split the same way: every target cell in the year
 * comes from `TARGET 2026`, so it is reported as a single permanent dependency rather
 * than a countdown that will never move.
 *
 * @returns {null|object} null when the plan has no block in either tab
 */
export function summarizeWorksheetDependency({
  actual, target, planId, monthIndex, overrides = {}, year = null,
}) {
  const actualBlock = actual?.plans?.[planId]
  const targetBlock = target?.plans?.[planId]
  if (!actualBlock || !targetBlock) return null
  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) return null

  const monthsElapsed = monthIndex + 1
  const order = [...new Set([...targetBlock.order, ...actualBlock.order])]

  const worksheetByMonth = MONTHS.map(() => 0)
  const recordByMonth = MONTHS.map(() => 0)
  const worksheetAreasByMonth = MONTHS.map(() => [])
  const recordAreasByMonth = MONTHS.map(() => [])

  const areas = order.map((key) => {
    const name = targetBlock.areas[key]?.name || actualBlock.areas[key]?.name || key
    const worksheetMonths = []
    const recordMonths = []
    for (let index = 0; index < monthsElapsed; index++) {
      if (actualCellRule(actualBlock, overrides, key, index).fromRecord) {
        recordMonths.push(index)
        recordByMonth[index] += 1
        recordAreasByMonth[index].push(name)
      } else {
        worksheetMonths.push(index)
        worksheetByMonth[index] += 1
        worksheetAreasByMonth[index].push(name)
      }
    }
    return {
      key,
      name,
      worksheetMonths,
      recordMonths,
      // Every elapsed month came from the worksheet: nothing in the tracker's record has
      // ever mentioned this province, so nothing can correct the worksheet for it.
      noRecordAtAll: recordMonths.length === 0,
    }
  })

  const months = []
  for (let index = 0; index < monthsElapsed; index++) {
    months.push({
      index,
      label: MONTHS[index],
      worksheet: worksheetByMonth[index],
      record: recordByMonth[index],
      worksheetAreas: worksheetAreasByMonth[index],
      recordAreas: recordAreasByMonth[index],
    })
  }

  const worksheetMonths = months.filter((month) => month.worksheet > 0).map((month) => month.index)
  const recordMonths = months.filter((month) => month.record > 0).map((month) => month.index)
  const fromWorksheet = months.reduce((total, month) => total + month.worksheet, 0)

  // The earliest month the record holds. Anything before it can never be corrected: the
  // archive only picks up a closed month the plan's own tabs still carry, so a month from
  // before the tracker started recording is on the worksheet for good.
  const earliestRecordMonth = recordMonths.length ? Math.min(...recordMonths) : null
  const permanentWorksheetMonths = earliestRecordMonth == null
    ? []
    : worksheetMonths.filter((index) => index < earliestRecordMonth)

  return {
    planId,
    year,
    monthIndex,
    monthsElapsed,
    monthsAfter: 11 - monthIndex,
    months: MONTHS,
    areas,
    monthDetail: months,
    totals: {
      areaCount: order.length,
      provinceMonths: order.length * monthsElapsed,
      fromWorksheet,
      fromRecord: order.length * monthsElapsed - fromWorksheet,
      worksheetMonths,
      recordMonths,
      // Months where *every* province came from the worksheet — the ones a record would
      // fix outright if it held them.
      fullyWorksheetMonths: months.filter((month) => month.worksheet === order.length).map((month) => month.index),
      areasWithNoRecord: areas.filter((area) => area.noRecordAtAll).map((area) => area.key),
      earliestRecordMonth,
      permanentWorksheetMonths,
    },
    // Permanent by construction, and worth stating next to the countdown so the countdown
    // is not read as "the worksheet disappears".
    target: {
      months: MONTHS.length,
      areaCount: order.length,
      cells: MONTHS.length * order.length,
    },
  }
}

/**
 * Turn parsed MTD sections — the app's own record, live and archived — into the per-month
 * override map `computeYtd` expects:
 *
 *   { [monthIndex]: { [areaKey]: actual } }
 *
 * Only months in `year` are kept. This is the one place that decides what counts as "the
 * app's own record", so it lives here rather than inline in the component tree.
 */
export function buildOverrides(sections, year) {
  const out = {}
  for (const [label, section] of Object.entries(sections || {})) {
    const parts = monthLabelParts(label)
    if (!parts || (year != null && parts.year !== year)) continue
    const byArea = {}
    for (const area of section?.areas || []) {
      if (Number.isFinite(area.lastMtd)) byArea[normalizeAreaKey(area.area)] = area.lastMtd
    }
    if (Object.keys(byArea).length > 0) out[parts.monthIndex] = byArea
  }
  return out
}

/**
 * The year-to-date position for one plan.
 *
 * Source rule, matching the rest of the app (docs/DATASOURCE.md): **the app's own record
 * wins for any month it holds**, and the worksheet fills the months it does not. That is
 * what makes the closed months self-correcting — BIDA's August cell in `YTD 2026` holds
 * August's target, while the archive holds the real 31, 36, 53 …
 *
 * @param {object}   args
 * @param {object}   args.actual        parsed `YTD 2026` table
 * @param {object}   args.target        parsed `TARGET 2026` table
 * @param {string}   args.planId
 * @param {number}   args.monthIndex    selected month, 0-based
 * @param {object}   [args.overrides]   `{ [monthIndex]: { [areaKey]: actual } }` from the
 *                                      live/archived MTD record
 * @param {number}   [args.progress]    fraction of the selected month elapsed, 0–1
 * @returns {null|object} null when the plan has no block in either tab
 */
export function computeYtd({ actual, target, planId, monthIndex, overrides = {}, progress = null }) {
  const actualBlock = actual?.plans?.[planId]
  const targetBlock = target?.plans?.[planId]
  if (!actualBlock || !targetBlock) return null
  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) return null

  // Target order first — it is the full province list, and it is the one the plan is
  // written in. Anything the completed tab adds on its own is appended.
  const order = [...new Set([...targetBlock.order, ...actualBlock.order])]
  const closedRecordMonths = new Set()

  const actualFor = (key, index) => actualCellRule(actualBlock, overrides, key, index)

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
    const remaining = Math.max(annualTarget - ytd, 0)
    const remainingAfterCurrent = Math.max(annualTarget - ytd - currentRemaining, 0)
    const requiredPerMonth = monthsAfter > 0 ? remainingAfterCurrent / monthsAfter : null

    const pct = annualTarget > 0 ? (ytd / annualTarget) * 100 : null
    const pctOfPlan = planToDate > 0 ? (ytd / planToDate) * 100 : null
    const deficit = planToDate - ytd

    // Average over finished months when there are any — the selected month is partial, so
    // including it would drag the rate down and understate the year-end figure.
    const paceMonthly = completedMonths > 0 ? completedActual / completedMonths : ytd / (monthIndex + 1)
    const monthsAhead = monthsAfter + (progress != null ? Math.max(1 - progress, 0) : 0)
    const projected = ytd + paceMonthly * monthsAhead
    const projectedPct = annualTarget > 0 ? (projected / annualTarget) * 100 : null

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
    const seriesTarget = MONTHS.map((_, index) => targetBlock.areas[key]?.monthly?.[index] ?? 0)
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
    // Months whose figure came from the app's own record rather than the worksheet —
    // surfaced in the UI, because that is the difference between "the sheet says so" and
    // "the tracker says so".
    closedRecordMonths: [...closedRecordMonths].sort((a, b) => a - b),
    progress,
  }
}
