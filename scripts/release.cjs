#!/usr/bin/env node
/**
 * Cuts a release in one step.
 *
 * The version lives in `package.json` alone, and everything else derives from it: the
 * service worker's cache names, the versioned manifest, and `version.json`, which is what a
 * running app compares itself against before it renders. The release workflow refuses a tag
 * that disagrees with the version, and publishes the CHANGELOG section the tag names. So a
 * release is four edits that must agree, in a fixed order — and doing them by hand is how a
 * tag ends up describing a build that was never shipped.
 *
 *   npm run release 1.22.0                  # or: npm run release major|minor|patch
 *   npm run release -- minor --dry-run      # print the edits, the diff and the command, write nothing
 *   npm run release -- patch --no-push      # commit and tag, leave the two pushes to you
 *
 * What it does, in order: bump `package.json` and the two version fields in
 * `package-lock.json`; promote `[Unreleased]` in `CHANGELOG.md` to `## [x.y.z] — <today>`;
 * re-render the three plan scripts so their build stamps follow the version; commit all of
 * them as `chore(release): vx.y.z`; create the annotated tag the release workflow reads its
 * title from; push the branch and the tag.
 *
 * Lines are written back with the line ending the file on disk already had — the changelog
 * is CRLF in this working copy and the JSON is LF, and a release is not the place to change
 * that.
 *
 * It refuses, without touching anything, when it cannot do the whole job: a tag that already
 * exists, a version that does not move forward, an empty `[Unreleased]` section, a branch
 * other than `main` (`--force` overrides that last one), or uncommitted changes in the plan
 * scripts and the template they are rendered from — which the re-stamp would otherwise sweep
 * into the release commit.
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const rootDir = path.join(__dirname, '..')
const PACKAGE_FILE = path.join(rootDir, 'package.json')
const LOCK_FILE = path.join(rootDir, 'package-lock.json')
const CHANGELOG_FILE = path.join(rootDir, 'CHANGELOG.md')
const NOTES_SCRIPT = path.join(__dirname, 'extract-changelog-section.cjs')
const APPS_SCRIPT_DIR = path.join(__dirname, 'apps-script')
const SYNC_SCRIPT = path.join(APPS_SCRIPT_DIR, 'sync-gs-tail.cjs')

/**
 * The scripts whose build stamp carries the version (see sync-gs-tail.cjs). A bump without
 * re-rendering them leaves every one of them claiming the version it was stamped at, and
 * `sync-gs-tail.cjs --check` refusing all three.
 */
const PLAN_SCRIPTS = ['FIBERXSCRIPT.gs', 'BIDASCRIPT.gs', 'SMESCRIPT.gs']

/**
 * Everything the re-stamp reads or writes. A release renders the working copy, so an
 * uncommitted edit here would be committed as though the release had written it.
 */
const STAMP_INPUTS = [
  ...PLAN_SCRIPTS,
  'scripts/apps-script/gs-tail.template.txt',
  'scripts/apps-script/sync-gs-tail.cjs',
]

/** Releases are cut from the branch the deploy and the tag both expect. */
const RELEASE_BRANCH = 'main'
const TAG_PREFIX = 'v'
const FOOTER = '🤖 Generated with Codebuff\nCo-Authored-By: Codebuff <noreply@codebuff.com>'

// ── shell ────────────────────────────────────────────────────────────────────

/** Git, with stdout captured. `stdio: 'inherit'` hands it to the terminal instead. */
function git(args, options = {}) {
  const output = execFileSync('git', args, { cwd: rootDir, encoding: 'utf8', ...options })
  return output == null ? '' : output.toString()
}

function fail(message) {
  console.error(`\nrelease: ${message}\n`)
  process.exit(1)
}

/** One step of the plan, as it is being carried out. */
function step(label, detail) {
  console.log(`  ${label.padEnd(9)} ${detail}`)
}

// ── arguments ────────────────────────────────────────────────────────────────

