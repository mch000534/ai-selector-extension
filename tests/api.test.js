const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

global.window = global;

const libDir = path.join(__dirname, '..', 'lib');
vm.runInThisContext(fs.readFileSync(path.join(libDir, 'utils.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(libDir, 'chat.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(libDir, 'api.js'), 'utf8'));

const api = window.__aiext.api;

// ─── retry helpers ───
test('retryDelayMs backs off exponentially capped at 8s', () => {
  assert.strictEqual(api.retryDelayMs(1), 1000);
  assert.strictEqual(api.retryDelayMs(2), 2000);
  assert.strictEqual(api.retryDelayMs(3), 4000);
  assert.strictEqual(api.retryDelayMs(4), 8000);
  assert.strictEqual(api.retryDelayMs(10), 8000);
});

test('isRetryableStatus matches 429 and 500-504 only', () => {
  assert.strictEqual(api.isRetryableStatus(429), true);
  assert.strictEqual(api.isRetryableStatus(500), true);
  assert.strictEqual(api.isRetryableStatus(504), true);
  assert.strictEqual(api.isRetryableStatus(400), false);
  assert.strictEqual(api.isRetryableStatus(403), false);
  assert.strictEqual(api.isRetryableStatus(404), false);
  assert.strictEqual(api.isRetryableStatus(505), false);
  assert.strictEqual(api.isRetryableStatus(200), false);
});

test('sleep resolves false normally and true when aborted', async () => {
  assert.strictEqual(await api.sleep(10), false);
  const c = new AbortController();
  c.abort();
  assert.strictEqual(await api.sleep(5000, c.signal), true);
});

test('sleep wakes early on abort', async () => {
  const c = new AbortController();
  setTimeout(() => c.abort(), 20);
  const start = Date.now();
  assert.strictEqual(await api.sleep(5000, c.signal), true);
  assert.ok(Date.now() - start < 2000, 'sleep must not wait the full delay');
});

// ─── SSE parser ───
test('createSseParser reassembles events split across chunks', () => {
  const deltas = [];
  const p = api.createSseParser(d => deltas.push(d));
  p.push('data: {"choices":[{"delta":{"content":"Hel');
  p.push('lo"}}]}\n\ndata: {"choices":[{"delta":{"content":" world"}}]}\n\n');
  assert.deepStrictEqual(deltas, ['Hello', ' world']);
  assert.strictEqual(p.done, false);
});

test('createSseParser ignores comments, non-data lines and malformed JSON', () => {
  const deltas = [];
  const p = api.createSseParser(d => deltas.push(d));
  p.push(': keep-alive\n\nevent: message\ndata: not-json\n\ndata: [DONE]\n\n');
  assert.deepStrictEqual(deltas, []);
  assert.strictEqual(p.done, true);
});

test('createSseParser stops after [DONE] and finish() flushes trailing line', () => {
  const deltas = [];
  const p = api.createSseParser(d => deltas.push(d));
  p.push('data: {"choices":[{"delta":{"content":"a"}}]}\n\ndata: [DONE]\n\n');
  p.push('data: {"choices":[{"delta":{"content":"b"}}]}\n\n');
  assert.deepStrictEqual(deltas, ['a']);
  const q = api.createSseParser(d => deltas.push(d));
  q.push('data: {"choices":[{"delta":{"content":"tail"}}]}');
  assert.strictEqual(q.finish(), false);
  assert.deepStrictEqual(deltas, ['a', 'tail']);
});

// ─── fetchModels ───
test('fetchModels returns sorted ids and [] when empty', async () => {
  const ok = async () => ({ ok: true, json: async () => ({ data: [{ id: 'z' }, { id: 'a' }] }) });
  assert.deepStrictEqual(await api.fetchModels({ baseUrl: 'https://x.test', apiKey: 'k', fetchFn: ok }), ['a', 'z']);
  const empty = async () => ({ ok: true, json: async () => ({ data: [] }) });
  assert.deepStrictEqual(await api.fetchModels({ baseUrl: 'https://x.test', apiKey: 'k', fetchFn: empty }), []);
});

test('fetchModels throws on HTTP error and propagates transport errors', async () => {
  const bad = async () => ({ ok: false, status: 401 });
  await assert.rejects(() => api.fetchModels({ baseUrl: 'https://x.test', apiKey: 'k', fetchFn: bad }), /HTTP 401/);
  const down = async () => { throw new Error('socket hang up'); };
  await assert.rejects(() => api.fetchModels({ baseUrl: 'https://x.test', apiKey: 'k', fetchFn: down }), /socket hang up/);
});

// ─── chatCompletion ───
function sseBody(chunks) {
  const enc = new TextEncoder();
  const queue = chunks.map(c => enc.encode(c));
  return {
    getReader() {
      let i = 0;
      return {
        async read() {
          if (i >= queue.length) return { done: true, value: undefined };
          return { done: false, value: queue[i++] };
        },
        async cancel() {},
        releaseLock() {},
      };
    },
  };
}

function sseOk(chunks) {
  return { ok: true, status: 200, body: sseBody(chunks) };
}

function statusRes(status, text) {
  return { ok: false, status, text: async () => text || '', body: null };
}

const IMG_MSG = [{ role: 'user', content: [{ type: 'text', text: 'hi' }, { type: 'image_url', image_url: { url: 'data:x' } }] }];
const TXT_MSG = [{ role: 'user', content: 'hi' }];
const hasImages = (msgs) => window.__aiext.chat.messagesHaveImages(msgs);
const stripImages = (msgs) => window.__aiext.chat.stripImagesFromMessages(msgs);

test('chatCompletion streams deltas and emits start/delta/end', async () => {
  const events = [];
  const fetchFn = async () => sseOk(['data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n', 'data: [DONE]\n\n']);
  const res = await api.chatCompletion({
    baseUrl: 'https://x.test', apiKey: 'k', model: 'm',
    messages: TXT_MSG, fetchFn, hasImages, stripImages, onEvent: e => events.push(e),
  });
  assert.deepStrictEqual(res, { ok: true, content: 'Hi' });
  assert.strictEqual(events[0].type, 'start');
  assert.strictEqual(events[events.length - 1].type, 'end');
  assert.ok(events.some(e => e.type === 'delta' && e.delta === 'Hi'));
});

test('chatCompletion retries 429 then succeeds', async () => {
  const events = [];
  let calls = 0;
  const fetchFn = async () => (++calls === 1
    ? statusRes(429, 'slow down')
    : sseOk(['data: {"choices":[{"delta":{"content":"ok"}}]}\n\n', 'data: [DONE]\n\n']));
  const res = await api.chatCompletion({
    baseUrl: 'https://x.test', apiKey: 'k', model: 'm',
    messages: TXT_MSG, fetchFn, hasImages, stripImages, onEvent: e => events.push(e),
  });
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(events.filter(e => e.type === 'retry'), [{ type: 'retry', attempt: 1, kind: 'status' }]);
});

test('chatCompletion falls back to text-only once on 400 with images', async () => {
  const bodies = [];
  let calls = 0;
  const fetchFn = async (url, init) => {
    bodies.push(JSON.parse(init.body).messages);
    return ++calls === 1 ? statusRes(400, 'bad') : sseOk(['data: [DONE]\n\n']);
  };
  const events = [];
  const res = await api.chatCompletion({
    baseUrl: 'https://x.test', apiKey: 'k', model: 'm',
    messages: IMG_MSG, fetchFn, hasImages, stripImages, onEvent: e => events.push(e),
  });
  assert.strictEqual(res.ok, true);
  assert.ok(events.some(e => e.type === 'fallback'));
  assert.strictEqual(bodies.length, 2);
  assert.ok(window.__aiext.chat.messagesHaveImages(bodies[0]));
  assert.ok(!window.__aiext.chat.messagesHaveImages(bodies[1]));
});

test('chatCompletion returns api_error for non-retryable status', async () => {
  const res = await api.chatCompletion({
    baseUrl: 'https://x.test', apiKey: 'k', model: 'm',
    messages: TXT_MSG, fetchFn: async () => statusRes(403, 'denied'),
    hasImages, stripImages,
  });
  assert.deepStrictEqual(res, { ok: false, code: 'api_error', status: 403, detail: 'denied' });
});

test('chatCompletion exhausts network retries with code network', async () => {
  let calls = 0;
  const res = await api.chatCompletion({
    baseUrl: 'https://x.test', apiKey: 'k', model: 'm',
    messages: TXT_MSG,
    fetchFn: async () => { calls++; throw new Error('boom'); },
    hasImages, stripImages,
  });
  assert.strictEqual(calls, 3);
  assert.strictEqual(res.code, 'network');
});

test('chatCompletion returns rate_limited when 429 persists', async () => {
  const res = await api.chatCompletion({
    baseUrl: 'https://x.test', apiKey: 'k', model: 'm',
    messages: TXT_MSG, maxAttempts: 2,
    fetchFn: async () => statusRes(429, 'slow'),
    hasImages, stripImages,
  });
  assert.strictEqual(res.code, 'rate_limited');
  assert.strictEqual(res.status, 429);
});

test('chatCompletion honours pre-aborted signal without fetching', async () => {
  const c = new AbortController();
  c.abort();
  let calls = 0;
  const res = await api.chatCompletion({
    baseUrl: 'https://x.test', apiKey: 'k', model: 'm',
    messages: TXT_MSG, signal: c.signal,
    fetchFn: async () => { calls++; return sseOk([]); },
    hasImages, stripImages,
  });
  assert.deepStrictEqual(res, { ok: false, code: 'cancelled' });
  assert.strictEqual(calls, 0);
});

test('chatCompletion aborts the retry wait', async () => {
  const c = new AbortController();
  setTimeout(() => c.abort(), 20);
  const start = Date.now();
  const res = await api.chatCompletion({
    baseUrl: 'https://x.test', apiKey: 'k', model: 'm',
    messages: TXT_MSG, signal: c.signal,
    fetchFn: async () => { throw new Error('down'); },
    hasImages, stripImages,
  });
  assert.strictEqual(res.code, 'cancelled');
  assert.ok(Date.now() - start < 2000, 'cancel must not wait the backoff delay');
});

// ─── multi-format adapters ───
test('detectFormat routes by hostname, defaulting to openai', () => {
  assert.strictEqual(api.detectFormat('https://api.anthropic.com'), 'anthropic');
  assert.strictEqual(api.detectFormat('https://api.anthropic.com/v1'), 'anthropic');
  assert.strictEqual(api.detectFormat('https://generativelanguage.googleapis.com'), 'gemini');
  assert.strictEqual(api.detectFormat('https://api.openai.com'), 'openai');
  assert.strictEqual(api.detectFormat('https://api.groq.com/openai'), 'openai');
  assert.strictEqual(api.detectFormat('not a url'), 'openai');
  assert.strictEqual(api.detectFormat(''), 'openai');
});

test('anthropic adapter builds versioned headers and system-split body', () => {
  const a = api.adapters.anthropic;
  const headers = a.buildHeaders('sk-ant');
  assert.strictEqual(headers['x-api-key'], 'sk-ant');
  assert.strictEqual(headers['anthropic-version'], api.ANTHROPIC_VERSION);
  assert.ok(!('Authorization' in headers));
  const body = a.buildBody({
    model: 'claude-x',
    messages: [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'yo' },
    ],
  });
  assert.strictEqual(body.model, 'claude-x');
  assert.strictEqual(body.system, 'sys');
  assert.strictEqual(body.stream, true);
  assert.ok(typeof body.max_tokens === 'number');
  assert.deepStrictEqual(body.messages.map(m => m.role), ['user', 'assistant']);
  const fallback = a.buildBody({ model: '', messages: TXT_MSG });
  assert.strictEqual(fallback.model, api.DEFAULT_MODELS.anthropic);
});

