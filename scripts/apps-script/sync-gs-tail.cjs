#!/usr/bin/env node
/**
 * Renders scripts/apps-script/gs-tail.template.txt into the TRIGGERS & MENU → EOF
 * region of the three plan scripts.
 *
 * The three Apps Script files are identical apart from the plan name, so a fix used
 * to mean editing all three by hand. This keeps them from drifting: edit the
 * template, run this, paste the three files into their Apps Script projects.
 *
 * Each file also carries a build id in its own SCRIPT_BUILD, hashed from the head and
 * the template, so a pasted project can say which build of the code it holds — see
 * buildId() below and 'Show Version' in the plan menu.
 *
 *   node scripts/apps-script/sync-gs-tail.cjs           # rewrite the three files
 *   node scripts/apps-script/sync-gs-tail.cjs --check   # exit 1 when they differ
 */
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const rootDir = path.join(__dirname, '..', '..')
const TEMPLATE = path.join(__dirname, 'gs-tail.template.txt')
const MARKER = '// ==================== TRIGGERS & MENU ===================='

// Read once: every plan renders the same source, and buildId() hashes it.
const TEMPLATE_TEXT = fs.readFileSync(TEMPLATE, 'utf8')
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')).version

const PLANS = [
  {
    file: 'FIBERXSCRIPT.gs',
    planId: 'fiberx',
    planLabel: 'FIBERX',
    sheetConst: 'FIBERX_SHEET_NAME',
    importFn: 'importFiberxToRawData',
    trimEnabled: true,
  },
  {
    file: 'BIDASCRIPT.gs',
    planId: 'bida',
    planLabel: 'BIDA',
    sheetConst: 'BIDA_SHEET_NAME',
    importFn: 'importBIDAToRawData',
    trimEnabled: true,
  },
  {
    file: 'SMESCRIPT.gs',
    planId: 'sme',
    planLabel: 'SME',
    sheetConst: 'SME_SHEET_NAME',
    importFn: 'importSMEToRawData',
    trimEnabled: true,
  },
]

/** The template is authored with LF; every .gs in this repo is CRLF. */
function toCrlf(text) {
  return text.replace(/\r\n/g, '\n').split('\n').join('\r\n')
}

/** An LF checkout and a CRLF one have to hash the same, so hashed text comes through here. */
const lf = (text) => text.replace(/\r\n/g, '\n')

/**
 * The build id a plan script carries: the app version plus a short hash of everything that
 * goes into the file — the hand-maintained head and this template. Any edit to either changes
 * it, so 'Show Version' in a plan's menu answers the one question a paste cannot: is this
 * project running the file the repo has?
 *
 * The rendered output is deliberately not part of the input — the stamp lives inside it — so
 * the value is stable across runs and `--check` stays meaningful.
 */
function buildId(head, plan) {
  const digest = crypto
    .createHash('sha256')
    .update([lf(head), lf(TEMPLATE_TEXT), plan.planId].join('\n'))
    .digest('hex')
  return `${APP_VERSION}+${digest.slice(0, 8)}`
}

function render(plan, build) {
  return toCrlf(
    TEMPLATE_TEXT
      .replace(/^\uFEFF/, '')
      .replace(/\{\{PLAN_ID\}\}/g, plan.planId)
      .replace(/\{\{PLAN_LABEL\}\}/g, plan.planLabel)
      .replace(/\{\{PLAN_SHEET_CONST\}\}/g, plan.sheetConst)
      .replace(/\{\{IMPORT_FN\}\}/g, plan.importFn)
      .replace(/\{\{PLAN_TRIM_ENABLED\}\}/g, plan.trimEnabled ? 'true' : 'false')
      .replace(/\{\{SCRIPT_BUILD\}\}/g, build),
  )
}

const checkOnly = process.argv.includes('--check')
let changed = 0

for (const plan of PLANS) {
  const filePath = path.join(rootDir, plan.file)
  const current = fs.readFileSync(filePath, 'utf8')

  const markerAt = current.indexOf(MARKER)
  if (markerAt === -1) {
    console.error(`${plan.file}: hindi mahanap ang "${MARKER}" marker — nilaktawan.`)
    process.exitCode = 1
    continue
  }

  // Keep whatever precedes the marker byte-for-byte, apart from the newline that
  // separated the previous section from it.
  const head = current.slice(0, markerAt).replace(/\r?\n$/, '\r\n')
  const build = buildId(head, plan)
  const next = head + render(plan, build)

  if (next === current) {
    console.log(`${plan.file}: up to date (build ${build})`)
    continue
  }

  changed++
  if (checkOnly) {
    console.error(`${plan.file}: STALE at build ${build} — patakbuhin ang node scripts/apps-script/sync-gs-tail.cjs`)
    process.exitCode = 1
  } else {
    fs.writeFileSync(filePath, next)
    console.log(`${plan.file}: updated (build ${build})`)
  }
}

if (checkOnly && changed === 0) console.log('All three plan scripts are in sync.')
