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

const { escapeHtml, normalizeBaseUrl } = window.__aiext.utils;const { renderMarkdown } = window.__aiext.markdown;
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

// Non-URL input and non-http(s) schemes pass through untouched (no /v1).
test('normalizeBaseUrl currently appends /v1 to Azure-style paths', () => {
  assert.strictEqual(
    normalizeBaseUrl('https://myres.openai.azure.com/openai/deployments/gpt4'),
    'https://myres.openai.azure.com/openai/deployments/gpt4/v1'
  );
});

test('normalizeBaseUrl passes through non-http schemes and garbage', () => {
  assert.strictEqual(normalizeBaseUrl('javascript:alert(1)'), 'javascript:alert(1)');
  assert.strictEqual(normalizeBaseUrl('not a url'), 'not a url');
});

test('isTrustedImageSrc allows data: images and http(s) only', () => {
  const { isTrustedImageSrc } = window.__aiext.utils;
  assert.strictEqual(isTrustedImageSrc('data:image/png;base64,AAA'), true);
  assert.strictEqual(isTrustedImageSrc('https://example.com/i.png'), true);
  assert.strictEqual(isTrustedImageSrc('http://example.com/i.png'), true);
  assert.strictEqual(isTrustedImageSrc('/rel/path.png', 'https://example.com/'), true);
  assert.strictEqual(isTrustedImageSrc('blob:https://example.com/x'), false);
  assert.strictEqual(isTrustedImageSrc('javascript:alert(1)'), false);
  assert.strictEqual(isTrustedImageSrc('data:text/html,<script>'), false);
  assert.strictEqual(isTrustedImageSrc(''), false);
  assert.strictEqual(isTrustedImageSrc(null), false);
});

test('background binds screenshot capture and validates presets', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
  assert.ok(src.includes('sender.tab.windowId'), 'capture must bind to sender tab');
  assert.ok(src.includes('captureVisibleTab(winId'), 'must capture the sender window');
  assert.ok(src.includes('invalid preset'), 'saveProviderPreset must validate input');
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
      lastActive: 1700000001000,
      conversationHistory: [{ role: 'user', content: 'hello' }],
      model: 'gpt-4o',
    }),
    {
      id: 'd1', hostname: 'ex.com', url: 'https://ex.com/p', closedAt: 1700000000000,
      lastActive: 1700000001000, messageCount: 1, preview: 'hello', model: 'gpt-4o',
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
      lastActive: 0, messageCount: 1, preview: 'a', model: '',
    }
  );
  assert.strictEqual(chat.buildClosedListItem(null), null);
});

test('buildClosedListItem maps open records with closedAt 0', () => {
  const item = chat.buildClosedListItem({
    id: 'd3', hostname: 'ex.com', lastActive: 1700000002000,
    conversationHistory: [{ role: 'user', content: 'hi' }],
  });
  assert.strictEqual(item.closedAt, 0);
  assert.strictEqual(item.lastActive, 1700000002000);
});

test('deriveTitle prefers explicit title, then first user message', () => {
  assert.strictEqual(typeof chat.deriveTitle, 'function');
  assert.strictEqual(chat.deriveTitle({ title: '  My chat  ' }), 'My chat');
  assert.strictEqual(
    chat.deriveTitle({ conversationHistory: [{ role: 'assistant', content: 'x' }, { role: 'user', content: '  hello\nworld  ' }] }),
    'hello world'
  );
  assert.strictEqual(
    chat.deriveTitle({ conversationHistory: [{ role: 'user', content: [{ type: 'text', text: 'pic' }, { type: 'image_url', image_url: {} }] }] }),
    'pic'
  );
  assert.strictEqual(chat.deriveTitle({ conversationHistory: [] }), '');
  assert.strictEqual(chat.deriveTitle(null), '');
  assert.strictEqual(chat.deriveTitle({ conversationHistory: [{ role: 'user', content: 'abcdefgh' }] }, 4), 'abcd');
});

