# Review Status

Status of the repository review, so the outcome is recorded rather than living in
conversation history. Last updated at commit `0999c19`.

**Current state: both review tracks are complete.** Nothing is pushed; the work
sits on the local branch `cleanup/repo-review`, 16 commits ahead of
`origin/main`.

Data-integrity defects that were found but deliberately **not** fixed are
documented separately in [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

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

| Item                                | Outcome      | Detail                                                                        |
| ----------------------------------- | ------------ | ----------------------------------------------------------------------------- |
| B-FIX-1 `postMessage` vulnerability | **Fixed**    | `0705a66`                                                                     |
| B-FIX-2 reject empty save payloads  | **Dropped**  | Would break legitimate deletion sync                                          |
| B-FIX-3 standalone blank page       | **Fixed**    | `1e1fee2`, tests hardened in `f0a4858`                                        |
| B-FIX-8a category management code   | **Retained** | `0999c19` - documented as an unfinished feature, not dead code                |
| B-FIX-8b `currencySymbol` escaping  | **Open**     | Left as issue 5 in `KNOWN_ISSUES.md` - import-only vector, low practical risk |

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

### B-FIX-8a: category management (retained, not deleted)

Originally flagged for deletion as unreachable code. Verification disproved
that: the mutators write to `appState` and call `saveData()` **before** calling
a `renderCategories()` that does not exist, so the data write succeeds and only
the view refresh fails. `categories` is live data used by Quick Add, item counts,
and export.

Deleting these would have removed the only way to add, edit, or remove a
category, so they are retained and documented instead. See issue 8 in
`KNOWN_ISSUES.md`, which records the decision so it is not re-proposed.

---

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
  `npm run format:check` all pass (22 tests).
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

Only the data-integrity defects in [KNOWN_ISSUES.md](KNOWN_ISSUES.md) remain,
plus B-FIX-8b. They are not scheduled: each requires an explicit decision about
how real data should be migrated, and the standing rule for this project is that
user data is never altered without that decision.

Priority if that changes: issue 1 (import destroys data), then issue 2 (load-time
pruning), then issue 3 (migration), each with a verified copy of real data taken
first.
