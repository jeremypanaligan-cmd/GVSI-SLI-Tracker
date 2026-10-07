#!/usr/bin/env node
/**
 * Generates `supabase/seed-year-targets.sql` — the year's target plan, one row per plan x
 * month x area — from the `TARGET 2026` tab's CSV export.
 *
 *   curl -sL 'https://docs.google.com/spreadsheets/d/1PGB2Mmo5Ka2NBfrlJWIF3V_X3Kxm6jepT5-eEYOC9bs/export?format=csv&gid=1221052795' > target.csv
 *   node scripts/targets-seed.cjs target.csv > supabase/seed-year-targets.sql
 *
 * The app reads the plan out of `sli_targets`, not out of the tab, so this is a migration
 * step rather than something the dashboard runs: it copies the plan once, and the same
 * command is how next year's plan is loaded when the tabs carry a new year.
 *
 * It refuses to emit anything it cannot prove: every province's twelve monthly cells must
 * add up to the TOTAL column the tab prints for that row, and every block must carry the
 * same province list in the same order. A tab that fails either check is one the app would
 * misread as a plan, so the seed is not written at all.
 *
 * Node itself does the parsing — the export quotes every cell with a thousands separator,
 * and splitting on commas would turn SME's `"74,126"` into two cells.
 */
const fs = require('fs')

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const BLOCK_TITLE = /^(BIDA|FIBERX|SME)\s+YTD\s+TARGET\s+(\d{4})\b/i

/** One CSV record per line, with RFC-4180 quoting. Trailing blank lines drop out. */
function parseCsv(text) {
  return String(text).replace(/\r\n/g, '\n').split('\n').map((line) => {
    if (line === '') return []
    const cells = []
    let cell = ''
    let quoted = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++ } else if (ch === '"') quoted = false
        else cell += ch
      } else if (ch === '"') quoted = true
      else if (ch === ',') { cells.push(cell); cell = '' }
      else cell += ch
    }
    cells.push(cell)
    return cells
  })
}

/** `"74,126"` → 74126, `''` → null. */
function num(cell) {
  const text = String(cell ?? '').replace(/[,\s]/g, '')
  if (text === '') return null
  const value = Number(text)
  if (!Number.isFinite(value)) throw new Error(`not a number: ${JSON.stringify(cell)}`)
  return value
}

const quote = (value) => `'${String(value).replace(/'/g, "''")}'`

