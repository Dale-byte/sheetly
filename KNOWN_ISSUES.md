# Known Issues

The eight defects listed here were **confirmed and are now fixed** in
`public/budget/`. Each fix is verified against synthetic data in a real
browser (throwaway profile, no real budget data touched) and committed
together in `1ac006b`.

The original text is kept below under "Previously reported" so the reasoning
survives, including the claims that turned out to be wrong.

**Severity** was ranked by risk of irreversible data loss, not by how
annoying the defect was.

For the review that produced this list — including findings that were corrected
or dropped — see [REVIEW_STATUS.md](REVIEW_STATUS.md).

---

## Status

| #   | Defect                                                       | Severity | Status                                  |
| --- | ------------------------------------------------------------ | -------- | --------------------------------------- |
| 1   | Import silently destroyed `tags`, `debts`, `payslips`        | Critical | Fixed                                   |
| 2   | Loading the app silently deleted duplicate-named items       | Critical | Fixed                                   |
| 3   | Legacy migration discarded extra `New Buffer` groups         | Critical | Fixed                                   |
| 4   | `settings.schemaVersion` written but never read              | High     | Fixed                                   |
| 5   | `currencySymbol` from an import inserted unescaped into HTML | High     | Fixed                                   |
| 6   | Totals used `\|\| 0`, hiding bad amounts as wrong totals     | Medium   | Fixed                                   |
| 7   | IndexedDB fallback had no `debts`/`payslips` stores          | Medium   | Fixed                                   |
| 8   | Category management was unreachable from the UI              | Medium   | Removed by owner request - not a defect |

## What changed

1. **Import and export cover all nine collections.** `exportData()`,
   `createBackup()`, and `importData()` now handle `tags`, `debts`, and
   `payslips` alongside the six they already had. Import warns before
   replacing existing data, and still accepts an empty payload so a
   delete-everything state can be restored.
2. **Load no longer prunes items.** The `groupId + name` dedup is gone from
   both the localStorage and IndexedDB paths, so two items in a group may
   share a name again.
3. **The buffer migration is non-destructive.** All three migration sites
   rename only the first `New Buffer` / `Total (Buffer/Variable)` group and
   keep the rest, logging what was kept.
4. **The schema version is an explicit gate.** `readSchemaVersion()` and
   `applyMigrations()` consume `settings.schemaVersion`, and data written by a
   newer build is left untouched rather than rewritten.
5. **The currency symbol is escaped.** `formatCurrency()` escapes the symbol
   before it reaches an `innerHTML` template.
6. **Bad amounts are surfaced, not hidden.** `toAmount()` coerces a finite
   number or returns `0` and records the input; `reportBadAmount()` logs each
   bad value once, so a wrong total is now traceable to its cause. Read paths
   were converted; write paths were left alone so an amount being typed is not
   rewritten mid-keystroke.
7. **IndexedDB stores `debts` and `payslips`.** Bumped to `DB_VERSION 2`,
   created both stores, and wired them into load, save, and reset.

Item 8 is not a fix. Category management **was** briefly implemented, then
removed again at the owner's request: there is no Categories nav entry, no
`category-groups` route, and no `renderCategories()`. The `categories` data
itself is untouched and still used by Quick Add, the item count, and
export/import. Treat the absence of a category management screen as a settled
decision, not a defect — see B-FIX-8a in [REVIEW_STATUS.md](REVIEW_STATUS.md),
which is written specifically to stop a future review reopening it.

Regression coverage lives in `tests/export-import.test.mjs` (round trip keeps
every collection). The load-time behaviour and the shell→iframe handshake were
also exercised in a real browser.

## Previously reported

The text below is the original report, retained for context.

### 1. Import silently destroys `tags`, `debts`, and `payslips`

Import rebuilt `appState` from only:

```
settings, sheets, groups, items, recurringItems, categories, templates
```

`tags`, `debts`, and `payslips` were not read back in, then the handler called
`clearDB()` and `saveData()`. The data was gone from IndexedDB, and because
saving syncs to the private GitHub repository, the deletion was pushed to the
cloud copy too.

There was also no backup path: the export/backup payload included `tags` but
omitted `debts` and `payslips` entirely, so a file exported then could not
restore them even if import were fixed.

### 2. Loading the app silently deletes duplicate-named items

On every load, items were deduplicated by `groupId + '|' + name`, keeping only
the first match. Two items in the same group with the same name could not
coexist: one was dropped from `appState`, the result was saved, and the deletion
synced to GitHub.

