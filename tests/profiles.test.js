const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

global.window = global;

const libDir = path.join(__dirname, '..', 'lib');
vm.runInThisContext(fs.readFileSync(path.join(libDir, 'profiles.js'), 'utf8'));

const profiles = window.__aiext.profiles;

test('deriveName extracts hostname safely', () => {
  assert.strictEqual(profiles.deriveName('https://api.openai.com/v1'), 'api.openai.com');
  assert.strictEqual(profiles.deriveName('not a url'), 'custom');
  assert.strictEqual(profiles.deriveName(''), 'custom');
  assert.strictEqual(profiles.deriveName(null), 'custom');
});

test('normalizeProfiles drops invalid entries and fills ids', () => {
  const out = profiles.normalizeProfiles([
    { baseUrl: ' https://a.test/v1 ', apiKey: 'k1', model: ' m1 ' },
    { name: 'No URL' },
    null,
    'junk',
  ]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].baseUrl, 'https://a.test/v1');
  assert.strictEqual(out[0].apiKey, 'k1');
  assert.strictEqual(out[0].model, 'm1');
  assert.strictEqual(out[0].name, 'a.test');
  assert.ok(typeof out[0].id === 'string' && out[0].id.length > 0);
  assert.deepStrictEqual(profiles.normalizeProfiles(null), []);
});

test('upsertProfile creates then updates by baseUrl', () => {
  const first = profiles.upsertProfile([], { baseUrl: 'https://a.test/v1', apiKey: 'k1', model: 'm1' });
  assert.strictEqual(first.profiles.length, 1);
  const id = first.id;
  assert.ok(id);
  const second = profiles.upsertProfile(first.profiles, { baseUrl: 'https://a.test/v1', apiKey: 'k2', model: 'm2' });
  assert.strictEqual(second.profiles.length, 1);
  assert.strictEqual(second.id, id);
  assert.strictEqual(second.profiles[0].apiKey, 'k2');
  assert.strictEqual(second.profiles[0].model, 'm2');
  const third = profiles.upsertProfile(second.profiles, { baseUrl: 'https://b.test/v1', apiKey: 'k3', model: 'm3' });
  assert.strictEqual(third.profiles.length, 2);
  assert.notStrictEqual(third.id, id);
});

test('upsertProfile rejects empty baseUrl', () => {
  assert.deepStrictEqual(profiles.upsertProfile([], { baseUrl: '  ', apiKey: 'k', model: 'm' }), { profiles: [], id: null });
});

test('findProfile and deleteProfile', () => {
  const { profiles: list, id } = profiles.upsertProfile([], { baseUrl: 'https://a.test/v1', apiKey: 'k', model: 'm' });
  assert.strictEqual(profiles.findProfile(list, id).baseUrl, 'https://a.test/v1');
  assert.strictEqual(profiles.findProfile(list, 'nope'), null);
  assert.deepStrictEqual(profiles.deleteProfile(list, id), []);
  assert.strictEqual(profiles.deleteProfile(list, 'nope').length, 1);
});
