# Security Policy

## Reporting a vulnerability

Sheetly is a personal, single-user app, so there is no private disclosure
process. If you find a real security problem, open a normal GitHub issue at
<https://github.com/Dale-byte/sheetly/issues>. For anything that could expose
someone's budget data, please say so in the title so it can be triaged first.

## Threat model

Sheetly has **no server**. There is no backend, no database and no account
system. The whole data flow is:

```
your browser  <--localStorage-->  iframe (public/budget/)
     |
     +-- GitHub contents API -->  YOUR private repo (budget.json)
```

Because there is no server, Sheetly has no stored credentials of its own. The
trust boundary is your browser and your GitHub account.

## Protecting the iframe

The budget app runs inside a full-screen iframe owned by the shell app, and the
two exchange data with `postMessage`. Because the app has no server, the iframe's
own security depends entirely on that message boundary.

Both directions validate the sender:

- the budget app accepts messages **only** from its real parent, checking both
  the origin and that `event.source` is the parent window;
- the shell accepts messages **only** from the actual iframe window, on the same
  origin.

Every outbound message targets the current origin explicitly - there is no
wildcard `"*"` target anywhere. Without these checks, any page able to obtain a
reference to the iframe could drive the sync engine or read budget data out of
it.

Each page also carries a framebusting script: the shell refuses to be framed at
all, and the budget app refuses to be framed **cross-origin** while still
allowing the same-origin shell to embed it. This is a best-effort client-side
measure, not a substitute for the message validation above.

## What is and is not a secret

| Item              | Where it lives                                                             | Notes                                                                            |
| ----------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Your budget data  | `budget.json` in **your private repo**, plus this browser's `localStorage` | Plaintext JSON. Anyone with read access to the repo can read it.                 |
| Your GitHub token | This browser's `localStorage`, key `sheetly_github_config`                 | Plaintext, not encrypted. Anyone with access to the browser profile can read it. |
| App source code   | This public repo                                                           | Contains no data and no secrets.                                                 |

## Why this repo is public

GitHub Pages can only serve a public repository. The app repo therefore has to
be public. It contains **only code** - no budget data, no tokens, no `.env`
file. `.env` is gitignored and has never been committed.

Your budget data is never stored in this repo. It lives in a **separate,
private** repository that you create yourself and that only you have access to.

## Token handling

The token is entered in the app's Connect screen, kept in `localStorage`, and
sent only to `https://api.github.com`. It is:

- never written to this repo, a log, or a build artifact;
- sent only over HTTPS, and only in an `Authorization` header;
- removable at any time with the **Disconnect** button, which deletes it from
  `localStorage`.

Anyone holding the token can read or modify your budget, so treat it like a
password: use a **fine-grained** token scoped to a single repository with
**Contents: Read and write** and nothing else, and revoke it on GitHub if the
device is lost.

## Reporting a token that was exposed

If a token is ever committed or pasted somewhere public:

1. **Revoke it first** on <https://github.com/settings/personal-access-tokens>.
   Revoking is instant and makes the token worthless.
2. Generate a replacement with the same minimal scope.
3. Re-enter it in each device's Connect screen.

Secret scanning and push protection are worth enabling on this repo (Settings →
Code security and analysis) so an accidental credential push is blocked and
flagged rather than merged. If you enable them, a push that trips them fails,
so a token never has to be cleaned up after the fact.