const USAGE = `Usage: npm run release <version|major|minor|patch> [options]

  --dry-run    print the edits, the diff and the commands, and change nothing
  --no-push    commit and tag locally, then print the two push commands
  --force      allow a branch other than ${RELEASE_BRANCH}
  --help       this text

  npm takes any --flag written before its own --, so the flags are safest after it:
    npm run release -- minor --dry-run
  Both spellings work: when a flag is taken by npm it arrives as a config instead, and
  that is read back below.`

/**
 * npm eats an option written before its `--` separator and exports it as configuration instead
 * of passing it on, so `npm run release minor --dry-run` would reach this script with no flag
 * at all — and cut a real release with nobody expecting one. Reading the same intent back out
 * of the environment means both spellings do what was meant:
 *
 *   --dry-run   → npm_config_dry_run=true    --force → npm_config_force=true
 *   --no-push   → npm_config_push=''         (an empty value, not the word "false")
 */
function fromNpmConfig() {
  const env = process.env
  const flags = {}
  if (env.npm_config_dry_run === 'true') flags.dryRun = true
  if (env.npm_config_force === 'true') flags.force = true
  if (env.npm_config_push === '' || env.npm_config_push === 'false') flags.push = false
  return flags
}

function parseArgs(argv) {
  // Typed arguments win over the ones npm took and re-exported.
  const flags = { dryRun: false, push: true, force: false, help: false, spec: null, ...fromNpmConfig() }
  for (const arg of argv) {
    if (arg === '--dry-run') flags.dryRun = true
    else if (arg === '--no-push') flags.push = false
    else if (arg === '--force') flags.force = true
    else if (arg === '--help' || arg === '-h') flags.help = true
    else if (arg.startsWith('-')) fail(`unknown option "${arg}"\n\n${USAGE}`)
    else if (flags.spec) fail(`expected one version, found "${flags.spec}" and "${arg}"\n\n${USAGE}`)
    else flags.spec = arg
  }
  return flags
}

// ── versions ─────────────────────────────────────────────────────────────────

