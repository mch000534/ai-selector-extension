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
const chatLibPath = path.join(libDir, 'chat.js');
if (fs.existsSync(chatLibPath)) {
  vm.runInThisContext(fs.readFileSync(chatLibPath, 'utf8'));
}

const { escapeHtml, normalizeBaseUrl } = window.__aiext.utils;
const { renderMarkdown } = window.__aiext.markdown;
const chat = window.__aiext.chat || {};

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

// KNOWN LIMITATION (roadmap §3.8): normalizeBaseUrl does not validate scheme
// or provider path style. These tests lock the current behavior so a future
// fix must consciously update them.
test('normalizeBaseUrl currently appends /v1 to Azure-style paths', () => {
  assert.strictEqual(
    normalizeBaseUrl('https://myres.openai.azure.com/openai/deployments/gpt4'),
    'https://myres.openai.azure.com/openai/deployments/gpt4/v1'
  );
});

test('normalizeBaseUrl currently accepts non-http schemes and garbage', () => {
  assert.strictEqual(normalizeBaseUrl('javascript:alert(1)'), 'javascript:alert(1)/v1');
  assert.strictEqual(normalizeBaseUrl('not a url'), 'not a url/v1');
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

// ─── isSafeFetchUrl (loaded from the real lib/net.js, shared with background.js) ───
vm.runInThisContext(fs.readFileSync(path.join(libDir, 'net.js'), 'utf8'));
const { isSafeFetchUrl } = window.__aiext.net;

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

test('isSafeFetchUrl rejects IPv4-mapped IPv6 and NAT64/site-local variants', () => {
  assert.strictEqual(isSafeFetchUrl('http://[::ffff:127.0.0.1]/'), false);
  assert.strictEqual(isSafeFetchUrl('http://[::ffff:7f00:1]/'), false);
  assert.strictEqual(isSafeFetchUrl('http://[64:ff9b::7f00:1]/'), false);
  assert.strictEqual(isSafeFetchUrl('http://[fec0::1]/'), false);
});

test('isSafeFetchUrl rejects CGNAT, benchmark and multicast ranges', () => {
  assert.strictEqual(isSafeFetchUrl('http://100.64.0.1/'), false);
  assert.strictEqual(isSafeFetchUrl('http://100.127.255.255/'), false);
  assert.strictEqual(isSafeFetchUrl('http://198.18.0.1/'), false);
  assert.strictEqual(isSafeFetchUrl('http://198.19.255.255/'), false);
  assert.strictEqual(isSafeFetchUrl('http://224.0.0.1/'), false);
  assert.strictEqual(isSafeFetchUrl('http://255.255.255.255/'), false);
});

test('background.js fetchImageAsDataUrl uses manual redirect handling', () => {
  const bg = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
  const net = fs.readFileSync(path.join(libDir, 'net.js'), 'utf8');
  assert.ok(bg.includes("redirect: 'manual'"), 'fetch must use redirect: manual');
  assert.ok(net.includes('MAX_FETCH_REDIRECTS'), 'redirect hop limit must exist');
  assert.ok(net.includes('MAX_FETCH_IMAGE_BYTES'), 'response size cap must exist');
});

test('content.js dialog template escapes config.model', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
  assert.ok(
    src.includes('escapeHtml(config.model'),
    'config.model must be escaped before innerHTML interpolation'
  );
  assert.ok(
    !src.includes('value="${config.model'),
    'unescaped config.model interpolation must not remain'
  );
});

// ─── chat helpers ───
test('buildChatMessages includes selection context and conversation history', () => {
  assert.strictEqual(typeof chat.buildChatMessages, 'function');
  const messages = chat.buildChatMessages({
    context: { text: 'Selected passage', images: [] },
    pendingImages: [],
    conversationHistory: [{ role: 'user', content: 'Summarize it' }],
    uiLang: 'en-US',
  });

  assert.strictEqual(messages.length, 2);
  assert.strictEqual(messages[0].role, 'system');
  assert.ok(messages[0].content.includes('Selected passage'));
  assert.ok(messages[0].content.includes('Please respond in en-US'));
  assert.deepStrictEqual(messages[1], { role: 'user', content: 'Summarize it' });
});

test('buildChatMessages includes image context before conversation history', () => {
  assert.strictEqual(typeof chat.buildChatMessages, 'function');
  const messages = chat.buildChatMessages({
    context: { text: '', images: ['data:image/png;base64,aaa'] },
    pendingImages: ['data:image/png;base64,bbb'],
    conversationHistory: [{ role: 'user', content: 'What is shown?' }],
    uiLang: 'zh-TW',
  });

  assert.strictEqual(messages.length, 4);
  assert.strictEqual(messages[1].role, 'user');
  assert.strictEqual(messages[1].content[0].type, 'text');
  assert.strictEqual(messages[1].content[1].image_url.url, 'data:image/png;base64,aaa');
  assert.strictEqual(messages[1].content[2].image_url.url, 'data:image/png;base64,bbb');
  assert.strictEqual(messages[2].role, 'assistant');
  assert.deepStrictEqual(messages[3], { role: 'user', content: 'What is shown?' });
});

test('stripImagesFromMessages removes image parts while preserving text', () => {
  assert.strictEqual(typeof chat.stripImagesFromMessages, 'function');
  const stripped = chat.stripImagesFromMessages([
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Describe this' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,aaa' } },
      ],
    },
  ]);

  assert.deepStrictEqual(stripped, [{ role: 'user', content: 'Describe this' }]);
});

