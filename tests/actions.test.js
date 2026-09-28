const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

global.window = global;

const libDir = path.join(__dirname, '..', 'lib');
vm.runInThisContext(fs.readFileSync(path.join(libDir, 'actions.js'), 'utf8'));

const actions = window.__aiext.actions;

test('DEFINITIONS lists six actions with label keys', () => {
  assert.strictEqual(actions.DEFINITIONS.length, 6);
  const ids = actions.DEFINITIONS.map(d => d.id);
  assert.deepStrictEqual(ids, ['translate', 'convertChinese', 'explain', 'summarize', 'polish', 'tutorial']);
  for (const d of actions.DEFINITIONS) {
    assert.ok(typeof d.labelKey === 'string' && d.labelKey.length > 0);
  }
});

test('every action builds a prompt containing the selection', () => {
  for (const { id } of actions.DEFINITIONS) {
    const prompt = actions.buildActionPrompt(id, { selection: 'hello world', uiLang: 'en' });
    assert.ok(typeof prompt === 'string' && prompt.includes('hello world'), id);
  }
});

test('translate and tutorial honor uiLang', () => {
  assert.ok(actions.buildActionPrompt('translate', { selection: 'x', uiLang: 'zh-TW' }).includes('zh-TW'));
  assert.ok(actions.buildActionPrompt('tutorial', { selection: 'x', uiLang: 'ja' }).includes('ja'));
});

test('convertChinese targets the other variant', () => {
  assert.ok(actions.buildActionPrompt('convertChinese', { selection: 'x', uiLang: 'zh-TW' }).includes('Simplified Chinese'));
  assert.ok(actions.buildActionPrompt('convertChinese', { selection: 'x', uiLang: 'zh-CN' }).includes('Traditional Chinese'));
  assert.ok(actions.buildActionPrompt('convertChinese', { selection: 'x', uiLang: 'en' }).includes('Traditional Chinese'));
});

test('selection is trimmed and capped, empty/unknown yields null', () => {
  assert.strictEqual(actions.buildActionPrompt('nope', { selection: 'x', uiLang: 'en' }), null);
  assert.strictEqual(actions.buildActionPrompt('translate', { selection: '   ', uiLang: 'en' }), null);
  assert.strictEqual(actions.buildActionPrompt('translate', {}, ), null);
  const long = 'a'.repeat(5000);
  const prompt = actions.buildActionPrompt('summarize', { selection: long, uiLang: 'en' });
  assert.ok(!prompt.includes(long));
  assert.ok(prompt.includes('a'.repeat(2000)));
  assert.ok(!prompt.includes('a'.repeat(2001)));
});

test('normalizeEnabledIds falls back to all on garbage, keeps explicit empty', () => {
  assert.deepStrictEqual(actions.normalizeEnabledIds(['translate', 'bogus']), ['translate']);
  assert.deepStrictEqual(actions.normalizeEnabledIds([]), []);
  assert.deepStrictEqual(actions.normalizeEnabledIds(null), actions.defaultEnabledIds());
  assert.deepStrictEqual(actions.normalizeEnabledIds('translate'), actions.defaultEnabledIds());
});