test('anthropic adapter converts data-URL images, drops remote URLs', () => {
  const out = api.toAnthropicContent([
    { type: 'text', text: 'see' },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
    { type: 'image_url', image_url: { url: 'https://x.test/i.png' } },
  ]);
  assert.deepStrictEqual(out, [
    { type: 'text', text: 'see' },
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } },
  ]);
  assert.strictEqual(api.toAnthropicContent('plain'), 'plain');
});

test('gemini adapter builds contents with model roles and system instruction', () => {
  const a = api.adapters.gemini;
  const url = a.buildChatUrl('https://gen.test/v1', { model: 'gemini-x', apiKey: 'k' });
  assert.ok(url.includes(':streamGenerateContent') && url.includes('key=k'));
  const body = a.buildBody({
    model: 'gemini-x',
    messages: [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'yo' },
    ],
  });
  assert.deepStrictEqual(body.contents.map(c => c.role), ['user', 'model']);
  assert.deepStrictEqual(body.systemInstruction, { parts: [{ text: 'sys' }] });
  assert.deepStrictEqual(a.buildHeaders('k'), { 'Content-Type': 'application/json' });
});

test('delta parsers extract per-format events', () => {
  assert.strictEqual(api.parseOpenAIDelta({ choices: [{ delta: { content: 'a' } }] }), 'a');
  assert.strictEqual(api.parseOpenAIDelta({}), null);
  assert.strictEqual(
    api.parseAnthropicDelta({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'b' } }),
    'b'
  );
  assert.strictEqual(api.parseAnthropicDelta({ type: 'message_start' }), null);
  assert.strictEqual(
    api.parseGeminiDelta({ candidates: [{ content: { parts: [{ text: 'c' }, { text: 'd' }] } }] }),
    'cd'
  );
  assert.strictEqual(api.parseGeminiDelta({}), null);
  const deltas = [];
  const p = api.createSseParser(d => deltas.push(d), (obj) => api.parseAnthropicDelta(obj));
  p.push('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n\n');
  assert.deepStrictEqual(deltas, ['Hi']);
});

