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
 * gets a chance to fill in the version. Serve/write it with `{{VERSION}}` replaced
 * instead, so a release only bumps package.json.
 *
 * The service worker needs no substitution — it reads the version from its own `?v=`
 * query, which `src/main.jsx` sets from the injected `__APP_VERSION__`.
 */
function versionedManifest() {
  const fill = () => readFileSync(MANIFEST_FILE, 'utf8').split(VERSION_TOKEN).join(version)
  let outDir = path.join(rootDir, 'dist')

  return [
    {
      name: 'gvsi-versioned-manifest:serve',
      apply: 'serve',
      configureServer(server) {
        // Registered before Vite's own middlewares, so this wins over public/ serving
        server.middlewares.use((req, res, next) => {
          const url = (req.url || '').split('?')[0]
          if (!url.endsWith('/manifest.json')) return next()
          res.setHeader('Content-Type', 'application/manifest+json')
          res.setHeader('Cache-Control', 'no-cache')
          res.end(fill())
        })
      },
    },
    {
      name: 'gvsi-versioned-manifest:build',
      apply: 'build',
      configResolved(config) {
        outDir = path.isAbsolute(config.build.outDir)
          ? config.build.outDir
          : path.join(rootDir, config.build.outDir)
      },
      // Runs after Vite copies public/ into the output directory
      closeBundle() {
        writeFileSync(path.join(outDir, 'manifest.json'), fill())
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
  plugins: [react(), versionedManifest(), watchPackageVersion()],
  server: {
    host: 'localhost',
    port: 5173,
  },
  build: {
    // Ensure manifest.json is copied to dist
    copyPublicDir: true,
  },
})
