# Sheetly — Repository Architecture

This guide is a navigation map for the codebase. Sheetly is a personal budget app that ships as a
**static site + installable PWA** on GitHub Pages. It is not a SPA in the usual sense: a small React
shell hosts the real budget app in a same-origin `<iframe>` and keeps it in sync with a private
GitHub repository. There is no server and no database of our own — the user's own repo is the
cloud store, and its git history is the backup system.

## Top-level layout

| Path                           | Purpose                                                                   |
| ------------------------------ | ------------------------------------------------------------------------- |
| `src/`                         | React shell: GitHub connect gate, top bar, iframe host, Backups tab       |
| `public/budget/`               | **The budget app itself** — legacy vanilla JS, shipped untranspiled       |
| `public/`                      | Static root: PWA manifest, icons, service worker, `budget/`               |
| `tests/`                       | `node --test` suites (base path, postMessage, sync bridge, export/import) |
| `scripts/post-build.mjs`       | Post-build: stamp `sw.js`, pin asset versions, copy `404.html`            |
| `scripts/generate-icons.ps1`   | Regenerates the PWA icon set from `public/icons/icon.svg`                 |
| `documents/`                   | This architecture map, `SYSTEM_PROMPT.md`, `features.md`                  |
| `.github/workflows/ci.yml`     | Verification only (typecheck, lint, test, format, build)                  |
| `.github/workflows/deploy.yml` | Builds and publishes `dist/` to GitHub Pages on push to `main`            |
| `index.html`                   | Vite entry; also carries the shell framebust                              |
| `vite.config.ts`               | Vite + React + Tailwind; `base: "/sheetly/"`                              |
| `KNOWN_ISSUES.md`              | Data-integrity defects that were found and fixed, and why                 |
| `REVIEW_STATUS.md`             | Running review log, including the closed category-management decision     |
| `README.md`                    | End-user install/usage guide                                              |
| `package.json`                 | Manifest, scripts, dependencies                                           |
| `LICENSE`                      | MIT                                                                       |

## Two apps, one page

The single most important thing to understand about this repo: **the product is two codebases in one
page.** The React app is a thin host; the budget app is the actual product and is deliberately
plain JavaScript.

```
src/                              React 19 shell (TypeScript)
├── App.tsx                       Renders <IndexPage/> and nothing else
├── main.tsx                      React root
├── pages/index.tsx               ConnectScreen gate + BudgetFrame (iframe host + sync engine)
├── components/
│   ├── Backups.tsx               Version history: download / restore / run-now / import
│   ├── InstallPrompt.tsx         beforeinstallprompt → "Install" button (Android/Chrome)
│   └── ui/                       shadcn/ui primitives (Radix + Tailwind). Unmodified boilerplate
├── hooks/use-mobile.tsx          Tailwind responsive breakpoint
├── lib/
│   ├── github-store.ts           GitHub contents API client; config in localStorage
│   └── utils.ts                  cn() class merge helper
└── styles.css                    Tailwind entry (shell only)

public/                           Copied verbatim into dist/ by Vite
├── index.html                    SPA shell (the React app)
├── sw.js                         Service worker: precache + cache-first (stamped at build)
├── manifest.webmanifest          PWA manifest
├── icons/                        icon.svg + generated PNG sizes
└── budget/                       The budget app — vanilla JS, no build step
    ├── index.html                Sidebar + view container + modal + framebust
    ├── app.js                    All app logic (~3400 lines): state, views, persistence
    ├── sync.js                   postMessage bridge to the host frame
    ├── calculator.js             Amount/percentage calculator used inside modals
    └── styles.css                Hand-written CSS for the budget app
```

`public/` is listed in `.prettierignore` and excluded from ESLint on purpose: it ships
untranspiled, and `public/sw.js` is regex-matched by `scripts/post-build.mjs`, so reformatting it
can break the build.

## App flow

