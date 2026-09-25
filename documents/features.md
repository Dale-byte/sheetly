# Sheetly — Feature Roadmap

Status legend: [x] done, [ ] planned.

## Phase 1 — MVP (shipped)

### Budget sheet

- [x] Subsections with items, totals and per-item amount breakdowns
- [x] Group types: section, subsection, summary (buffers), recurring
- [x] Default group/item template seeded on first run
- [x] Add, rename and delete subsections; add, rename, re-amount, duplicate, activate/deactivate
      and delete items
- [x] Duplicate-named items allowed by design — they are never pruned automatically
- [x] Amount calculator inside the item modal

### Buffers

- [x] Current Buffer and Total Buffer summary groups
- [x] Quick-set editing of buffer totals from the sheet

### Recurring

- [x] Dedicated Recurring group for standing amounts
- [x] Per-item activate/deactivate and delete

### Monthly sheets

- [x] One sheet per month, with switch, create, rename and delete
- [x] Duplicate an entire sheet
- [x] Configurable sheet format (e.g. `month-year`)
- [x] Filter the sheet list

### Dashboard

- [x] Overview with quick actions into the common edits

### Debts

- [x] Per-debt balance, limit and minimum payment
- [x] Payment history per debt
- [x] Aggregate balance, limit, minimum-payment and paid totals

### Payslips

- [x] One payslip per month
- [x] Line items with editable labels and amounts, saved as you type
- [x] Gross, deductions, company contributions, allowances/fringe benefits, net pay
- [x] Free-text notes, edit and delete a whole payslip

### Notes and tags

- [x] Notes with title and body
- [x] Tag notes, and tag notes while editing
- [x] Tag list with colours; edit a tag's colour; add and delete tags
- [x] Filter notes

### Templates

- [x] Save the current sheet as a reusable template
- [x] Create a new sheet from a template
- [x] Preview a template before using it
- [x] Duplicate and delete templates
- [x] Configurable default template

### Settings

- [x] Currency symbol, cents on/off, light/dark theme
- [x] Data tools: export, import, create backup, reset all data
- [x] Entries into the Backups and Templates host tabs

### Help

- [x] In-app help view

### Foundations

- [x] Offline-capable static PWA (manifest, generated icon set, service worker, install prompt)
- [x] Framework-free budget app shipped untranspiled inside a React shell
- [x] No server, no database service, no analytics, no ads
- [x] Node built-in test suite covering base path, postMessage, sync bridge and export/import

## Phase 2 — Cloud sync & backups (shipped)

- [x] Connect a **private** GitHub repo (owner, repo, fine-grained PAT with Contents read/write);
      public repos are rejected at connect time
- [x] Token stored in this browser only, under `localStorage["sheetly_github_config"]`
- [x] Whole budget stored as one `budget.json` snapshot; every save is a commit
- [x] Debounced auto-save from the app to the host to GitHub
- [x] Cross-device sync: 30 s poll plus a check on tab focus, ignoring our own echo
- [x] No reload within 20 s of our own write, so an in-progress edit is never destroyed
- [x] Empty or unreachable cloud falls back to local data and can never wipe the device
- [x] Visible sync status: Synced / Syncing… / Sync failed
- [x] Same-origin `postMessage` bridge in both directions, with `e.origin` **and** `e.source`
      verified on each side
- [x] Host tabs: Budget, Templates, Backups

### Version history (shipped)

- [x] Backups tab listing the last 50 versions of `budget.json` with message, date and short SHA
- [x] Download any version as JSON
- [x] Restore any version (confirmation required; writes a new "Restore <sha>" commit)
- [x] "Run backup now" to snapshot the current state as a marked version
- [x] Import an external backup file (accepts a raw snapshot or a wrapped `budget_data` export)

## Phase 3 — Data integrity (shipped)

Root causes are documented in `KNOWN_ISSUES.md`.

- [x] Load-time duplicate-name pruning removed — items that share a name are all kept
- [x] Extra legacy buffer groups preserved across a load/save cycle
- [x] `schemaVersion` is now read, not just written, and gates migration
- [x] Amount coercion hardened (`toAmount`): no more `NaN`, no more `"0abc"` concatenation, and
      non-numeric input is warned about instead of silently swallowed
- [x] IndexedDB v2 with `debts` and `payslips` stores, created without touching existing records
- [x] Export, backup and import cover all nine collections plus settings
- [x] Regression tests guarding each of the above

## Phase 4 — Repo hygiene & delivery (shipped)

- [x] MIT `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, PR template
- [x] CI on push to `main` and on pull requests (typecheck, lint, test, format, build) — and it
      does **not** deploy, so a broken PR is caught before it is published
- [x] Separate Pages deploy workflow on push to `main`
- [x] CI asserts the service worker was stamped and that `404.html` matches `index.html`
- [x] Service worker cache version stamped with the commit SHA on every build
- [x] Budget asset URLs versioned per release so a deploy can never serve the previous `app.js`
- [x] `.gitattributes` pinning LF and protecting binary assets, overriding `core.autocrlf`
- [x] Clickjacking defence: the shell refuses to be framed, and the budget page refuses a
      cross-origin parent while still tolerating the legitimate same-origin host

## Owner decisions (closed — do not re-open in review)

- [x] **Category management screen removed** (`f02692f`). The sidebar entry, the
      `category-groups` route, `renderCategories()`/`refreshCategories()` and the five category
      mutators are gone, along with their `window` exports. This is a decision, not a defect:
      recorded as B-FIX-8a in `REVIEW_STATUS.md` and item 8 in `KNOWN_ISSUES.md`.
- [x] **Category data deliberately kept**: the `categories` collection, its IndexedDB store, Quick
      Add from a category, the category item count, and export/import all still work. Only the
      management screen was removed. There is no UI to edit categories any more, so existing
      records can only be changed by editing the stored file directly.

## Known gaps

- [ ] No UI to create or edit categories (consequence of the owner decision above)
- [ ] `currentSheetId` is not carried through export/backup/import, so restoring a file from
      another device always lands on the first sheet rather than the sheet you were last using
- [ ] `tests/export-import.test.mjs` reconstructs the import path by hand rather than driving the
      real `importData()` handler, so the on-the-wire import path is not covered end to end
- [ ] `renderReports()` is defined in `app.js` but wired to no route and has no nav entry
- [ ] Cosmetic: in framed mode a renamed buffer group can briefly appear as a "New Buffer"
      duplicate. No data is lost. Unrooted
- [ ] No automated browser test in CI; live verification is done manually with headless Chrome and
      synthetic data
