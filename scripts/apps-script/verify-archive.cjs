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
 *   node scripts/apps-script/verify-archive.cjs bida --as-of 2026-10-07  # run as if it were that day
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
 *   --as-of YYYY-MM-DD
 *              Moves the sandbox's clock to that day and prints the cut-off table, so
 *              "what will happen on the 7th" can be answered now. The cut-off maths is
 *              pure date arithmetic and is exact; the COMPLETE column is not, because it
 *              is judged from the rows in the sheet today — a month still being written
 *              reads as incomplete until the next month's rows actually exist.
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
    // A mirror like BIDA's, but PLAN_SHEET_TRIM_ENABLED is false for this plan, so nothing
    // ever calls openById on its source and the id here is only needed to make
    // planSheetIsFormulaDriven_() see a formula-driven sheet. That is the real shape.
    mirrorFormula: `=IMPORTRANGE("https://docs.google.com/spreadsheets/d/FIBERXSOURCEUNKNOWN00000000000/edit", "'FIBERX DAILY'!A1:M")`,
  },
  bida: {
    script: 'BIDASCRIPT.gs',
    sheetId: '1FrEowZ9Zl0jMAyLDe4OZE2cQV04nIz-rjRkLi6uv99M',
    tabs: { 'BIDA NEW REPORT': '1425609870', 'RAW DATA': '486719298', 'MTD': '1061751267' },
    // The mirror's IMPORTRANGE points here, so the window trim can be exercised against
    // the rows it really spills from.
    mirrorFormula: `=IMPORTRANGE("https://docs.google.com/spreadsheets/d/1fTxL4PYEu1ThGGmOIISf9E2h1bPv41TKjiQmAiNZ3W0/edit", "'BIDA DAILY'!A1:M")`,
    mirrorSource: {
      id: '1fTxL4PYEu1ThGGmOIISf9E2h1bPv41TKjiQmAiNZ3W0',
      tab: 'BIDA DAILY',
      csvUrl: 'https://docs.google.com/spreadsheets/d/1fTxL4PYEu1ThGGmOIISf9E2h1bPv41TKjiQmAiNZ3W0/export?format=csv',
    },
  },
  sme: {
    script: 'SMESCRIPT.gs',
    sheetId: '10P3GatvwC76IujPpjHtqgyNjE71ChAoP_8Ln7BDcvTY',
    tabs: { 'SME NEW REPORT': '1425609870', 'RAW DATA': '486719298', 'MTD': '1061751267' },
    mirrorFormula: `=IMPORTRANGE("https://docs.google.com/spreadsheets/d/SMESOURCEUNKNOWN00000000000000/edit", "'SME DAILY'!A1:M")`,
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

/** 'A' → 1, 'M' → 13 — the column a mirror's range ends at. */
function colNumber(letters) {
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n
}

function fetchText(url) {
  return execFileSync('curl', ['-sS', '-L', '--max-time', '60', url], {
    maxBuffer: 128 * 1024 * 1024,
  }).toString()
}

// ── Apps Script sheet stubs ─────────────────────────────────────────────────

const purgeLog = []

// Spreadsheets other than the active one. Only a plan with PLAN_SHEET_TRIM_ENABLED needs
// one, because only the trim calls SpreadsheetApp.openById.
const externalSheets = {}

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
  // Formula support is not cosmetic: the window trim reads A1's formula, and the generic
  // stub below used to swallow setFormula() into a silent no-op — a test that "passed"
  // while writing nothing. These are real.
  getFormula() { return this.sheet.formulas[`${this.row},${this.col}`] || '' }
  getFormulas() {
    const { rows, cols } = this._bounds()
    const out = []
    for (let r = 0; r < rows; r++) {
      const line = []
      for (let c = 0; c < cols; c++) {
        line.push(this.sheet.formulas[`${this.row + r},${this.col + c}`] || '')
      }
      out.push(line)
    }
    return out
  }
  setFormula(formula) {
    this.sheet.formulas[`${this.row},${this.col}`] = String(formula)
    this.sheet.renderSpill()
    return this
  }
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
    this.formulas = {}
    // A mirror is modelled the way Sheets really behaves: the formula sits in the anchor
    // cell and IMPORTRANGE spills the SOURCE grid from the range's start row down. Keeping
    // the whole source here is what makes moving that start row actually change the rows.
    this.spillSource = null
  }
  /** Re-spill from the stored formula's range, the way IMPORTRANGE would. */
  renderSpill() {
    const formula = this.formulas['1,1'] || ''
    if (!this.spillSource || !formula) return
    const spec = /!A(\d+):([A-Z]+)/.exec(formula)
    if (!spec) return
    const start = parseInt(spec[1], 10)
    const endCol = colNumber(spec[2])
    this.rows = this.spillSource.slice(start - 1).map((r) => r.slice(0, endCol))
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

  // The live CSV export is a grid of values with no formula in it, so the mirror has to be
  // seeded with the formula the spreadsheet actually holds. Without that,
  // planSheetIsFormulaDriven_() would call the real NEW REPORT "hand-encoded" and the
  // purge would take a path it never takes on the day.
  const reportTab = Object.keys(plan.tabs).find((name) => /NEW REPORT$/.test(name))
  if (reportTab && sheets[reportTab] && plan.mirrorFormula) {
    sheets[reportTab].formulas['1,1'] = plan.mirrorFormula

    if (plan.mirrorSource) {
      const grid = csvToGrid(fetchText(plan.mirrorSource.csvUrl))
      externalSheets[plan.mirrorSource.id] = {
        [plan.mirrorSource.tab]: new Sheet(plan.mirrorSource.tab, grid),
      }
      sheets[reportTab].spillSource = grid
      sheets[reportTab].renderSpill()
    }
  }

  const logs = []
  const mails = []
  const scriptProps = { ...props }

  const sandbox = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => makeSpreadsheet(sheets),
      // Only the window trim reaches for another spreadsheet, and only for the plan whose
      // PLAN_SHEET_TRIM_ENABLED is true. Anything unregistered throws, which is exactly
      // what "no access to that file" does in Apps Script.
      openById: (id) => {
        if (!externalSheets[id]) throw new Error(`No access to spreadsheet ${id}`)
        return makeSpreadsheet(externalSheets[id])
      },
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
      // The trim polls for the spill to settle; in the harness renderSpill is synchronous,
      // so the wait is a no-op and the first poll already succeeds.
      sleep: () => {},
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

  return { plan, sheets, context, logs, mails, scriptProps, externalSheets }
}

