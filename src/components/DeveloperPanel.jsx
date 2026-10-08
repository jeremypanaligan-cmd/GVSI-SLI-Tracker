import { Fragment, useCallback, useEffect, useState } from 'react'
import { setMaintenance, forceSignOutAll, formatDuration } from '../utils/presence'
import { fetchArchivedMonths } from '../utils/archiveFetcher'
import { getDiagnostics } from '../utils/dataSourceDiagnostics'
import { fetchArchiveStatus } from '../utils/archiveStatus'
import { monthLabelParts, archiveDate } from '../utils/yearTables'
import { ARCHIVE_AFTER_DAYS, YTD_YEAR } from '../config/plans'
import { SUPABASE_ENABLED } from '../config/supabase'
import { PLANS } from '../config/plans'
import { APP_VERSION } from '../utils/version'

const DURATIONS = [
  { label: '30 minutes', hours: 0.5 },
  { label: '1 hour', hours: 1 },
  { label: '2 hours (default)', hours: 2 },
  { label: '4 hours', hours: 4 },
  { label: '8 hours', hours: 8 },
  { label: 'No auto-off', hours: null },
]

/** How each read in dataSourceDiagnostics describes itself. */
const SOURCE_LABELS = {
  live: 'Live sheet export',
  cache: 'Cached copy',
  'stale-cache': 'Stale cache',
  none: 'Nothing cached',
  error: 'Sheet export failed',
}

/**
 * Where a Monthly Progress month's two figures can come from, and what each looks like in the
 * panel.
 *
 * `sli_monthly` is the archive's own month table — one row per area with the figure and the
 * target together; `record` is the live `MTD` tab, or the archive's `sli_mtd` rows for a closed
 * month; and `plan` is the year's own target plan (`sli_targets`), which states the target under
 * a month the record cannot. `uncovered` is not a source at all: no read carried that month, so
 * the cell is a zero nothing measured.
 *
 * A month's *target* has one source the figures do not: the running month's own `DATA` tab,
 * which is edited daily while the year's plan is a copy made once. That is a badge of its own
 * (`live`), not a fifth vocabulary word — it answers the same question the others do.
 *
 * `short` is the same name in the three-to-four characters the province x month grid can hold,
 * so the grid's legend spells the vocabulary out rather than inventing a second one.
 */
const MONTHLY_SOURCE = {
  monthly: {
    label: 'sli_monthly',
    short: 'sli',
    cell: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
  },
  record: {
    label: 'record',
    short: 'rec',
    cell: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300',
  },
  plan: {
    label: 'year plan',
    short: 'plan',
    cell: 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300',
  },
  uncovered: {
    label: 'nothing read',
    short: '\u2014',
    cell: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300',
  },
}

