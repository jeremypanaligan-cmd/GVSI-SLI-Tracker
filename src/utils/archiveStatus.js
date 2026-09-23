/**
 * What the archiver said about itself, read from a plan's `CONFIG` tab.
 *
 * The window trim writes its verdict into one cell — `LAST_ARCHIVE` — through the Apps
 * Script's `auditArchive_()`. That cell is the only place a *refusal* is explained: "the
 * month is verified in Supabase, the sheet did not shrink, and here is which guard stopped
 * it". Reading it meant opening the spreadsheet, which is exactly the trip the Developer
 * console exists to save. Each plan's `CONFIG` tab is published for the same reason its
 * `RAW DATA` tab is, so the console can say this in English instead.
 *
 * The audit line is Tagalog-ish prose written by the script, so the raw text is quoted
 * verbatim next to a translated verdict: the record is evidence and should not be
 * paraphrased away, but the console itself reads as English.
 *
 * Pure except for `fetchArchiveStatus`. Nothing in the data path calls this module — a
 * failure here leaves the trim row blank and never changes what the dashboard shows.
 */

/**
 * `SETTING,VALUE` rows. Google quotes a value that contains a comma, which `LAST_ARCHIVE`
 * can, since it is prose (an unquoted comma would otherwise split the row).
 */
function splitRow(row) {
  const cells = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < row.length; i++) {
    const ch = row[i]
    if (quoted) {
      if (ch === '"') {
        if (row[i + 1] === '"') { cell += '"'; i++ } else { quoted = false }
      } else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { cells.push(cell); cell = '' }
    else cell += ch
  }
  cells.push(cell)
  return cells
}

export function parseConfigValues(csv) {
  const values = {}
  const lines = String(csv || '').replace(/\r\n/g, '\n').split('\n')

  for (const line of lines) {
    if (!line.trim()) continue
    const cells = splitRow(line)
    const key = String(cells[0] || '').trim().toUpperCase()
    if (!key || key === 'SETTING') continue
    values[key] = cells.length > 1 ? cells.slice(1).join(',').trim() : ''
  }
  return values
}

const truthy = (value) => String(value ?? '').trim().toUpperCase() === 'TRUE'

/** `A1:M → A19:M`, in either half of the line. */
const RANGE_MOVE = /A(\d+):([A-Z]+)\s*→\s*A(\d+):([A-Z]+)/
const PREVIEW_MONTH = /magsisimula sa ([\d-]+)/
const MOVED_MONTH = /mula na lang sa ([\d-]+)/

/**
 * The parenthetical after a window move: `(mula na lang sa 2026-09; <note>)`. Cut by index
 * rather than by pattern, because the note can itself carry parentheses — "hindi mabuksan
 * ang source sheet (permission)" — and a regex that stops at the first `)` would drop it.
 */
function moveNote(segment) {
  const open = segment.indexOf('(')
  const close = segment.lastIndexOf(')')
  if (open < 0 || close < open) return ''

  const inner = segment.slice(open + 1, close)
  const semicolon = inner.indexOf(';')
  return (semicolon < 0 ? inner : inner.slice(semicolon + 1)).trim().replace(/\.$/, '')
}

/**
 * The guards' verdicts, in the script's own words → what they mean. Each pattern may carry
 * capture groups, referenced as `$1`, `$2` in the English sentence. An unrecognised reason
 * keeps the script's text, which is better than inventing a translation for a guard that
 * was added after this table.
 */
const GLOSSES = [
  [/PLAN_SHEET_TRIM_ENABLED = false/,
    "this plan's window trim is off in its Apps Script (PLAN_SHEET_TRIM_ENABLED), so its " +
    'window never moves — CONFIG alone cannot turn it on'],
  [/hindi IMPORTRANGE/,
    "the tab's A1 is not an IMPORTRANGE with an A<n>:M range, so the window is not touched"],
  [/walang na-archive sa run na ito/,
    'no month was archived in that run, so there was nothing to start past'],
  [/walang day block/,
    'no day block was found in the report tab'],
  [/walang buwan na mas bago sa ([\d-]+)/,
    'the tab still holds no month newer than $1, so the window has nowhere to start yet'],
  [/hindi tinatrim — may buwan pang hindi archived bago ang ([\d-]+): ([\d-]+(?:, [\d-]+)*)/,
    '$2 — older than the new start $1, and still not archived'],
  [/hindi nag-settle/,
    'the range did not settle after it was written, so the old formula was put back'],
  [/sheet not found/,
    'the report tab was not found in the spreadsheet'],
  [/hindi mahanap ang ([\d-]+)/,
    '$1 was not found in the report tab'],
  [/hindi naka-TRUE ang ARCHIVE_TRIM/,
    'ARCHIVE_TRIM is FALSE in this plan\'s CONFIG, so no run moves the window'],
  [/hindi naka-TRUE ang ARCHIVE_PURGE/,
    'ARCHIVE_PURGE is FALSE, so rows are never deleted from this tab'],
  [/formula-driven — ang window ng/,
    'the window moves once, after every due month has been archived and verified'],
]

function gloss(reason) {
  const text = String(reason || '')
  for (const [pattern, english] of GLOSSES) {
    const match = pattern.exec(text)
    if (match) return english.replace(/\$(\d)/g, (_, digit) => match[Number(digit)] || '')
  }
  return ''
}

/**
 * Where the new start row came from, in English. The script records either the source tab
 * or a fallback to counting in the mirror, and the reason it fell back is worth reading.
 */
