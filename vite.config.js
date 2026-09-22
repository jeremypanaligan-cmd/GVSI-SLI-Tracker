import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path for GitHub Pages subdirectory
// Change to '/' if deploying to a custom domain
const base = '/GVSI-SLI-Tracker/'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// package.json is the single source of truth for the app version
const { version } = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'))

const MANIFEST_FILE = path.join(rootDir, 'public', 'manifest.json')
const VERSION_TOKEN = '{{VERSION}}'

/**
 * `manifest.json` is a static file in `public/`, so Vite copies it verbatim and never
 * gets a chance to fill in the version. `version.json` is not in `public/` at all — it
 * only exists to be served, and it is what the running app compares itself against
 * before it lets anyone in (see src/utils/appUpdate.js). Both are written from
 * `package.json`, so a release only bumps that one file.
 *
 * The service worker needs no substitution — it reads the version from its own `?v=`
 * query, which `src/main.jsx` sets from the injected `__APP_VERSION__`.
 */
function versionedStaticFiles() {
  const manifestBody = () => readFileSync(MANIFEST_FILE, 'utf8').split(VERSION_TOKEN).join(version)
  const versionBody = () => JSON.stringify({ version }) + '\n'
  let outDir = path.join(rootDir, 'dist')

  // Registered before Vite's own middlewares, so these win over public/ serving. Both
  // answer on the dev server too, so the check behaves the same in development.
  const serve = (suffix, contentType, body) => (req, res, next) => {
    const url = (req.url || '').split('?')[0]
    if (!url.endsWith(suffix)) return next()
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'no-store')
    res.end(body)
  }

  return [
    {
      name: 'gvsi-versioned-static:serve',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use(serve('/manifest.json', 'application/manifest+json', manifestBody()))
        server.middlewares.use(serve('/version.json', 'application/json', versionBody()))
      },
    },
    {
      name: 'gvsi-versioned-static:build',
      apply: 'build',
      configResolved(config) {
        outDir = path.isAbsolute(config.build.outDir)
          ? config.build.outDir
          : path.join(rootDir, config.build.outDir)
      },
      // Runs after Vite copies public/ into the output directory
      closeBundle() {
        writeFileSync(path.join(outDir, 'manifest.json'), manifestBody())
        writeFileSync(path.join(outDir, 'version.json'), versionBody())
      },
    },
  ]
}

/** Restart the dev server when package.json changes, so a version bump takes effect. */
function watchPackageVersion() {
  return {
    name: 'gvsi-package-version:watch',
    apply: 'serve',
    configureServer(server) {
      const file = path.join(rootDir, 'package.json')
      server.watcher.add(file)
      server.watcher.on('change', (changed) => {
        if (path.resolve(changed) === file && typeof server.restart === 'function') server.restart()
      })
    },
  }
}

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [react(), versionedStaticFiles(), watchPackageVersion()],
  server: {
    host: 'localhost',
    port: 5173,
  },
  build: {
    // Ensure manifest.json is copied to dist
    copyPublicDir: true,
  },
})