const formatTime = (value) => {
  const date = value ? new Date(value) : null
  if (!date || isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-PH', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const formatBytes = (value) => {
  const bytes = Number(value) || 0
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

const formatCount = (value) => (Number(value) || 0).toLocaleString('en-US')

/** Counts and peso figures side by side — SME's year actuals carry centavos. */
const formatValue = (value) => (Number(value) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })

const formatAge = (timestamp) =>
  timestamp ? `${formatDuration((Date.now() - timestamp) / 1000)} ago` : '—'

/**
 * Which script the browser actually loaded. In a release that is the hashed bundle
 * (`index-C192Sa_2.js`), and the hash changes with every build — so this is the same
 * thing DevTools → Network would show, and the quickest way to tell whether the deploy
 * you just pushed is the one running.
 */
function loadedBundle() {
  if (import.meta.env?.DEV) return 'dev server'
  const src = Array.from(document.querySelectorAll('script[src]'))
    .map((tag) => tag.getAttribute('src') || '')
    .find((value) => /\/assets\/.+\.js$/.test(value))
  return src ? src.split('/').pop().split('?')[0] : '—'
}

const formatDay = (date) =>
  date.toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * How each trim verdict reads, and how it is coloured. `moved` is the only one that means
 * the sheet actually let a month go; `refused` and `idle` both describe a month that is in
 * Supabase while still sitting in the tab, which is the case worth explaining.
 */
const TRIM_VERDICT = {
  moved: { label: 'Window moved', tone: 'emerald' },
  'would-move': { label: 'A dry run would move it', tone: 'sky' },
  refused: { label: 'Refused', tone: 'amber' },
  idle: { label: 'No window change', tone: 'slate' },
  blocked: { label: 'Gate failed', tone: 'rose' },
  failed: { label: 'Run failed', tone: 'rose' },
  unreported: { label: 'Not recorded', tone: 'slate' },
}

const TONE_CLASS = {
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  sky: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300',
}

const stateLabel = (value) => (value ? 'TRUE' : 'FALSE')

/**
 * One plan's archive switches and the last run's verdict, as the script recorded it.
 *
 * The trim's own reasons only ever reached `LAST_ARCHIVE`, so a month that stayed in the
 * sheet looked identical to one that was never due. This reads the CONFIG tab and says
 * which it was — and quotes the recorded line, because the record is evidence and the
 * console should not paraphrase it away.
 */
function ArchiveTrim({ status, loading }) {
  if (loading && !status) {
    return <p className="text-[11px] text-slate-400 dark:text-slate-500">Reading…</p>
  }
  if (!status) {
    return (
      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        Not read in this tab yet.
      </p>
    )
  }
  if (status.error) {
    return <p className="text-[11px] text-rose-600 dark:text-rose-400">{status.error}</p>
  }

  const { settings, last } = status
  const trim = last?.trim
  const verdict = TRIM_VERDICT[trim?.status] || TRIM_VERDICT.unreported
  const moved = trim?.status === 'moved' || trim?.status === 'would-move'

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span className={settings.enabled
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-rose-600 dark:text-rose-400'}
        >
          ARCHIVE_ENABLED {stateLabel(settings.enabled)}
        </span>
        <span className="text-slate-500 dark:text-slate-400">DRY RUN {stateLabel(settings.dryRun)}</span>
        <span className={settings.trim
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-amber-600 dark:text-amber-400'}
        >
          TRIM {stateLabel(settings.trim)}
        </span>
        <span className="text-slate-500 dark:text-slate-400">PURGE {stateLabel(settings.purge)}</span>
        {settings.afterDays != null && (
          <span className="text-slate-500 dark:text-slate-400">
            {settings.afterDays} days after the month
          </span>
        )}
      </div>

      {!settings.enabled && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          Archive runs are off for this plan, so its scheduled run does nothing.
        </p>
      )}

      {!last && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          No archive run has been recorded yet.
        </p>
      )}

      {last && trim && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${TONE_CLASS[verdict.tone]}`}>
              {verdict.label}
            </span>
            {moved && (
              <span className="text-[11px] font-mono text-slate-700 dark:text-slate-200">
                A{trim.from}:{trim.fromCol} → A{trim.to}:{trim.toCol}
              </span>
            )}
            {moved && trim.monthKey && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                now starts at {trim.monthKey}
              </span>
            )}
            {last.stamp && (
              <span className="text-[10px] text-slate-400 dark:text-slate-500">{last.stamp}</span>
            )}
            {last.dryRun && (
              <span className="text-[10px] text-slate-400 dark:text-slate-500">recorded by a dry run</span>
            )}
          </div>

          {trim.english && (
            <p className="text-[11px] text-slate-600 dark:text-slate-300">{trim.english}</p>
          )}
          {!trim.english && trim.reason && (
            <p className="text-[11px] text-slate-600 dark:text-slate-300">{trim.reason}</p>
          )}

          {last.transfer && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {last.monthLabel || 'That month'}: {formatCount(last.transfer.raw)} RAW +{' '}
              {formatCount(last.transfer.mtd)} MTD rows reached Supabase.
              {moved && trim.provenance ? ` Start row read from ${trim.provenance}.` : ''}
            </p>
          )}
        </div>
      )}

      {last?.line && (
        <p className="text-[10px] font-mono leading-relaxed text-slate-500 dark:text-slate-400 break-words">
          {last.line}
        </p>
      )}
    </div>
  )
}

/**
 * One line per elapsed month of the strip, showing the strip's own two figures and the read
 * behind each: `sli_monthly` (the archive's month table, figure and target together), the
 * record (the live `MTD` tab's month, or the archive's `sli_mtd` rows for a closed one), the
 * year's own target plan (`sli_targets`) for a target the record cannot state — the plan's own
 * `DATA` tab instead for the month still running, which is the one month the year's plan can be
 * behind on — or nothing at all. The figures come straight out of the computed year, so this
 * panel cannot disagree with the strip — and since the archive fills up month by month, so does
 * the row of green.
 *
 * A month reading `sli_monthly` says which read put it there. The archive job's own month is
 * the tracker's measurement; a month the backfill copied out of `YTD 2026` / `TARGET 2026`
 * (`supabase/seed-monthly-progress.sql`) is somebody's worksheet wearing the table's name, and
 * is badged as such rather than counted as measured.
 *
 * Beneath the lines is the same vocabulary read one level down: a province × month grid, one
 * cell per province per elapsed month, so a month that reads `sli_monthly` as a whole can still
 * show the provinces that month's read never named. `summarizeMonthlyProgressSources` (in
 * `src/utils/yearTables.js`) does that attribution, and its docblock states the precedence.
 */
// Exported so a probe can render the panel directly: it is the one place the strip's own
// figures and the read behind each of them are written down side by side.
export function MonthlyProgressSources({ report }) {
  const months = report?.months || []
  if (!months.length) return null

  const totals = report.totals || {}
  const label = (source, recordVia) => (source === 'record'
    ? `record — ${recordVia === 'live' ? 'live MTD tab' : 'sli_mtd'}`
    : MONTHLY_SOURCE[source]?.label || source)

  return (
    <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-700/60 px-2.5 py-2">
      <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
        Monthly Progress — where each month came from
      </p>
      <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
        {`The strip's own cells, month by month. ${formatCount(totals.monthly)} of ${formatCount(totals.months)} come from sli_monthly`}
        {totals.backfilled ? ` (${formatCount(totals.backfilled)} of them backfilled from the year tabs)` : ''}
        {`, ${formatCount(totals.record)} from the record`}
        {totals.uncovered ? `, ${formatCount(totals.uncovered)} with nothing behind them at all.` : '.'}
      </p>

      <ul className="mt-1.5 space-y-0.5 text-[11px]">
        {months.map((month) => (
          <li key={month.index} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="w-8 shrink-0 font-semibold text-slate-500 dark:text-slate-400">{month.label}</span>
            <span className="w-20 shrink-0 text-right tabular-nums font-semibold text-slate-700 dark:text-slate-200">
              {formatValue(month.value)}
            </span>
            <span className="text-slate-400 dark:text-slate-500">of</span>
            <span className="w-20 shrink-0 text-right tabular-nums text-slate-600 dark:text-slate-300">
              {formatValue(month.target)}
            </span>
            <span className={`px-1.5 rounded font-semibold ${MONTHLY_SOURCE[month.source]?.cell}`}>
              {label(month.source, month.recordVia)}
            </span>
            {month.tableSource === 'worksheet' && (
              <span className="px-1.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                backfilled from the year tabs
              </span>
            )}
            {month.targetSource === 'live' ? (
              <span
                className="px-1.5 rounded bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300"
                title={report.liveTargetDate ? `read at ${report.liveTargetDate}` : undefined}
              >
                target: the plan's own DATA tab
              </span>
            ) : month.targetSource !== month.source && (
              <span className={`px-1.5 rounded ${MONTHLY_SOURCE[month.targetSource]?.cell}`}>
                {`target: ${label(month.targetSource, month.recordVia)}`}
              </span>
            )}
            {month.live && (
              <span className="text-slate-400 dark:text-slate-500">the live month</span>
            )}
          </li>
        ))}
      </ul>

      {/* Province x month, one cell each — the same names as the list above, read one level
          down. The plan lists thirteen provinces and the archive writes twelve-province months,
          so a month that reads `sli_monthly` overall can still hold `year plan` cells. */}
      {report.provinces?.length > 0 && months.length > 0 && (
        <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-700/60">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              Province × month — where each cell came from
            </p>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              {`${formatCount(totals.provinceCells)} province-months`}
            </span>
          </div>

          <div className="mt-1.5 overflow-x-auto">
            <div
              className="grid gap-0.5 min-w-max text-[10px]"
              style={{ gridTemplateColumns: `minmax(7rem, 11rem) repeat(${months.length}, 2rem)` }}
            >
              <span className="text-slate-400 dark:text-slate-500" />
              {months.map((month) => (
                <span
                  key={month.index}
                  className="text-center font-semibold text-slate-400 dark:text-slate-500"
                  title={month.name}
                >
                  {month.label.slice(0, 1)}
                </span>
              ))}

              {report.provinces.map((province) => (
                <Fragment key={province.key}>
                  <span className="truncate pr-2 text-slate-600 dark:text-slate-300" title={province.name}>
                    {province.name}
                  </span>
                  {province.cells.map((cell, position) => {
                    const month = months[position]
                    const source = MONTHLY_SOURCE[cell.source]
                    return (
                      <span
                        key={cell.index}
                        title={`${province.name} · ${month.name} — ${label(cell.source, month.recordVia)}`}
                        className={`text-center font-semibold rounded-sm py-0.5 ${source?.cell}`}
                      >
                        {source?.short || '·'}
                      </span>
                    )
                  })}
                </Fragment>
              ))}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500 dark:text-slate-400">
            {Object.entries(MONTHLY_SOURCE).map(([key, source]) => (
              <span key={key} className="flex items-center gap-1">
                <span className={`inline-block w-8 text-center font-semibold rounded-sm ${source.cell}`}>
                  {source.short}
                </span>
                {source.label}
              </span>
            ))}
          </div>

          <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400 mt-1.5">
            {`One row per province, one column per elapsed month — ${formatCount(totals.provinceMonthly)} of ${formatCount(totals.provinceCells)} province-months are the archived month table's`}
            {`, ${formatCount(totals.provinceRecord)} the record's`}
            {totals.provincePlan ? `, ${formatCount(totals.provincePlan)} carry only the year plan's target under them (nobody measured that province-month)` : ''}
            {totals.provinceUnread ? `, and ${formatCount(totals.provinceUnread)} have nothing behind them at all.` : '.'}
            {' A `record` cell under the running month is the live `MTD` tab; every other `record` cell is the archive\u2019s `sli_mtd` rows.'}
          </p>
        </div>
      )}

      <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400 mt-1.5">
        A month is sourced once for its figure and once for the target under it, so a month can
        show two badges — the archive states both, and the year's own target plan states the
        target wherever no archived row carries one. The running month is the exception: its
        targets are read off the plan's own `DATA` tab, which is edited daily where the plan is a
        copy edited by hand, and that is what the `DATA` tab badge says. `nothing read` is the
        case worth chasing: no read held that month, so the strip is showing a zero nobody
        measured. A month reading `sli_monthly` was written by the archive job where it has no
        second badge, and copied out of the year tabs by the backfill where it has one.
      </p>
    </div>
  )
}

/**
 * The year's target plan (`sli_targets`) for one plan: what the Year-to-Date section measures
 * against, and where its province list comes from.
 *
 * The shared `YTD 2026` / `TARGET 2026` worksheet used to supply both. It does not any more:
 * this is a copy of the target plan in Supabase, made once by `scripts/targets-seed.cjs`, and
 * the dashboard reads the copy. So this says what the copy holds — rows, provinces × months and
 * the annual total it adds up to — where the read came from, and whether the rows are the
 * archive job's own or a backfill out of the worksheet. The read failing is worth stating
 * plainly, because that is the state in which the section loses its annual targets.
 *
 * The countdown underneath used to hang off the worksheet read; it only ever needed the year
 * and the archive's own month list, so it stays here.
 *
 * `manual` is the manual **Sync Data** tally — when the button was last pressed in this tab,
 * and how many target reads it forced past the TTL. It is the one thing on this panel that
 * answers "did my press actually reach the database?": the rows may come back identical to
 * the cached copy, but the count moves and the read above is marked forced.
 */
// Exported so a probe can render the block directly, like `MonthlyProgressSources`.
export function YearPlan({ yearPlan, merge, manual, now }) {
  const archiveMonths = new Set(
    (merge?.supabaseMonths || []).map((label) => monthLabelParts(label)?.monthIndex).filter((v) => v != null),
  )
  const due = []
  const upcoming = []
  for (let index = 0; index < 12; index++) {
    const date = archiveDate(YTD_YEAR, index)
    if (date.getTime() <= now) due.push(index)
    else upcoming.push({ index, date })
  }
  const dueArchived = due.filter((index) => archiveMonths.has(index)).length
  const copied = (yearPlan.sources || []).join(', ')

  return (
    <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-700/60 px-2.5 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
          Year target plan — sli_targets
        </p>
        <span className="text-[10px] text-slate-400 dark:text-slate-500">
          {yearPlan.fetchedAt ? formatAge(yearPlan.fetchedAt) : 'not loaded in this tab yet'}
        </span>
      </div>

      {yearPlan.error ? (
        <p role="alert" className="text-[11px] text-rose-600 dark:text-rose-400 mt-1">
          {`Read failed (${yearPlan.error}), so the Year-to-Date section is built from the tracker's own record: no annual targets, no months still to come, and no province list beyond the ones the record names.`}
        </p>
      ) : (
        <p className="text-[11px] text-slate-700 dark:text-slate-200 mt-0.5">
          {`${formatCount(yearPlan.rows)} rows · ${formatCount(yearPlan.provinces)} provinces × ${formatCount(yearPlan.months)} months · annual target `}
          <span className="font-semibold">{formatValue(yearPlan.annualTarget)}</span>
          {yearPlan.fromCache
            ? ' · cached copy'
            : yearPlan.forced ? ' · read from Supabase, forced by Sync Data' : ' · read from Supabase'}
          {copied ? ` · source: ${copied}` : ''}
        </p>
      )}

      {manual && (manual.at || manual.targetReadsForced > 0) && (
        <p className="text-[11px] text-slate-700 dark:text-slate-200 mt-1">
          <span className="text-slate-400 dark:text-slate-500">Manual Sync Data: </span>
          {manual.at ? formatAge(manual.at) : 'not in this tab yet'}
          {` · ${formatCount(manual.targetReadsForced)} target read${manual.targetReadsForced === 1 ? '' : 's'} forced`}
        </p>
      )}

      <p className="text-[11px] text-slate-700 dark:text-slate-200 mt-1">
        <span className="text-slate-400 dark:text-slate-500">Next conversion: </span>
        {upcoming.length ? (
          <>
            <span className="font-semibold">{monthNameOf(upcoming[0].index)}</span>
            {` becomes eligible ${formatDay(upcoming[0].date)}`}
          </>
        ) : (
          'none left this year.'
        )}
      </p>

      {due.length > 0 && (
        <p className={`text-[11px] mt-1 ${dueArchived === 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-200'}`}>
          {`${due.length} closed month${due.length === 1 ? '' : 's'} passed the cutoff`}
          {dueArchived === 0
            ? ' — none is archived, so either ARCHIVE_ENABLED is off in CONFIG or the archive has not run yet. The countdown will not move until it does.'
            : ` — ${dueArchived} archived in Supabase.`}
        </p>
      )}

      <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400 mt-1.5">
        The annual targets, the months still to come and the province list all come from this
        table; the figures come from the record — `sli_monthly` for a closed month and the live
        `MTD` tab for the running one. The shared `YTD 2026` / `TARGET 2026` worksheet is no
        longer read by the app at all.
      </p>
    </div>
  )
}

const FULL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const monthNameOf = (index) => (Number.isInteger(index) ? FULL_MONTHS[index] : '\u2014')

/**
 * Developer-only console: which build is running, where each plan's data came from,
 * who is signed in right now (and for how long), and the maintenance switch.
 *
 * Every action goes through a Supabase RPC that re-checks the caller's role against
 * their session token inside Postgres, so this panel being open in the DOM does not
 * by itself grant anything.
 */
export default function DeveloperPanel({
  open, onClose, token, roster, maintenance, onMaintenanceChange, onNotice,
}) {
  const [message, setMessage] = useState('')
  const [durationIndex, setDurationIndex] = useState(2)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())

  // Live durations — the figures move on their own while the panel stays open.
  useEffect(() => {
    if (!open) return
    const timer = setInterval(() => setNow(Date.now()), 10000)
    return () => clearInterval(timer)
  }, [open])

  useEffect(() => {
    if (open && maintenance?.enabled && maintenance.message) setMessage(maintenance.message)
  }, [open, maintenance?.enabled, maintenance?.message])

  // Which build is running, and which months Supabase already holds. `force` skips the
  // 5-minute index cache on purpose: the whole point is to see the live answer, and it
  // refreshes that cache as a side effect for the rest of the app.
  const [deploy, setDeploy] = useState({ loading: true, error: '', bundle: '—', archived: null })

  const loadDeployStatus = useCallback(async () => {
    const bundle = loadedBundle()
    if (!SUPABASE_ENABLED) {
      setDeploy({ loading: false, error: '', bundle, archived: null })
      return
    }
    setDeploy((prev) => ({ ...prev, loading: true, error: '' }))
    try {
      const entries = await Promise.all(
        Object.values(PLANS).map(async (plan) => [
          plan.id,
          await fetchArchivedMonths(plan.id, { force: true }),
        ]),
      )
      setDeploy({ loading: false, error: '', bundle, archived: Object.fromEntries(entries) })
    } catch (err) {
      setDeploy({ loading: false, error: err.message || 'The archived month list could not be read.', bundle, archived: null })
    }
  }, [])

  useEffect(() => {
    if (open) loadDeployStatus()
  }, [open, loadDeployStatus])

  // Each plan's CONFIG tab: the archive switches and the last run's own account of whether
  // the window moved. Read here rather than off the dashboard path, because it is the one
  // thing an operator needs when a month is safely in Supabase but still sitting in the
  // sheet. A plan that fails is reported on its own row, not as one panel-wide error.
  const [archive, setArchive] = useState({ loading: false, plans: {} })

  const loadArchiveStatus = useCallback(async () => {
    setArchive((prev) => ({ ...prev, loading: true }))
    const entries = await Promise.all(
      Object.values(PLANS).map(async (plan) => {
        try {
          return [plan.id, await fetchArchiveStatus(plan)]
        } catch (err) {
          return [plan.id, {
            planId: plan.id,
            settings: null,
            last: null,
            error: err.message || 'The CONFIG tab could not be read.',
          }]
        }
      }),
    )
    setArchive({ loading: false, plans: Object.fromEntries(entries) })
  }, [])

  useEffect(() => {
    if (open) loadArchiveStatus()
  }, [open, loadArchiveStatus])

  // Snapshot of the reads this tab has made. Refreshed on open, on the header button and
  // on the same 10-second tick the durations use, so it keeps up without polling on its own.
  const [diag, setDiag] = useState(() => getDiagnostics())
  useEffect(() => {
    if (open) setDiag(getDiagnostics())
  }, [open, now])

  if (!open) return null

  const active = roster?.active || []
  const recent = roster?.recent || []

  const runMaintenance = async (enabled) => {
    setBusy(enabled ? 'on' : 'off')
    setError('')
    try {
      const hours = DURATIONS[durationIndex]?.hours
      const expiresAt = enabled && hours
        ? new Date(Date.now() + hours * 3600 * 1000).toISOString()
        : null

      await setMaintenance(token, { enabled, message, expiresAt })
      await onMaintenanceChange?.()
      onNotice?.(enabled ? 'Maintenance mode is on.' : 'Maintenance mode is off.')
    } catch (err) {
      setError(err.message || 'The change could not be applied.')
    } finally {
      setBusy('')
    }
  }

  const runForceSignOut = async () => {
    if (!window.confirm('Revoke every session except your own? Everyone else will have to sign in again.')) return
    setBusy('kick')
    setError('')
    try {
      const count = await forceSignOutAll(token, true)
      await roster?.refresh?.()
      onNotice?.(`${count || 0} sessions revoked.`)
    } catch (err) {
      setError(err.message || 'Force sign-out failed.')
    } finally {
      setBusy('')
    }
  }

  const durationFor = (row) => {
    const start = row?.started_at ? new Date(row.started_at).getTime() : null
    if (!start || isNaN(start)) return '—'
    return formatDuration((now - start) / 1000)
  }

  const refreshAll = () => {
    roster?.refresh?.()
    loadDeployStatus()
    loadArchiveStatus()
    setDiag(getDiagnostics())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 overflow-y-auto bg-slate-950/60 backdrop-blur-sm">
      <div className="w-full max-w-3xl my-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
        <header className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <span className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Developer console</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {active.length} active now · refreshing automatically
            </p>
          </div>
          <button
            type="button"
            onClick={refreshAll}
            disabled={roster?.loading || deploy.loading || archive.loading}
            className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition"
          >
            {roster?.loading || deploy.loading || archive.loading ? 'Loading…' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="p-4 space-y-5 max-h-[75vh] overflow-y-auto">
          {roster?.error && (
            <p role="alert" className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg px-3 py-2">
              {roster.error}
            </p>
          )}
          {error && (
            <p role="alert" className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Build status */}
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
              Build status
            </h3>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-3">
              <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-3">
                <div className="min-w-0">
                  <dt className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Build</dt>
                  <dd className="text-xs font-mono font-semibold text-slate-800 dark:text-slate-100">v{APP_VERSION}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Bundle</dt>
                  <dd className="text-xs font-mono text-slate-700 dark:text-slate-200 truncate" title={deploy.bundle}>
                    {deploy.bundle}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Supabase</dt>
                  <dd className={`text-xs font-semibold ${SUPABASE_ENABLED ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {SUPABASE_ENABLED ? 'configured' : 'not configured'}
                  </dd>
                </div>
              </dl>

              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">
                  Archived months
                </p>
                {deploy.error && (
                  <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{deploy.error}</p>
                )}
                {!deploy.error && !deploy.archived && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {SUPABASE_ENABLED
                      ? 'Reading…'
                      : 'Supabase is not configured — the sheet is the only data source.'}
                  </p>
                )}
                {deploy.archived && (
                  <ul className="grid gap-1 sm:grid-cols-3">
                    {Object.values(PLANS).map((plan) => {
                      const months = deploy.archived[plan.id] || []
                      const labels = months.map((month) => month.month_label).join(', ')
                      return (
                        <li key={plan.id} className="flex items-baseline gap-2 text-xs">
                          <span className="font-semibold text-slate-700 dark:text-slate-200">{plan.name}</span>
                          <span className={months.length
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-400 dark:text-slate-500'}
                          >
                            {months.length ? labels : 'none yet'}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                This list is read straight from Supabase, not from the cache. If the Build shown
                here is older than the release you expect, the CDN has not picked up the new
                deploy yet — hard refresh. A month in this list already comes from Supabase, even
                if the sheet still holds a copy of it.
              </p>
            </div>
          </section>

          {/* Archive trim — whether a verified month left the sheet, and why not */}
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
              Archive trim
            </h3>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
              {Object.values(PLANS).map((plan) => (
                <div key={plan.id} className="p-3 space-y-2">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">{plan.name}</h4>
                  <ArchiveTrim status={archive.plans[plan.id]} loading={archive.loading} />
                </div>
              ))}

              <p className="p-3 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                Read from each plan's <span className="font-mono">CONFIG</span> tab, not from the
                dashboard path. <span className="font-mono">TRIM</span> decides whether a run may
                move the window at all; each generated Apps Script also carries its own{' '}
                <span className="font-mono">PLAN_SHEET_TRIM_ENABLED</span>, so a plan can hold its
                window even while <span className="font-mono">TRIM</span> is TRUE. The line below
                each verdict is that plan's own{' '}
                <span className="font-mono">LAST_ARCHIVE</span>, quoted as the script wrote it.
              </p>
            </div>
          </section>

          {/* Data source diagnostics */}
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
              Data source diagnostics
            </h3>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
              {Object.values(PLANS).map((plan) => {
                const entry = diag.plans[plan.id]
                const sheet = entry?.sheet
                const archive = entry?.archive
                const merge = entry?.merge
                const archivedMonths = Object.values(archive?.months || {})
                const archiveRawRows = archivedMonths.reduce((sum, month) => sum + (month.rawRows || 0), 0)
                const archiveMtdRows = archivedMonths.reduce((sum, month) => sum + (month.mtdRows || 0), 0)
                const archiveBytes = archivedMonths.reduce((sum, month) => sum + (month.rawBytes || 0) + (month.mtdBytes || 0), 0)
                const fromNetwork = archivedMonths.some((month) => month.rawFromCache === false || month.mtdFromCache === false)

                return (
                  <div key={plan.id} className="p-3 space-y-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">{plan.name}</h4>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        {entry?.at ? formatAge(entry.at) : 'not loaded in this tab yet'}
                      </span>
                    </div>

                    {!entry && (
                      <p className="text-[11px] text-slate-400 dark:text-slate-500">
                        Open this plan in the dashboard, then reopen this console.
                      </p>
                    )}

                    {entry && (
                      <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[9rem_1fr] text-[11px]">
                        <dt className="text-slate-400 dark:text-slate-500">Live month source</dt>
                        <dd className="text-slate-700 dark:text-slate-200">
                          <span className="font-semibold">
                            {SOURCE_LABELS[sheet?.source] || 'Unknown'}
                          </span>
                          {sheet?.fetchedAt ? ` · ${formatAge(sheet.fetchedAt)}` : ''}
                          {sheet?.cachedAt ? ` · cached ${formatAge(sheet.cachedAt)}` : ''}
                        </dd>

                        {sheet?.liveError && (
                          <>
                            <dt className="text-slate-400 dark:text-slate-500">Sheet error</dt>
                            <dd className="text-rose-600 dark:text-rose-400">{sheet.liveError}</dd>
                          </>
                        )}

                        <dt className="text-slate-400 dark:text-slate-500">Sheet payload</dt>
                        <dd className="text-slate-700 dark:text-slate-200">
                          {formatBytes(sheet?.rawBytes)} · {formatCount(sheet?.rawRows)} RAW rows
                          {' · '}
                          {formatBytes(sheet?.mtdBytes)} · {formatCount(sheet?.mtdRows)} MTD rows
                        </dd>

                        <dt className="text-slate-400 dark:text-slate-500">Sheet months</dt>
                        <dd className="text-slate-700 dark:text-slate-200">
                          {merge?.sheetMtdMonths?.length
                            ? merge.sheetMtdMonths.join(', ')
                            : merge?.sheetRawMonths && Object.keys(merge.sheetRawMonths).length
                              ? Object.keys(merge.sheetRawMonths).join(', ')
                              : '—'}
                        </dd>

                        <dt className="text-slate-400 dark:text-slate-500">Supabase months</dt>
                        <dd className="text-slate-700 dark:text-slate-200">
                          {archive?.months && Object.keys(archive.months).length
                            ? archivedMonths
                                .map((month) => `${month.monthKey} · ${formatCount(month.rawRows)} RAW + ${formatCount(month.mtdRows)} MTD`)
                                .join(' · ')
                            : 'none archived'}
                        </dd>

                        <dt className="text-slate-400 dark:text-slate-500">Archive payload</dt>
                        <dd className="text-slate-700 dark:text-slate-200">
                          {archiveRawRows || archiveMtdRows
                            ? `${formatBytes(archiveBytes)} · ${formatCount(archiveRawRows)} RAW + ${formatCount(archiveMtdRows)} MTD rows · ${fromNetwork ? 'fetched' : 'cache'}`
                            : '—'}
                        </dd>

                        <dt className="text-slate-400 dark:text-slate-500">Handed to parser</dt>
                        <dd className="text-slate-700 dark:text-slate-200">
                          {merge
                            ? `${formatCount(merge.supabaseRawRows || 0)} RAW + ${formatCount(merge.supabaseMtdRows || 0)} MTD rows from Supabase; ${formatCount(merge.sheetRawRows || 0)} RAW + ${formatCount(merge.sheetMtdRows || 0)} MTD rows from the sheet`
                            : '—'}
                        </dd>
                      </dl>
                    )}

                    {entry?.yearPlan && (
                      <YearPlan
                        yearPlan={entry.yearPlan}
                        merge={entry.merge}
                        manual={entry.manual}
                        now={now}
                      />
                    )}

                    {entry?.monthlyProgress && (
                      <MonthlyProgressSources report={entry.monthlyProgress} />
                    )}
                  </div>
                )
              })}

              <p className="p-3 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                Sheet payload is the export the app downloaded (or its cached copy — the source
                line says which). Archive payload is what Supabase returned, or what this tab
                already had cached. Both counts are raw rows, before the parsers turn them into
                the dashboard tables, so a month appearing on both sides would be visible here.
              </p>
            </div>
          </section>

          {/* Active now */}
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
              Active now
            </h3>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="text-left font-semibold px-3 py-2">User</th>
                      <th className="text-left font-semibold px-3 py-2">Role</th>
                      <th className="text-left font-semibold px-3 py-2">View</th>
                      <th className="text-right font-semibold px-3 py-2">Active</th>
                      <th className="text-right font-semibold px-3 py-2">Started</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {active.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-center text-slate-400 dark:text-slate-500">
                          No one else has been active in the last 2 minutes.
                        </td>
                      </tr>
                    )}
                    {active.map((row, index) => (
                      <tr key={`${row.username}-${row.started_at}-${index}`} className="text-slate-700 dark:text-slate-200">
                        <td className="px-3 py-2">
                          <span className="font-semibold">{row.username}</span>
                          {row.full_name && (
                            <span className="block text-[10px] text-slate-400 dark:text-slate-500">{row.full_name}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{row.role || '—'}</td>
                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                          {row.plan ? `${row.plan}${row.view ? ` / ${row.view}` : ''}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                          {durationFor(row)}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {formatTime(row.started_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Maintenance */}
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
              Maintenance mode
            </h3>
            <div className={`rounded-xl border p-3 ${
              maintenance?.enabled
                ? 'border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10'
                : 'border-slate-200 dark:border-slate-800'
            }`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                    {maintenance?.enabled ? 'Currently on' : 'Off'}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {maintenance?.enabled
                      ? `Set by ${maintenance.by || '—'} at ${formatTime(maintenance.since)}` +
                        (maintenance.expiresAt ? ` · until ${formatTime(maintenance.expiresAt)}` : ' · manual turn-off')
                      : 'Users do not see the maintenance screen.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => runMaintenance(!maintenance?.enabled)}
                  disabled={busy === 'on' || busy === 'off'}
                  className={`shrink-0 text-xs font-semibold px-3 py-2 rounded-lg transition disabled:opacity-50 ${
                    maintenance?.enabled
                      ? 'bg-slate-800 dark:bg-slate-700 text-white hover:bg-slate-700 dark:hover:bg-slate-600'
                      : 'bg-amber-600 hover:bg-amber-500 text-white'
                  }`}
                >
                  {busy === 'on' || busy === 'off'
                    ? 'Applying…'
                    : maintenance?.enabled ? 'Turn off' : 'Turn on maintenance'}
                </button>
              </div>

              {!maintenance?.enabled && (
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    type="text"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Message shown to users (optional)"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950/60 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition"
                  />
                  <select
                    value={durationIndex}
                    onChange={(event) => setDurationIndex(Number(event.target.value))}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950/60 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  >
                    {DURATIONS.map((option, index) => (
                      <option key={option.label} value={index}>{option.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <p className="mt-3 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                This blocks everyone except Developers, and turns itself off at the chosen time so
                the team cannot be left locked out. It is not a security control: the check runs in
                the browser. See docs/DEVELOPER.md.
              </p>
            </div>
          </section>

          {/* Sessions */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Recent sessions
              </h3>
              <button
                type="button"
                onClick={runForceSignOut}
                disabled={busy === 'kick'}
                className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-rose-300 dark:border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 disabled:opacity-50 transition"
              >
                {busy === 'kick' ? 'Revoking…' : 'Force sign-out everyone'}
              </button>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="text-left font-semibold px-3 py-2">User</th>
                      <th className="text-left font-semibold px-3 py-2">Started</th>
                      <th className="text-left font-semibold px-3 py-2">Ended</th>
                      <th className="text-right font-semibold px-3 py-2">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {recent.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center text-slate-400 dark:text-slate-500">
                          No sessions recorded yet.
                        </td>
                      </tr>
                    )}
                    {recent.map((row, index) => (
                      <tr key={`${row.username}-${row.started_at}-${index}`} className="text-slate-700 dark:text-slate-200">
                        <td className="px-3 py-2">
                          <span className="font-semibold">{row.username}</span>
                          {row.revoked_at && (
                            <span className="ml-2 text-[10px] font-semibold text-rose-600 dark:text-rose-400">revoked</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {formatTime(row.started_at)}
                        </td>
                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {row.ended_at ? formatTime(row.ended_at) : (row.revoked_at ? 'revoked' : 'still active')}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {formatDuration(row.duration_seconds)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
