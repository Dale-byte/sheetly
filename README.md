# Sheetly

A personal budget app that runs as a static website and an installable PWA. Plan and track your monthly budget, debts, and payslips, with your data synced across devices through your own private GitHub repository - no cloud account needed.

**Live URL (works on laptop and phone):** https://dale-byte.github.io/sheetly/

## Access

### On a laptop (Windows / macOS / Linux)

1. Open https://dale-byte.github.io/sheetly/ in any browser (Chrome, Edge, Firefox, Safari).
2. Use it directly in the browser, or install it as an app:
   - **Chrome / Edge:** click the install icon in the address bar, or use the blue **Install** button in the app's top bar.
   - It then launches in its own window and works offline.

### On a phone (Android)

1. Open https://dale-byte.github.io/sheetly/ in **Chrome**.
2. Tap the blue **Install** button in the app's top bar - or use Chrome's menu (**⋯**) and choose **"Add to Home screen" / "Install app"**.
3. A "Sheetly" icon appears on your home screen. It launches full-screen like a native app and works offline.

### On a phone (iPhone / iPad)

1. Open https://dale-byte.github.io/sheetly/ in **Safari** (installing from other browsers is not supported on iOS).
2. Tap the **Share** button, then **"Add to Home Screen"**, then **Add**.
3. A "Sheetly" icon appears on your home screen and launches full-screen like a native app.

## First-time setup (once per device)

Before you can save and sync, connect a private GitHub repository:

1. Create a **private** repository, e.g. `sheetly-data` (https://github.com/new).
2. Create a fine-grained personal access token with **Contents: Read and write** on that repo only: Settings → Developer settings → Personal access tokens → Fine-grained tokens.
3. Open the app and use the **Connect** screen: enter your GitHub owner, the private repo name, and the token, then tap **Connect**.

Notes:

- Your budget is stored only in this browser (localStorage) and as a single `budget.json` file in **your** private repo. Every save creates a new commit, so the repo's git history is your backup.
- Safe first connect: if the repo has no data yet but this browser does, the app uploads the local data automatically. An empty repo never erases local data.
- The token is kept only in this browser's localStorage. Anyone with the token can read or change your budget, so keep the repo private and don't share the token.
- Add the app on each new device with the same owner/repo/token to keep them all in sync (changes sync automatically, polling every 30 seconds).

## Security

- The app repo (`Dale-byte/sheetly`) is **public** because GitHub Pages requires it, but it contains only code - no data and no secrets. `.env` is gitignored and has never been committed.
- Your budget and your token live only in your **private** data repo and in this browser's localStorage.
- Secret scanning and push protection are worth enabling on the app repo (Settings → Code security and analysis), so an accidental credential push is blocked and flagged instead of merged.
- Before using the legacy budget app, please read **[KNOWN_ISSUES.md](KNOWN_ISSUES.md)**. It documents confirmed, currently unfixed defects in how data is imported, exported, and migrated — including one that can permanently destroy data.

## Features

- Full budget sheets: income, expenses, variance, summary cards
- Debts tracking with payments and available-credit view
- Payslips with categories, line items, and net pay
- Templates: save and reuse sheet layouts
- Floating calculator
- Cross-device sync via the GitHub contents API
- Version history (Backups tab): download, restore, run a manual backup, or import an old backup
- Safe first connect: an empty repo never erases this device's data - local data is uploaded instead
- PWA: installable and usable offline

## Architecture

- **Shell** - a Vite + React 19 app that handles the connect screen, top-bar tabs, sync engine, and the Backups UI.
- **Budget app** - the original HTML/CSS/JS budget app in `public/budget/`, loaded inside a full-screen iframe. `index.html`, `styles.css`, `sync.js` and `calculator.js` are untouched; `app.js` is only edited deliberately and kept free of framework assumptions. `sync.js` and `calculator.js` are Sheetly additions.
- **Sync** - `src/lib/github-store.ts` reads/writes `budget.json` in the connected private repo via the GitHub contents API; the shell polls for changes and reloads the iframe. A 20-second suppression after a local write avoids reloading while you type. Cloud data is authoritative when present; when the repo is empty, this device's local data is kept and uploaded instead of being overwritten.
- **PWA** - `public/manifest.webmanifest` and a service worker. At build time the worker is regenerated (`scripts/post-build.mjs`) so its precache list matches the real asset hashes and its version is stamped with the commit SHA, so clients always pick up a fresh worker after each deploy.
- **Deploy** - GitHub Actions (`.github/workflows/deploy.yml`) builds the app and publishes it to GitHub Pages on every push to `main`. Deep links fall back to `404.html` (the SPA shell).
- **CI** - `.github/workflows/ci.yml` runs typecheck, lint, tests, format check and build on every pull request and on pushes to `main`. It never deploys.

## Development

```bash
npm install         # install dependencies
npm run dev         # local dev server
npm run build       # production build (vite + post-build: 404.html + sw stamping)
npm run preview     # serve the built app locally
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
npm test            # unit tests (node --test, no extra dependencies)
npm run format      # rewrite files with prettier
npm run format:check # verify formatting without writing
```

The build output goes to `dist/` and is deployed verbatim to GitHub Pages.

Before contributing, read [CONTRIBUTING.md](CONTRIBUTING.md) - it explains the
shell / legacy-app split, which is the thing that most often trips people up.

## Project layout

```
.github/workflows/deploy.yml   # build + deploy to GitHub Pages (main only)
.github/workflows/ci.yml       # verify pull requests, never deploy
public/
  budget/                      # original budget app (index.html, styles.css, app.js, sync.js, calculator.js)
  sw.js                        # service worker template (regenerated into dist at build)
  manifest.webmanifest         # PWA manifest
  icons/                       # app icons (generated by scripts/generate-icons.ps1)
scripts/
  post-build.mjs               # copies 404.html, regenerates dist/sw.js
  generate-icons.ps1           # regenerates the PWA icons (requires -Source)
tests/                         # node --test unit tests
src/
  lib/github-store.ts          # GitHub storage + sync layer
  pages/index.tsx              # connect screen + shell (tabs, sync, top bar)
  components/Backups.tsx       # version history UI
  components/InstallPrompt.tsx # in-app PWA install button
```