test('parseModelIds reads and sorts OpenAI-compatible model responses', () => {
  assert.strictEqual(typeof chat.parseModelIds, 'function');
  assert.deepStrictEqual(
    chat.parseModelIds({
      data: [{ id: 'z-model' }, { id: 'a-model' }],
      models: [{ name: 'ignored-when-data-exists' }],
    }),
    ['a-model', 'z-model']
  );
  assert.deepStrictEqual(
    chat.parseModelIds({ models: [{ name: 'beta' }, { id: 'alpha' }] }),
    ['alpha', 'beta']
  );
});

test('normalizeQuickPrompts keeps non-empty prompt strings', () => {
  assert.strictEqual(typeof chat.normalizeQuickPrompts, 'function');
  assert.deepStrictEqual(
    chat.normalizeQuickPrompts([' Translate ', '', null, 'Summarize', 42]),
    ['Translate', 'Summarize']
  );
});

test('buildClosedListItem normalizes a closed record', () => {
  assert.strictEqual(typeof chat.buildClosedListItem, 'function');
  assert.deepStrictEqual(
    chat.buildClosedListItem({
      id: 'd1', hostname: 'ex.com', url: 'https://ex.com/p', closedAt: 1700000000000,
      conversationHistory: [{ role: 'user', content: 'hello' }],
      model: 'gpt-4o',
    }),
    {
      id: 'd1', hostname: 'ex.com', url: 'https://ex.com/p', closedAt: 1700000000000,
      messageCount: 1, preview: 'hello', model: 'gpt-4o',
    }
  );
});

test('buildClosedListItem joins array content and rejects open records', () => {
  assert.deepStrictEqual(
    chat.buildClosedListItem({
      id: 'd2', hostname: '', closedAt: 1700000000000,
      conversationHistory: [{ role: 'user', content: [{ type: 'text', text: 'a' }, { type: 'image_url', image_url: {} }] }],
    }),
    {
      id: 'd2', hostname: '', url: '', closedAt: 1700000000000,
      messageCount: 1, preview: 'a', model: '',
    }
  );
  assert.strictEqual(chat.buildClosedListItem({ id: 'd3' }), null);
  assert.strictEqual(chat.buildClosedListItem(null), null);
});

test('createOpenDrawerMessage builds the content-script drawer command', () => {
  assert.strictEqual(typeof chat.createOpenDrawerMessage, 'function');
  assert.deepStrictEqual(
    chat.createOpenDrawerMessage({ srcUrl: 'https://example.com/image.png', initialText: 'Explain this' }),
    {
      action: 'openDrawer',
      srcUrl: 'https://example.com/image.png',
      initialText: 'Explain this',
    }
  );
  assert.deepStrictEqual(chat.createOpenDrawerMessage({}), { action: 'openDrawer' });
});

test('clampDrawerWidth keeps drawer width within viewport bounds', () => {
  assert.strictEqual(typeof chat.clampDrawerWidth, 'function');
  assert.strictEqual(chat.clampDrawerWidth(240, 1000), 300);
  assert.strictEqual(chat.clampDrawerWidth(500, 1000), 500);
  assert.strictEqual(chat.clampDrawerWidth(980, 1000), 920);
  assert.strictEqual(chat.clampDrawerWidth(360, 320), 294);
});

test('createDrawerWidthStyle returns an important width declaration', () => {
  assert.strictEqual(typeof chat.createDrawerWidthStyle, 'function');
  assert.deepStrictEqual(chat.createDrawerWidthStyle(980, 1000), {
    property: 'width',
    value: '920px',
    priority: 'important',
  });
});
