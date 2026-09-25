import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const SYNC_SRC = fs.readFileSync("public/budget/sync.js", "utf8");
const SHELL_HTML = fs.readFileSync("index.html", "utf8");
const APP_HTML = fs.readFileSync("public/budget/index.html", "utf8");

const APP_ORIGIN = "https://app.test";

const CLOUD = JSON.stringify({ settings: { currencySymbol: "R" }, sheets: [{ id: "s1" }] });

/**
 * Boots sync.js with a chosen parent.
 *
 * Two things matter for the assertions below and both are recorded directly
 * rather than inferred:
 *
 *  - dclRegistered counts DOMContentLoaded listeners that reached the real
 *    document. sync.js swallows them into its own queue while it waits for an
 *    init message, so framed => 0 (this is exactly why a standalone page used
 *    to render blank) and standalone => 1.
 *
 *  - window.postMessage exists, so a standalone "send to parent" resolves to
 *    self-post and is recorded instead of throwing into sync.js's catch. An
 *    earlier version of this file omitted it, which made the hello assertion
 *    pass for the wrong reason.
 */
function boot({ framed }) {
  const store = new Map();
  const toParent = [];
  const messageHandlers = [];
  const dclRegistered = [];

  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
  };

  const document = {
    addEventListener(type, fn) {
      if (type === "DOMContentLoaded") dclRegistered.push(fn);
    },
  };

  const record = (data, targetOrigin) => toParent.push({ data, targetOrigin });

  const window = {
    location: { origin: APP_ORIGIN },
    parent: framed ? { postMessage: record } : null,
    postMessage: record,
    addEventListener(type, fn) {
      if (type === "message") messageHandlers.push(fn);
    },
  };
  if (!framed) window.parent = window; // standalone: parent === self

  const sandbox = {
    window,
    document,
    localStorage,
    Event: class {
      constructor(t) {
        this.type = t;
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
    /** The window sync.js sees as its parent - the legitimate e.source. */
    parent: window.parent,
    /** Simulate app.js registering its boot handler. */
    registerDCL(fn) {
      document.addEventListener("DOMContentLoaded", fn);
    },
    get dclRegistered() {
      return dclRegistered.length;
    },
    get hello() {
      return toParent.filter((m) => m.data.type === "hello");
    },
    post: ({ origin, source, data }) => {
      for (const fn of messageHandlers) fn({ origin, source, data });
    },
  };
}

// ---------------------------------------------------------------- standalone

test("STANDALONE: app.js's DOMContentLoaded handler registers, so the page can render", () => {
  const env = boot({ framed: false });
  env.registerDCL(() => {});
  assert.equal(
    env.dclRegistered,
    1,
    "a standalone page must not have its boot handler swallowed - that is the blank-page bug",
  );
});

test("STANDALONE: posts no hello, because there is no host", () => {
  const env = boot({ framed: false });
  assert.equal(env.hello.length, 0, "standalone must not handshake with itself");
  assert.equal(env.toParent.length, 0, "standalone must not post at all");
});

test("STANDALONE: a foreign init is still refused (guard survives standalone mode)", () => {
  const env = boot({ framed: false });
  env.post({
    origin: "https://evil.test",
    source: { name: "stranger" },
    data: { source: "sheetly-host", type: "init", payload: '{"hacked":true}' },
  });
  assert.equal(env.store.get("sheetly_data"), undefined, "must not write");
});

// -------------------------------------------------------------------- framed

test("FRAMED: boot is held until the snapshot arrives", () => {
  const env = boot({ framed: true });
  env.registerDCL(() => {});
  assert.equal(env.dclRegistered, 0, "framed boot must wait for the cloud snapshot");
});

test("FRAMED: a hello is sent to the host", () => {
  const env = boot({ framed: true });
  assert.equal(env.hello.length, 1, "host must be told we are alive");
  assert.equal(env.hello[0].targetOrigin, APP_ORIGIN, "and not to a wildcard");
});

test("FRAMED: held boot runs and the snapshot is seeded once init arrives", () => {
  const env = boot({ framed: true });
  let booted = 0;
  env.registerDCL(() => booted++);
  env.post({
    origin: APP_ORIGIN,
    source: env.parent,
    data: { source: "sheetly-host", type: "init", payload: CLOUD },
  });
  assert.equal(env.store.get("sheetly_data"), CLOUD, "snapshot must be seeded");
  assert.equal(env.dclRegistered, 0, "still held inside sync.js, not re-registered");
  assert.ok(
    env.toParent.some((m) => m.data.type === "ready"),
    "must acknowledge ready",
  );
});

// ------------------------------------------------------------------- framebust

test("both HTML entry points carry a framebust", () => {
  assert.match(SHELL_HTML, /window\.top !== window\.self/, "shell needs a framebust");
  assert.match(APP_HTML, /window\.top !== window\.self/, "budget app needs a framebust");
});

test("the budget app framebust tolerates the real same-origin host", () => {
  assert.match(
    APP_HTML,
    /window\.top\.location\.origin !== window\.location\.origin/,
    "the shell frames this page same-origin; bouncing it would break the app",
  );
});

test("the shell framebust is unconditional (nothing legitimately frames the shell)", () => {
  const block = SHELL_HTML.slice(SHELL_HTML.indexOf("window.top"));
  assert.ok(
    !block.includes("location.origin"),
    "the shell needs no origin check; an unconditional bounce is correct there",
  );
});
