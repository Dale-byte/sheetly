# Review Status

Status of the repository review, so the outcome is recorded rather than living in
conversation history. Last updated at commit `1ac006b`.

**Current state: both review tracks are complete, and the data-integrity defects
are now fixed too.** The work sits on the local branch `cleanup/repo-review`,
18 commits ahead of `origin/main`. `main` is untouched.

The data-integrity defects are recorded in
[KNOWN_ISSUES.md](KNOWN_ISSUES.md), which now lists them as fixed and keeps the
original findings for context.

---

## Track A - repository hygiene (complete)

Ten commits, all merged into this branch.

| Commit    | Change                                                                          |
| --------- | ------------------------------------------------------------------------------- |
| `c2a7bd9` | MIT `LICENSE`                                                                   |
| `30cb4a6` | Removed the obsolete BudgetBuddy `localStorage` migration                       |
| `c065dd5` | Added `SECURITY.md`                                                             |
| `f2150a9` | Added `CONTRIBUTING.md` and a pull request template                             |
| `9abc2de` | Prettier ignore plus an `npm run format:check` script                           |
| `3cd8e4f` | Added `typecheck`, the Node test runner, and `/sheetly/` path invariant tests   |
| `982ba83` | Added verification-only CI on Node 22 (never deploys)                           |
| `6c85e6c` | Renamed `scripts/postbuild.mjs` to `scripts/post-build.mjs`                     |
| `2b20dd2` | Made `generate-icons.ps1 -Source` mandatory; regenerated icons byte-identically |
| `95701ed` | Corrected README drift and softened unverified secret-scanning claims           |

Verified: build, typecheck, tests, and format all pass; lint exits 0 with six
pre-existing React Refresh warnings; seven key `/sheetly/` preview paths return
200; `package-lock.json` is unchanged and no dependencies were added.

## Track B - security and runtime correctness (complete)

| Item                                | Outcome     | Detail                                                                                      |
| ----------------------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| B-FIX-1 `postMessage` vulnerability | **Fixed**   | `0705a66`                                                                                   |
| B-FIX-2 reject empty save payloads  | **Dropped** | Would break legitimate deletion sync                                                        |
| B-FIX-3 standalone blank page       | **Fixed**   | `1e1fee2`, tests hardened in `f0a4858`                                                      |
| B-FIX-8a category management code   | **Removed** | Removed at the owner's request - see below                                                  |
| B-FIX-8b `currencySymbol` escaping  | **Fixed**   | `1ac006b` - `formatCurrency()` escapes the symbol before it reaches an `innerHTML` template |

### B-FIX-8a: category management (closed decision - do not reopen)

This item has now been through three reviews and the outcome is settled. Please
read this before proposing anything about categories again.

**History.** `addCategoryPrompt`, `confirmAddCategory`, `editCategory`,
`confirmEditCategory`, and `deleteCategory` were exposed on `window` but not
wired to any UI, and each called a `renderCategories()` that did not exist.
Review 1 flagged them as dead code to delete. That was **wrong**: the mutation
and `saveData()` both complete before the missing renderer throws, so deleting
them would have removed the only way to add, edit, or remove a category. They
were retained and documented. Review 2 implemented `renderCategories()` and
added a **Categories** nav entry. The owner does not want the feature and asked
for it to be removed again.

**Current state, decided by the owner.** There is no category management UI:

- No **Categories** nav entry and no `category-groups` route.
- No `renderCategories()` / `refreshCategories()`, and the five mutators are gone.
- Nothing is exposed on `window` for them.

**The `categories` data itself is retained and is live.** It is read by Quick
Add (`quickAddFromCategory`), by the item count on the dashboard, and by
export, backup, and import. The IndexedDB store stays. Existing category records
keep working exactly as before.

**Therefore, in a future review:**

- Do **not** report the missing Categories screen as a bug or an unfinished
  feature. It is a deliberate decision, not an oversight.
