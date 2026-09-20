#!/usr/bin/env node
/**
 * verify-archive.cjs — run the REAL Apps Script archive code against the live sheets.
 *
 * The archive gate is the only thing standing between a slightly-off month and a purged
 * NEW REPORT, and the Apps Script editor gives you no way to exercise it end to end: a
 * dry run does not upload, and a live run purges. So this loads `<PLAN>SCRIPT.gs`
 * verbatim into a VM with Apps Script stubs fed by the live CSV exports. The code under
 * test is the code that will run on the day, not a reimplementation of it.
 *
 *   node scripts/apps-script/verify-archive.cjs bida             # dry run, no writes
 *   node scripts/apps-script/verify-archive.cjs bida --dump       # + every shaped row
 *   node scripts/apps-script/verify-archive.cjs bida --gate-view  # + what the gate measures
 *   node scripts/apps-script/verify-archive.cjs bida --upload     # + the real gate
 *   node scripts/apps-script/verify-archive.cjs bida --connection # the menu's connection test
 *
 * What each pass does:
 *
 *   (default)  Reads the sheets and reports the rows and sums that WOULD be archived,
 *              plus the NEW REPORT day blocks that WOULD be purged. No network, no
 *              writes anywhere.
 *   --upload   Additionally upserts the month to Supabase, then re-reads row counts and
 *              checksums back and compares them — the real gate, in full. It stops
 *              before the purge: deleteRows() is recorded and printed, never applied.
 *              Nothing in Google changes, and the archive tables do get real rows.
 *   --connection
 *              Runs the menu's 'Test Supabase Connection' function and stops. No sheets
 *              are read, and nothing is written: the write check is an empty-row INSERT
 *              that Postgres rejects on a not-null constraint, so it proves the key may
 *              write while leaving the archive tables untouched. Point it at the anon
 *              key to see the failure path (`SUPABASE_SERVICE_KEY=<anon key>`).
 *
 * Fidelity notes, so you know exactly what is and is not the real thing:
 *
 *   * Cells are fed as the CSV export's strings. `parseAnyDate_`, `num_` and
 *     `percentText_` all handle that form, which is the same path the app uses.
 *   * CONFIG is supplied in memory, so the real CONFIG tab is never read or written and
 *     `LAST_ARCHIVE` stays untouched. That also means the archiving switch here is the
 *     harness's, not the spreadsheet's.
 *   * URLFetchApp is synchronous. It is backed by curl, so the Supabase calls are real
 *     HTTP against the real project.
 *
 * Requires the same two Script Properties the Apps Script uses:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

'use strict'

const fs = require('fs')
const path = require('path')
const vm = require('vm')
const { execFileSync } = require('child_process')

// ── The plans, and where each sheet tab lives ────────────────────────────────

const PLANS = {
  fiberx: {
    script: 'FIBERXSCRIPT.gs',
    sheetId: '1UUd8cpfKeOCBHANx9wmM7l1apFyDoZRv0dHZa2_bVr0',
    tabs: { 'FIBERX NEW REPORT': '1425609870', 'RAW DATA': '486719298', 'MTD': '1061751267' },
  },
  bida: {
    script: 'BIDASCRIPT.gs',
    sheetId: '1FrEowZ9Zl0jMAyLDe4OZE2cQV04nIz-rjRkLi6uv99M',
    tabs: { 'BIDA NEW REPORT': '1425609870', 'RAW DATA': '486719298', 'MTD': '1061751267' },
  },
  sme: {
    script: 'SMESCRIPT.gs',
    sheetId: '10P3GatvwC76IujPpjHtqgyNjE71ChAoP_8Ln7BDcvTY',
    tabs: { 'SME NEW REPORT': '1425609870', 'RAW DATA': '486719298', 'MTD': '1061751267' },
  },
}

// ── CSV → a 2D grid, the way getValues() would return it ─────────────────────
//
// Not the app's parseCSV(): that one hunts for a header row and trims, which would move
// cells out from under the archive code. Sheet cells keep their padding.

function csvToGrid(csv) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false

  const text = csv.replace(/\r\n/g, '\n')
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else { quoted = false }
      } else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }

  const width = rows.reduce((max, r) => Math.max(max, r.length), 0)
  rows.forEach((r) => { while (r.length < width) r.push('') })
  return rows
}

function fetchText(url) {
  return execFileSync('curl', ['-sS', '-L', '--max-time', '60', url], {
    maxBuffer: 128 * 1024 * 1024,
  }).toString()
}

// ── Apps Script sheet stubs ─────────────────────────────────────────────────

const purgeLog = []

class Range {
  constructor(sheet, row, col, numRows, numCols) {
    this.sheet = sheet
    this.row = row
    this.col = col
    this.numRows = numRows
    this.numCols = numCols
  }
  _bounds() {
    const first = this.sheet.rows[this.row - 1] || []
    return { rows: this.numRows || first.length || 1, cols: this.numCols || first.length || 1 }
  }
  getValues() {
    const { rows, cols } = this._bounds()
    const out = []
    for (let r = 0; r < rows; r++) {
      const source = this.sheet.rows[this.row - 1 + r] || []
      const line = []
      for (let c = 0; c < cols; c++) {
        const v = source[this.col - 1 + c]
        line.push(v === undefined || v === null ? '' : v)
      }
      out.push(line)
    }
    return out
  }
  getDisplayValues() { return this.getValues() }
  getValue() { return this.getValues()[0]?.[0] ?? '' }
  getDisplayValue() { return this.getValue() }
  getNumRows() { return this._bounds().rows }
  getNumColumns() { return this._bounds().cols }
  getLastColumn() { return this.col + this._bounds().cols - 1 }
  getLastRow() { return this.row + this._bounds().rows - 1 }
  getSheet() { return this.sheet }
  getA1Notation() { return `${this.sheet.name}!R${this.row}C${this.col}` }
  setValues(values) {
    const { rows, cols } = this._bounds()
    if (values.length > rows || (values[0] && values[0].length > cols)) {
      throw new Error(`setValues out of range: got ${values.length}x${values[0]?.length}, ` +
        `range is ${rows}x${cols} (row ${this.row}, col ${this.col} on ${this.sheet.name})`)
    }
    values.forEach((line, r) => {
      this.sheet.ensure(this.row + r, this.col + line.length - 1)
      line.forEach((v, c) => { this.sheet.rows[this.row - 1 + r][this.col - 1 + c] = v })
    })
    return this
  }
  setValue(value) { return this.setValues([[value]]) }
}

/**
 * Formatting is cosmetic in a harness, so rather than stub setFontWeight, setFontFamily,
 * setBorder, … one at a time and trip over the next one, any fluent-looking call we have
 * not implemented returns the range itself. That is what the real API does, so chains in
 * the plan script keep working.
 */