function main() {
  const file = process.argv[2]
  if (!file) {
    console.error('usage: node scripts/targets-seed.cjs <TARGET.csv>')
    process.exit(2)
  }

  const rows = parseCsv(fs.readFileSync(file, 'utf8'))
  const plans = {}
  let year = null
  let current = null

  for (const cells of rows) {
    if (!cells.some((cell) => cell !== '')) continue
    const first = cells[0] || ''

    const title = first.match(BLOCK_TITLE)
    if (title) {
      current = { plan: title[1].toLowerCase(), areas: [] }
      plans[current.plan] = current
      if (year == null) year = Number(title[2])
      continue
    }

    if (cells.includes('JAN')) {
      const start = cells.indexOf('JAN')
      for (let i = 0; i < MONTHS.length; i++) {
        if (cells[start + i] !== MONTHS[i]) throw new Error(`month header out of order at ${MONTHS[i]}`)
      }
      current.monthCol = start
      current.totalCol = cells.indexOf('TOTAL')
      if (!current || current.totalCol < 0) throw new Error('TOTAL column missing from a header row')
      continue
    }

    if (!current || current.monthCol == null) continue
    if (first === '') continue
    if (first.trim().toUpperCase() === 'TOTAL') continue // recomputed from the provinces by the app

    const monthly = MONTHS.map((_, i) => num(cells[current.monthCol + i]) ?? 0)
    const total = num(cells[current.totalCol])
    const sum = monthly.reduce((acc, value) => acc + value, 0)
    if (total != null && Math.abs(sum - total) > 0.005) {
      throw new Error(`${current.plan} ${first}: months sum to ${sum}, the tab prints ${total}`)
    }
    current.areas.push({ area: String(first).trim().replace(/\s+/g, ' '), monthly })
  }

  const planIds = Object.keys(plans)
  if (!planIds.length) throw new Error('no target block found in the export')
  if (year == null) throw new Error('no year found in the block titles')

  // The province list is the app's own row order, so it has to be one list. A block that
  // lists a province the others do not would give that plan a different grid from the year
  // tabs' — and the app has no other place to learn the order from.
  const [firstPlan, ...rest] = planIds
  const reference = plans[firstPlan].areas.map((row) => row.area)
  for (const planId of rest) {
    const list = plans[planId].areas.map((row) => row.area)
    if (list.join('|') !== reference.join('|')) {
      throw new Error(`${planId} lists different provinces than ${firstPlan}`)
    }
  }

  // One line per province, its twelve months beside it: the plan is read as a year grid
  // rather than as 468 separate cells, and `set seed` cross-joins the months back on.
  const values = []
  for (const planId of planIds) {
    const annual = plans[planId].areas.reduce(
      (acc, row) => acc + row.monthly.reduce((a, value) => a + value, 0), 0)
    values.push(`  -- ${planId.toUpperCase()} \u2014 annual target ${annual.toLocaleString('en-US')}`)
    plans[planId].areas.forEach((row, order) => {
      values.push(`  (${quote(planId)}, ${quote(row.area)}, ${order}, ${row.monthly.join(', ')})`)
    })
  }

  const out = []
  out.push('-- ============================================================================')
  out.push('-- sli_targets — the year’s target plan, copied out of the shared `TARGET 2026` tab')
  out.push('--')
  out.push(`-- Generated by \`scripts/targets-seed.cjs\` from the \`TARGET 2026\` (gid 1221052795)`)
  out.push(`-- export of the shared workbook: ${planIds.length} plans x 12 months x ${reference.length} provinces,`)
  out.push('-- in the tab’s own province order. This file is a migration, not something the app runs:')
  out.push('-- the dashboard reads `sli_targets` and never the tab. Regenerate and re-run it to move')
  out.push('-- the plan to a new year, or after a target has been corrected in the sheet.')
  out.push('--')
  out.push('-- The annual target is NOT stored. The app sums the twelve monthly rows, which is the')
  out.push('-- same figure the tab prints in its TOTAL column — this generator refuses to emit a row')
  out.push('-- whose months do not add up to that column, so the two cannot disagree.')
  out.push('--')
  out.push('-- Re-running replaces the plan with this file’s version of it, month by month, area by')
  out.push('-- area: the tab is the source the plan is copied FROM, and this file is that copy.')
  out.push('-- ============================================================================')
  out.push('')
  out.push('insert into public.sli_targets')
  out.push('  (plan, month_key, month_label, area, target, row_order, source, updated_at)')
  out.push('select t.plan, m.month_key, m.month_label, t.area, m.target::numeric, t.row_order,')
  out.push("       'worksheet', now()")
  out.push('from (values')
  out.push(values.join(',\r\n'))
  out.push(') as t (plan, area, row_order, jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec)')
  out.push('cross join lateral (values')
  for (let index = 0; index < MONTHS.length; index++) {
    const sep = index === MONTHS.length - 1 ? '' : ','
    const monthKey = `${year}-${String(index + 1).padStart(2, '0')}`
    out.push(`  (${quote(monthKey)}, ${quote(`${MONTH_NAMES[index]} ${year}`)}, t.${MONTHS[index].toLowerCase()})${sep}`)
  }
  out.push(') as m (month_key, month_label, target)')
  out.push('on conflict (plan, month_key, area) do update set')
  out.push('  month_label = excluded.month_label,')
  out.push('  target = excluded.target,')
  out.push('  row_order = excluded.row_order,')
  out.push('  source = excluded.source,')
  out.push('  updated_at = excluded.updated_at;')
  out.push('')
  out.push('')

  process.stdout.write(out.join('\r\n'))
  for (const planId of planIds) {
    const areas = plans[planId].areas
    const annual = areas.reduce((acc, row) => acc + row.monthly.reduce((a, v) => a + v, 0), 0)
    console.error(`${planId}: ${areas.length} provinces x 12 months, annual total ${annual}`)
  }
  console.error(`${planIds.length * 12 * reference.length} rows, ${year}`)
}

main()