test('chatCompletion streams anthropic deltas end to end', async () => {
  const seen = {};
  const fetchFn = async (url, init) => {
    seen.url = url;
    seen.body = JSON.parse(init.body);
    seen.headers = init.headers;
    return sseOk([
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ]);
  };
  const res = await api.chatCompletion({
    baseUrl: 'https://api.anthropic.com', apiKey: 'sk', model: 'claude-x',
    messages: [{ role: 'system', content: 's' }, ...TXT_MSG],
    fetchFn, hasImages, stripImages,
  });
  assert.deepStrictEqual(res, { ok: true, content: 'Hello' });
  assert.ok(seen.url.endsWith('/messages'));
  assert.strictEqual(seen.headers['x-api-key'], 'sk');
  assert.strictEqual(seen.body.system, 's');
});

test('chatCompletion streams gemini candidates end to end', async () => {
  const seen = {};
  const fetchFn = async (url, init) => {
    seen.url = url;
    seen.body = JSON.parse(init.body);
    return sseOk(['data: {"candidates":[{"content":{"parts":[{"text":"G"}]}}]}\n\n']);
  };
  const res = await api.chatCompletion({
    baseUrl: 'https://generativelanguage.googleapis.com', apiKey: 'gk', model: 'gemini-x',
    messages: [{ role: 'system', content: 's' }, ...TXT_MSG],
    fetchFn, hasImages, stripImages,
  });
  assert.deepStrictEqual(res, { ok: true, content: 'G' });
  assert.ok(seen.url.includes(':streamGenerateContent') && seen.url.includes('key=gk'));
  assert.ok(!seen.url.includes('/chat/completions'));
});

