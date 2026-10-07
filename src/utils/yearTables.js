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
 * The month's source decides every province in it, not just the ones the record lists. A
 * province the record leaves out collected nothing that month, and reading its worksheet cell
 * anyway adds the other side's figure to a month the record has already defined — which is how
 * BIDA's `2026-08` came to read 540. The archive was written from a twelve-province list with
 * no `Aurora`, so the tab's `Aurora` cell — the same 17 tickets the archive files under
 * `Kalinga` — was counted on top of the archive's own month. `covered` is that decision: the
 * months the record speaks for, so a month it cannot speak about (SME's `2026-08`, twelve
 * ticket counts and no `NET`) still falls to the worksheet whole.
 *
 * Where the two hold the same month and disagree, the record wins and the worksheet's figure
 * goes unused — which is why `summarizeSourceClashes` reports those cells rather than leaving
 * the difference to be noticed by eye.
 *
 * One definition on purpose. `computeYtd` uses it to decide what to display and
 * `summarizeWorksheetDependency` uses it to report on what was displayed, so the two can
 * never disagree about what "the worksheet supplied this" means.
 */
function actualCellRule(actualBlock, overrides, covered, key, index) {
  const override = overrides?.[index]?.[key]
  if (typeof override === 'number' && Number.isFinite(override)) return { value: override, fromRecord: true }
  if (covered.has(index)) return { value: 0, fromRecord: true }
  const worksheet = actualBlock.areas[key]?.monthly?.[index]
  return { value: typeof worksheet === 'number' ? worksheet : 0, fromRecord: false }
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
 * contributes nothing here either, and keeps the worksheet's target rather than a zero that
 * would read as "no target was ever set".
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
 * twelve ticket counts and no `NET`, so it contributes nothing and the month stays the
 * worksheet's. Deriving the set here rather than taking it from a second caller is what keeps
 * the two from disagreeing about which months have a record behind them.
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
 * The target side is almost permanent. A closed month's targets are archived beside its
 * figure (`sli_monthly`), so the strip reads them from the record for the months the archive
 * holds and from `TARGET 2026` for everything else — the live month, the months still to
 * come, and the annual totals. What the record supplies is reported as `fromRecordMonths`,
 * which is the part of the target column that stops depending on somebody's worksheet as the
 * year runs.
 *
 * @returns {null|object} null when the plan has no block in either tab
 */
export function summarizeWorksheetDependency({
  actual, target, planId, monthIndex, overrides = {}, targetOverrides = {}, year = null,
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

  const covered = coveredMonthsOf(overrides)

  const areas = order.map((key) => {
    const name = targetBlock.areas[key]?.name || actualBlock.areas[key]?.name || key
    const worksheetMonths = []
    const recordMonths = []
    for (let index = 0; index < monthsElapsed; index++) {
      if (actualCellRule(actualBlock, overrides, covered, key, index).fromRecord) {
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
      // Months whose target came from the record rather than `TARGET 2026`.
      fromRecordMonths: [...coveredMonthsOf(targetOverrides)].sort((a, b) => a - b),
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
 * part, where a province it does not hold has a non-zero worksheet cell. Nothing disagrees
 * about a figure — the record's month simply stands for every province in it, and that cell is
 * left out of the total (`actualCellRule`). Worth saying because the cell looks like data: on
 * BIDA's `2026-08` the archive carries twelve rows and no `Aurora`, while the tab's `Aurora`
 * cell holds the same 17 tickets the archive files under `Kalinga`. See `partialMonths`.
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

  // Months the record covers only in part. The month's source decides every province in it, so
  // the ones the record does not list count as zero for that month and their worksheet cells are
  // left out of the total — reported because they are the figures a reader would otherwise assume
  // were counted. BIDA's `2026-08` is the live example: the archive carries twelve rows and no
  // `Aurora`, while the tab's `Aurora` cell holds `17` — the same tickets the archive files under
  // `Kalinga` — so that cell is withheld rather than added to the archive's 523. Only a non-zero
  // cell can be withheld, so a blank stays out of the report.
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
      withheld: missing.reduce((total, entry) => total + entry.worksheet, 0),
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
 * month. The worksheet still supplies the live month, the months still to come, the annual
 * targets and the province list.
 *
 * A row is only usable in the plan's own units. `measure` travels with the row — `net` for
 * SME's collections, `count` for everyone else's tickets — and a row whose measure does not
 * match the plan is dropped whole, figure *and* target, so the month stays the worksheet's
 * rather than being read in the wrong basis. That guard is what keeps SME's `2026-08`, which
 * was archived before the MRC columns existed, out of the year-to-date figures instead of
 * putting a 174 beside the worksheet's 465,023.
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
 * Whether the shared tabs can serve this plan at all: both of its blocks present.
 *
 * "The tabs are unavailable" has two shapes, and the difference matters to the reader. The
 * whole read can fail — a 404, or an offline browser with no year cache — and one of them can
 * arrive without a block for the plan. Both leave `computeYtd` with nothing, and both are
 * handled the same way: the section is rebuilt from the record
 * (`buildYearTablesFromRecord`) instead of disappearing.
 */
export function hasPlanBlocks(actual, target, planId) {
  return Boolean(actual?.plans?.[planId] && target?.plans?.[planId])
}

/**
 * The year tables rebuilt from the app's own record, for when the shared `YTD 2026` /
 * `TARGET 2026` tabs cannot be read at all.
 *
 * The section used to disappear in that case, on the reasoning that a year-to-date table with
 * no year tables has nothing to show. That stopped being true once `sli_monthly` began holding
 * every elapsed month: the figures are the app's own record now, and the worksheet is left with
 * the live month, the months still to come, the annual targets and the province list. So this
 * rebuilds the two blocks `computeYtd` expects out of what the app already has:
 *
 *   provinces  the area list out of `sli_monthly`, in its own row order (the oldest month that
 *              names a province fixes its place), then any province only the live `MTD` tab has
 *   figures    the month's figure out of `sli_monthly`, and the live month out of the record
 *   targets    the month's target out of `sli_monthly`, and the live month's target off the
 *              `MTD` tab, which is the only place that one is carried
 *
 * The province list is the part worth naming: it is the one thing the worksheet was still
 * exclusively supplying that the record can supply too, because `sli_monthly` carries an area
 * per row. A plan whose table is empty and whose `MTD` tab says nothing has no provinces, and
 * returns null — an absent section is better than an empty one.
 *
 * What it cannot know is the rest of the year. Every `total` stays null, so the annual target
 * `computeYtd` falls back to is the sum of the months the record holds — a partial figure that
 * must not be presented as the year's plan, which is what the `annualTargetsKnown: false` the
 * caller passes beside these tables is for.
 *
 * @param {object}   args
 * @param {string}   args.planId
 * @param {object[]} [args.rows]              `sli_monthly` rows for this plan
 * @param {object}   [args.sections]          `mtdData.sections` — the live `MTD` tab
 * @param {number}   [args.year]              only months in this year are kept
 * @param {boolean}  [args.collectionBased]   the plan is measured in money (SME)
 * @returns {null|{ actual: object, target: object }} two `parseYearTable`-shaped blocks
 */
export function buildYearTablesFromRecord({
  planId, rows = [], sections = null, year = null, collectionBased = false,
}) {
  const measure = collectionBased ? 'net' : 'count'
  const order = []
  const names = {}
  const actualMonthly = {}
  const targetMonthly = {}

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

  // `sli_monthly`: the province list and every month it holds. Oldest month first, then the
  // plan's own row order, so the list comes out the way the plan is written rather than
  // alphabetically — the same order the year tabs would give.
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

  const block = (kind, monthly) => ({
    kind,
    order: [...order],
    areas: Object.fromEntries(order.map((key) => [key, {
      name: names[key],
      key,
      monthly: monthly[key],
      // Unknown, not zero: see the note above about what a partial annual target means.
      total: null,
    }])),
    overall: {
      monthly: MONTHS.map((_, index) => sum(order.map((key) => monthly[key][index] ?? 0))),
      total: null,
    },
  })

  // Shaped exactly like `parseYearTable`'s output — one block per plan under `plans` — so
  // `computeYtd` cannot tell which of the two it was handed, which is the point.
  const shaped = (kind, monthly) => ({
    year,
    months: MONTHS,
    plans: { [planId]: block(kind, monthly) },
  })

  return {
    planId,
    year,
    actual: shaped('completed', actualMonthly),
    target: shaped('target', targetMonthly),
  }
}

/**
 * Where each month of the Monthly Progress strip came from.
 *
 * The strip is a row of cells, one per month, and each cell has two figures that can come
 * from two different places: the month's delivered total, and the target under it. This
 * reports, month by month, which side supplied each — the same question the worksheet
 * dependency answers for the provincial grid, asked of the one row a reader actually looks
 * at first.
 *
 * It takes the computed year (`ytd`) rather than recomputing anything, so the figures shown
 * here are the strip's own and the two cannot drift apart. The attribution is read off the
 * same maps `computeYtd` was handed, in the same precedence order:
 *
 *   figure   the archived month in `sli_monthly`, else the record (the live `MTD` tab, or the
 *            archive's `sli_mtd` rows), else the `YTD 2026` worksheet
 *   target   the archived month in `sli_monthly` beside that figure, else `TARGET 2026`
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
    const source = fromTable ? 'monthly' : fromRecord ? 'record' : 'worksheet'
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
      targetSource: holds(tableTargets, index) ? 'monthly' : 'worksheet',
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
      worksheet: count('worksheet'),
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
 * @param {object}   [args.targetOverrides] `{ [monthIndex]: { [areaKey]: target } }` from the
 *                                      archived Monthly Progress record (`sli_monthly`), so a
 *                                      closed month's target comes from the same source as
 *                                      its figure instead of the `TARGET 2026` worksheet
 * @param {number}   [args.progress]    fraction of the selected month elapsed, 0–1
 * @param {boolean}  [args.annualTargetsKnown] false when the annual targets are not available
 *                                      — the section was rebuilt from the record because the
 *                                      year tabs could not be read. Everything measured against
 *                                      the year then reports absent (`null`) rather than
 *                                      measured against the months the record happens to hold;
 *                                      the plan-to-date yardstick is unaffected and still shown.
 * @returns {null|object} null when the plan has no block in either tab
 */
export function computeYtd({ actual, target, planId, monthIndex, overrides = {}, targetOverrides = {}, progress = null, annualTargetsKnown = true }) {
  const actualBlock = actual?.plans?.[planId]
  const targetBlock = target?.plans?.[planId]
  if (!actualBlock || !targetBlock) return null
  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) return null

  // Target order first — it is the full province list, and it is the one the plan is
  // written in. Anything the completed tab adds on its own is appended.
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
    // Months whose figure came from the app's own record rather than the worksheet —
    // surfaced in the UI, because that is the difference between "the sheet says so" and
    // "the tracker says so".
    closedRecordMonths: [...closedRecordMonths].sort((a, b) => a - b),
    annualTargetKnown: annualTargetsKnown,
    progress,
  }
}