function provenance(note) {
  const text = String(note || '')
  if (/row mula sa source sheet/.test(text)) return 'the source tab'

  const fallback = text.match(/galing sa mirror\s*—\s*([\s\S]*)$/)
  if (!fallback) return ''

  const reason = fallback[1]
  if (/hindi mabuksan ang source sheet/.test(reason)) {
    return 'the mirror, because the source sheet could not be opened'
  }
  const missingTab = reason.match(/walang "([^"]*)" tab sa source sheet/)
  if (missingTab) return `the mirror, because the source sheet has no "${missingTab[1]}" tab`
  const noBlock = reason.match(/wala pang ([\d-]+) na block sa source sheet/)
  if (noBlock) return `the mirror, because the source sheet has no ${noBlock[1]} block yet`
  return 'the mirror'
}

function readTrim(segment, monthNote, dryRun) {
  // A run that throws, or whose gate does not match, never reaches the trim — and the note
  // says so earlier in the line than any trim verdict would.
  if (/\bFAILED:/.test(monthNote)) {
    return { status: 'failed', reason: 'the run threw before it finished', english: 'nothing was uploaded, deleted or trimmed' }
  }
  if (/VERIFICATION FAILED/.test(monthNote)) {
    return { status: 'blocked', reason: 'the gate did not match', english: 'nothing was deleted and the window was left alone' }
  }

  // A run that had nothing to do still says something: no month had reached its cut-off
  // yet, which is the normal answer on most days.
  if (/Walang buwang due pa/.test(monthNote)) {
    return {
      status: 'idle',
      reason: 'no month was due yet',
      english: 'nothing was eligible — a month becomes archivable a few days after it ends',
    }
  }

  if (segment) {
    if (/hindi isinagawa/.test(segment)) {
      const reason = (segment.match(/hindi isinagawa\s*—\s*([\s\S]*?)\.?\s*$/) || [])[1] || segment
      return { status: 'refused', reason, english: gloss(reason) }
    }
    const move = segment.match(RANGE_MOVE)
    if (move) {
      const note = moveNote(segment)
      return {
        status: 'moved',
        from: move[1], fromCol: move[2], to: move[3], toCol: move[4],
        monthKey: (segment.match(MOVED_MONTH) || [])[1] || '',
        note: note.trim(),
        provenance: provenance(note),
        reason: '',
        english: '',
      }
    }
  }

  // A dry run never writes a `Formula trim:` segment — it puts the preview inside the
  // month's own note, which is also where a stand-down explains itself.
  const preview = monthNote.match(/ang window ng [\s\S]*?ay A(\d+):([A-Z]+)\s*→\s*A(\d+):([A-Z]+)/)
  if (dryRun && preview) {
    return {
      status: 'would-move',
      from: preview[1], fromCol: preview[2], to: preview[3], toCol: preview[4],
      monthKey: (monthNote.match(PREVIEW_MONTH) || [])[1] || '',
      reason: '',
      english: '',
    }
  }

  const standDown = monthNote.match(/walang itatrim sa formula\s*—\s*([\s\S]*?)\.?\s*$/) ||
    monthNote.match(/Walang buburahin\s*—\s*([\s\S]*?)\.?\s*$/) ||
    monthNote.match(/walang binura\s*—\s*([\s\S]*?)\.?\s*$/)
  if (standDown) {
    const reason = standDown[1]
    return { status: 'idle', reason, english: gloss(reason) }
  }

  return { status: 'unreported', reason: '', english: '' }
}

function readLastArchive(text) {
  const line = String(text || '').trim()
  if (!line) return null

  const head = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s+\[([a-z]+)( DRY RUN)?\]\s*([\s\S]*)$/.exec(line)
  const summary = head ? head[4] : line
  const segments = summary.split(' | ')
  const trimSegment = segments.find((part) => /^Formula trim:/.test(part)) || ''
  const monthNote = segments.find((part) => !/^Formula trim:/.test(part)) || ''

  const transfer = monthNote.match(/(\d+) RAW \+ (\d+) MTD rows/)

  return {
    stamp: head ? head[1] : '',
    planId: head ? head[2] : '',
    dryRun: head ? Boolean(head[3]) : false,
    line,
    monthLabel: (monthNote.match(/^([A-Z][a-z]+ \d{4})/) || [])[1] || '',
    transfer: transfer ? { raw: Number(transfer[1]), mtd: Number(transfer[2]) } : null,
    trim: readTrim(trimSegment, monthNote, head ? Boolean(head[3]) : false),
  }
}

/** One plan's CONFIG tab → its switches plus the last run's verdict. */
export function summarizeArchiveConfig(csv) {
  const values = parseConfigValues(csv)
  const afterDays = Number(values.ARCHIVE_AFTER_DAYS)

  return {
    settings: {
      enabled: truthy(values.ARCHIVE_ENABLED),
      dryRun: truthy(values.ARCHIVE_DRY_RUN),
      trim: truthy(values.ARCHIVE_TRIM),
      purge: truthy(values.ARCHIVE_PURGE),
      afterDays: Number.isFinite(afterDays) && afterDays > 0 ? afterDays : null,
    },
    last: readLastArchive(values.LAST_ARCHIVE),
  }
}

/**
 * Read one plan's `CONFIG` tab. `no-store` and a cache-busting query because the whole
 * point is the live answer — this tab is edited by hand between runs.
 */
export async function fetchArchiveStatus(plan) {
  if (!plan?.configUrl) {
    throw new Error('No CONFIG tab is configured for this plan.')
  }
  const response = await fetch(`${plan.configUrl}&t=${Date.now()}`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`CONFIG HTTP ${response.status}`)
  return summarizeArchiveConfig(await response.text())
}
