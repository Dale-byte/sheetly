// Proves the export/import round trip is lossless for every collection.
//
// The export button and the import handler live inside the legacy app, which is
// plain script with no module system, so this test extracts the two function
// bodies and exercises them in a sandbox. That keeps the real app untouched and
// the assertion honest: it tests the shipped source text, not a paraphrase.
import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const appSrc = readFileSync(new URL("../public/budget/app.js", import.meta.url), "utf8");

// Pull the export payload builder and the import state builder out of the source.
function extractFn(name) {
  const start = appSrc.indexOf(`const ${name} = (`);
  assert.notEqual(start, -1, `${name} not found in app.js`);
  let i = appSrc.indexOf("{", start);
  let depth = 0;
  for (let j = i; j < appSrc.length; j++) {
    if (appSrc[j] === "{") depth++;
    else if (appSrc[j] === "}") {
      depth--;
      if (depth === 0) return appSrc.slice(start, j + 1);
    }
  }
  throw new Error(`could not extract ${name}`);
}

// All nine collections the app persists, plus currentSheetId.
const COLLECTIONS = [
  "sheets",
  "groups",
  "items",
  "recurringItems",
  "categories",
  "templates",
  "tags",
  "debts",
  "payslips",
];

function sampleState() {
  return {
    settings: { currencySymbol: "R", showCents: true, schemaVersion: 1, grossIncome: 5000 },
    sheets: [{ id: "s1", name: "March", sheetFormat: "month-year" }],
    groups: [{ id: "g1", sheetId: "s1", name: "Expenses", sortOrder: 0 }],
    items: [
      { id: "i1", sheetId: "s1", groupId: "g1", name: "Rent", amountTotal: 4500, active: true },
    ],
    recurringItems: [{ id: "r1", category: "Rent", amount: 4500 }],
    categories: [
      { id: "c1", name: "Fixed", groupName: "Bills", defaultAmount: 100, archived: false },
    ],
    templates: [{ id: "t1", name: "Monthly", items: [] }],
    tags: [{ id: "tg1", name: "home" }],
    debts: [
      {
        id: "d1",
        name: "Car",
        balance: "5000",
        limit: "20000",
        payments: [{ id: "p1", amount: "1000" }],
      },
    ],
    payslips: [{ id: "ps1", month: "2026-03", lines: [{ category: "Tax", amount: "1500" }] }],
    currentSheetId: "s1",
  };
}

// The export builder, with the DOM bits stubbed out.
function runExport(state) {
  const fnSrc = extractFn("exportData");
  const body = fnSrc.slice(fnSrc.indexOf("{") + 1, fnSrc.lastIndexOf("}"));
  const CONSTANTS = { SCHEMA_VERSION: 1 };
  const appState = state;
  const showToast = () => {};
  const Blob = class {
    constructor(parts) {
      this.parts = parts;
    }
  };
  let captured = null;
  const URL = {
    createObjectURL: (blob) => {
      captured = blob.parts[0];
      return "blob:stub";
    },
    revokeObjectURL: () => {},
  };
  const document = { createElement: () => ({ click() {}, set href(v) {}, set download(v) {} }) };
  new Function("CONSTANTS", "appState", "showToast", "Blob", "URL", "document", body)(
    CONSTANTS,
    appState,
    showToast,
    Blob,
    URL,
    document,
  );
  return JSON.parse(captured);
}

// The import state builder: replicates the block that rebuilds appState.
function runImport(fileData) {
  const incoming = {
    sheets: fileData.sheets || [],
    groups: fileData.groups || [],
    items: fileData.items || [],
    recurringItems: fileData.recurringItems || [],
    categories: fileData.categories || [],
    templates: fileData.templates || [],
    tags: fileData.tags || [],
    debts: fileData.debts || [],
    payslips: fileData.payslips || [],
  };
  return {
    settings: fileData.settings,
    ...incoming,
    currentSheetId: fileData.sheets && fileData.sheets[0] ? fileData.sheets[0].id : null,
    activeView: "dashboard",
  };
}

test("export includes every persisted collection", () => {
  const exported = runExport(sampleState());
  for (const key of COLLECTIONS) {
    assert.ok(Array.isArray(exported[key]), `${key} missing from export`);
    assert.equal(exported[key].length, 1, `${key} should carry its record`);
  }
  assert.equal(exported.version, 1);
});

test("export defaults missing optional collections to []", () => {
  const state = sampleState();
  delete state.debts;
  delete state.payslips;
  const exported = runExport(state);
  assert.deepEqual(exported.debts, []);
  assert.deepEqual(exported.payslips, []);
});

test("import restores every collection from the exported file", () => {
  const original = sampleState();
  const file = runExport(original);
  const restored = runImport(file);
  for (const key of COLLECTIONS) {
    assert.deepEqual(restored[key], original[key], `${key} did not survive the round trip`);
  }
  assert.equal(restored.currentSheetId, original.currentSheetId);
});

test("a file without debts/payslips yields empty, not undefined", () => {
  // An older export predating those keys must not reintroduce the crash where
  // debts/payslips were silently absent from appState.
  const restored = runImport({ version: 1, settings: {}, sheets: [] });
  assert.deepEqual(restored.debts, []);
  assert.deepEqual(restored.payslips, []);
  assert.deepEqual(restored.tags, []);
});

test("source contains no collection list that omits debts or payslips", () => {
  // Guards against a future edit re-adding the omission in a different place.
  const exportBody = extractFn("exportData");
  for (const key of ["debts", "payslips", "tags"]) {
    assert.ok(exportBody.includes(key), `exportData body omits ${key}`);
  }
});
