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
 * that used to hold the August target rather than August's completions.
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
 * Which side of the split one province-month comes from: **the app's own record wins for any
 * month it holds** — the archived month in Supabase first, then the live `MTD` tab of a
 * running month — and the `YTD 2026` worksheet fills only the months the record does not.
 *
 * The record side is the app's own measurement of that month, written at trim time and
 * immutable afterwards; the worksheet is a hand-typed cell somebody maintains. Preferring the
 * app's figure is the point of keeping an archive at all.
 *
 * Making the worksheet the basis was tried and reverted. The mismatch that blamed the record
 * (SME's `MONTHLY PROGRESS` reading 174 where `YTD 2026` says 465,023 for August) was never a
 * precedence problem: `buildOverrides` was feeding a **ticket count** into a series measured in
 * pesos. `recordValueFor` now fixes that at the source — a collection-based plan contributes
 * its NET, and nothing at all when its row has no NET — so the record keeps its precedence and
 * SME's `2026-08` still cannot land in the wrong units: that archived row predates the MRC
 * columns, holds no NET, contributes nothing, and leaves the month to the worksheet.
 *
 * A blank worksheet cell is the other half of the rule. The province rows of both completed
 * blocks leave `SEP`–`DEC` empty until somebody fills them in, so `null` means "not reported
 * yet" rather than "zero", and that is the month the record is there to supply.
 *
 * Where the two hold the same month and disagree, the record wins and the worksheet's figure
 * goes unused — which is why `summarizeSourceClashes` reports those cells rather than leaving
 * the difference to be noticed by eye.
 *
 * One definition on purpose. `computeYtd` uses it to decide what to display and
 * `summarizeWorksheetDependency` uses it to report on what was displayed, so the two can
 * never disagree about what "the worksheet supplied this" means.
 */
function actualCellRule(actualBlock, overrides, key, index) {
  const override = overrides?.[index]?.[key]
  if (typeof override === 'number' && Number.isFinite(override)) return { value: override, fromRecord: true }
  const worksheet = actualBlock.areas[key]?.monthly?.[index]
  return { value: typeof worksheet === 'number' ? worksheet : 0, fromRecord: false }
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
 * Where the two sides of the split disagree about the *same* province-month.
 *
 * The record wins wherever both sides hold a month, so the worksheet's version of that month is
 * never read: the dashboard shows the record's figure and the tab's figure is simply not used.
 * That is the right display rule and the wrong thing to keep quiet about. Both sides are
 * supposed to describe the same month, so a gap between them is a worksheet cell that was never
 * corrected after the archive was taken, a basis mismatch, or a genuine error — and the one
 * behind the 2026-08 mismatch was found by eye rather than by the app.
 *
 * A gap has to clear both a relative and an absolute threshold to be reported, so single-digit
 * rounding on a small count stays quiet while 12% on any figure does not. The 12% is not an
 * arbitrary pick: SME's `MTD` carries `GROSS` and `NET` and `GROSS = NET × 1.12` exactly, so a
 * worksheet column read in the other basis shows up here as a uniform 12% across every area.
 *
 * A third thing is reported beside those two, and it is neither: a month the record covers in
 * part, where a province it does not hold keeps a non-zero worksheet cell. Nothing disagrees —
 * there is simply one side's figure added to the other side's — and the result is a month whose
 * number is larger than either source's own. See `partialMonths`.
 *
 * There is a second failure that is not a disagreement at all, and it is the one that arrives
 * looking like agreement: a record month that cannot be expressed in the plan's own units.
 * SME's archived `2026-08` rows are ticket counts with no `NET`, so `buildOverrides` drops them
 * — and the month then reads from the worksheet with nothing on the record side to compare. The
 * worksheet may be right or wrong; either way nobody is told the archive has that month and
 * cannot say anything about it. Those are reported separately as `unusable`, carrying the
 * plan's own units so the reason can be stated in the right words.
 *
 * Observation only — nothing reads the result back.
 *
 * @param {object}  args
 * @param {object}  args.actual       parsed `YTD 2026` table
 * @param {string}  args.planId
 * @param {number}  args.monthIndex   selected month, 0-based
 * @param {object}  [args.overrides]  `{ [monthIndex]: { [areaKey]: actual } }` from the record
 * @param {object}  [args.sections]   `mtdData.sections`, to see what the record holds raw
 * @param {boolean} [args.collectionBased] the plan is measured in money (SME)
 * @param {number}  [args.tolerance]  relative gap above which a difference is a clash
 * @param {number}  [args.floor]      absolute gap, in the plan's own units, below which it is not
 * @returns {null|object} null when the plan has no block in the tab
 */
export function summarizeSourceClashes({
  actual, planId, monthIndex, overrides = {}, sections = null,
  collectionBased = false, tolerance = 0.005, floor = 2,
}) {
  const actualBlock = actual?.plans?.[planId]
  if (!actualBlock) return null
  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) return null

  const clashes = []
  const unusable = []
  let comparedCells = 0

  for (const key of actualBlock.order) {
    const name = actualBlock.areas[key]?.name || key
    for (let index = 0; index <= monthIndex; index++) {
      const worksheet = actualBlock.areas[key]?.monthly?.[index]
      // A blank worksheet cell is the record doing its job, so there is nothing to compare.
      if (typeof worksheet !== 'number') continue

      const record = overrides?.[index]?.[key]
      if (typeof record !== 'number' || !Number.isFinite(record)) {
        // The record may still hold the month in units this plan cannot use.
        const held = recordEntryFor(sections, index, key)
        if (held && recordValueFor(held, collectionBased) === null) {
          unusable.push({
            key,
            name,
            monthIndex: index,
            month: MONTHS[index],
            monthName: MONTH_NAMES[index],
            worksheet,
            held: Number.isFinite(held.lastMtd) ? held.lastMtd : null,
            heldGross: Number.isFinite(held.gross) ? held.gross : null,
            heldNet: Number.isFinite(held.net) ? held.net : null,
          })
        }
        continue
      }

      comparedCells += 1
      const difference = worksheet - record
      const scale = Math.max(Math.abs(worksheet), Math.abs(record))
      const relative = scale > 0 ? Math.abs(difference) / scale : 0
      if (Math.abs(difference) < floor || relative <= tolerance) continue

      clashes.push({
        key,
        name,
        monthIndex: index,
        month: MONTHS[index],
        monthName: MONTH_NAMES[index],
        worksheet,
        record,
        difference,
        relative,
      })
    }
  }

  clashes.sort((a, b) => b.relative - a.relative)

  const clashWorksheetTotal = clashes.reduce((total, clash) => total + clash.worksheet, 0)
  const clashRecordTotal = clashes.reduce((total, clash) => total + clash.record, 0)
  const clashScale = Math.max(Math.abs(clashWorksheetTotal), Math.abs(clashRecordTotal))

  // Which months the record holds but cannot speak about, in reading order.
  const unusableMonths = [...new Set(unusable.map((entry) => entry.monthIndex))].sort((a, b) => a - b)

  // Months the record covers only in part. The provinces it does hold decide the month's
  // source, and the ones it does not keep their worksheet cell — so a region total can come out
  // larger than either side's own, which no single cell would explain. BIDA's `2026-08` is the
  // live example: the archive carries twelve rows and no `Aurora`, while the tab's `Aurora` cell
  // holds `17`, so the archive's 523 is shown as 540. Only a province whose worksheet cell is
  // non-zero can move a total, so a zero stays out of the report.
  const partialMonths = []
  for (let index = 0; index <= monthIndex; index++) {
    const covered = new Set()
    for (const key of actualBlock.order) {
      const record = overrides?.[index]?.[key]
      if (typeof record === 'number' && Number.isFinite(record)) covered.add(key)
    }
    // All of it or none of it: nothing to explain either way.
    if (covered.size === 0 || covered.size === actualBlock.order.length) continue

    const missing = []
    for (const key of actualBlock.order) {
      if (covered.has(key)) continue
      const worksheet = actualBlock.areas[key]?.monthly?.[index]
      if (typeof worksheet !== 'number' || worksheet === 0) continue
      missing.push({ key, name: actualBlock.areas[key]?.name || key, worksheet })
    }
    if (!missing.length) continue

    partialMonths.push({
      monthIndex: index,
      month: MONTHS[index],
      monthName: MONTH_NAMES[index],
      covered: covered.size,
      total: actualBlock.order.length,
      missing,
      added: missing.reduce((total, entry) => total + entry.worksheet, 0),
    })
  }

  return {
    planId,
    monthIndex,
    collectionBased,
    tolerance,
    floor,
    comparedCells,
    clashCells: clashes.length,
    clashWorksheetTotal,
    clashRecordTotal,
    clashDifference: clashWorksheetTotal - clashRecordTotal,
    clashRelative: clashScale > 0 ? Math.abs(clashWorksheetTotal - clashRecordTotal) / clashScale : 0,
    // Biggest relative gap first — the one worth looking at.
    clashes,
    worst: clashes[0] || null,
    unusable,
    unusableCells: unusable.length,
    unusableMonths,
    partialMonths,
  }
}

/**
 * The record's own entry for one province-month, found the way `buildOverrides` finds it, so
 * the two cannot disagree about whether the record holds a month at all.
 */
function recordEntryFor(sections, monthIndex, areaKey) {
  if (!sections) return null
  for (const [label, section] of Object.entries(sections)) {
    const parts = monthLabelParts(label)
    if (!parts || parts.monthIndex !== monthIndex) continue
    for (const area of section?.areas || []) {
      if (normalizeAreaKey(area.area) === areaKey) return area
    }
  }
  return null
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
 * A record row with no NET at all contributes nothing rather than its count. A month left
 * to the worksheet is honest; a count standing in for pesos is not.
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
 * The year-to-date position for one plan.
 *
 * Source rule, matching the rest of the app (docs/DATASOURCE.md): **the app's own record wins
 * for any month it holds** — the archived month in Supabase first, then the live `MTD` tab of
 * a running month — and the worksheet fills the months it does not. `buildOverrides` decides
 * what the record may contribute, so a collection-based plan can only ever add pesos; see
 * `actualCellRule` for why that guard is what keeps the precedence safe.
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
