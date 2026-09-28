const __aiextApiRoot = typeof window !== 'undefined' ? window : globalThis;
__aiextApiRoot.__aiext = __aiextApiRoot.__aiext || {};

const Api = __aiextApiRoot.__aiext.api = {
  MAX_ATTEMPTS: 3,

  retryDelayMs(attempt) {
    return Math.min(1000 * Math.pow(2, attempt - 1), 8000);
  },

  isRetryableStatus(status) {
    return status === 429 || (status >= 500 && status <= 504);
  },

  // Abort-aware sleep. Resolves true when the wait was cut short by abort,
  // so UI cancel takes effect immediately instead of lingering up to 8s.
  sleep(ms, signal) {
    return new Promise((resolve) => {
      if (signal && signal.aborted) return resolve(true);
      function onAbort() {
        clearTimeout(timer);
        resolve(true);
      }
      const timer = setTimeout(() => {
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve(!!(signal && signal.aborted));
      }, ms);
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
    });
  },

  // Incremental SSE parser. Pure and DOM-free so it can be unit tested.
  // Handles events split across chunks and a trailing line without its
  // terminating newline. parseFn maps a parsed data-line object to a delta
  // string (defaults to OpenAI); adapters supply their own.
  createSseParser(onDelta, parseFn, isDoneFn) {
    const parse = typeof parseFn === 'function' ? parseFn : Api.parseOpenAIDelta;
    const isDone = typeof isDoneFn === 'function' ? isDoneFn : (() => false);
    let lineBuffer = '';
    let done = false;
    function handleLine(trimmed) {
      if (!trimmed.startsWith('data: ')) return;
      const data = trimmed.slice(6);
      if (data === '[DONE]') { done = true; return; }
      try {
        const obj = JSON.parse(data);
        if (isDone(obj)) { done = true; return; }
        const delta = parse(obj);
        if (delta) onDelta(delta);
      } catch (e) { /* ignore malformed data lines */ }
    }
    return {
      push(chunkText) {
        if (done) return;
        lineBuffer += chunkText;
        let nlIdx;
        while ((nlIdx = lineBuffer.indexOf('\n')) !== -1) {
          const line = lineBuffer.slice(0, nlIdx);
          lineBuffer = lineBuffer.slice(nlIdx + 1);
          handleLine(line.trim());
          if (done) break;
        }
      },
      finish() {
        if (!done && lineBuffer.trim()) handleLine(lineBuffer.trim());
        return done;
      },
      get done() { return done; },
    };
  },

  // ─── Multi-format adapters ───
  // OpenAI-compatible is the default. Anthropic and Gemini are detected by
  // endpoint hostname; each adapter absorbs URL, header, body and SSE-event
  // differences so the retry/stream state machine stays format-agnostic.
  DEFAULT_MODELS: {
    openai: 'gpt-4o',
    anthropic: 'claude-sonnet-4-20250514',
    gemini: 'gemini-2.0-flash',
  },
  ANTHROPIC_VERSION: '2023-06-01',
  // 8192 is supported as an output cap by all current Claude 3+ models, so it
  // raises the ceiling for long completions without a per-model settings UI.
  ANTHROPIC_MAX_TOKENS: 8192,

  detectFormat(baseUrl) {
    let host = '';
    try {
      host = new URL(String(baseUrl || '').trim()).hostname.toLowerCase();
    } catch (e) {
      return 'openai';
    }
    if (/(^|\.)anthropic\.com$/.test(host)) return 'anthropic';
    if (/(^|\.)generativelanguage\.googleapis\.com$/.test(host)) return 'gemini';
    return 'openai';
  },

  // Format-aware base URL normalization. OpenAI/Anthropic endpoints need a
  // /v1 version segment (normalizeBaseUrl adds it); Gemini's adapter already
  // builds its own /v1beta/... path, so appending /v1 here would double up
  // into .../v1/v1beta/....
  normalizeBase(baseUrl) {
    const trimmed = String(baseUrl == null ? '' : baseUrl).trim().replace(/\/+$/, '');
    if (Api.detectFormat(trimmed) === 'gemini') return trimmed;
    return __aiextApiRoot.__aiext.utils.normalizeBaseUrl(trimmed);
  },

  parseOpenAIDelta(obj) {
    try {
      return (obj && obj.choices && obj.choices[0] && obj.choices[0].delta && obj.choices[0].delta.content) || null;
    } catch (e) {
      return null;
    }
  },

  parseAnthropicDelta(obj) {
    try {
      if (obj && obj.type === 'content_block_delta' && obj.delta && typeof obj.delta.text === 'string') {
        return obj.delta.text;
      }
      return null;
    } catch (e) {
      return null;
    }
  },

  parseGeminiDelta(obj) {
    try {
      const parts = obj && obj.candidates && obj.candidates[0] && obj.candidates[0].content && obj.candidates[0].content.parts;
      if (!Array.isArray(parts)) return null;
      const text = parts.filter(p => p && typeof p.text === 'string').map(p => p.text).join('');
      return text || null;
    } catch (e) {
      return null;
    }
  },

  // Shared by toAnthropicContent/toGeminiParts below. Returns
  // {mediaType, data} for a data: image URL, or null for anything else
  // (remote URLs are dropped; a 400 still triggers the text-only fallback).
  parseDataUrlImage(url) {
    if (typeof url !== 'string') return null;
    const m = url.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]*)$/);
    return m ? { mediaType: m[1], data: m[2] } : null;
  },

  // Canonical (OpenAI-shaped) content parts converted per format.
  toAnthropicContent(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content.map(p => {
      if (!p || typeof p !== 'object') return null;
      if (p.type === 'text') return { type: 'text', text: p.text };
      if (p.type === 'image_url' && p.image_url) {
        const img = Api.parseDataUrlImage(p.image_url.url);
        if (img) return { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } };
      }
      return null;
    }).filter(Boolean);
  },

  toGeminiParts(content) {
    if (typeof content === 'string') return [{ text: content }];
    if (!Array.isArray(content)) return [{ text: '' }];
    const parts = [];
    for (const p of content) {
      if (!p || typeof p !== 'object') continue;
      if (p.type === 'text' && p.text) parts.push({ text: p.text });
      else if (p.type === 'image_url' && p.image_url) {
        const img = Api.parseDataUrlImage(p.image_url.url);
        if (img) parts.push({ inlineData: { mimeType: img.mediaType, data: img.data } });
      }
    }
    return parts.length > 0 ? parts : [{ text: '' }];
  },

  splitSystemMessage(messages) {
    const sys = [];
    const rest = [];
    for (const m of (messages || [])) {
      if (m && m.role === 'system' && typeof m.content === 'string') sys.push(m.content);
      else if (m) rest.push(m);
    }
    return { sys, rest };
  },

  adapters: {
    openai: {
      buildChatUrl(norm, { model, apiKey }) {
        return norm + '/chat/completions';
      },
      buildHeaders(apiKey) {
        return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
      },
      buildBody({ model, messages }) {
        return { model: model || Api.DEFAULT_MODELS.openai, messages, stream: true };
      },
      parseDelta(obj) { return Api.parseOpenAIDelta(obj); },
      isDone(obj) { return false; },
      buildModelsRequest(norm, apiKey) {
        return { url: norm + '/models', headers: { 'Authorization': `Bearer ${apiKey}` } };
      },
      postProcessModelIds(ids) { return ids; },
    },
    anthropic: {
      buildChatUrl(norm, { model, apiKey }) {
        return norm + '/messages';
      },
      buildHeaders(apiKey) {
        return {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': Api.ANTHROPIC_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
        };
      },
      buildBody({ model, messages }) {
        const { sys, rest } = Api.splitSystemMessage(messages);
        return {
          model: model || Api.DEFAULT_MODELS.anthropic,
          max_tokens: Api.ANTHROPIC_MAX_TOKENS,
          ...(sys.length > 0 ? { system: sys.join('\n\n') } : {}),
          messages: rest.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: Api.toAnthropicContent(m.content),
          })),
          stream: true,
        };
      },
      parseDelta(obj) { return Api.parseAnthropicDelta(obj); },
      isDone(obj) { return !!obj && obj.type === 'message_stop'; },
      buildModelsRequest(norm, apiKey) {
        return { url: norm + '/models', headers: { 'x-api-key': apiKey, 'anthropic-version': Api.ANTHROPIC_VERSION } };
      },
      postProcessModelIds(ids) { return ids; },
    },
    gemini: {
      buildChatUrl(norm, { model, apiKey }) {
        const name = encodeURIComponent(model || Api.DEFAULT_MODELS.gemini);
        return `${norm}/v1beta/models/${name}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey || '')}`;
      },
      buildHeaders(apiKey) {
        return { 'Content-Type': 'application/json' };
      },
      buildBody({ model, messages }) {
        const { sys, rest } = Api.splitSystemMessage(messages);
        const body = {
          contents: rest.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: Api.toGeminiParts(m.content),
          })),
        };
        if (sys.length > 0) body.systemInstruction = { parts: [{ text: sys.join('\n\n') }] };
        return body;
      },
      parseDelta(obj) { return Api.parseGeminiDelta(obj); },
      isDone(obj) {
        try {
          const c = obj && obj.candidates && obj.candidates[0];
          return !!c && c.finishReason != null;
        } catch (e) {
          return false;
        }
      },
      buildModelsRequest(norm, apiKey) {
        return { url: `${norm}/v1beta/models?key=${encodeURIComponent(apiKey || '')}`, headers: {} };
      },
      postProcessModelIds(ids) {
        return ids
          .map(id => String(id).replace(/^models\//, ''))
          .filter(Boolean)
          .sort();
      },
    },
  },

  // Unified /models fetch for popup and content script. The adapter absorbs
  // endpoint, auth and response-shape differences. Mirrors chatCompletion's
  // contract: never throws, resolves {ok:true, models} or {ok:false, code,
  // status?, detail?}. models is [] when the endpoint answers OK but lists
  // no models.
  async fetchModels({ baseUrl, apiKey, fetchFn, customHeaders }) {
    const f = fetchFn || fetch;
    const adapter = Api.adapters[Api.detectFormat(baseUrl)];
    const norm = Api.normalizeBase(baseUrl);
    const req = adapter.buildModelsRequest(norm, apiKey);
    let res;
    try {
      res = await f(req.url, { headers: { ...req.headers, ...(customHeaders || {}) } });
    } catch (err) {
      return { ok: false, code: 'network', status: 0, detail: (err && err.message) || 'network' };
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { ok: false, code: 'api_error', status: res.status, detail: errText.slice(0, 200) || `HTTP ${res.status}` };
    }
    const data = await res.json();
    const models = adapter.postProcessModelIds(__aiextApiRoot.__aiext.chat.parseModelIds(data));
    return { ok: true, models };
  },

  // Streaming chat with retry state machine across all supported formats.
  // DOM-free: progress is reported through onEvent ({type:'start'|'delta'|
  // 'end'|'retry'|'fallback'}), and the caller owns all UI.
  // Returns {ok:true, content} or {ok:false, code, status?, detail?} where
  // code is one of 'cancelled'|'network'|'rate_limited'|'server'|'api_error'.
  async chatCompletion({ baseUrl, apiKey, model, messages, signal, fetchFn, maxAttempts, hasImages, stripImages, onEvent, customHeaders }) {
    const f = fetchFn || fetch;
    const emit = onEvent || (() => {});
    const attempts = maxAttempts || Api.MAX_ATTEMPTS;
    const adapter = Api.adapters[Api.detectFormat(baseUrl)];
    const norm = Api.normalizeBase(baseUrl || 'https://api.openai.com');
    const url = adapter.buildChatUrl(norm, { model, apiKey });
    const headers = { ...adapter.buildHeaders(apiKey), ...(customHeaders || {}) };
    let attempt = 0;
    let fallbackDone = false;
    let current = messages;

    while (attempt < attempts) {
      if (signal && signal.aborted) return { ok: false, code: 'cancelled' };

      let res;
      try {
        res = await f(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(adapter.buildBody({ model, messages: current })),
          signal
        });
      } catch (err) {
        if (signal && signal.aborted) return { ok: false, code: 'cancelled' };
        attempt++;
        if (attempt >= attempts) return { ok: false, code: 'network', status: 0, detail: (err && err.message) || 'network' };
        emit({ type: 'retry', attempt, kind: 'network' });
        if (await Api.sleep(Api.retryDelayMs(attempt), signal)) return { ok: false, code: 'cancelled' };
        continue;
      }

      if (res.status === 400 && !fallbackDone && hasImages && hasImages(current)) {
        fallbackDone = true;
        current = stripImages(current);
        emit({ type: 'fallback' });
        continue;
      }

      if (Api.isRetryableStatus(res.status)) {
        attempt++;
        if (attempt >= attempts) {
          const errText = await res.text().catch(() => '');
          return {
            ok: false,
            code: res.status === 429 ? 'rate_limited' : 'server',
            status: res.status,
            detail: errText.slice(0, 200)
          };
        }
        emit({ type: 'retry', attempt, kind: 'status' });
        if (await Api.sleep(Api.retryDelayMs(attempt), signal)) return { ok: false, code: 'cancelled' };
        continue;
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return { ok: false, code: 'api_error', status: res.status, detail: errText.slice(0, 200) };
      }

      const stream = await Api.readSseStream(res, signal, emit, (obj) => adapter.parseDelta(obj), (obj) => adapter.isDone(obj));
      if (stream.aborted) return { ok: false, code: 'cancelled' };
      emit({ type: 'end', fullContent: stream.fullContent, doneReceived: stream.doneReceived });
      return { ok: true, content: stream.fullContent, truncated: !stream.doneReceived };
    }

    return { ok: false, code: 'cancelled' };
  },

  // Consumes an SSE response body, emitting start/delta per chunk.
  // parseDelta comes from the active adapter (Anthropic/Gemini event shapes
  // differ from OpenAI's); isDoneFn recognizes adapter-specific terminators
  // (e.g. Anthropic message_stop); the data: line framing is shared.
  async readSseStream(res, signal, emit, parseDelta, isDoneFn) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    const parser = Api.createSseParser((delta) => {
      fullContent += delta;
      emit({ type: 'delta', delta, fullContent });
    }, parseDelta, isDoneFn);
    emit({ type: 'start' });
    try {
      while (true) {
        if (signal && signal.aborted) {
          try { await reader.cancel(); } catch (e) {}
          return { aborted: true, fullContent };
        }
        let read;
        try {
          read = await reader.read();
        } catch (e) {
          if (signal && signal.aborted) return { aborted: true, fullContent };
          throw e;
        }
        if (read.done) break;
        parser.push(decoder.decode(read.value, { stream: true }));
        if (parser.done) break;
      }
    } finally {
      try { reader.releaseLock(); } catch (e) {}
    }
    return { aborted: false, fullContent, doneReceived: parser.finish() };
  },
};
