const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeDocument() {
  const elements = [];
  const doc = {
    body: null,
    createElement(tag) {
      const el = {
        tag,
        style: {},
        attrs: {},
        children: [],
        removed: false,
        isConnected: false,
        setAttribute(k, v) { this.attrs[k] = v; },
        getAttribute(k) { return this.attrs[k]; },
        appendChild(c) { this.children.push(c); return c; },
        remove() { this.removed = true; this.isConnected = false; },
        attachShadow() {
          const root = { children: [], appendChild(c) { this.children.push(c); return c; } };
          el.shadowRoot = root;
          return root;
        },
      };
      elements.push(el);
      return el;
    },
  };
  doc.body = doc.createElement('body');
  doc.body.isConnected = true;
  doc.body.appendChild = function (c) { this.children.push(c); c.isConnected = true; return c; };
  return doc;
}

function loadShadow(doc) {
  const sandbox = { window: {}, document: doc };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'lib', 'shadow.js'), 'utf8'), sandbox);
  return sandbox.__aiext.shadow;
}

test('ensure builds a host on first use', () => {
  const shadow = loadShadow(makeDocument());
  const root = shadow.ensure();
  assert.ok(root);
  assert.ok(shadow.host);
  assert.strictEqual(shadow.connected(), true);
});

test('ensure heals after the host is detached (SPA body replacement)', () => {
  const doc = makeDocument();
  const shadow = loadShadow(doc);
  shadow.ensure();
  const oldHost = shadow.host;
  oldHost.isConnected = false;
  doc.body = null;
  doc.body = { children: [], appendChild(c) { this.children.push(c); c.isConnected = true; return c; } };
  const root = shadow.ensure();
  assert.ok(root);
  assert.notStrictEqual(shadow.host, oldHost);
  assert.strictEqual(shadow.connected(), true);
});

test('destroy detaches and forces rebuild on next use', () => {
  const shadow = loadShadow(makeDocument());
  shadow.ensure();
  const oldHost = shadow.host;
  shadow.destroy();
  assert.strictEqual(shadow.host, null);
  assert.strictEqual(shadow.connected(), false);
  const root = shadow.ensure();
  assert.ok(root);
  assert.notStrictEqual(shadow.host, oldHost);
  assert.strictEqual(oldHost.removed, true);
});

test('ensure returns null without a body', () => {
  const doc = makeDocument();
  doc.body = null;
  const shadow = loadShadow(doc);
  assert.strictEqual(shadow.ensure(), null);
});
