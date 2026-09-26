const __aiextApiRoot = typeof window !== 'undefined' ? window : globalThis;
__aiextApiRoot.__aiext = __aiextApiRoot.__aiext || {};

const Api = __aiextApiRoot.__aiext.api = {
  MAX_ATTEMPTS: 3,
  DEFAULT_MODEL: 'gpt-4o',
  MODELS_PATH: '/models',
  CHAT_COMPLETIONS_PATH: '/chat/completions',

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

  // Incremental OpenAI-compatible SSE parser. Pure and DOM-free so it can be
  // unit tested. Handles events split across chunks and a trailing line
  // without its terminating newline.
  createSseParser(onDelta) {
    let lineBuffer = '';
    let done = false;
    function handleLine(trimmed) {
      if (!trimmed.startsWith('data: ')) return;
      const data = trimmed.slice(6);
      if (data === '[DONE]') { done = true; return; }
      try {
        const delta = JSON.parse(data).choices?.[0]?.delta?.content;
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

  buildChatRequest({ model, messages }) {
    return { model: model || Api.DEFAULT_MODEL, messages, stream: true };
  },

  // Unified /models fetch for popup and content script. Throws on transport
  // or HTTP errors (so callers can display the message); returns [] when the
  // endpoint answers OK but lists no models.
  async fetchModels({ baseUrl, apiKey, fetchFn }) {
    const f = fetchFn || fetch;
    const url = __aiextApiRoot.__aiext.utils.normalizeBaseUrl(baseUrl) + Api.MODELS_PATH;
    const res = await f(url, { headers: { 'Authorization': `Bearer ${apiKey}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return __aiextApiRoot.__aiext.chat.parseModelIds(data);
  },

  // OpenAI-compatible streaming chat with retry state machine. DOM-free:
  // progress is reported through onEvent ({type:'start'|'delta'|'end'|
  // 'retry'|'fallback'}), and the caller owns all UI.
  // Returns {ok:true, content} or {ok:false, code, status?, detail?} where
  // code is one of 'cancelled'|'network'|'rate_limited'|'server'|'api_error'.
  async chatCompletion({ url, apiKey, model, messages, signal, fetchFn, maxAttempts, hasImages, stripImages, onEvent }) {
    const f = fetchFn || fetch;
    const emit = onEvent || (() => {});
    const attempts = maxAttempts || Api.MAX_ATTEMPTS;
    let attempt = 0;
    let fallbackDone = false;
    let current = messages;

    while (attempt < attempts) {
      if (signal && signal.aborted) return { ok: false, code: 'cancelled' };

      let res;
      try {
        res = await f(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(Api.buildChatRequest({ model, messages: current })),
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

      const stream = await Api.readSseStream(res, signal, emit);
      if (stream.aborted) return { ok: false, code: 'cancelled' };
      emit({ type: 'end', fullContent: stream.fullContent, doneReceived: stream.doneReceived });
      return { ok: true, content: stream.fullContent };
    }

    return { ok: false, code: 'cancelled' };
  },

  // Consumes an SSE response body, emitting start/delta per chunk.
  async readSseStream(res, signal, emit) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    const parser = Api.createSseParser((delta) => {
      fullContent += delta;
      emit({ type: 'delta', delta, fullContent });
    });
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