function proxied(range) {
  const proxy = new Proxy(range, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (value !== undefined) return value
      if (typeof prop === 'string' && /^(set|merge|clear|auto|insert)/i.test(prop)) return () => proxy
      return undefined
    },
  })
  return proxy
}

class Sheet {
  constructor(name, rows) {
    this.name = name
    this.rows = rows || []
  }
  ensure(row, col) {
    while (this.rows.length < row) this.rows.push([])
    for (const line of this.rows) while (line.length < col) line.push('')
  }
  getName() { return this.name }
  getDataRange() {
    let width = 0
    this.rows.forEach((r) => { width = Math.max(width, r.length) })
    return proxied(new Range(this, 1, 1, this.rows.length, width))
  }
  getRange(row, col, numRows, numCols) {
    return proxied(new Range(this, row, col, numRows, numCols))
  }
  getLastRow() {
    for (let i = this.rows.length - 1; i >= 0; i--) {
      if (this.rows[i].some((c) => c !== '' && c !== null && c !== undefined)) return i + 1
    }
    return 0
  }
  clear() { this.rows = [] }
  clearContent() { this.rows = [] }
  deleteRows(start, count) {
    // The one thing we must never do for real from here.
    const removed = this.rows.slice(start - 1, start - 1 + count)
    purgeLog.push({ sheet: this.name, start, count, firstCell: removed[0] && removed[0][0] })
    this.rows.splice(start - 1, count)
  }
}