// ── Time travel ─────────────────────────────────────────────────────────────

/**
 * Moves the sandbox's clock. `eligibleMonths_` asks `new Date()` three times (`today`,
 * the cut-off and the month's last day), so replacing the context's Date is enough to
 * evaluate the whole decision as of another day — no date maths is duplicated here.
 *
 * The hour is fixed at noon UTC so a timezone offset cannot push the answer onto the
 * neighbouring day; the cut-off is a whole-day comparison either way.
 */
function setClock(context, isoDate) {
  const epoch = Date.parse(`${isoDate}T12:00:00Z`)
  if (Number.isNaN(epoch)) {
    throw new Error(`--as-of wants YYYY-MM-DD (e.g. 2026-10-07), got "${isoDate}"`)
  }
  vm.runInContext(`
    (function () {
      var Real = Date;
      var fixed = ${epoch};
      function FakeDate() {
        if (arguments.length === 0) return new Real(fixed);
        // Reflect.construct keeps every arity working, so new Date(y, m, d) does not
        // silently become an Invalid Date from a padded-out undefined milliseconds arg.
        return Reflect.construct(Real, Array.prototype.slice.call(arguments));
      }
      FakeDate.prototype = Real.prototype;
      FakeDate.now = function () { return fixed; };
      FakeDate.parse = Real.parse;
      FakeDate.UTC = Real.UTC;
      globalThis.Date = FakeDate;
    })();
  `, context)
}

// ── Report the cut-off, month by month ──────────────────────────────────────

/**
 * Every month in RAW DATA with the three dates the decision turns on. The rules are
 * read from the plan script itself (`archiveCutoff_`, `lastDayOfMonth_`, `todayMidnight_`)
 * rather than reimplemented, so this cannot disagree with what the job will do.
 */
