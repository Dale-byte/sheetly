// Guards the /sheetly/ GitHub Pages base path.
//
// The path is hard-coded in five separate files because Vite, the manifest,
// the HTML shell and the service worker all need it and there is no single
// source of truth. Changing one and not the others does not fail the build -
// it silently 404s the icons and breaks the service worker precache in
// production. This test makes that failure loud.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const EXPECTED = "/sheetly/";

test("vite base matches the expected Pages subpath", () => {
  const base = /base:\s*"([^"]+)"/.exec(read("vite.config.ts"));
  assert.ok(base, "could not find `base:` in vite.config.ts");
  assert.equal(base[1], EXPECTED);
});

test("postbuild BASE matches the vite base, minus the trailing slash", () => {
  const base = /const BASE = "([^"]+)"/.exec(read("scripts/postbuild.mjs"));
  assert.ok(base, "could not find `const BASE` in scripts/postbuild.mjs");
  assert.equal(base[1], EXPECTED.replace(/\/$/, ""));
});

test("service worker template BASE matches the vite base, minus the trailing slash", () => {
  const base = /const BASE = "([^"]+)"/.exec(read("public/sw.js"));
  assert.ok(base, "could not find `const BASE` in public/sw.js");
  assert.equal(base[1], EXPECTED.replace(/\/$/, ""));
});

test("every /sheetly/ URL in index.html is absolute under the base path", () => {
  const html = read("index.html");
  // Only <link href> is checked. The module entry script is deliberately
  // "/src/main.tsx": that is the Vite dev entry, which Vite rewrites to
  // "<base>assets/index-<hash>.js" at build time, so it is not a base-path
  // concern and asserting on it would break every build.
  const hrefs = [...html.matchAll(/<link\b[^>]*\bhref="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length > 0, "expected at least one <link href> in index.html");
  for (const href of hrefs) {
    assert.ok(
      href.startsWith(EXPECTED),
      `index.html references "${href}" which is not under ${EXPECTED}`,
    );
  }
});

test("manifest id, start_url, scope and every icon src are under the base path", () => {
  const manifest = JSON.parse(read("public/manifest.webmanifest"));
  for (const key of ["id", "start_url", "scope"]) {
    assert.equal(manifest[key], EXPECTED, `manifest.${key} is not ${EXPECTED}`);
  }
  assert.ok(manifest.icons.length > 0, "manifest has no icons");
  for (const icon of manifest.icons) {
    assert.ok(
      icon.src.startsWith(EXPECTED),
      `manifest icon "${icon.src}" is not under ${EXPECTED}`,
    );
  }
});

test("the shell loads the budget app from the base path", () => {
  const shell = read("src/pages/index.tsx");
  assert.ok(
    shell.includes('import.meta.env.BASE_URL + "budget/index.html"'),
    "src/pages/index.tsx no longer loads the budget app from BASE_URL",
  );
});
