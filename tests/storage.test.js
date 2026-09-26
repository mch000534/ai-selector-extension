const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

global.window = global;

const libDir = path.join(__dirname, '..', 'lib');
vm.runInThisContext(fs.readFileSync(path.join(libDir, 'storage.js'), 'utf8'));

const storage = window.__aiext.storage;

function setMockChrome(impl) {
  global.chrome = impl;
  window.chrome = impl;
}

test('SCHEMA_VERSION is a positive number', () => {
  assert.ok(Number.isInteger(storage.SCHEMA_VERSION) && storage.SCHEMA_VERSION >= 1);
});

test('getSync returns fallback when chrome is absent', async () => {
  setMockChrome(undefined);
  assert.deepStrictEqual(await storage.getSync(['a'], { dflt: 1 }), { dflt: 1 });
  assert.deepStrictEqual(await storage.getSync(['a']), {});
});

test('getSync returns stored values and falls back on rejection', async () => {
  setMockChrome({ runtime: { id: 'x' }, storage: { sync: { get: async () => ({ a: 1 }) } } });
  assert.deepStrictEqual(await storage.getSync(['a'], {}), { a: 1 });
  setMockChrome({
    runtime: { id: 'x' },
    storage: { sync: { get: async () => { throw new Error('lastError: QUOTA_BYTES'); } } },
  });
  assert.deepStrictEqual(await storage.getSync(['a'], { fb: true }), { fb: true });
});

test('getSync returns fallback when context is invalidated', async () => {
  setMockChrome({ runtime: { id: null }, storage: { sync: { get: async () => ({ a: 1 }) } } });
  assert.deepStrictEqual(await storage.getSync(['a'], { fb: true }), { fb: true });
});

test('getLocal reads from the local area', async () => {
  setMockChrome({ runtime: { id: 'x' }, storage: { local: { get: async () => ({ k: [1] }) } } });
  assert.deepStrictEqual(await storage.getLocal(['k'], {}), { k: [1] });
});

test('setSync resolves true on success, false on failure or absence', async () => {
  setMockChrome({ runtime: { id: 'x' }, storage: { sync: { set: async () => {} } } });
  assert.strictEqual(await storage.setSync({ a: 1 }), true);
  setMockChrome({ runtime: { id: 'x' }, storage: { sync: { set: async () => { throw new Error('denied'); } } } });
  assert.strictEqual(await storage.setSync({ a: 1 }), false);
  setMockChrome(undefined);
  assert.strictEqual(await storage.setLocal({ a: 1 }), false);
});

test('ensureSchema stamps the version once and is idempotent', async () => {
  const store = {};
  setMockChrome({
    runtime: { id: 'x' },
    storage: {
      sync: {
        get: async () => ({ ...store }),
        set: async (obj) => { Object.assign(store, obj); },
      },
    },
  });
  assert.deepStrictEqual(await storage.ensureSchema(), { migrated: true, from: 0 });
  assert.strictEqual(store.schemaVersion, storage.SCHEMA_VERSION);
  assert.deepStrictEqual(await storage.ensureSchema(), { migrated: false, from: storage.SCHEMA_VERSION });
});

test('ensureSchema never throws without chrome', async () => {
  setMockChrome(undefined);
  const res = await storage.ensureSchema();
  assert.strictEqual(res.migrated, false);
});
