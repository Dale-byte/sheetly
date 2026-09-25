## What does this change?

<!-- One or two sentences. What problem does this solve? -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / cleanup (no behaviour change)
- [ ] Docs only
- [ ] Build, config or CI

## Checklist

- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] I did not reformat unrelated code
- [ ] I did not bump any dependency versions
- [ ] I did not change the `/sheetly/` base path (it is hard-coded in four files)

## Does this touch `public/budget/`?

`public/budget/` is the actual budget app. It ships as-is, with no build step,
no bundler, no type checker, and it is excluded from ESLint and Prettier. **No
automated check covers it.**

- [ ] No
- [ ] Yes — I have tested it manually in the browser and describe what I checked below

<!-- If yes: what did you test, and what did you check? -->

## Escaping (only if you touched `public/budget/app.js`)

- [ ] Every value in an `on*=` handler uses `jsAttr()`, not `esc()`
- [ ] Every value reaching HTML text or a plain attribute uses `esc()`
- [ ] Nothing unescaped reaches `innerHTML` or an attribute value

## Screenshots

<!-- For UI changes, before/after. -->
