/**
 * App version — injected at dev/build time from `package.json` (see vite.config.js).
 *
 * Bumping `version` in package.json is the only change a release needs: the service
 * worker cache names, the manifest icon cache-buster and the data cache keys all
 * derive from this value.
 */
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'

export default APP_VERSION
