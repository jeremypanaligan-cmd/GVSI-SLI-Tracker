# GVSI SLI Tracker — Preview Run Doc

## Reproduce the artifacts a fresh checkout needs

This is a Vite + React (JSX) PWA. There are **no secret/env files** — all data URLs
(Google Sheets CSV exports) are hardcoded in `src/config/plans.js`. Nothing to copy.

Dependencies:
- `node_modules/` must exist (install once with `npm install` — do NOT use `npm ci`,
  the repo has a lockfile but `npm ci` may fail if the lockfile is out of sync with
  `package.json`; plain `npm install` is the recorded procedure).
- No `.env`, `.env.local`, or generated artifacts required before `npm run dev` —
  Vite builds/serves from source directly. For a production preview instead, run
  `npm run build` (outputs to `dist/`), which needs nothing beyond `node_modules`.

## Run the server (Windows)

Start the Vite dev server detached (survives this conversation), logging to separate
stdout/stderr files:

```
powershell -NoProfile -Command "(Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev','--','--port','5175' -RedirectStandardOutput 'C:\Users\Jeremy Panaligan\Documents\GitHub\GVSI SLI Tracker\.freebuff\preview-f4d42cb1-e90b-425d-a1eb-67bdbd1f7ad7.log' -RedirectStandardError 'C:\Users\Jeremy Panaligan\Documents\GitHub\GVSI SLI Tracker\.freebuff\preview-f4d42cb1-e90b-425d-a1eb-67bdbd1f7ad7.log.err' -WindowStyle Hidden -PassThru).Id"
```

Notes:
- The default Vite port is **5173**, but it (and 5174) are commonly occupied by
  earlier preview servers in this workspace — check `netstat -ano | grep LISTENING`
  first and pick the first free port (currently **5175**).
- The app base path is `/GVSI-SLI-Tracker/`, so the app URL is
  `http://localhost:5175/GVSI-SLI-Tracker/` (not the bare root).
- `npm.cmd` must be the executable passed to Start-Process (shell shims like `npm`
  are not resolved by Start-Process).
- The wrapper may time out from bash even though the server started — verify with
  `netstat` / `Get-Process -Id <pid>` and poll the URL for HTTP 200 instead of
  trusting the command's exit.