/**
 * Cosmetic sheet APIs (autoResize*, setFrozen*, hide*) are stubbed generically, but
 * deleteRows / deleteColumns / clear stay REAL because those are the destructive calls
 * the harness exists to keep away from the spreadsheet.
 */
function proxiedSheet(sheet) {
  return new Proxy(sheet, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (value !== undefined) return value
      if (typeof prop === 'string' && /^(auto|set|hide|show|sort|activate|append)/i.test(prop)) return () => {}
      return undefined
    },
  })
}

function makeSpreadsheet(sheets) {
  return {
    getSheetByName: (name) => (sheets[name] ? proxiedSheet(sheets[name]) : null),
    insertSheet: (name) => { sheets[name] = new Sheet(name, []); return proxiedSheet(sheets[name]) },
    getSheets: () => Object.values(sheets).map(proxiedSheet),
  }
}

function formatInTz(date, tz, fmt) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date).reduce((acc, part) => { acc[part.type] = part.value; return acc }, {})
  return fmt
    .replace(/yyyy/g, p.year).replace(/MM/g, p.month).replace(/dd/g, p.day)
    .replace(/HH/g, p.hour).replace(/mm/g, p.minute).replace(/ss/g, p.second)
}

/** Synchronous UrlFetchApp over curl, so supabaseRequest_ sees real responses. */
function fetchSync(url, params) {
  const options = params || {}
  const args = ['-sS', '-D', '-', '--max-time', '60', '-X', String(options.method || 'get').toUpperCase(), url]
  Object.entries(options.headers || {}).forEach(([k, v]) => args.push('-H', `${k}: ${v}`))
  if (options.payload !== undefined) args.push('--data-binary', String(options.payload))

  let raw
  try {
    raw = execFileSync('curl', args, { maxBuffer: 128 * 1024 * 1024 }).toString()
  } catch (error) {
    throw new Error(`UrlFetchApp.fetch failed for ${url}: ${error.message}`)
  }

  const split = raw.indexOf('\r\n\r\n')
  const head = split >= 0 ? raw.slice(0, split) : raw
  const body = split >= 0 ? raw.slice(split + 4) : ''
  const status = (head.match(/HTTP\/[\d.]+\s+(\d{3})/) || [])[1]
  const headers = {}
  head.split(/\r?\n/).forEach((line) => {
    const i = line.indexOf(':')
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim()
  })

  return {
    getResponseCode: () => parseInt(status || '0', 10),
    getContentText: () => body,
    getAllHeaders: () => headers,
  }
}

// ── Load the plan script ────────────────────────────────────────────────────