This ran on every page load with no prompt, no warning, and no way to opt out.
It is also why a duplicated sheet was risky — copied items that keep the same
group and name would be pruned on the next load.

### 3. Legacy migration silently discards extra `New Buffer` groups

The old-BudgetBuddy migration renamed the **first** group named `New Buffer` or
`Total (Buffer/Variable)` to `Total Buffer`, then silently dropped any further
groups with those names. The code commented this as "Rename first occurrence,
remove others".

This was destructive only with **two or more** such groups: the extras were
deleted with no prompt, and the result was saved and synced. The first one was
kept, not deleted — earlier notes overstated this.

### 4. `settings.schemaVersion` is written but never used

The app wrote a schema version in three places but never read it. Migration was
therefore decided by legacy name heuristics rather than a real version gate,
which is what made the migration steps above hard to reason about.

_(Note: an earlier review claimed totals were keyed by item name and could merge
colliding names. That was checked and is **not** the case — every total is a
`reduce` over an array. No such bug.)_

### 5. `currencySymbol` from an imported file is inserted unescaped into HTML

`settings.currencySymbol` was interpolated into HTML unescaped, reaching the
DOM through `formatCurrency()` whose result is embedded in `innerHTML`
templates across the app. The settings UI only offers four fixed options, so
the only realistic way to get a hostile value in was via an import file, where
it is not validated.

### 6. Totals use `|| 0`, which silently converts bad amounts

Many aggregations read `item.amountTotal || 0` and debts totals used
`parseFloat(x) || 0`.

`|| 0` only guards _falsy_ values. A `NaN` is falsy and becomes `0`, hiding the
error. But a **non-numeric string** such as `"abc"` is truthy, so it passes
through unchanged — and `sum + "abc"` then performs string concatenation,
producing something like `"0abc"` instead of raising an error. This was
reachable if an imported file contained a non-numeric `amountTotal`, since
import does not validate the field.

Totals computed with `reduce` over arrays were otherwise correct; the weakness
was the value validation, not the aggregation itself.

### 7. IndexedDB fallback is missing stores for `debts` and `payslips`

If the app fell back to IndexedDB, the store definitions did not include those
two collections, so they were not persisted through that path.

### 8. Category management (removed at the owner's request - not a defect)

`addCategoryPrompt`, `editCategory`, `confirmAddCategory`,
`confirmEditCategory`, and `deleteCategory` were exposed on `window` but not
wired to any button or nav entry. The data operations themselves **did** work —
they mutated `appState` and called `saveData()` before the failure — but each
then called a `renderCategories()` that did not exist, so the view never
refreshed and the function threw afterwards.

The practical effect: calling these from the console _would_ change and persist
categories while appearing to fail, and the screen would look unchanged.

An earlier review flagged them as dead code, which was wrong: the mutation and
`saveData()` both completed before the missing renderer threw. They were
retained, then `renderCategories()` was implemented and a **Categories** nav
entry added. The owner does not want the feature, so the whole management
surface has been removed again. The five mutators, `renderCategories()`,
`refreshCategories()`, the `category-groups` route, and the nav entry are all
gone, and nothing is exposed on `window` for them.

**The `categories` data is retained and unaffected.** Quick Add, the dashboard
item count, and export/backup/import all still read it, and the IndexedDB store
still exists. The only consequence is that a category can no longer be created,
edited, or deleted from the UI; existing records keep working.

---

## Still worth knowing

- **Your real data lives in two places:** this app's local storage and
  `budget.json` in your private GitHub repository. Both are overwritten by
  ordinary saves and syncs, so neither is a historical backup. Export is a
  snapshot, not a version history.
- **Import replaces everything.** It is a full restore, not a merge, so a file
  missing a collection imports that collection as empty. It warns first.
- **Non-numeric amounts now become `0` and are logged** to the browser console
  rather than throwing or printing `NaN`. That is deliberate, but it means a
  corrupt imported amount shows as `0` in the UI. Check the console when a
  total looks wrong.
- **An extra `New Buffer` group is kept under its old name** rather than being
  renamed or merged. Rename it by hand if you want the name.
- **There is no category management screen, by decision.** Categories cannot be
  created, edited, or deleted in the app. Existing ones still work in Quick Add.
  This is intentional; see B-FIX-8a in [REVIEW_STATUS.md](REVIEW_STATUS.md).