test('fetchModels adapts auth and id shapes per format', async () => {
  const calls = [];
  const mkFetch = (payload) => async (url, init) => {
    calls.push({ url, headers: init.headers });
    return { ok: true, json: async () => payload };
  };
  const anthropic = await api.fetchModels({
    baseUrl: 'https://api.anthropic.com', apiKey: 'sk',
    fetchFn: mkFetch({ data: [{ id: 'claude-x' }] }),
  });
  assert.deepStrictEqual(anthropic, ['claude-x']);
  assert.strictEqual(calls[0].headers['x-api-key'], 'sk');

  const gemini = await api.fetchModels({
    baseUrl: 'https://generativelanguage.googleapis.com', apiKey: 'gk',
    fetchFn: mkFetch({ models: [{ name: 'models/gemini-b' }, { name: 'models/gemini-a' }] }),
  });
  assert.deepStrictEqual(gemini, ['gemini-a', 'gemini-b']);
  assert.ok(calls[1].url.includes('key=gk'));
});

test('customHeaders override adapter defaults', async () => {
  let headers;
  const fetchFn = async (url, init) => {
    headers = init.headers;
    return { ok: true, json: async () => ({ data: [] }) };
  };
  await api.fetchModels({ baseUrl: 'https://x.test', apiKey: 'k', fetchFn, customHeaders: { Authorization: 'Bearer custom' } });
  assert.strictEqual(headers.Authorization, 'Bearer custom');
});
