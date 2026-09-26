const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const localesDir = path.join(__dirname, '..', '_locales');
const langs = fs.readdirSync(localesDir).filter(name =>
  fs.statSync(path.join(localesDir, name)).isDirectory()
);

function loadMessages(lang) {
  const raw = fs.readFileSync(path.join(localesDir, lang, 'messages.json'), 'utf8');
  return JSON.parse(raw);
}

const en = loadMessages('en');
const enKeys = Object.keys(en).sort();

function substitutionTokens(message) {
  const tokens = new Set();
  const re = /\$(\d)/g;
  let m;
  while ((m = re.exec(message || '')) !== null) tokens.add(m[1]);
  return [...tokens].sort();
}

test('55 locales exist with en as default', () => {
  assert.ok(langs.includes('en'), 'en locale must exist');
  assert.strictEqual(langs.length, 55);
});

test('every locale has exactly the en key set', () => {
  for (const lang of langs) {
    if (lang === 'en') continue;
    const keys = Object.keys(loadMessages(lang)).sort();
    assert.deepStrictEqual(keys, enKeys, `${lang}: key set differs from en`);
  }
});

test('placeholder name sets match en', () => {
  const enPlaceholders = {};
  for (const [key, entry] of Object.entries(en)) {
    enPlaceholders[key] = Object.keys(entry.placeholders || {}).sort();
  }
  for (const lang of langs) {
    if (lang === 'en') continue;
    const messages = loadMessages(lang);
    for (const key of enKeys) {
      const actual = Object.keys((messages[key] && messages[key].placeholders) || {}).sort();
      assert.deepStrictEqual(actual, enPlaceholders[key], `${lang}.${key}: placeholders differ from en`);
    }
  }
});

test('$N substitution tokens in messages match en', () => {
  const enTokens = {};
  for (const [key, entry] of Object.entries(en)) {
    enTokens[key] = substitutionTokens(entry.message);
  }
  for (const lang of langs) {
    if (lang === 'en') continue;
    const messages = loadMessages(lang);
    for (const key of enKeys) {
      const actual = substitutionTokens(messages[key] && messages[key].message);
      assert.deepStrictEqual(actual, enTokens[key], `${lang}.${key}: $N tokens differ from en`);
    }
  }
});

test('no locale has empty message strings', () => {
  for (const lang of langs) {
    const messages = loadMessages(lang);
    for (const key of Object.keys(messages)) {
      const text = messages[key] && messages[key].message;
      assert.ok(typeof text === 'string' && text.trim().length > 0, `${lang}.${key}: empty message`);
    }
  }
});