```
index.html  →  React root  →  <App/>  →  <IndexPage/>
                                     │
                 no GitHub config ───┴─── has config
                        │                    │
                 <ConnectScreen>       <BudgetFrame>
                 owner/repo/token      ├─ top bar: Budget | Templates | Backups tabs
                 testConnection()      │            + sync status + Install + Disconnect
                 rejects public repos  ├─ <iframe src="/sheetly/budget/index.html">
                                       │     └─ budget app: sidebar, 7 views, modals
                                       └─ sync engine (see below)

budget app  →  budget/index.html
                ├─ #dashboard       renderDashboard()    overview + quick actions
                ├─ #budget-sheet    renderBudgetSheet()  subsections, items, buffers, recurring
                ├─ #debts           renderDebts()        balances, limits, min payments
                ├─ #payslip         renderPayslip()      payslip lines, deductions, net pay
                ├─ #categories      renderNotes()        Notes + tags  (legacy route name)
                ├─ #templates       renderTemplates()    sheet templates
                ├─ #settings        renderSettings()     currency, theme, sheets, data tools
                └─ #help            renderHelp()         in-app help
```

`renderReports()` is defined in `app.js` but is **not** wired to any route and has no nav entry.

Note the route name `#categories` renders **Notes**. That is legacy naming and must not be
"corrected" — the sidebar label is already `Notes`.

## Sync engine (the interesting part)

The host frame and the budget app communicate only over `postMessage`, same-origin, in both
directions:

| Direction     | Message                           | Meaning                                             |
| ------------- | --------------------------------- | --------------------------------------------------- |
| budget → host | `hello`                           | "I'm alive, send me the snapshot"                   |
| host → budget | `init`                            | The full `sheetly_data` snapshot from GitHub        |
| budget → host | `ready`                           | Snapshot applied, safe to run `DOMContentLoaded`    |
| budget → host | `save`                            | Local data changed; host should push to GitHub      |
| host → budget | `navigate`                        | Host tab asked the app to switch view               |
| host → budget | `reload`                          | A newer snapshot exists elsewhere; reload the frame |
| budget → host | `open-backups` / `open-templates` | App asked the host to switch top-bar tab            |

Timing and safety rules that are easy to break:

- `sync.js` intercepts `document.addEventListener` and **defers** `app.js`'s `DOMContentLoaded`
  until the snapshot arrives, so the app never boots against empty local state and then gets
  clobbered. If the page is opened **standalone** (`window.parent === window`) nothing would ever
  send an `init`, so the deferral is skipped entirely and the page boots normally.
- Both sides gate on `e.origin === window.location.origin` **and** `e.source === <the other
window>`. The `msg.source` string inside the payload is _not_ a security check — any page can
  forge it. Never post with a `'*'` target origin.
- `sync.js` hooks `localStorage.setItem`/`removeItem` and debounces 600 ms before posting `save`.
  The host debounces a further 1000 ms, then re-reads the file and skips the write if unchanged.
- An **empty** `save` payload is a legitimate "I deleted everything" signal and must keep working.
- The host polls every 30 s (and on `visibilitychange`) for changes made on other devices. It never
  reloads the frame within 20 s of its own write, so an in-progress edit is not destroyed.
- An empty or unreachable cloud must never wipe a device that has local data: the host falls back
  to reading `localStorage` before sending anything, and the frame keeps local data when it
  receives an empty `init`.

## Persistence

| Store          | Key                     | Role                                           |
| -------------- | ----------------------- | ---------------------------------------------- |
| `localStorage` | `sheetly_data`          | **Primary.** Read first, written on every save |
| `localStorage` | `sheetly_github_config` | `{ owner, repo, token }`, browser-only         |
| IndexedDB      | `SheetlyDB` (v2)        | Secondary mirror of the collections            |
| GitHub repo    | `budget.json`           | Cloud store; one commit per save = one backup  |

The full state object holds `settings`, `sheets`, `groups`, `items`, `recurringItems`,
`categories`, `templates`, `tags`, `debts`, `payslips`, and `currentSheetId`. `SCHEMA_VERSION` is
currently `1`; `DB_VERSION` is `2` (v2 added the `debts` and `payslips` object stores, which v1
never created — the upgrade only creates empty stores and never deletes existing records).

Every amount passes through `toAmount(value, context)`, which returns a real finite number in all
cases and `console.warn`s on non-numeric input instead of silently producing `NaN` or a
concatenated string. All user-supplied text is escaped with `esc()` before entering an HTML
template literal, and with `jsAttr()` inside `on*=` attributes.