test('buildConversationMarkdown renders meta and turns', () => {
  assert.strictEqual(typeof chat.buildConversationMarkdown, 'function');
  const md = chat.buildConversationMarkdown({
    title: 'Demo', hostname: 'ex.com', url: 'https://ex.com/', model: 'm',
    createdAt: 1700000000000,
    conversationHistory: [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
      { role: 'user', content: [{ type: 'text', text: 'pic?' }, { type: 'image_url', image_url: {} }] },
    ],
  });
  assert.ok(md.startsWith('# Demo\n'));
  assert.ok(md.includes('- Host: ex.com'));
  assert.ok(md.includes('## User\n\nHi'));
  assert.ok(md.includes('## Assistant\n\nHello!'));
  assert.ok(md.includes('[image]'));
});

test('lastUserIndexBefore finds the nearest user message at or before index', () => {  assert.strictEqual(typeof chat.lastUserIndexBefore, 'function');
  const h = [
    { role: 'user', content: 'a' },
    { role: 'assistant', content: 'b' },
    { role: 'user', content: 'c' },
    { role: 'assistant', content: 'd' },
  ];
  assert.strictEqual(chat.lastUserIndexBefore(h, 3), 2);
  assert.strictEqual(chat.lastUserIndexBefore(h, 2), 2);
  assert.strictEqual(chat.lastUserIndexBefore(h, 1), 0);
  assert.strictEqual(chat.lastUserIndexBefore(h, 0), 0);
  assert.strictEqual(chat.lastUserIndexBefore([{ role: 'assistant', content: 'x' }], 0), -1);
  assert.strictEqual(chat.lastUserIndexBefore([], 0), -1);
  assert.strictEqual(chat.lastUserIndexBefore(null, 0), -1);
  assert.strictEqual(chat.lastUserIndexBefore(h, 99), 2);
});

test('estimateTextTokens uses ~4 chars per token', () => {
  assert.strictEqual(chat.estimateTextTokens(''), 0);
  assert.strictEqual(chat.estimateTextTokens('abcd'), 1);
  assert.strictEqual(chat.estimateTextTokens('abcde'), 2);
  assert.strictEqual(chat.estimateTextTokens(null), 0);
});

test('estimateMessagesTokens sums text and image parts', () => {
  assert.strictEqual(chat.estimateMessagesTokens(null), 0);
  assert.strictEqual(
    chat.estimateMessagesTokens([
      { role: 'user', content: 'abcd' },
      { role: 'user', content: [{ type: 'text', text: 'abcdefgh' }, { type: 'image_url', image_url: {} }] },
      { role: 'assistant', content: '' },
    ]),
    1 + 2 + 1000 + 0
  );
});

test('formatTokenCount abbreviates thousands and millions', () => {
  assert.strictEqual(chat.formatTokenCount(0), '0');
  assert.strictEqual(chat.formatTokenCount(999), '999');
  assert.strictEqual(chat.formatTokenCount(1500), '1.5k');
  assert.strictEqual(chat.formatTokenCount(128000), '128.0k');
  assert.strictEqual(chat.formatTokenCount(2500000), '2.5M');
});

test('contextWindowForModel matches known families', () => {
  assert.strictEqual(chat.contextWindowForModel('gpt-4o'), 128000);
  assert.strictEqual(chat.contextWindowForModel('gpt-3.5-turbo'), 16385);
  assert.strictEqual(chat.contextWindowForModel('claude-sonnet-4-20250514'), 200000);
  assert.strictEqual(chat.contextWindowForModel('gemini-2.0-flash'), 1000000);
  assert.strictEqual(chat.contextWindowForModel('llama-3.3-70b-versatile'), 128000);
  assert.strictEqual(chat.contextWindowForModel('mistral-medium-latest'), 128000);
  assert.strictEqual(chat.contextWindowForModel('some-future-model'), 128000);
  assert.strictEqual(chat.contextWindowForModel(''), 128000);
});

test('manifest declares keyboard shortcuts', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  assert.ok(manifest.commands, 'commands section must exist');
  assert.ok(manifest.commands['_execute_action'], '_execute_action must be declared');
  assert.ok(manifest.commands['open-drawer'], 'open-drawer must be declared');
  assert.ok(manifest.commands['open-drawer'].suggested_key, 'open-drawer needs a suggested key');
});

test('background handles the open-drawer command', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
  assert.ok(src.includes('chrome.commands.onCommand'), 'must listen for commands');
  assert.ok(src.includes("command !== 'open-drawer'"), 'must route open-drawer');
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