function cutoffTable(context, sheets, afterDays) {
  const grid = (sheets['RAW DATA'] || { rows: [] }).rows
  const months = new Map()
  let overallLast = null

  for (let i = 1; i < grid.length; i++) {
    const date = context.parseAnyDate_(grid[i][0])
    if (!date) continue
    if (!overallLast || date.getTime() > overallLast.getTime()) overallLast = date
    const key = context.monthKeyOf_(date)
    if (!months.has(key)) months.set(key, { first: date, last: date })
    const entry = months.get(key)
    if (date.getTime() < entry.first.getTime()) entry.first = date
    if (date.getTime() > entry.last.getTime()) entry.last = date
  }

  const today = context.todayMidnight_()
  // Local components, never toISOString(): the script builds its dates with
  // `new Date(y, m, d)`, so a UTC render shows every one of them a day early
  // anywhere east of Greenwich — which is exactly where this runs.
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-` +
    `${String(d.getDate()).padStart(2, '0')}`
  const rows = []

  for (const [key, entry] of [...months.entries()].sort()) {
    const cutoff = context.archiveCutoff_(entry.first, afterDays)
    const monthEnd = context.lastDayOfMonth_(entry.first)
    const cutoffPassed = cutoff.getTime() <= today.getTime()
    // Same two clauses as eligibleMonths_: the last calendar day is encoded, or
    // encoding has already moved on to a later month (which is what happens to a
    // just-finished month once the new month's first rows land).
    let complete = entry.last.getTime() >= monthEnd.getTime()
    if (!complete && overallLast && context.monthKeyOf_(overallLast) > key) complete = true
    rows.push({ key, entry, cutoff, monthEnd, cutoffPassed, complete })
  }
  return { rows, iso, overallLast }
}

// ── Reporting ───────────────────────────────────────────────────────────────

const ok = (s) => `\x1b[32m${s}\x1b[0m`
const bad = (s) => `\x1b[31m${s}\x1b[0m`
const dim = (s) => `\x1b[2m${s}\x1b[0m`

function rule(title) {
  console.log(`\n${title}\n${'─'.repeat(title.length)}`)
}

// The window trim is judged by what the sheet ends up showing, so the checks below read
// the harness's own mirror rather than trusting a return value on its own.
let checks = 0
let failures = 0

function check(label, condition, detail) {
  checks++
  if (!condition) failures++
  console.log(`  ${condition ? ok('PASS') : bad('FAIL')} ${label}` +
    (detail === undefined ? '' : `  ${dim(detail)}`))
}

function finish() {
  if (!checks) return
  if (failures) {
    console.log(bad(`\n${failures} of ${checks} check(s) FAILED.`))
    process.exitCode = 1
  } else {
    console.log(ok(`\nAll ${checks} checks passed.`))
  }
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
  const asOfIndex = args.indexOf('--as-of')
  const asOf = asOfIndex === -1 ? null : (args[asOfIndex + 1] || '')
  if (asOfIndex !== -1 && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    console.error(`--as-of wants YYYY-MM-DD (e.g. 2026-10-07)`)
    process.exit(2)
  }
  const afterDaysForReport = 7

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
  const { plan, sheets, context, logs, mails, externalSheets: externals } =
    loadPlan(planId, props, { skipTabs: connection })
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

  if (asOf) {
    // Before anything reads the clock — every later section then behaves as if it were
    // that day, including the purge blocks the gate would release.
    setClock(context, asOf)
    rule(`1a. Cut-off table — as if today were ${asOf}`)
    const table = cutoffTable(context, sheets, afterDaysForReport)
    if (!table.rows.length) console.log(dim('  RAW DATA has no dated rows.'))
    for (const r of table.rows) {
      console.log(`  ${r.key}  ${(r.cutoffPassed ? 'past cut-off' : 'before cut-off').padEnd(15)}` +
        ` cut-off ${table.iso(r.cutoff)}` +
        `  month ends ${table.iso(r.monthEnd)}` +
        `  encoded to ${table.iso(r.entry.last)}` +
        `  ${r.complete ? ok('COMPLETE') : 'incomplete'}`)
    }
    console.log(dim('\n  The cut-off column is exact. COMPLETE is judged from the rows in the sheet' +
      '\n  TODAY, so a month that is still being written reads as incomplete until the' +
      '\n  next month has rows — on the real day that clause is what releases it.'))
  }


  // CONFIG in memory, so the spreadsheet's own CONFIG tab is never touched.
  // ARCHIVE_TRIM is the switch the window trim hangs off, and ARCHIVE_PURGE the one row
  // deletion does — two switches, so the harness has to be able to hold them apart.
  const setConfig = (dryRun, purge, trim) => {
    const rows = [
      ['KEY', 'VALUE'],
      ['ARCHIVE_ENABLED', 'TRUE'],
      ['ARCHIVE_AFTER_DAYS', '7'],
      ['ARCHIVE_DRY_RUN', dryRun ? 'TRUE' : 'FALSE'],
      ['ARCHIVE_PURGE', purge === false ? 'FALSE' : 'TRUE'],
    ]
    // Left out entirely when undefined, so the run falls back to the key's own default
    // rather than to a value the harness chose.
    if (trim !== undefined) rows.push(['ARCHIVE_TRIM', trim === false ? 'FALSE' : 'TRUE'])
    rows.push(['LAST_ARCHIVE', ''])
    sheets['CONFIG'] = new Sheet('CONFIG', rows)
  }

  /** The LAST_ARCHIVE line, which is where a run's own account of itself ends up. */
  const auditLine = () => {
    const config = sheets['CONFIG']
    if (!config) return ''
    const row = config.rows.find((r) => String(r[0]).toUpperCase() === 'LAST_ARCHIVE')
    return row ? String(row[1]) : ''
  }

  const due = () => context.eligibleMonths_(7)

  rule('1b. Which months are due')
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
        const mtdRows = context.deriveMtdArchiveRows_(rawRows, month.key, month.label)
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
    rule('3. Upload + gate — the real archive path, as production is configured')
    purgeLog.length = 0
    logs.length = 0
    // ARCHIVE_PURGE = FALSE, ARCHIVE_TRIM = TRUE: nothing on a hand-encoded tab is ever
    // deleted, while a mirror's window still moves once the month is verified.
    setConfig(false, false, true)
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

  const reportTabName = Object.keys(plan.tabs).find((name) => /NEW REPORT$/.test(name))
  const mirror = () => sheets[reportTabName]
  const anchorFormula = () => (mirror() ? mirror().getRange(1, 1).getFormula() : '')
  const windowMonths = () => (mirror() ? context.mirrorMonthKeys_() : [])
  const sourceRows = (() => {
    const src = plan.mirrorSource && externals[plan.mirrorSource.id]
    return src ? src[plan.mirrorSource.tab].rows : null
  })()

  /** The mirror as the spreadsheet really holds it: the formula in A1, spilling the source. */
  const resetMirror = (formula) => {
    if (!sourceRows) return
    const sheet = sheets[reportTabName]
    sheet.formulas = { '1,1': formula || plan.mirrorFormula }
    sheet.spillSource = sourceRows
    sheet.renderSpill()
  }

  rule('4. What shrank the sheet, and how (NOT applied to Google)')
  if (purgeLog.length) {
    purgeLog.forEach((p) => console.log(`  ${p.sheet}: deleteRows(${p.start}, ${p.count})  first cell ${JSON.stringify(p.firstCell)}`))
    const rows = purgeLog.reduce((sum, p) => sum + p.count, 0)
    console.log(`  → ${purgeLog.length} day block(s), ${rows} rows — a hand-encoded sheet`)
  } else {
    console.log(dim('  deleteRows: nothing, and that is correct here. A formula-driven sheet is'))
    console.log(dim('  narrowed by moving its range — deleting formula output would tear the'))
    console.log(dim('  formula out of A1 instead (2026-09-21).'))
  }
  if (mirror()) {
    console.log(`  ${reportTabName} A1:`)
    console.log(`    ${anchorFormula() || dim('(no formula — reads as hand-encoded)')}`)
    console.log(`    shows ${windowMonths().join(', ') || dim('nothing')}  (${mirror().rows.length} rows)`)
  }
  // Captured before anything re-seeds CONFIG, because setConfig writes a blank
  // LAST_ARCHIVE — the run's own account of itself would otherwise be lost here.
  const archiveAudit = auditLine()
  if (archiveAudit) console.log(`  LAST_ARCHIVE: ${archiveAudit}`)

  if (sourceRows) {
    rule('4b. The formula window — moved, not deleted')
    resetMirror()
    const beforeRows = mirror().rows.length
    setConfig(false, false, true)
    const trim = context.trimPlanSheetFormula_(['2026-08'], false)

    // The expected row read from the SOURCE, the same way the script reads it — an
    // assertion pinned to "row 19" would go stale the moment the source gains a row.
    let expectedRow = -1
    for (let i = 0; i < sourceRows.length; i++) {
      const date = context.blockDateOf_(sourceRows[i][0])
      if (date && context.monthKeyOf_(date) === '2026-09') { expectedRow = i + 1; break }
    }
    const anchor = (/!A(\d+):/.exec(anchorFormula()) || [])[1]

    check('the trim reports a change', trim.changed === true,
      trim.reason ? trim.reason : `A${trim.from} → A${trim.to}`)
    check('it starts the window at the source row of the next month',
      anchor === String(expectedRow), `expected A${expectedRow}, formula has A${anchor}`)
    check('the old start row was 1', trim.from === 1)
    check('the window now starts at 2026-09', windowMonths()[0] === '2026-09', windowMonths().join(', '))
    check('2026-08 is gone from the window', !windowMonths().includes('2026-08'))
    check('the window got smaller', mirror().rows.length < beforeRows,
      `${beforeRows} → ${mirror().rows.length} rows`)
    check('nothing was deleted to do it', purgeLog.length === 0)
    if (upload) {
      check('the audit line records the trim', /Formula trim/.test(archiveAudit), archiveAudit)
      check('the archive itself deleted nothing', /walang binura/.test(archiveAudit), archiveAudit)
    } else {
      console.log(dim('  (the LAST_ARCHIVE line above is the dry run\'s — add --upload for the real one)'))
    }

    rule('4g. The gate — ARCHIVE_TRIM decides, not ARCHIVE_PURGE')
    // A dry run deliberately skips the `fullSync()` a real run starts with, so it judges
    // the RAW DATA tab as the sheet currently holds it — and that tab is whatever the last
    // Full Sync wrote, which can be a single running month with nothing closed in it. A
    // gate test pinned to that would pass on some days and fail on others; rebuild it here
    // the way a real run does, in the harness's own sheets, so the section is deterministic.
    resetMirror()
    context.fullSync()
    setConfig(true, false, false)
    context.archiveClosedMonths()
    const trimOffNote = auditLine()
    check('with ARCHIVE_TRIM = FALSE the window is left alone',
      /ARCHIVE_TRIM/.test(trimOffNote), trimOffNote)
    check('and the formula is untouched', anchorFormula() === plan.mirrorFormula, anchorFormula())

    resetMirror()
    setConfig(true, false, true)
    context.archiveClosedMonths()
    const trimOnNote = auditLine()
    check('with ARCHIVE_TRIM = TRUE the run previews the move',
      /→ A\d+:M/.test(trimOnNote), trimOnNote)
    check('the preview names the month it would start at', /magsisimula sa 2026-\d\d/.test(trimOnNote),
      trimOnNote)
    resetMirror()

    // The strongest local proof available: a REAL (non-dry) run of archiveClosedMonths,
    // with the three Supabase calls swapped for an in-memory table that only holds what
    // the run itself sent. Nothing reaches the network, and the gate is judged against
    // the upload rather than against a hand-fed answer.
    rule('4h. End to end — one real archive run with Supabase held in memory')
    resetMirror()
    purgeLog.length = 0
    setConfig(false, false, true)
    const realUpsert = context.supabaseUpsert_
    const realCount = context.supabaseCount_
    const realSum = context.supabaseSum_
    const sent = {}
    const monthIn = (filter) => {
      const m = /month_key=eq\.([\d-]+)/.exec(filter)
      return m ? m[1] : ''
    }
    const heldRows = (table, filter) => (sent[table] || [])
      .filter((r) => monthIn(filter) === r.month_key)
    context.supabaseUpsert_ = (table, rows) => {
      sent[table] = (sent[table] || []).concat(rows)
    }
    context.supabaseCount_ = (table, filter) => heldRows(table, filter).length
    context.supabaseSum_ = (table, filter) => {
      const skipOverall = /is_overall_total=eq\.false/.test(filter)
      return heldRows(table, filter)
        .filter((r) => !skipOverall || !r.is_overall_total)
        .reduce((sum, r) => sum + Number(r.total_completed || 0), 0)
    }
    try {
      context.archiveClosedMonths()
    } catch (error) {
      console.log(bad(`  THREW: ${error.message}`))
    }
    context.supabaseUpsert_ = realUpsert
    context.supabaseCount_ = realCount
    context.supabaseSum_ = realSum
    const e2e = auditLine()
    check('the run archived the month', /archived \d+ RAW/.test(e2e), e2e)
    check('and trimmed the window in the same pass', /Formula trim/.test(e2e), e2e)
    check('with ARCHIVE_PURGE = FALSE, so nothing was deleted',
      /walang binura/.test(e2e) && purgeLog.length === 0, e2e)
    check('the window now starts at September', windowMonths()[0] === '2026-09',
      windowMonths().join(', '))
    check('and the formula points past row 1', /!A\d+:M/.test(anchorFormula()) &&
      !/!A1:M/.test(anchorFormula()), anchorFormula())
    resetMirror()

    rule('4c. Guard — a month left behind blocks the trim')
    resetMirror()
    const realBlocks = context.mirrorBlocks_
    context.mirrorBlocks_ = () => [{ monthKey: '2026-07', row: 1, date: new Date(2026, 6, 1) }]
      .concat(realBlocks.call(context))
    const blocked = context.trimPlanSheetFormula_(['2026-08'], true)
    context.mirrorBlocks_ = realBlocks
    check('the trim refuses', blocked.changed === false && !blocked.dryRun)
    check('and names the month it would have dropped', /2026-07/.test(blocked.reason), blocked.reason)
    check('the formula was never touched', anchorFormula() === plan.mirrorFormula)

    resetMirror()
    const noSuccessor = context.trimPlanSheetFormula_(['2026-08', '2026-09'], true)
    check('and with no later month to start at it refuses too',
      noSuccessor.changed === false && !noSuccessor.dryRun, noSuccessor.reason)

    rule('4d. Guard — the old formula goes back when the spill does not land')
    resetMirror()
    const realBlocks2 = context.mirrorBlocks_
    let blockCalls = 0
    context.mirrorBlocks_ = () => {
      blockCalls++
      // The pre-check sees the real window; every poll after the write reports another
      // month, which is what a stale or mis-pointed IMPORTRANGE looks like.
      return blockCalls === 1
        ? realBlocks2.call(context)
        : [{ monthKey: '1999-01', row: 1, date: new Date(1999, 0, 1) }]
    }
    const rolled = context.trimPlanSheetFormula_(['2026-08'], false)
    context.mirrorBlocks_ = realBlocks2
    check('the trim refuses', rolled.changed === false)
    check('and says the range did not settle', /nag-settle/.test(rolled.reason), rolled.reason)
    check('the original range is back', anchorFormula() === plan.mirrorFormula, anchorFormula())
    check('the window is untouched', windowMonths()[0] === '2026-08', windowMonths().join(', '))

    rule('4e. A hand-encoded sheet still deletes its rows')
    sheets[reportTabName] = new Sheet(reportTabName, sourceRows.map((r) => r.slice(0, 13)))
    check('the tab now reads as hand-encoded', context.planSheetIsFormulaDriven_() === false)
    purgeLog.length = 0
    const purged = context.purgeMonthFromNewReport_('2026-08', false)
    check('the August month blocks are deleted', purged.rows > 0 && purgeLog.length > 0,
      `${purgeLog.length} block(s), ${purged.rows} rows`)
    check('and the next month is left where it was', windowMonths()[0] === '2026-09',
      windowMonths().join(', '))

    rule('4f. Rollback — the full-history formula')
    resetMirror()
    context.trimPlanSheetFormula_(['2026-08'], false)
    const narrowed = anchorFormula()
    context.restorePlanSheetFormula()
    check('it was narrowed first', !/!A1:M/.test(narrowed), narrowed)
    check('the range is back to A1:M', /!A1:M/.test(anchorFormula()), anchorFormula())
    check('the whole history is in the window again', windowMonths().includes('2026-08'),
      windowMonths().join(', '))
  } else {
    rule('4b. The formula window')
    console.log(dim(`  ${planId} has PLAN_SHEET_TRIM_ENABLED = false, so no window moves here.`))
    check('nothing was deleted on this plan either', !/purged \d+ NEW REPORT rows/.test(archiveAudit))
    if (mirror()) {
      const disabled = context.trimPlanSheetFormula_(['2026-08'], true)
      check('the trim stands down for this plan', disabled.changed === false && !disabled.dryRun)
      console.log(dim(`  trimPlanSheetFormula_ → ${disabled.reason}`))
    }
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
    finish()
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

  finish()
  console.log('\n' + dim('Reminder: any delete was recorded, not performed, and the spreadsheet was not\n' +
    'written to. The real scheduled run shrinks the sheet itself once the gate passes.'))
}

if (require.main === module) main()