function nextVersion(current, spec) {
  if (/^\d+\.\d+\.\d+$/.test(spec)) return spec
  if (!['major', 'minor', 'patch'].includes(spec)) {
    fail(`"${spec}" is not a version and not one of major, minor, patch\n\n${USAGE}`)
  }
  const [major, minor, patch] = current.split('.').map(Number)
  if (spec === 'major') return `${major + 1}.0.0`
  if (spec === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

/** -1, 0 or 1 — enough to refuse a version that does not move forward. */
function compareVersions(a, b) {
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1
  }
  return 0
}

/** `YYYY-MM-DD` in the machine's own timezone — the day the release is being cut. */
function today() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// ── the file edits, kept as strings so a dry run can show them ───────────────

/** Rewrite text with the line ending the file on disk already uses. */
function withEol(original, text) {
  const eol = original.includes('\r\n') ? '\r\n' : '\n'
  return text.replace(/\r\n/g, '\n').split('\n').join(eol)
}

function bumpedPackage(text, version) {
  const next = text.replace(/^(\s*"version"\s*:\s*")[^"]+(")/m, `$1${version}$2`)
  if (JSON.parse(next).version !== version) fail('package.json has no "version" field to bump.')
  return next
}

/**
 * Both version fields in the lock: the root one and the copy under `packages[""]`. Nothing is
 * installed from them — `npm ci` reads the dependency graph either way — but the lock in this
 * repository named 1.8.0 while `package.json` said 1.21.0, which is a lie someone will
 * eventually trust.
 */
function bumpedLock(text, version) {
  const next = text
    .replace(/^(\s*"version"\s*:\s*")[^"]+(")/m, `$1${version}$2`)
    .replace(/("packages"\s*:\s*\{\s*"":\s*\{[^}]*?"version"\s*:\s*")[^"]+(")/, `$1${version}$2`)

  const parsed = JSON.parse(next)
  if (parsed.version !== version) fail('the lock\'s own "version" field could not be rewritten.')
  if (parsed.packages?.[''] && parsed.packages[''].version !== version) {
    fail('the lock\'s packages[""] version could not be rewritten.')
  }
  return next
}

/**
 * `## [Unreleased]` gains a dated version heading under it, and the section it was holding
 * becomes that version's. The prose is not touched — it is already the entry that ships.
 * Returns the new text and the section headings, which become the commit body.
 */
function promotedChangelog(text, version, date) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const unreleased = lines.findIndex((line) => /^## \[Unreleased\]\s*$/.test(line))
  if (unreleased === -1) fail('CHANGELOG.md has no "## [Unreleased]" heading to promote.')

  // The first real line after it: the heading goes in front of that, so the blank line that
  // was already there stays where it is.
  let cut = unreleased + 1
  while (cut < lines.length && !lines[cut].trim()) cut++
  if (cut >= lines.length || /^## \[/.test(lines[cut])) {
    fail('the [Unreleased] section is empty — there is nothing to release.')
  }

  let end = cut
  while (end < lines.length && !/^## \[/.test(lines[end])) end++
  // The emoji that opens a section heading is the changelog's own indexing; it is dropped
  // here, because the same headings become the prose of the commit body.
  const headings = lines
    .slice(cut, end)
    .filter((line) => /^### /.test(line))
    .map((line) => line.replace(/^###\s+/, '').replace(/^[^\p{L}\p{N}]+/u, '').trim())

  const out = [...lines.slice(0, cut), `## [${version}] — ${date}`, '', ...lines.slice(cut)]
  return { text: out.join('\n'), headings }
}

/** Wrap prose at the width the rest of this repository's commit bodies use. */
function wrap(text, width = 78) {
  return text.split(' ').reduce((lines, word) => {
    const last = lines[lines.length - 1]
    if (last && `${last} ${word}`.length <= width) lines[lines.length - 1] = `${last} ${word}`
    else lines.push(word)
    return lines
  }, []).join('\n')
}

// ── the plan scripts' build stamps ───────────────────────────────────────────

/**
 * Re-render the three plan scripts now that `package.json` carries the new version. Returns
 * the files whose text actually changed. A failure puts back whatever the sync had already
 * rewritten before it stopped, so the working copy is never left half-stamped.
 */
function restampPlanScripts() {
  const before = new Map(
    PLAN_SCRIPTS.map((file) => [file, fs.readFileSync(path.join(rootDir, file), 'utf8')]),
  )
  try {
    execFileSync('node', [SYNC_SCRIPT], { cwd: rootDir, stdio: 'inherit' })
  } catch (error) {
    for (const [file, text] of before) fs.writeFileSync(path.join(rootDir, file), text)
    throw error
  }
  return PLAN_SCRIPTS.filter((file) => fs.readFileSync(path.join(rootDir, file), 'utf8') !== before.get(file))
}

/**
 * The same render, done in a throwaway copy, so `--dry-run` can show the new stamps without
 * writing anything. The sync script reads the version from `package.json`, so the copy is
 * handed the bumped text — re-implementing the hash here is exactly the drift this step is
 * meant to prevent.
 */
function stampsInShadow(bumpedPackage) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gvsi-release-scripts-'))
  try {
    fs.mkdirSync(path.join(directory, 'scripts', 'apps-script'), { recursive: true })
    fs.writeFileSync(path.join(directory, 'package.json'), bumpedPackage)
    for (const name of ['sync-gs-tail.cjs', 'gs-tail.template.txt']) {
      fs.copyFileSync(path.join(APPS_SCRIPT_DIR, name), path.join(directory, 'scripts', 'apps-script', name))
    }
    for (const file of PLAN_SCRIPTS) fs.copyFileSync(path.join(rootDir, file), path.join(directory, file))
    execFileSync('node', [path.join(directory, 'scripts', 'apps-script', 'sync-gs-tail.cjs')], {
      cwd: directory,
      stdio: 'ignore',
    })
    return Object.fromEntries(
      PLAN_SCRIPTS.map((file) => [file, fs.readFileSync(path.join(directory, file), 'utf8')]),
    )
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

function commitMessage(version, headings) {
  const what = headings.length
    ? `Promotes the unreleased section: ${headings.join('; ')}.`
    : 'Promotes the unreleased section.'
  return `chore(release): ${TAG_PREFIX}${version}\n\n${wrap(what)}\n\n${FOOTER}\n`
}

// ── dry run ──────────────────────────────────────────────────────────────────

/**
 * `git diff --no-index` exits 1 when the files differ, which is the whole point here. The
 * pair is written into a throwaway directory and diffed by bare name, so the header reads
 * `a/before.json` rather than a pair of absolute temporary paths.
 */
function showDiff(label, before, after, suffix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gvsi-release-'))
  const from = `before${suffix}`
  const to = `after${suffix}`
  fs.writeFileSync(path.join(directory, from), before)
  fs.writeFileSync(path.join(directory, to), after)
  console.log(`\n  ── ${label} ──`)
  try {
    execFileSync('git', [
      '-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false',
      '--no-pager', 'diff', '--no-index', '--no-color', '-U2', '--', from, to,
    ], { cwd: directory, stdio: 'inherit' })
  } catch (error) {
    if (error.status !== 1) throw error
  }
  fs.rmSync(directory, { recursive: true, force: true })
}

// ── after the push ───────────────────────────────────────────────────────────

/**
 * True when a `.gs` differs from the previous release by its build stamp and nothing else.
 * Every release rewrites that line on purpose, and on its own it asks nothing of whoever
 * deploys the scripts — a re-paste reminder for it would be noise on every release.
 */
function isStampOnlyChange(file, previous) {
  const STAMP = /^const SCRIPT_BUILD = '[^']*';$/m
  try {
    const before = git(['show', `${previous}:${file}`]).replace(STAMP, '')
    const after = git(['show', `HEAD:${file}`]).replace(STAMP, '')
    return before === after
  } catch {
    return false
  }
}

/**
 * The `.gs` files and the shared tail that changed since the previous release, if any. The
 * release just committed is the one at HEAD, so it is skipped and its predecessor is the
 * baseline — falling back to the first commit of the repository, which is what a release
 * that has no predecessor should be measured against.
 */
function releasedScriptFiles() {
  try {
    const head = git(['rev-parse', 'HEAD']).trim()
    // Plain parentheses on purpose: `--grep` is a basic regular expression, where \( is a
    // group rather than a literal bracket and a pattern that escapes them matches nothing.
    const releases = git(['log', '--format=%H', '--grep=^chore(release):'])
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    const previous = releases.find((hash) => hash !== head)

    // Before the first release there is nothing to measure from, so the baseline is the whole
    // history — and the first commit's own change has to be asked for separately, because no
    // `git diff` reaches backwards past it.
    let changed
    if (previous) {
      changed = git(['diff', '--name-only', `${previous}..HEAD`])
    } else {
      const root = git(['rev-list', '--max-parents=0', 'HEAD']).trim().split('\n')[0]
      changed = `${git(['log', '-1', '--name-only', '--format=', root])}\n${git(['diff', '--name-only', `${root}..HEAD`])}`
    }

    const files = [...new Set(changed.split('\n').map((line) => line.trim()).filter(Boolean))]
    const candidates = files.filter((file) => /\.gs$/.test(file) || file.startsWith('scripts/apps-script/'))
    // A version bump re-stamps the plan scripts, so they show up in every release's diff: only
    // the ones that changed in some other way are worth asking about.
    return previous
      ? candidates.filter((file) => !/\.gs$/.test(file) || !isStampOnlyChange(file, previous))
      : candidates
  } catch {
    return []
  }
}

function repositoryUrl() {
  try {
    const remote = git(['remote', 'get-url', 'origin']).trim()
    const match = remote.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/)
    return match ? `https://github.com/${match[1]}` : null
  } catch {
    return null
  }
}

/** Where the app is served from — `base` in vite.config.js, which this cannot read. */
function pagesBaseUrl() {
  const url = repositoryUrl()
  if (!url) return '/'
  const [owner, repo] = url.replace(/^https:\/\/github\.com\//, '').split('/')
  return `https://${owner}.github.io/${repo}/`
}

/**
 * What to check afterwards, in the order it becomes true: the release record, the deployed
 * build, and the one thing a release cannot do for itself — the Apps Script files are
 * deployed by paste.
 */
function reportNext({ version, tag, branch, pushed }) {
  const releasesUrl = repositoryUrl()
  console.log('\ncheck:')
  console.log(`  version.json   ${pagesBaseUrl()}version.json`)
  console.log(`                 should read ${version} a minute or two after the deploy finishes`)
  if (releasesUrl) {
    console.log(`  release notes  ${releasesUrl}/releases/tag/${tag}`)
    console.log('                 written by the tag push, from the section just promoted')
  }

  const scripts = releasedScriptFiles()
  if (scripts.length) {
    console.log(`  Apps Script    ${scripts.join(', ')}`)
    console.log('                 changed in this release, and those are deployed by paste —')
    console.log('                 re-paste them and run a Full Sync, or the sheet keeps the old code')
  }

  if (pushed) {
    console.log('\n  Already on the way: the tag push publishes the release and the branch push')
    console.log('  deploys the app. A device on the previous version refuses to start until it')
    console.log('  updates, so nobody needs a hard refresh — the version is what carries it.')
  } else {
    console.log('\n  Not pushed yet. When ready:')
    console.log(`    git push origin ${branch}`)
    console.log(`    git push origin ${tag}`)
    console.log('  The branch push deploys; the tag push publishes the release.')
  }
  console.log('')
}

// ── the release ──────────────────────────────────────────────────────────────

function main() {
  const flags = parseArgs(process.argv.slice(2))
  if (flags.help) {
    console.log(USAGE)
    return
  }
  if (!flags.spec) fail(`a version is required\n\n${USAGE}`)

  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim()
  if (branch !== RELEASE_BRANCH && !flags.force) {
    fail(`this is "${branch}", not "${RELEASE_BRANCH}". Releases are cut from ${RELEASE_BRANCH}, the\nbranch both the deploy and the version tag expect. Use --force to release anyway.`)
  }

  const packageText = fs.readFileSync(PACKAGE_FILE, 'utf8')
  const current = JSON.parse(packageText).version
  const version = nextVersion(current, flags.spec)
  const tag = `${TAG_PREFIX}${version}`

  if (compareVersions(version, current) <= 0) {
    fail(`${version} is not newer than ${current} — a release moves the version forward.`)
  }
  if (git(['tag', '--list', tag]).trim()) fail(`tag ${tag} already exists.`)

  // A release re-renders the plan scripts from the working copy. Anything uncommitted in them
  // or in the template would ride into the release commit under `chore(release)`, so it is
  // asked for cleanly here instead of being explained afterwards.
  const dirtyScripts = git(['status', '--porcelain', '--', ...STAMP_INPUTS])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (dirtyScripts.length) {
    fail(
      `the plan scripts or their template have uncommitted changes, and a release re-renders them:\n  ${dirtyScripts.join('\n  ')}\nCommit those first — the release commit is meant to carry the version and nothing else.`,
    )
  }

  const changelogText = fs.readFileSync(CHANGELOG_FILE, 'utf8')
  if (new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`, 'm').test(changelogText)) {
    fail(`CHANGELOG.md already has a "## [${version}]" section.`)
  }

  const promotion = promotedChangelog(changelogText, version, today())
  const nextPackage = bumpedPackage(packageText, version)
  const nextChangelog = withEol(changelogText, promotion.text)

  // The lock is optional: without one there is nothing to keep in step.
  const lockText = fs.existsSync(LOCK_FILE) ? fs.readFileSync(LOCK_FILE, 'utf8') : null
  const nextLock = lockText ? withEol(lockText, bumpedLock(lockText, version)) : null

  const files = ['package.json', ...(nextLock ? ['package-lock.json'] : []), 'CHANGELOG.md']
  const message = commitMessage(version, promotion.headings)

  /** Undo the three version edits — the paths a failure before the commit has to leave clean. */
  const restoreVersionFiles = () => {
    fs.writeFileSync(PACKAGE_FILE, packageText)
    if (lockText) fs.writeFileSync(LOCK_FILE, lockText)
    fs.writeFileSync(CHANGELOG_FILE, changelogText)
  }

  console.log(`\n${tag}  from ${current}${flags.dryRun ? '   (dry run — nothing will be written)' : ''}\n`)
  step('bump', files.join(', '))
  step('promote', `[Unreleased] → [${version}] — ${today()}`)
  step('stamp', `${PLAN_SCRIPTS.length} plan scripts re-rendered, so every SCRIPT_BUILD names ${version}`)
  step('commit', `chore(release): ${tag}, ${files.length} files plus whatever was re-stamped`)
  step('tag', `${tag}, annotated "GVSI SLI Tracker ${tag}"`)
  step('push', flags.push ? `origin ${branch}, then ${tag}` : 'skipped (--no-push)')

  if (flags.dryRun) {
    showDiff('package.json', packageText, nextPackage, '.json')
    if (lockText) showDiff('package-lock.json', lockText, nextLock, '.json')
    showDiff('CHANGELOG.md', changelogText, nextChangelog, '.md')
    // Rendered for real, in a copy, so the preview shows the stamps the release would write.
    const shadowScripts = stampsInShadow(nextPackage)
    for (const file of PLAN_SCRIPTS) {
      const asIs = fs.readFileSync(path.join(rootDir, file), 'utf8')
      if (shadowScripts[file] !== asIs) showDiff(file, asIs, shadowScripts[file], '.gs')
    }
    console.log(`\n  ── commit message ──\n${message.replace(/^/gm, '  ')}`)
    console.log('  Nothing was written. Run it again without --dry-run to cut the release.\n')
    return
  }

  fs.writeFileSync(PACKAGE_FILE, nextPackage)
  if (nextLock) fs.writeFileSync(LOCK_FILE, nextLock)
  fs.writeFileSync(CHANGELOG_FILE, nextChangelog)

  // The release workflow runs exactly this to build its notes, and fails the release when the
  // section is missing or empty — so it is checked here, while the files can still go back.
  try {
    execFileSync('node', [NOTES_SCRIPT, version], { cwd: rootDir, stdio: ['ignore', 'ignore', 'pipe'] })
  } catch (error) {
    restoreVersionFiles()
    fail(`the promoted section could not be read back as release notes:\n${String(error.stderr || error.message).trim()}\nNothing was committed, and the files were put back.`)
  }

  // The stamps carry the version, so they move with it. A release that skipped this would leave
  // every plan script claiming the version before last, and `--check` refusing all three.
  let stamped = []
  try {
    stamped = restampPlanScripts()
  } catch (error) {
    restoreVersionFiles()
    fail(`the plan scripts could not be re-stamped:\n${String(error.stderr || error.message).trim()}\nNothing was committed, and the version files were put back (the scripts restore themselves).`)
  }

  // A pathspec commit: only these files go in, whatever else happens to be staged here.
  git(['commit', '-q', '-m', message, '--', ...files, ...stamped], { stdio: 'inherit' })
  git(['tag', '-a', tag, '-m', `GVSI SLI Tracker ${tag}`])
  step('done', `${git(['log', '-1', '--format=%h']).trim()} and ${tag}`)

  if (flags.push) {
    try {
      git(['push', 'origin', branch], { stdio: 'inherit' })
      git(['push', 'origin', tag], { stdio: 'inherit' })
    } catch {
      // The commit and the tag are already made, so the recovery is to push them rather than
      // to cut the release again — which would find the version already taken.
      fail(`the push failed. ${tag} and its commit are made locally, so nothing needs re-cutting:
  git push origin ${branch}
  git push origin ${tag}`)
    }
  }

  reportNext({ version, tag, branch, pushed: flags.push })
}

main()