- Do **not** delete the `categories` collection, its IndexedDB store, or
  `quickAddFromCategory`. They are in use, and removing them would break Quick
  Add.
- Do **not** re-implement `renderCategories()` or re-add the nav entry without
  asking the owner first. It has been added and removed once already at their
  instruction.
- The one thing still fair to raise: categories can no longer be created,
  edited, or deleted through the UI. Existing data is safe, but a category can
  only be changed by editing the stored file directly. Raise it as a question,
  not a defect.

### B-FIX-1: message origin validation

The shell and the budget iframe previously accepted `postMessage` from any
sender and used the wildcard `"*"` target, so any page that could obtain a
reference to the iframe could drive the sync engine or read data out of it.

Fixed by validating `e.origin` and requiring `e.source` to be the expected
window in both directions:

- `public/budget/sync.js` accepts messages only from the real parent.
- `src/pages/index.tsx` accepts messages only from the actual iframe
  `contentWindow` on the same origin.
- Every outbound `postMessage` now targets `window.location.origin`; no wildcard
  target remains.

Covered by `tests/postmessage.test.mjs`. Mutation-verified: removing the child
guards fails 3 tests, and restoring a wildcard host target fails 1.

### B-FIX-2: empty payload rejection (dropped)

An earlier suggestion was to reject empty save payloads. **This was investigated
and deliberately not done.** `resetAllData()` legitimately removes the data key,
which makes the bridge send `""`. Rejecting it would stop deletions from syncing,
so deleted data would reappear from the cloud on the next load. The suggested fix
would have introduced a worse bug than the one it addressed.

### B-FIX-3: standalone blank page

`public/budget/index.html` was permanently blank when opened directly, because
`sync.js` always deferred `DOMContentLoaded` waiting for a host `init` message
that a top-level page never receives. The child now detects whether it is framed
and boots itself when it is not.

Also added: a framebusting script in the shell, a cross-origin-only framebust in
the budget page (so same-origin framing by the shell keeps working), and strict
referrer metadata.

Covered by `tests/sync-bridge.test.mjs`, mutation-verified in both directions.

### B-FIX-8a: category management

Superseded by the closed decision above. The original reasoning is kept so the
correction is not lost: the functions were originally flagged for deletion as
unreachable code, which verification disproved, because the mutators write to
`appState` and call `saveData()` **before** calling a `renderCategories()` that
did not exist, so the data write succeeded and only the view refresh failed. The
correct fix at the time would have been to implement `renderCategories()`. The
owner has since decided the feature is not wanted, so it was removed instead.
See the closed decision above for the current state.

---

## Track C - data integrity (complete)

| Issue | Defect                                               | Severity | Commit                                                   |
| ----- | ---------------------------------------------------- | -------- | -------------------------------------------------------- |
| 1     | Import destroyed `tags`, `debts`, `payslips`         | Critical | `1ac006b`                                                |
| 2     | Load-time dedup deleted duplicate-named items        | Critical | `1ac006b`                                                |
| 3     | Buffer migration discarded extra `New Buffer` groups | Critical | `1ac006b`                                                |
| 4     | `settings.schemaVersion` written but never read      | High     | `1ac006b`                                                |
| 5     | `currencySymbol` inserted unescaped into HTML        | High     | `1ac006b`                                                |
| 6     | `\|\| 0` hid bad amounts behind wrong totals         | Medium   | `1ac006b`                                                |
| 7     | IndexedDB had no `debts`/`payslips` stores           | Medium   | `1ac006b`                                                |
| 8     | Category management unreachable from the UI          | Medium   | Removed by owner request - closed decision, see B-FIX-8a |

Seven of the eight were found by reading `public/budget/app.js` and fixed in one
commit. They could not be split into per-issue commits without hand-editing the
verified diff back apart, which risked reintroducing the very bugs being fixed,
so the commit message enumerates each defect instead. Issue 8 was later reversed
by owner request; see B-FIX-8a. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for the
full list and the caveats that remain.

