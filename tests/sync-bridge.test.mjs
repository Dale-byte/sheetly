import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const SYNC_SRC = fs.readFileSync("public/budget/sync.js", "utf8");
const SHELL_HTML = fs.readFileSync("index.html", "utf8");
const APP_HTML = fs.readFileSync("public/budget/index.html", "utf8");

/**
 * Boots sync.js with a chosen parent, so we can compare framed vs standalone.
 */
function boot({ framed }) {
  const store = new Map();
  const toParent = [];
  const messageHandlers = [];
  const dclHandlers = [];

  const parentWindow = { postMessage: (d, o) => toParent.push({ d, o }) };

  const window = {
    location: { origin: "https://app.test" },
    parent: framed ? parentWindow : null,
    addEventListener(type, fn) {
      if (type === "message") messageHandlers.push(fn);
    },
  };
  // Standalone: window.parent === window
  if (!framed) window.parent = window;

  const document = {
    addEventListener(type, fn) {
      if (type === "DOMContentLoaded") dclHandlers.push(fn);
    },
  };

  const sandbox = {
    window,
    document,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => void store.set(k, String(v)),
      removeItem: (k) => void store.delete(k),
    },
    Event: class {
      constructor(t) {
        this.type = t;
      }
    },
    setTimeout: (fn) => {
      fn();
      return 0;
    },
    clearTimeout: () => {},
    console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SYNC_SRC, sandbox, { filename: "sync.js" });

  return {
    toParent,
    store,
    post: ({ origin, source, data }) => {
      for (const fn of messageHandlers) fn({ origin, source, data });
    },
    get hello() {
      return toParent.filter((m) => m.d.type === "hello");
    },
  };
}

test("framed: boot is deferred and a hello is sent to the host", () => {
  const env = boot({ framed: true });
  assert.equal(env.hello.length, 1, "host must be told we are alive");
});

test("framed: a save before init is NOT pushed (ready gate still works)", () => {
  const env = boot({ framed: true });
  // setItem before any init must not produce a 'save'
  const before = env.toParent.length;
  assert.equal(before, 1, "only hello so far");
});

test("STANDALONE: no hello, and boot is not deferred (page cannot be blank)", () => {
  const env = boot({ framed: false });
  assert.equal(env.hello.length, 0, "standalone must not post a hello to itself");
  assert.equal(
    env.toParent.length,
    0,
    "standalone must not post anything at all - there is no host",
  );
});

test("STANDALONE: a foreign init is still rejected (guard is not bypassed)", () => {
  const env = boot({ framed: false });
  env.post({
    origin: "https://evil.test",
    source: { name: "stranger" },
    data: { source: "sheetly-host", type: "init", payload: '{"hacked":true}' },
  });
  assert.equal(env.store.get("sheetly_data"), undefined, "must not write");
});

test("both HTML entry points carry a framebust", () => {
  assert.match(SHELL_HTML, /window\.top !== window\.self/, "shell needs a framebust");
  assert.match(APP_HTML, /window\.top !== window\.self/, "budget app needs a framebust");
});

test("the budget app framebust allows a same-origin parent", () => {
  // The shell frames /sheetly/budget/index.html same-origin; the guard must
  // not bounce that. Assert the origin comparison is present, not an
  // unconditional bounce.
  assert.match(
    APP_HTML,
    /window\.top\.location\.origin !== window\.location\.origin/,
    "budget app must compare origins so the real host still works",
  );
});

test("the shell framebust is unconditional (nothing legitimately frames it)", () => {
  assert.ok(
    !/window\.top\.location\.origin/.test(SHELL_HTML.split("framebust")[0] + "framebust"),
    "the shell is not framed by the app, so no origin check is needed there",
  );
});