## Feature index (where to look)

| Feature                                  | Where                                        |
| ---------------------------------------- | -------------------------------------------- |
| Shell / iframe host / sync               | `src/pages/index.tsx`                        |
| GitHub contents API client               | `src/lib/github-store.ts`                    |
| Version history, restore, import backup  | `src/components/Backups.tsx`                 |
| PWA install prompt                       | `src/components/InstallPrompt.tsx`           |
| Dashboard                                | `public/budget/app.js` `renderDashboard()`   |
| Budget sheet, buffers, recurring, sheets | `public/budget/app.js` `renderBudgetSheet()` |
| Debts                                    | `public/budget/app.js` `renderDebts()`       |
| Payslips                                 | `public/budget/app.js` `renderPayslip()`     |
| Notes and tags                           | `public/budget/app.js` `renderNotes()`       |
| Templates                                | `public/budget/app.js` `renderTemplates()`   |
| Settings, export, import, reset          | `public/budget/app.js` `renderSettings()`    |
| In-app help                              | `public/budget/app.js` `renderHelp()`        |
| Cloud bridge                             | `public/budget/sync.js`                      |
| Offline cache                            | `public/sw.js`                               |

## Tests

`npm test` runs Node's built-in runner (`node --test`) — no test framework dependency. The suites
are largely source-level assertions: they read `app.js`, `sw.js`, `sync.js`, `index.html`, and
`vite.config.ts` and verify the invariants that broke in the past.

| File                           | Covers                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/base-path.test.mjs`     | Vite `base`, post-build `BASE`, and sw `BASE` all agree; every `/sheetly/` URL in `index.html` and the manifest is under the base           |
| `tests/postmessage.test.mjs`   | Foreign-origin and wrong-window `init`/`navigate`/`reload` are rejected; no wildcard target origin; host keeps both guards                  |
| `tests/sync-bridge.test.mjs`   | Standalone boot is not deferred; framed boot waits for the snapshot; both entry points keep a framebust that tolerates the same-origin host |
| `tests/export-import.test.mjs` | Export/backup include every collection and default missing optional ones to `[]`; no collection list may omit `debts` or `payslips`         |

Browser-level behaviour is verified by driving headless Chrome over the DevTools protocol against
a real page with synthetic data; those harnesses are throwaway and are not committed.

## Build & release

- `npm run build` = `vite build && node scripts/post-build.mjs`. The post-build step:
  1. rewrites `styles.css?v=…`, `app.js?v=…` and `calculator.js?v=…` in `dist/budget/index.html`
     to the commit SHA and **fails the build** if any reference is missed, so no release can ship
     a half-versioned page;
  2. regenerates the `PRECACHE` list in `dist/sw.js` using those same versioned URLs and stamps
     `const VERSION = "<sha>"`;
  3. copies `dist/index.html` to `dist/404.html`.
- The SHA stamp is what purges old service-worker caches. The `?v=` rewrite is what stops a browser
  or a cache-first worker from serving the _previous_ release's `app.js`; those hand-written
  tokens used to be identical on every deploy and busted nothing.
- CI runs on pushes to `main` and on pull requests and does **not** deploy. `deploy.yml` builds
  and publishes to GitHub Pages on push to `main`. The CI job also asserts the output is stamped
  and that `404.html` is byte-identical to `index.html`.
- Pushing to `main` deploys. There is no manual release step and no version file to bump.

## Conventions

- TypeScript/TSX in `src/`, plain JS in `public/budget/`. Do not "modernise" the budget app into
  React without asking; it is deliberately framework-free and untranspiled.
- Prettier: `printWidth: 100`, semicolons, double quotes, `trailingComma: "all"`.
- Line endings are LF everywhere, enforced by `.gitattributes` (`* text=auto eol=lf` plus explicit
  binary extensions). This overrides `core.autocrlf` on any machine.
- `public/` is excluded from Prettier and ESLint; `public/sw.js` is regex-matched at build time.
- ESLint reports 6 known `react-refresh/only-export-components` warnings in `src/components/ui/`.
  They are pre-existing boilerplate; do not "fix" them without asking.
- No comments in code unless asked; keep the existing comment style where comments already exist,
  and only where they explain a non-obvious invariant.