### Verification performed for Track C

- `npm run build`, `npm run lint`, `npm run typecheck`, `npm test` (27 tests),
  `npm run format:check` all pass. Lint exits 0 with the six pre-existing React
  Refresh warnings.
- Real browser, throwaway profile, **synthetic data only**: seeded two
  same-named items, three groups including two `New Buffer`, one debt, and one
  payslip, then loaded and saved. 16/16 assertions passed - both duplicates
  survive, all three groups survive with the first renamed to `Total Buffer` and
  the second kept, debts and payslips are present in localStorage and are
  written to IndexedDB, the store list is v2, and the shell→iframe handshake
  still works end to end.
- After the category removal, re-verified in a real browser that the **Categories**
  nav entry and `category-groups` route are gone, that no view throws, that
  Quick Add still renders a button for an existing category, and that a
  category still survives save and reload.
- The same harness produced two initial failures, both of which turned out to be
  faults in the harness rather than the app: the buffer migration renames in
  memory and only persists on the next save, and the new IndexedDB stores start
  empty because nothing had triggered a save yet. Corrected the probes and both
  pass. Worth knowing the rename is not written until something else saves.
- The shell→iframe handshake was re-verified after the fixes: the iframe mounts,
  the frame is same-origin reachable, and the app renders the Dashboard inside
  the frame. 4/4 assertions passed.
- The temporary harnesses were deleted; no verification scaffolding remains in the
  repository.

## Corrections to the original review

Several initial findings did not survive verification. They are recorded so they
are not reintroduced:

| Original claim                                     | Verdict                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| ~29 XSS injection sites                            | Overstated; a handful of real paths, now documented per-issue                        |
| Totals keyed by item name, merging colliding names | **False** - every total is a `reduce` over an array (`app.js:407`, `:1886`, `:2793`) |
| `currencySymbol` broken                            | **False** - the symbol works; only escaping was missing                              |
| Comma-decimal / float accumulation breakage        | **False** - refuted                                                                  |
| The `New Buffer` migration deletes a group         | Overstated - it renames the **first** match and drops only the extras                |
| Category management is dead code                   | **False** - the mutation and save both complete before the missing renderer throws   |
| Rejecting empty payloads would harden sync         | **False** - it would break deletion sync and resurrect deleted cloud data            |

## Verification performed

- `npm run build`, `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run format:check` all pass (27 tests).
- Confirmed in a real browser via the Chrome DevTools Protocol that the
  standalone budget page renders, the shell mounts, and - seeding a fake config
  so the shell gets past the Connect screen - the **full framed production path
  still works with the new origin checks**: the iframe mounts, the handshake
  completes, and the app renders inside the frame.
- Confirmed `origin/main`'s `sync.js` fails the standalone render identically,
  proving the blank page was pre-existing and genuinely fixed rather than
  introduced.
- The temporary browser harness used for this was deleted; no verification
  scaffolding remains in the repository.

## Remaining known work

No known defects remain open. The `public/backup-full.html` diagnostic page
added in `76047dc` was removed again in this series: it was written while the
load-time data loss was still present, so its hazard report described deletion
behaviour that no longer exists, and it was not wanted.

The caveats in [KNOWN_ISSUES.md](KNOWN_ISSUES.md) still apply to how the fixes
behave in normal use: import is a full replace rather than a merge, a non-numeric
amount becomes `0` and is logged rather than throwing, and an extra
`New Buffer` group keeps its old name until renamed by hand.

## Not done here

- **No real data was ever read, written, or migrated during this work.** Every
  verification used synthetic fixtures in a throwaway Chrome profile. The
  load-time fixes will act on real data the first time the app is opened after
  this is deployed, so taking one export beforehand is still worth doing.
- **The eight fixes are one commit.** See Track C for why.
- **`package-lock.json` is unchanged** and no dependencies were added.
