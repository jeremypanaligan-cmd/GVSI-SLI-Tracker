#!/usr/bin/env node
/**
 * GVSI SLI Tracker — Changelog Section Extractor
 *
 * Prints one version's section of CHANGELOG.md with the trailing rule stripped, so
 * a release's notes are the entry that ships with the tag. The changelog stays the
 * only place the notes are written — there is no second copy to drift.
 *
 * Usage: node scripts/extract-changelog-section.cjs 1.13.0 > notes.md
 *
 * Exits 1 when the version has no section, or the section is empty, so a tag that
 * was never documented fails the release instead of publishing blank notes.
 */

const fs = require('fs')
const path = require('path')

const version = process.argv[2]
if (!version) {
  console.error('usage: node scripts/extract-changelog-section.cjs <version>   e.g. 1.13.0')
  process.exit(2)
}

const file = process.argv[3] || path.join(__dirname, '..', 'CHANGELOG.md')
const markdown = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')

// Anchored on `## [<version>]` and closed by the `]`, so asking for 1.1 can never
// pick up 1.10.0's section.
const heading = new RegExp(`^## \\[${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`, 'm')
const start = markdown.search(heading)

if (start === -1) {
  console.error(`CHANGELOG.md has no "## [${version}]" section — add the entry before tagging this version.`)
  process.exit(1)
}

const body = markdown
  .slice(start)
  .replace(/^## \[[^\]]*\][^\n]*\n/, '') // drop the version heading itself
  .split(/^## \[/m)[0] // stop before the next version's section
  .trim()
  // Trim first: the text now ends at the rule itself, which an anchored pattern can
  // remove — matching it before the trailing newlines were gone silently left the
  // `---` in the notes.
  .replace(/(-{3,}[ \t]*\n?)+$/, '') // drop the horizontal rule that closes the entry
  .trim()

if (!body) {
  console.error(`The "${version}" section in CHANGELOG.md is empty.`)
  process.exit(1)
}

process.stdout.write(body + '\n')
