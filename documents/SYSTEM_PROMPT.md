You are working on **Sheetly**, a personal budget app that runs as a static website and an
installable PWA on GitHub Pages, built with **Vite + React 19 + TypeScript**. Your budget is stored
in the user's own private GitHub repository, so it syncs across devices with no cloud account.

## What this is

A single-developer, no-backend web app. There is no server of ours, no database service, and no
build server: `npm run build` produces a static `dist/` that GitHub Pages serves. All persistence
is the user's `localStorage`, a mirror in IndexedDB, and a single `budget.json` file in a private
GitHub repo that the browser reads and writes through the GitHub contents API. The app is already
deployed and in daily use; work now is bug fixes, features, and polish.

The repo contains **two apps in one page**. A small React shell (`src/`) hosts the real budget app
— legacy vanilla JS in `public/budget/` — inside a same-origin `<iframe>` and keeps the two in
sync over `postMessage`. Read `documents/ARCHITECTURE.md` before changing anything structural.

## Project location & repo

- Project root: `C:\Users\daelf\Documents\vibecode_projects\Sheetly\Project Source\export`
- Git remote: `https://github.com/Dale-byte/sheetly.git` (branch `main`)
- Live URL: https://dale-byte.github.io/sheetly/
- Data repo (the user's, private, **not** this one): `Dale-byte/sheetly-data`, file `budget.json`
- Pushing to `main` deploys to GitHub Pages automatically. There is no version file to bump and no
  manual release step.
- This repository is the _app_; the user's budget lives in a separate private repo. Never commit
  budget data, tokens, or `sheetly_github_config` here.

## Current state

- `main` is at `c094467` and is clean; CI and the Pages deploy are green on every push.
- Full check chain, all passing: `npm run build`, `npm run lint`, `npm run typecheck`, `npm test`
  (27 tests), `npm run format:check`.
- `npm run lint` reports **6 known `react-refresh/only-export-components` warnings** in
  `src/components/ui/`. They are pre-existing shadcn/ui boilerplate. Do not "fix" them without
  asking; they are unrelated leftovers and fixing them creates churn.
- Version: no semver in the app. Releases are identified by commit SHA, which is stamped into
  `dist/sw.js` and into the `?v=` query of the budget app's assets at build time.

## What is done (shipped)

Per `documents/features.md`:

- **Budget sheet**: subsections, items with totals and breakdowns, active/inactive toggle,
  duplicate items allowed by design, summary/section/subsection group types, per-month sheets with
  switch, create, rename, delete, and duplicate.
- **Buffers**: Current Buffer and Total Buffer summary groups with quick-set editing.
- **Recurring**: a dedicated Recurring group for standing amounts, toggleable per item.
- **Dashboard**: overview with quick actions.
- **Debts**: balance, limit, minimum payment, payment history, aggregate totals.
- **Payslips**: monthly payslips with line items, deductions, company contributions, net pay.
- **Notes and tags**: notes with title/body, tags with colours, tag management, filtering.
- **Templates**: save the current sheet as a reusable template, create a sheet from a template,
  duplicate and delete templates.
- **Export/import**: JSON export, full backup file, Excel (`.xls`), PDF, and JSON import.
- **Settings**: currency symbol, theme, cents display, sheet format, default template, and data
  tools (export, import, backup, reset).
- **In-app help** view.
- **Cloud sync**: connect a private GitHub repo, auto-save, cross-device polling, visible sync
  status, and a Backups tab with full version history (download, restore, run-now, import).
- **PWA**: web manifest, generated icon set, service worker with precache, install prompt, offline
  capability.
- **Foundations**: MIT license, `SECURITY.md`, `CONTRIBUTING.md`, PR template, CI on push and PR,
  Pages deploy on push to `main`, LF line endings enforced via `.gitattributes`.

## Latest work in this session

1. **Category management removed at the owner's request** (`f02692f`). Removed the sidebar entry,
   the `category-groups` route, `renderCategories()`/`refreshCategories()`, and the five category
   mutators, plus their `window` exports. The `categories` **data**, the IndexedDB store, Quick Add
   from a category, the item count, and export/import were all deliberately kept. This is a closed
   owner decision, recorded as B-FIX-8a in `REVIEW_STATUS.md` and item 8 in `KNOWN_ISSUES.md`.
   **Do not re-add category management in a future code review** — it is a decision, not a defect.
2. **Per-deploy asset versioning** (`c094467`). The budget page referenced its sub-resources with
   hand-written tokens (`app.js?v=mob-7`, `styles.css?v=mob-7`, `calculator.js?v=2`) that were
   identical on every release, so they busted nothing: with `Cache-Control: max-age=600` and a
   cache-first service worker, browsers kept serving the _previous_ release's `app.js` after a
   successful deploy. `scripts/post-build.mjs` now rewrites those three references to the commit
   SHA and fails the build if any is missed, and regenerates the precache list from the same
   versioned URLs so page requests and cache keys agree.
3. **`.gitattributes` added** (`28731fd`): `* text=auto eol=lf` plus explicit binary extensions.
   This overrides `core.autocrlf` per machine. Verified in a fresh clone that inherited
   `autocrlf=true`: zero CRLF text files, Prettier and ESLint clean.
4. **Load-time data loss and incomplete export/import fixed** (`1ac006b`, on `main` as `27cf05f`).
   Duplicate-named items are no longer pruned on load, extra legacy buffer groups are preserved,
   the previously write-only `schemaVersion` is now actually read and gates migration, amounts are
   coerced through `toAmount()` with warnings instead of producing `NaN`/concatenated strings, and
   IndexedDB was bumped to v2 so `debts` and `payslips` persist. Export and backup now include all
   nine collections plus settings. Root causes are written up in `KNOWN_ISSUES.md`.

## Stack & architecture

- Vite 7, React 19, TypeScript 5.8, Tailwind 4, shadcn/ui on Radix, `lucide-react`, `sonner`,
  `date-fns`, `react-hook-form` + `zod`, `recharts` (via the shadcn chart component),
  `vite-tsconfig-paths` (`@/` alias). Tests use **Node's built-in runner** (`node --test`) — there
  is no Vitest/Jest.
- `vite.config.ts` sets `base: "/sheetly/"` (the Pages project-page subpath). `public/sw.js` and
  `scripts/post-build.mjs` must keep the same `BASE`; `tests/base-path.test.mjs` enforces it.
- `src/` is TypeScript and lint-checked. `public/budget/` is plain JS, ships untranspiled, and is
  excluded from both Prettier and ESLint on purpose (`public/sw.js` is regex-matched at build
  time, so reformatting it can break the build).
- Persistence keys: `localStorage["sheetly_data"]` (primary),
  `localStorage["sheetly_github_config"]` (`{owner, repo, token}`, browser-only), IndexedDB
  `SheetlyDB` v2, and `budget.json` in the user's private repo. `SCHEMA_VERSION` is 1.
- State shape: `settings`, `sheets`, `groups`, `items`, `recurringItems`, `categories`,
  `templates`, `tags`, `debts`, `payslips`, `currentSheetId`, `activeView`.
- Default currency `R` (ZAR) with `en-ZA` number/date formatting.

## Build / verify / release workflow

- Verify everything before pushing: `npm run build`, `npm run lint`, `npm run typecheck`,
  `npm test`, `npm run format:check`. All five must be clean.
- `npm run build` runs `vite build && node scripts/post-build.mjs`. Post-build pins the budget
  asset `?v=` tokens to the SHA, stamps `const VERSION` in `dist/sw.js`, regenerates the precache
  list, and copies `dist/index.html` to `dist/404.html`. It exits non-zero if a version rewrite is
  missed — that is intentional, do not weaken the check.
- CI (`.github/workflows/ci.yml`) runs on push to `main` and on pull requests, does not deploy, and
  additionally asserts the build output is stamped and `404.html` matches `index.html`.
- `deploy.yml` builds and publishes `dist/` to GitHub Pages on push to `main`. After pushing, watch
  both runs and confirm the deploy succeeded before telling the user it is live.
- Release identity is the commit SHA. There is nothing to version-bump.

## Gotchas / context

- **The user cannot see a deploy immediately.** A cached page keeps showing the old app. This has
  burned us twice: hand the user **Ctrl+Shift+R** (or clear site data) rather than assuming the
  push did not land. Verify the _server_ response with a cache-busting query before concluding
  anything is broken.
- **Category data is not category management.** Removing the screen must not remove the
  `categories` collection, the IndexedDB store, or Quick Add. See gotcha 1 above.
- **`#categories` is the Notes route.** The sidebar label is `Notes`. Do not "fix" the route name.
- **`renderReports()` is dead code** — defined in `app.js`, routed from nowhere. Leave it alone
  unless asked.
- **An empty `postMessage` `save` payload is legitimate** and means "the user deleted everything".
  Do not add truthiness guards that would swallow it.
- **The sync bridge defers `DOMContentLoaded` when framed.** If you break that handshake the app
  either boots against empty state or never boots at all. Standalone (opened directly, not framed)
  must skip the deferral or the page stays blank forever.
- **Never post with a `'*'` target origin**, and never treat `msg.source` (a string inside the
  payload) as an origin check. Both sides must verify `e.origin` and `e.source`.
- **An empty cloud must never wipe a device with local data.** The host reads `localStorage` as a
  fallback before sending, and the frame preserves local data on an empty `init`.
- **Never inspect or touch the user's real budget data.** All browser testing uses synthetic data
  in a throwaway profile. We cannot independently confirm the state of the user's real data, and
  must say so rather than imply we checked.
- A known cosmetic issue remains: in framed mode a buffer group can be renamed in place and
  momentarily appear as a "New Buffer" duplicate. No data is lost. Unrooted.
- The old buggy versions were live before `27cf05f`. If the old code pruned anything during earlier
  visits, the app cannot restore it; the user's `budget.json` git history is the recovery path.
- Session history lives in opencode's global DB at
  `C:\Users\daelf\.local\share\opencode\opencode.db`. This project originally sat in the wrong
  working directory; all files edited belong to `...\Sheetly\Project Source\export`.

## How to behave

Read code before changing it and mimic the surrounding style. Do not add comments unless asked.
Never convert `public/budget/` to a framework or add a build step to it without asking first. Keep
`vite.config.ts` base, `public/sw.js` `BASE`, and `scripts/post-build.mjs` `BASE` in agreement.
Run the full five-command check chain after any change, not just the one you touched. Do not commit
or push unless asked — the user grants push permission explicitly and per-task. Verify the live
site with a real headless browser and synthetic data before claiming a fix works, and report
what you actually verified versus what you could not.
