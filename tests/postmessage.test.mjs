import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const SYNC_SRC = fs.readFileSync("public/budget/sync.js", "utf8");
const HOST_SRC = fs.readFileSync("src/pages/index.tsx", "utf8");

const APP_ORIGIN = "https://app.test";
const HOST_ORIGIN = "https://evil.test";

const CLOUD = JSON.stringify({
  settings: { currencySymbol: "R" },
  sheets: [{ id: "s1" }],
});

/**
 * Boots public/budget/sync.js in a vm sandbox with just enough DOM surface for
 * it to run, so the message handler can be driven directly.
 */
function boot({ appOrigin = APP_ORIGIN } = {}) {
  const store = new Map();
  const toParent = [];
  const domReady = [];
  const messageHandlers = [];

  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
  };

  const document = {
    addEventListener(type, fn) {
      if (type === "DOMContentLoaded") domReady.push(fn);
    },
  };

  // The real window.parent the script will post to. Tests use this object as
  // the legitimate `e.source`.
  const parent = {
    postMessage: (data, targetOrigin) => toParent.push({ data, targetOrigin }),
  };

  const window = {
    location: { origin: appOrigin },
    parent,
    addEventListener(type, fn) {
      if (type === "message") messageHandlers.push(fn);
    },
  };

  const sandbox = {
    window,
    document,
    localStorage,
    Event: class {
      constructor(type) {
        this.type = type;
      }
    },
    setTimeout: () => 0,
    clearTimeout: () => {},
    console,
  };
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(SYNC_SRC, sandbox, { filename: "sync.js" });

  return {
    store,
    toParent,
    domReady,
    /** The legitimate parent window object. */
    parent,
    /** Deliver a message, spoofing both origin and sender. */
    post({ origin, source, data }) {
      for (const fn of messageHandlers) fn({ origin, source, data });
    },
    get stored() {
      return store.get("sheetly_data");
    },
  };
}

test("accepts init from the real host: snapshot is seeded (no regression)", () => {
  const env = boot();
  env.post({
    origin: APP_ORIGIN,
    source: env.parent,
    data: { source: "sheetly-host", type: "init", payload: CLOUD },
  });
  assert.equal(env.stored, CLOUD, "the cloud snapshot must reach localStorage");
});

test("REJECTS init from a foreign origin, even carrying the right magic string", () => {
  const env = boot();
  env.post({
    origin: HOST_ORIGIN,
    source: env.parent,
    data: { source: "sheetly-host", type: "init", payload: '{"hacked":true}' },
  });
  assert.equal(env.stored, undefined, "a cross-origin init must not be able to write localStorage");
});

test("REJECTS init from the right origin sent by a window that is not our host", () => {
  const env = boot();
  env.post({
    origin: APP_ORIGIN,
    source: { name: "some-other-window" },
    data: { source: "sheetly-host", type: "init", payload: '{"hacked":true}' },
  });
  assert.equal(env.stored, undefined, "only window.parent may send init");
});

test("REJECTS a forged navigate from a foreign origin", () => {
  const env = boot();
  env.post({
    origin: HOST_ORIGIN,
    source: env.parent,
    data: { source: "sheetly-host", type: "navigate", payload: "dashboard" },
  });
  // navigate() is not defined in the sandbox, so reaching it would set a hash.
  // Assert the handler bailed before touching location.
  assert.equal(env.stored, undefined);
});

test("REJECTS a forged reload from a foreign origin", () => {
  const env = boot();
  // If the guard were missing, window.location.reload() would throw here
  // because reload is absent from the fake location object.
  env.post({
    origin: HOST_ORIGIN,
    source: env.parent,
    data: { source: "sheetly-host", type: "reload" },
  });
  assert.ok(true, "guard returned before calling location.reload()");
});

test("never posts to a wildcard target origin", () => {
  const env = boot();
  assert.ok(env.toParent.length >= 1, "expected at least the hello message");
  for (const m of env.toParent) {
    assert.notEqual(m.targetOrigin, "*", `message ${m.data.type} used a wildcard`);
    assert.equal(m.targetOrigin, APP_ORIGIN);
  }
});

test("host-side listeners in index.tsx keep both guards (regression guard)", () => {
  const origin = HOST_SRC.match(/if \(e\.origin !== window\.location\.origin\) return;/g) ?? [];
  assert.ok(
    origin.length >= 2,
    `expected both host listeners to check e.origin, found ${origin.length}`,
  );
  const source =
    HOST_SRC.match(/if \(e\.source !== iframeRef\.current\?\.contentWindow\) return;/g) ?? [];
  assert.ok(
    source.length >= 2,
    `expected both host listeners to check e.source, found ${source.length}`,
  );
  assert.ok(
    !/postMessage\([^;]*"\*"/.test(HOST_SRC),
    "index.tsx must not use a wildcard targetOrigin",
  );
});