function loadPlan(planId, props, options) {
  const plan = PLANS[planId]
  if (!plan) {
    throw new Error(`Unknown plan "${planId}". Pick one of: ${Object.keys(PLANS).join(', ')}`)
  }

  const repoRoot = path.resolve(__dirname, '..', '..')
  const scriptPath = path.join(repoRoot, plan.script)
  if (!fs.existsSync(scriptPath)) throw new Error(`Missing ${plan.script} in ${repoRoot}`)

  // The connection test talks to Supabase and to nothing else, so it must keep working
  // when the spreadsheet tabs are the very thing that is unreachable.
  const skipTabs = Boolean(options && options.skipTabs)

  const sheets = {}
  const missing = []
  if (!skipTabs) {
    Object.entries(plan.tabs).forEach(([name, gid]) => {
      const url = `https://docs.google.com/spreadsheets/d/${plan.sheetId}/export?format=csv&gid=${gid}`
      const csv = fetchText(url)
      if (/<html/i.test(csv.slice(0, 200))) { missing.push(name); return }
      sheets[name] = new Sheet(name, csvToGrid(csv))
    })
    if (missing.length) {
      throw new Error(`Could not read ${missing.join(', ')} — check the tab gids in this file. ` +
        'A tab that has been renamed or deleted returns an HTML error page.')
    }
  }

  const logs = []
  const mails = []
  const scriptProps = { ...props }

  const sandbox = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => makeSpreadsheet(sheets),
      flush: () => {},
      getUi: () => ({ alert: () => {}, createMenu: () => ({ addItem: function () { return this }, addSeparator: function () { return this }, addToUi: () => {} }) }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => (key in scriptProps ? scriptProps[key] : null),
        setProperty: (key, value) => { scriptProps[key] = value },
        getProperties: () => ({ ...scriptProps }),
      }),
    },
    UrlFetchApp: { fetch: fetchSync },
    Utilities: {
      formatDate: formatInTz,
      // supabaseKeyRole_ decodes the JWT payload to name the role, so the stubs have to
      // be the real base64 rather than a no-op — otherwise the check silently degrades
      // to "not a JWT" and the test would stop exercising it.
      base64Decode: (encoded) => Buffer.from(encoded, 'base64'),
      newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8') }),
    },
    Session: { getScriptTimeZone: () => 'Asia/Manila' },
    Logger: { log: (line) => logs.push(String(line)) },
    MailApp: { sendEmail: (...args) => mails.push(args.map(String).join(' | ')) },
    ScriptApp: {
      EventType: { CLOCK: 'clock', ON_CHANGE: 'on_change' },
      getProjectTriggers: () => [],
      deleteTrigger: () => {},
      newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => ({}) }), atHour: () => ({ everyDays: () => ({ create: () => ({}) }) }) }), forSpreadsheet: () => ({ onChange: () => ({ create: () => ({}) }) }) }),
    },
  }

  const context = vm.createContext(sandbox)
  vm.runInContext(fs.readFileSync(scriptPath, 'utf8'), context, { filename: plan.script })

  return { plan, sheets, context, logs, mails, scriptProps }
}

// ── Reporting ───────────────────────────────────────────────────────────────

const ok = (s) => `\x1b[32m${s}\x1b[0m`
const bad = (s) => `\x1b[31m${s}\x1b[0m`
const dim = (s) => `\x1b[2m${s}\x1b[0m`

function rule(title) {
  console.log(`\n${title}\n${'─'.repeat(title.length)}`)
}

/**
 * Reads Supabase directly rather than through the stubs, so the closing summary is
 * evidence about the database and not about the harness.
 */
