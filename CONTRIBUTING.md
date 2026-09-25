# Contributing to Sheetly

Sheetly is a personal budget app: a React shell that syncs a legacy
vanilla-JS budget app to a private GitHub repo. Thanks for helping.

## Setup

```bash
npm install
npm run dev     # http://localhost:5173/sheetly/
```

Node 22 or newer. There is no `.env` to create — the app reads no environment
variables. GitHub credentials are entered in the app's own Connect screen and
stored only in your browser.

## Commands

| Command                | What it does                                      |
| ---------------------- | ------------------------------------------------- |
| `npm run dev`          | Dev server with HMR                               |
| `npm run build`        | Production build + `scripts/postbuild.mjs`        |
| `npm run preview`      | Serve the built output from `dist/`               |
| `npm run lint`         | ESLint                                            |
| `npm run typecheck`    | `tsc --noEmit`                                    |
| `npm test`             | Unit tests (`node --test`, no extra dependencies) |
| `npm run format`       | Rewrite files with Prettier                       |
| `npm run format:check` | Verify formatting without writing                 |

Before opening a pull request, run `npm run build`, `npm run lint`,
`npm run typecheck` and `npm test`, and make sure all four pass. CI runs the
same checks.

Tests live in `tests/` and use Node's built-in test runner, so there is no test
framework to install. Run a single file with:

```bash
node --test tests/base-path.test.mjs
```

## Understand the layout first

This trips up new contributors, so read this before changing anything.

```
src/            the React SHELL only - connect screen, top bar, tabs, sync engine
public/budget/  the actual BUDGET APP - vanilla HTML/CSS/JS, no build step, no framework
```

`src/pages/index.tsx` loads `public/budget/index.html` in an iframe and talks
to it over `postMessage`. **The shell is not the product.** Most user-facing
logic lives in `public/budget/app.js`.

Two consequences:

- Changes to `public/budget/` ship as-is. There is no transpiler, no bundler and
  no type checker for that file. It must stay valid ES5-ish browser JavaScript.
- `public/budget/` is excluded from ESLint and Prettier on purpose. It is
  pre-existing legacy code; reformatting it would bury any real change in noise.

## Escaping rules in `public/budget/app.js`

The single most important rule in this codebase. Values reach the DOM through
template literals, and there are two different escapers:

| Where the value goes                    | Use        |
| --------------------------------------- | ---------- |
| HTML text, or a plain HTML attribute    | `esc()`    |
| Inside a JS string in an `on*=` handler | `jsAttr()` |

**Using `esc()` inside an `on*=` handler is a security bug, not a style
nitpick.** `esc()` turns `'` into the entity `&#39;`. The HTML parser decodes
that entity _before_ the inline handler is compiled, so the value breaks out of
the JS string literal. `jsAttr()` exists to prevent exactly that.

```js
// WRONG - breaks out of the JS string
onclick = "editNote('${esc(note.id)}')";

// RIGHT
onclick = "editNote('${jsAttr(note.id)}')";
```

Values that arrive from the cloud (the `budget.json` in the user's repo) are
attacker-controllable from the point of view of the app. Escape everything.

## The `/sheetly/` base path

The app is served from a GitHub Pages project subpath, so `base: "/sheetly/"`
is hard-coded in **four** places that must stay in sync:

- `vite.config.ts` (`base`)
- `index.html` (manifest, favicon, apple-touch-icon hrefs)
- `public/manifest.webmanifest` (`id`, `start_url`, `scope`, icon `src`)
- `scripts/postbuild.mjs` (`BASE`, used to build the service worker precache)

If you ever change one, change all four, or the app silently 404s on its
icons and service worker.

## Service worker

`public/sw.js` is a **template**, not the shipped file. `scripts/postbuild.mjs`
rewrites its `VERSION` and `PRECACHE` list at build time from the real asset
hashes. Two consequences:

- Do not hand-edit the `VERSION` or `PRECACHE` constants; they are overwritten.
- Do not let Prettier reformat that file. The postbuild step matches those two
  constants with exact regexes and will fail the build loudly if the shape
  changes.

## Pull requests

1. Branch from `main`.
2. Keep the change focused — one logical change per PR.
3. Run `npm run build` and `npm run lint` locally.
4. Do not reformat unrelated code, bump dependencies, or change the `/sheetly/`
   base path as a side effect of another change.
5. If you touch `public/budget/`, say so explicitly in the description, because
   that file has no automated checks covering it.

## Reporting security issues

See [SECURITY.md](SECURITY.md).
