# Known Issues

These are **confirmed, unfixed defects** in the legacy budget app
(`public/budget/`). They are recorded here rather than fixed because fixing them
would change how your data is loaded, migrated, exported, or imported, and that
was an explicit decision: this project prioritises never silently altering your
data, even at the cost of leaving a known bug in place.

Most of these cannot be fixed safely by editing code alone — they need a data
migration strategy and a verified backup of your real data first.

**Severity** is ranked by risk of irreversible data loss, not by how annoying
they are.

---

## Critical

### 1. Import silently destroys `tags`, `debts`, and `payslips`

`public/budget/app.js:2848`

Import rebuilds `appState` from only these keys:

```
settings, sheets, groups, items, recurringItems, categories, templates
```

`tags`, `debts`, and `payslips` are **not read back in**, then the handler calls
`clearDB()` and `saveData()` (`:2860-2861`). The data is gone from IndexedDB, and
because saving syncs to the private GitHub repository, the deletion is pushed to
your cloud copy too.

**There is also no backup path for this.** The export/backup payload
(`:2720-2729`) includes `tags` but **omits `debts` and `payslips` entirely**. So
a file exported today could not restore them even if import were fixed.

> **Until this is fixed: do not use the import feature.** Your only copies of
> debts and payslips are the live app storage and `budget.json` in your private
> repo. Importing destroys both. A code fix cannot recover them once removed.

### 2. Loading the app silently deletes duplicate-named items

`public/budget/app.js:248-261` (localStorage path) and `:316` (IndexedDB path)

On every load, items are deduplicated by `groupId + '|' + name`, keeping only
the first match. Two items in the same group with the same name are not allowed
to coexist: one is dropped from `appState`, the result is saved, and the deletion
syncs to GitHub.

This runs on every page load with no prompt, no warning, and no way to opt out.
It is also why a duplicated sheet is risky — copied items that keep the same
group and name will be pruned on the next load.

> **Until this is fixed: never leave two items with the same name in the same
> group**, and be cautious with "Duplicate Sheet".

### 3. Legacy migration silently discards extra `New Buffer` groups

`public/budget/app.js:235` (localStorage path), `:303` (IndexedDB path)

The old-BudgetBuddy migration renames the **first** group named `New Buffer` or
`Total (Buffer/Variable)` to `Total Buffer`, then **silently drops any further
groups with those names**. The code comments this as "Rename first occurrence,
remove others" (`:299`).

So this is destructive only if you have **two or more** such groups: the extras
are deleted with no prompt, and the result is saved and synced. The first one is
kept, not deleted — earlier notes overstated this.

> **Until this is fixed: check that you do not have more than one group named
> `New Buffer` or `Total (Buffer/Variable)` before loading this version.**

---

## High

### 4. `settings.schemaVersion` is written but never used

The app writes a schema version in three places (`:56`, `:2678`, `:2883`) but
**never reads it**. Migration is therefore decided by legacy name heuristics
rather than a real version gate, which is what makes the migration steps above
hard to reason about. It will remain a source of risk until a proper version gate
exists.

_(Note: an earlier review claimed totals were keyed by item name and could merge
colliding names. That was checked and is **not** the case — every total is a
`reduce` over an array, e.g. `:2793`, `:407`, `:1886`. No such bug.)_

### 5. `currencySymbol` from an imported file is inserted unescaped into HTML

`public/budget/app.js` (import handler, near `:2850`)

`settings.currencySymbol` is interpolated into HTML unescaped. It reaches the
DOM through `formatCurrency()` (`:16-21`), whose result is embedded in
`innerHTML` templates across the app. The settings UI only offers four fixed
options (`:2228-2232`), so the only realistic way to get a hostile value in is
via an import file — where it is not validated. Practical risk is low for a
personal app, but the value is still attacker-controlled after an import.

> Only import files you created yourself or trust the source of.

---

## Medium

### 6. Totals use `|| 0`, which silently converts bad amounts instead of reporting them

Many aggregations read `item.amountTotal || 0` (`:397`, `:824`, `:1874`,
`:2793`) and debts totals use `parseFloat(x) || 0` (`:661-666`).

`|| 0` only guards _falsy_ values. A `NaN` is falsy and becomes `0`, hiding the
error. But a **non-numeric string** such as `"abc"` is truthy, so it passes
through unchanged — and `sum + "abc"` then performs string concatenation,
producing something like `"0abc"` instead of raising an error. This is reachable
if an imported file contains a non-numeric `amountTotal`, since import does not
validate the field.

The visible result is a quietly wrong total rather than an obvious failure.

> Totals computed with `reduce` over arrays were checked and are otherwise
> correct; the weakness is the value validation, not the aggregation itself.

### 7. IndexedDB fallback is missing stores for `debts` and `payslips`

If the app falls back to IndexedDB, the store definitions do not include those
two collections, so they are not persisted through that path.

### 8. Category management is an unfinished feature

`public/budget/app.js:1736-1824`

`addCategoryPrompt`, `editCategory`, `confirmAddCategory`, `confirmEditCategory`
and `deleteCategory` are exposed on `window` (`:2915-2919`) but are not wired to
any button or nav entry. The data operations themselves **do work** — they mutate
`appState` and call `saveData()` before the failure — but each one then calls a
`renderCategories()` that does not exist, so the view never refreshes and the
function throws afterwards.

The practical effect: calling these from the console _will_ change and persist
your categories while appearing to fail, and the screen will look unchanged.

Note that `categories` themselves are healthy and actively used — by Quick Add
(`:1365`, `:1394`), item counts (`:2214`), and export/backup (`:2697`, `:2726`).
Only the management UI is missing. This is a missing renderer, not dead code, so
the functions are intentionally left in place: removing them would delete the
only way to add, edit, or remove a category.

---

## Safe usage precautions

Until the above are addressed:

1. **Do not use the import feature.** It is the single most destructive action in
   the app (issue 1).
2. **Keep item names unique within a group** to avoid silent pruning (issue 2).
3. **Do not rely on Export/Backup to protect debts or payslips** — those two are
   not included in the export at all (issue 1).
4. **Your real data exists in two places only:** this app's local storage and
   `budget.json` in your private GitHub repository. Both are overwritten by
   ordinary saves and syncs, so neither is a historical backup.
5. **Take a manual copy before large restructuring** (bulk renames, duplicating
   sheets, first run of this version) so you can compare afterwards.
6. Only import files you created yourself (issue 5).

---

## Why these are not fixed here

Fixing issues 1-4 requires deciding how existing data should be migrated and
reconciled, and every one of those fixes changes what gets written to storage and
pushed to GitHub. Under the standing rule that this project must not alter the
user's data without an explicit decision, these were left as-is and documented
instead.

The recommended order, once changes are authorised, is: 1, then 2, then 3, with
a verified copy of real data taken before each step.