function remoteGet(url, key, pathAndQuery) {
  const args = ['-sS', '--max-time', '60', `${url}/rest/v1/${pathAndQuery}`,
    '-H', `apikey: ${key}`, '-H', `Authorization: Bearer ${key}`]
  return JSON.parse(execFileSync('curl', args, { maxBuffer: 128 * 1024 * 1024 }).toString() || '[]')
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2)
  const planId = args.find((a) => !a.startsWith('-')) || 'bida'
  const upload = args.includes('--upload')
  const dump = args.includes('--dump')
  const gateView = args.includes('--gate-view')
  const connection = args.includes('--connection')

  const props = {
    SUPABASE_URL: process.env.SUPABASE_URL || process.env.SUPABASE_URL_OVERRIDE || '',
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || '',
    ALERT_EMAIL: process.env.ALERT_EMAIL || '',
  }
  // Only the upload leg needs Supabase at all, so a dry run stays completely offline
  // and never needs the privileged key in the environment.
  if ((upload || gateView || connection) && (!props.SUPABASE_URL || !props.SUPABASE_SERVICE_KEY)) {
    console.error('--upload, --gate-view and --connection need SUPABASE_URL and\n' +
      'SUPABASE_SERVICE_KEY in the environment. They are the same two Script Properties the\n' +
      'Apps Script uses; the service_role key lives only in your shell and in Script\n' +
      'Properties, never in this repo.\n' +
      '(--gate-view reads only, so the public anon key is enough for it. --connection is\n' +
      'worth running with the anon key on purpose: it shows the rejection you would get.)')
    process.exit(2)
  }

  const mode = connection ? 'CONNECTION TEST' : upload ? 'UPLOAD + GATE' : 'dry run'
  console.log(`Archive verification — plan "${planId}", mode: ${mode}`)
  const { sheets, context, logs, mails } = loadPlan(planId, props, { skipTabs: connection })
  console.log(dim(`Loaded ${PLANS[planId].script}: ` +
    (Object.entries(sheets).map(([n, s]) => `${n} (${s.rows.length} rows)`).join(', ') ||
      '(script only — no sheet tabs read)')))

  if (connection) {
    // Runs the menu function itself rather than a reimplementation of it: this is the
    // exact code 'Test Supabase Connection' executes inside the spreadsheet. Run it with
    // the anon key to see the failure path, and with service_role to see a pass.
    rule('1. Menu: Test Supabase Connection')
    logs.length = 0
    context.testSupabaseConnection()
    logs.join('\n').split('\n').forEach((line) => console.log(`  ${line}`))
    console.log(dim('\n  (alert() is stubbed in the harness; the log above is the report)'))
    return
  }

  // CONFIG in memory, so the spreadsheet's own CONFIG tab is never touched.
  const setConfig = (dryRun) => {
    sheets['CONFIG'] = new Sheet('CONFIG', [
      ['KEY', 'VALUE'],
      ['ARCHIVE_ENABLED', 'TRUE'],
      ['ARCHIVE_AFTER_DAYS', '7'],
      ['ARCHIVE_DRY_RUN', dryRun ? 'TRUE' : 'FALSE'],
      ['LAST_ARCHIVE', ''],
    ])
  }

  const due = () => context.eligibleMonths_(7)

  rule('1. Which months are due')
  const months = due()
  if (!months.length) {
    console.log('Nothing is due — no month is past month-end + 7 days, or none looks complete.')
  } else {
    months.forEach((m) => console.log(`  ${m.label}  (month_key ${m.key})`))
  }

  rule('2. Dry run — what would be archived, nothing uploaded')
  purgeLog.length = 0
  setConfig(true)
  context.archiveClosedMonths()
  logs.forEach((l) => console.log(`  ${l}`))
  console.log(dim('  (LAST_ARCHIVE was written to the in-memory CONFIG, not the sheet)'))
  if (mails.length) mails.forEach((m) => console.log(bad(`  mail: ${m}`)))

  if (dump) {
    rule('2b. The exact rows the archive would write')
    if (!months.length) {
      console.log(dim('  Nothing due, so there are no rows to show.'))
    } else {
      months.forEach((month) => {
        const rawRows = context.collectRawArchiveRows_(month.key)
        const mtdRows = context.collectMtdArchiveRows_(month.key, month.label)
        console.log(`  sli_raw_daily — ${rawRows.length} rows (${month.key})`)
        rawRows.forEach((r) => console.log(`    ${r.report_date}  ${String(r.area).padEnd(18)} ` +
          `overall=${String(r.is_overall_total).padEnd(5)} bf=${r.bf} inc=${r.inc} ` +
          `comp=${r.total_completed} co=${r.carry_over} mtd=${r.mtd} target=${r.target} pct=${JSON.stringify(r.pct)}`))
        console.log(`  sli_mtd — ${mtdRows.length} rows (${month.key})`)
        mtdRows.forEach((r) => console.log(`    ${String(r.area).padEnd(18)} ` +
          `overall=${String(r.is_overall_total).padEnd(5)} completed=${r.total_completed} ` +
          `last_mtd=${r.last_mtd} target=${r.target} last_pct=${JSON.stringify(r.last_pct)} incoming=${r.total_incoming}`))
      })
    }
  }

  if (upload) {
    rule('3. Upload + gate — the real archive path, stopping before the purge')
    purgeLog.length = 0
    logs.length = 0
    setConfig(false)
    try {
      context.archiveClosedMonths()
    } catch (error) {
      console.log(bad(`  THREW: ${error.message}`))
    }
    logs.forEach((l) => console.log(`  ${l}`))
    if (mails.length) mails.forEach((m) => console.log(bad(`  mail: ${m}`)))
  } else {
    rule('3. Upload + gate')
    console.log(dim('  Skipped. Re-run with --upload to do the real upload and comparison.'))
  }

  rule('4. Purge that the gate would release (NOT applied to Google)')
  if (!purgeLog.length) {
    console.log(dim('  Nothing. Either no month is due, upload was skipped, or the gate refused.'))
  } else {
    purgeLog.forEach((p) => console.log(`  ${p.sheet}: deleteRows(${p.start}, ${p.count})  first cell ${JSON.stringify(p.firstCell)}`))
    const rows = purgeLog.reduce((sum, p) => sum + p.count, 0)
    console.log(`  → ${purgeLog.length} day block(s), ${rows} rows`)
  }

  if (gateView) {
    rule('5. What the gate would measure right now')
    // supabaseCount_ and supabaseSum_ are the two reads the verdict rests on, and they
    // parse PostgREST's Content-Range. Call them directly so their maths is visible
    // before anything depends on it.
    months.forEach((month) => {
      try {
        const rawCount = context.supabaseCount_('sli_raw_daily', `plan=eq.${planId}&month_key=eq.${month.key}`)
        const rawSum = context.supabaseSum_('sli_raw_daily',
          `plan=eq.${planId}&month_key=eq.${month.key}&is_overall_total=eq.false`, 'total_completed')
        const mtdCount = context.supabaseCount_('sli_mtd', `plan=eq.${planId}&month_key=eq.${month.key}`)
        const mtdSum = context.supabaseSum_('sli_mtd',
          `plan=eq.${planId}&month_key=eq.${month.key}&is_overall_total=eq.false`, 'total_completed')
        console.log(`  ${month.label}: sli_raw_daily ${rawCount} rows / sum ${rawSum} · ` +
          `sli_mtd ${mtdCount} rows / sum ${mtdSum}`)
      } catch (error) {
        console.log(bad(`  ${month.label}: ${error.message}`))
      }
    })
    console.log(dim('  A count of -1 means the Content-Range header did not parse; the gate' +
      '\n  treats that as a mismatch and refuses to purge, so it fails safe.'))
  } else {
    rule('5. What the gate would measure right now')
    console.log(dim('  Skipped. Add --gate-view to call supabaseCount_ / supabaseSum_ the way the gate does.'))
  }

  rule('6. What Supabase now holds')
  if (!upload && !gateView) {
    console.log(dim('  Skipped — the dry run does not read Supabase.'))
    console.log('\n' + dim('Reminder: nothing was uploaded, nothing was purged, and the spreadsheet was not written to.'))
    return
  }

  const [url, key] = [props.SUPABASE_URL.replace(/\/+$/, ''), props.SUPABASE_SERVICE_KEY]
  try {
    const raw = remoteGet(url, key, `sli_raw_daily?plan=eq.${planId}&select=month_key,is_overall_total,total_completed`)
    const mtd = remoteGet(url, key, `sli_mtd?plan=eq.${planId}&select=month_key,area,is_overall_total,total_completed,last_pct`)
    const byMonth = (rows) => rows.reduce((acc, r) => {
      acc[r.month_key] = acc[r.month_key] || { rows: 0, sum: 0, days: new Set() }
      acc[r.month_key].rows += 1
      if (!r.is_overall_total) acc[r.month_key].sum += Number(r.total_completed || 0)
      return acc
    }, {})

    console.log('  sli_raw_daily:')
    const rawMonths = byMonth(raw)
    Object.entries(rawMonths).sort().forEach(([m, v]) =>
      console.log(`    ${m}  ${v.rows} rows, area sum ${v.sum}`))
    if (!Object.keys(rawMonths).length) console.log(dim('    (no rows)'))

    console.log('  sli_mtd:')
    mtd.forEach((r) => console.log(`    ${r.month_key}  ${r.area.padEnd(18)} ${r.is_overall_total ? '(overall)' : ''} ` +
      `completed ${r.total_completed}  last_pct ${r.last_pct}`))
    if (!mtd.length) console.log(dim('    (no rows)'))
  } catch (error) {
    console.log(bad(`  Could not read back: ${error.message}`))
  }

  console.log('\n' + dim('Reminder: the purge was recorded, not performed, and the spreadsheet was not written to.\n' +
    'The real scheduled run does the purge itself once the same gate passes.'))
}

if (require.main === module) main()
