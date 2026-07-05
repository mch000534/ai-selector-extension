const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

global.window = global;
global.chrome = { i18n: { getUILanguage: () => 'en', getMessage: (k) => k } };

const libDir = path.join(__dirname, '..', 'lib');
vm.runInThisContext(fs.readFileSync(path.join(libDir, 'utils.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(libDir, 'markdown.js'), 'utf8'));

const { escapeHtml, normalizeBaseUrl } = window.__aiext.utils;
const { renderMarkdown } = window.__aiext.markdown;

// ─── escapeHtml ───
test('escapeHtml escapes < > & " \'', () => {
  assert.strictEqual(escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  assert.strictEqual(escapeHtml("it's & that"), 'it&#39;s &amp; that');
});

test('escapeHtml returns empty string for non-string input', () => {
  assert.strictEqual(escapeHtml(null), '');
  assert.strictEqual(escapeHtml(undefined), '');
  assert.strictEqual(escapeHtml(42), '');
});

test('escapeHtml leaves safe text unchanged', () => {
  assert.strictEqual(escapeHtml('hello world'), 'hello world');
});

// ─── normalizeBaseUrl ───
test('normalizeBaseUrl appends /v1 when missing', () => {
  assert.strictEqual(normalizeBaseUrl('https://api.openai.com'), 'https://api.openai.com/v1');
});

test('normalizeBaseUrl preserves existing version path', () => {
  assert.strictEqual(normalizeBaseUrl('https://api.openai.com/v1'), 'https://api.openai.com/v1');
  assert.strictEqual(normalizeBaseUrl('https://api.openai.com/v2'), 'https://api.openai.com/v2');
});

test('normalizeBaseUrl strips trailing slashes', () => {
  assert.strictEqual(normalizeBaseUrl('https://api.openai.com/'), 'https://api.openai.com/v1');
  assert.strictEqual(normalizeBaseUrl('https://api.openai.com/v1/'), 'https://api.openai.com/v1');
});

test('normalizeBaseUrl trims whitespace', () => {
  assert.strictEqual(normalizeBaseUrl('  https://api.openai.com  '), 'https://api.openai.com/v1');
});

// ─── renderMarkdown ───
test('renderMarkdown returns empty for empty input', () => {
  assert.strictEqual(renderMarkdown(''), '');
});

test('renderMarkdown escapes HTML to prevent XSS', () => {
  assert.strictEqual(renderMarkdown('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('renderMarkdown protects code blocks from inline formatting', () => {
  const result = renderMarkdown('```js\nlet x = **not bold**\n```');
  assert.ok(result.includes('<pre><code>let x = **not bold**\n</code></pre>'));
  assert.ok(!result.includes('<strong>'));
});

test('renderMarkdown protects inline code from formatting', () => {
  const result = renderMarkdown('Use `a * b` here');
  assert.ok(result.includes('<code>a * b</code>'));
  assert.ok(!result.includes('<em>'));
});

test('renderMarkdown renders bold outside code', () => {
  assert.strictEqual(renderMarkdown('this is **bold** text'), 'this is <strong>bold</strong> text');
});

test('renderMarkdown renders italic with boundary check', () => {
  assert.strictEqual(renderMarkdown('this is *italic* text'), 'this is <em>italic</em> text');
});

test('renderMarkdown renders headings', () => {
  assert.strictEqual(renderMarkdown('# Title'), '<h3>Title</h3>');
  assert.strictEqual(renderMarkdown('## Section'), '<h4>Section</h4>');
  assert.strictEqual(renderMarkdown('### Sub'), '<h5>Sub</h5>');
});

test('renderMarkdown renders links with allowed schemes only', () => {
  assert.strictEqual(
    renderMarkdown('[Google](https://google.com)'),
    '<a href="https://google.com" target="_blank" rel="noopener noreferrer">Google</a>'
  );
  assert.strictEqual(
    renderMarkdown('[mail](mailto:test@example.com)'),
    '<a href="mailto:test@example.com" target="_blank" rel="noopener noreferrer">mail</a>'
  );
});

test('renderMarkdown rejects javascript: links', () => {
  const result = renderMarkdown('[xss](javascript:alert(1))');
  assert.ok(!result.includes('<a '));
  assert.ok(result.includes('[xss](javascript:alert(1))'));
});

test('renderMarkdown renders blockquotes', () => {
  assert.strictEqual(renderMarkdown('> quoted'), '<blockquote>quoted</blockquote>');
});

// ─── isSafeFetchUrl (copied from background.js for testing) ───
function isSafeFetchUrl(urlStr) {
  let u;
  try { u = new URL(urlStr); } catch (e) { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') return false;
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]), b = Number(v4[2]);
    if (a === 0 || a === 127) return false;
    if (a === 10) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false;
  }
  if (host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return false;
  return true;
}

test('isSafeFetchUrl allows public HTTPS', () => {
  assert.strictEqual(isSafeFetchUrl('https://example.com/img.png'), true);
  assert.strictEqual(isSafeFetchUrl('http://8.8.8.8/dns'), true);
});

test('isSafeFetchUrl rejects localhost', () => {
  assert.strictEqual(isSafeFetchUrl('http://localhost/admin'), false);
  assert.strictEqual(isSafeFetchUrl('http://127.0.0.1/admin'), false);
  assert.strictEqual(isSafeFetchUrl('http://[::1]/'), false);
});

test('isSafeFetchUrl rejects private ranges', () => {
  assert.strictEqual(isSafeFetchUrl('http://10.0.0.1/'), false);
  assert.strictEqual(isSafeFetchUrl('http://192.168.1.1/'), false);
  assert.strictEqual(isSafeFetchUrl('http://172.16.0.1/'), false);
  assert.strictEqual(isSafeFetchUrl('http://172.31.0.1/'), false);
});

test('isSafeFetchUrl rejects cloud metadata', () => {
  assert.strictEqual(isSafeFetchUrl('http://169.254.169.254/latest/meta-data/'), false);
});

test('isSafeFetchUrl rejects non-http schemes', () => {
  assert.strictEqual(isSafeFetchUrl('file:///etc/passwd'), false);
  assert.strictEqual(isSafeFetchUrl('javascript:alert(1)'), false);
  assert.strictEqual(isSafeFetchUrl('data:text/html,<script>'), false);
});
