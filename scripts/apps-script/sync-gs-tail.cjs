#!/usr/bin/env node
/**
 * Renders scripts/apps-script/gs-tail.template.txt into the TRIGGERS & MENU → EOF
 * region of the three plan scripts.
 *
 * The three Apps Script files are identical apart from the plan name, so a fix used
 * to mean editing all three by hand. This keeps them from drifting: edit the
 * template, run this, paste the three files into their Apps Script projects.
 *
 *   node scripts/apps-script/sync-gs-tail.cjs           # rewrite the three files
 *   node scripts/apps-script/sync-gs-tail.cjs --check   # exit 1 when they differ
 */
const fs = require('fs')
const path = require('path')

const rootDir = path.join(__dirname, '..', '..')
const TEMPLATE = path.join(__dirname, 'gs-tail.template.txt')
const MARKER = '// ==================== TRIGGERS & MENU ===================='

const PLANS = [
  {
    file: 'FIBERXSCRIPT.gs',
    planId: 'fiberx',
    planLabel: 'FIBERX',
    sheetConst: 'FIBERX_SHEET_NAME',
    importFn: 'importFiberxToRawData',
  },
  {
    file: 'BIDASCRIPT.gs',
    planId: 'bida',
    planLabel: 'BIDA',
    sheetConst: 'BIDA_SHEET_NAME',
    importFn: 'importBIDAToRawData',
  },
  {
    file: 'SMESCRIPT.gs',
    planId: 'sme',
    planLabel: 'SME',
    sheetConst: 'SME_SHEET_NAME',
    importFn: 'importSMEToRawData',
  },
]

/** The template is authored with LF; every .gs in this repo is CRLF. */
function toCrlf(text) {
  return text.replace(/\r\n/g, '\n').split('\n').join('\r\n')
}

function render(plan) {
  return toCrlf(
    fs
      .readFileSync(TEMPLATE, 'utf8')
      .replace(/\{\{PLAN_ID\}\}/g, plan.planId)
      .replace(/\{\{PLAN_LABEL\}\}/g, plan.planLabel)
      .replace(/\{\{PLAN_SHEET_CONST\}\}/g, plan.sheetConst)
      .replace(/\{\{IMPORT_FN\}\}/g, plan.importFn)
      .replace(/^/, ''),
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
  const next = head + render(plan)

  if (next === current) {
    console.log(`${plan.file}: up to date`)
    continue
  }

  changed++
  if (checkOnly) {
    console.error(`${plan.file}: STALE — patakbuhin ang node scripts/apps-script/sync-gs-tail.cjs`)
    process.exitCode = 1
  } else {
    fs.writeFileSync(filePath, next)
    console.log(`${plan.file}: updated`)
  }
}

if (checkOnly && changed === 0) console.log('All three plan scripts are in sync.')
