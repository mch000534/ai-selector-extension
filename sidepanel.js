(() => {
  const { normalizeBaseUrl } = window.__aiext.utils;
  const { renderMarkdown } = window.__aiext.markdown;
  const chat = window.__aiext.chat;

  const STORAGE_KEY = 'aiext_sidepanel_chat_v1';

  const els = {
    baseUrlSummary: document.getElementById('baseUrlSummary'),
    modelInput: document.getElementById('modelInput'),
    modelList: document.getElementById('modelList'),
    fetchModelsBtn: document.getElementById('fetchModelsBtn'),
    messages: document.getElementById('messages'),
    status: document.getElementById('status'),
    input: document.getElementById('messageInput'),
    sendBtn: document.getElementById('sendBtn'),
    quickPromptSelect: document.getElementById('quickPromptSelect'),
    useSelectionBtn: document.getElementById('useSelectionBtn'),
    clearChatBtn: document.getElementById('clearChatBtn'),
    contextBox: document.getElementById('contextBox'),
    contextText: document.getElementById('contextText'),
    contextImages: document.getElementById('contextImages'),
    clearContextBtn: document.getElementById('clearContextBtn'),
  };

  const state = {
    config: {},
    quickPrompts: [],
    context: { text: '', images: [] },
    conversationHistory: [],
    isStreaming: false,
    controller: null,
  };
  let modelSaveTimer = null;

  function t(key, args) {
    try { return chrome.i18n.getMessage(key, args || []) || key; }
    catch { return key; }
  }

  function applyI18n() {
    const lang = chrome.i18n.getUILanguage();
    const rtlLangs = ['ar', 'iw', 'fa', 'ur'];
    document.documentElement.lang = lang;
    document.documentElement.dir = rtlLangs.some(l => lang.startsWith(l)) ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const msg = t(el.dataset.i18n);
      if (msg) el.textContent = msg;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const msg = t(el.dataset.i18nPlaceholder);
      if (msg) el.placeholder = msg;
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const msg = t(el.dataset.i18nTitle);
      if (msg) el.title = msg;
    });
  }

  function setStatus(message, type) {
    els.status.textContent = message || '';
    els.status.className = type ? `status ${type}` : 'status';
  }

  function storageSyncGet(keys) {
    return new Promise(resolve => {
      chrome.storage.sync.get(keys, result => resolve(result || {}));
    });
  }

  function storageLocalGet(keys) {
    return new Promise(resolve => {
      chrome.storage.local.get(keys, result => resolve(result || {}));
    });
  }

  async function loadState() {
    state.config = await storageSyncGet(['apiKey', 'model', 'baseUrl']);
    const promptResult = await storageSyncGet(['quickPrompts']);
    state.quickPrompts = chat.normalizeQuickPrompts(promptResult.quickPrompts);

    const local = await storageLocalGet([STORAGE_KEY]);
    const saved = local[STORAGE_KEY] || {};
    state.conversationHistory = Array.isArray(saved.conversationHistory) ? saved.conversationHistory : [];
    state.context = saved.context || { text: '', images: [] };

    renderHeader();
    renderContext();
    renderMessages();
    renderQuickPrompts();
  }

  async function persist() {
    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        conversationHistory: state.conversationHistory,
        context: state.context,
        updatedAt: Date.now(),
      },
    });
  }

  function renderHeader() {
    els.baseUrlSummary.textContent = state.config.baseUrl
      ? normalizeBaseUrl(state.config.baseUrl)
      : t('sidePanelMissingConfig');
    if (document.activeElement !== els.modelInput) {
      els.modelInput.value = state.config.model || '';
    }
  }

  function renderContext() {
    const text = state.context && state.context.text ? state.context.text : '';
    const images = state.context && Array.isArray(state.context.images) ? state.context.images : [];
    els.contextBox.hidden = !text && images.length === 0;
    els.contextText.textContent = text.length > 900 ? text.slice(0, 900) + '...' : text;
    els.contextImages.innerHTML = '';
    images.slice(0, 6).forEach(src => {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      els.contextImages.appendChild(img);
    });
  }

  function renderQuickPrompts() {
    const placeholder = els.quickPromptSelect.querySelector('option[value=""]');
    els.quickPromptSelect.innerHTML = '';
    els.quickPromptSelect.appendChild(placeholder || new Option(t('quickPromptsLabel'), ''));
    state.quickPrompts.forEach(prompt => {
      const opt = document.createElement('option');
      opt.value = prompt;
      opt.textContent = prompt;
      els.quickPromptSelect.appendChild(opt);
    });
    els.quickPromptSelect.hidden = state.quickPrompts.length === 0;
    els.quickPromptSelect.value = '';
  }

  function renderMessages() {
    els.messages.innerHTML = '';
    if (state.conversationHistory.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = t('sidePanelEmptyState');
      els.messages.appendChild(empty);
      return;
    }
    state.conversationHistory.forEach(m => addMessage(m.role, m.content, false));
    scrollToBottom();
  }

  function addMessage(role, content, shouldScroll = true) {
    const empty = els.messages.querySelector('.empty');
    if (empty) empty.remove();
    const row = document.createElement('div');
    row.className = `msg msg-${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    if (role === 'assistant') bubble.innerHTML = renderMarkdown(content || '');
    else bubble.textContent = content || '';
    row.appendChild(bubble);
    els.messages.appendChild(row);
    if (shouldScroll) scrollToBottom();
    return bubble;
  }

  function scrollToBottom() {
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  function autoGrowInput() {
    els.input.style.height = 'auto';
    els.input.style.height = Math.min(els.input.scrollHeight, 150) + 'px';
  }

  async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs && tabs[0] ? tabs[0] : null;
  }

  async function useSelectionContext() {
    setStatus('');
    els.useSelectionBtn.disabled = true;
    try {
      const tab = await getActiveTab();
      if (!tab || typeof tab.id !== 'number') throw new Error(t('sidePanelNoActiveTab'));
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getSelectionContext' });
      if (!response || !response.ok) throw new Error((response && response.error) || t('sidePanelSelectionFailed'));
      state.context = response.context || { text: '', images: [] };
      renderContext();
      await persist();
      const hasContext = state.context.text || (state.context.images && state.context.images.length > 0);
      setStatus(hasContext ? t('sidePanelSelectionLoaded') : t('sidePanelNoSelection'), hasContext ? 'success' : '');
    } catch (err) {
      setStatus(t('sidePanelSelectionError', [err.message]), 'error');
    } finally {
      els.useSelectionBtn.disabled = false;
    }
  }

  async function sendMessage() {
    if (state.isStreaming) return;
    const text = els.input.value.trim();
    if (!text) return;
    await saveSelectedModel(els.modelInput.value);
    await refreshConfig();
    if (!state.config.apiKey || !state.config.baseUrl) {
      setStatus(t('sidePanelMissingConfig'), 'error');
      return;
    }

    els.input.value = '';
    autoGrowInput();
    state.conversationHistory.push({ role: 'user', content: text });
    addMessage('user', text);
    await persist();

    state.isStreaming = true;
    els.sendBtn.disabled = true;
    setStatus(t('sidePanelStreaming'));
    const bubble = addMessage('assistant', '');

    try {
      const uiLang = chrome.i18n.getUILanguage() || 'en';
      let messages = chat.buildChatMessages({
        context: state.context,
        pendingImages: [],
        conversationHistory: state.conversationHistory,
        uiLang,
      });
      const response = await callAI(messages, delta => {
        bubble.textContent += delta;
        scrollToBottom();
      });
      if (response.error) {
        bubble.textContent = response.error;
        setStatus(response.error, 'error');
      } else {
        bubble.innerHTML = renderMarkdown(response.content);
        state.conversationHistory.push({ role: 'assistant', content: response.content });
        setStatus('');
        await persist();
      }
    } catch (err) {
      bubble.textContent = t('errorRequestFailed', [err.message]);
      setStatus(t('errorRequestFailed', [err.message]), 'error');
    } finally {
      state.isStreaming = false;
      state.controller = null;
      els.sendBtn.disabled = false;
      els.input.focus();
    }
  }

  async function refreshConfig() {
    state.config = await storageSyncGet(['apiKey', 'model', 'baseUrl']);
    renderHeader();
  }

  function populateModelList(models) {
    els.modelList.innerHTML = '';
    models.forEach(id => {
      const opt = document.createElement('option');
      opt.value = id;
      els.modelList.appendChild(opt);
    });
  }

  async function saveSelectedModel(model) {
    const value = model.trim();
    state.config.model = value;
    await chrome.storage.sync.set({ model: value });
    renderHeader();
  }

  function queueModelSave() {
    state.config.model = els.modelInput.value.trim();
    clearTimeout(modelSaveTimer);
    modelSaveTimer = setTimeout(() => {
      saveSelectedModel(els.modelInput.value);
    }, 400);
  }

  async function fetchModels() {
    await refreshConfig();
    const baseUrl = state.config.baseUrl;
    const apiKey = state.config.apiKey;
    if (!baseUrl || !apiKey) {
      setStatus(t('statusNeedUrlAndKey'), 'error');
      return;
    }

    els.fetchModelsBtn.disabled = true;
    els.fetchModelsBtn.textContent = t('modelFetching');
    setStatus(t('modelFetchingHint'));

    try {
      const res = await fetch(normalizeBaseUrl(baseUrl) + '/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const models = chat.parseModelIds(await res.json());
      if (models.length === 0) {
        setStatus(t('modelNoModels'), 'error');
        return;
      }

      populateModelList(models);
      if (!els.modelInput.value.trim()) {
        els.modelInput.value = models[0];
        await saveSelectedModel(models[0]);
      }
      setStatus(t('modelFound', [String(models.length)]), 'success');
    } catch (err) {
      setStatus(t('modelFetchFailed', [err.message]), 'error');
    } finally {
      els.fetchModelsBtn.disabled = false;
      els.fetchModelsBtn.textContent = t('modelFetchBtn');
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function callAI(messages, onDelta) {
    const url = normalizeBaseUrl(state.config.baseUrl || 'https://api.openai.com/v1') + '/chat/completions';
    let attempt = 0;
    let fallbackTriggered = false;
    const maxAttempts = 3;

    while (attempt < maxAttempts) {
      const controller = new AbortController();
      state.controller = controller;
      let res;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.config.apiKey}`,
          },
          body: JSON.stringify({
            model: state.config.model || 'gpt-4o',
            messages,
            stream: true,
          }),
          signal: controller.signal,
        });
      } catch (err) {
        attempt++;
        if (attempt >= maxAttempts) return { error: t('errorRequestFailed', [err.message || 'network']) };
        setStatus(t('retrying', [String(attempt)]));
        await sleep(Math.min(1000 * Math.pow(2, attempt - 1), 8000));
        continue;
      }

      if (res.status === 400 && chat.messagesHaveImages(messages) && !fallbackTriggered) {
        fallbackTriggered = true;
        messages = chat.stripImagesFromMessages(messages);
        setStatus(t('fallbackTextOnly'));
        continue;
      }

      if (res.status === 429 || (res.status >= 500 && res.status <= 504)) {
        attempt++;
        if (attempt >= maxAttempts) {
          const errText = await res.text().catch(() => '');
          return { error: t('errorApiError', [String(res.status), errText.slice(0, 200)]) };
        }
        setStatus(t('retrying', [String(attempt)]));
        await sleep(Math.min(1000 * Math.pow(2, attempt - 1), 8000));
        continue;
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return { error: t('errorApiError', [String(res.status), errText.slice(0, 200)]) };
      }

      return { content: await readStream(res, onDelta) };
    }

    return { error: t('errorRequestFailed', ['unknown']) };
  }

  async function readStream(res, onDelta) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let lineBuffer = '';
    let doneReceived = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      lineBuffer += decoder.decode(value, { stream: true });
      let nlIdx;
      while ((nlIdx = lineBuffer.indexOf('\n')) !== -1) {
        const line = lineBuffer.slice(0, nlIdx);
        lineBuffer = lineBuffer.slice(nlIdx + 1);
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          doneReceived = true;
          break;
        }
        try {
          const delta = JSON.parse(data).choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            onDelta(delta);
          }
        } catch {}
      }
      if (doneReceived) break;
    }

    if (!doneReceived && lineBuffer.trim().startsWith('data: ')) {
      try {
        const delta = JSON.parse(lineBuffer.trim().slice(6)).choices?.[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          onDelta(delta);
        }
      } catch {}
    }

    return fullContent;
  }

  els.input.addEventListener('input', autoGrowInput);
  els.input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  els.sendBtn.addEventListener('click', sendMessage);
  els.fetchModelsBtn.addEventListener('click', fetchModels);
  els.modelInput.addEventListener('input', queueModelSave);
  els.modelInput.addEventListener('change', () => saveSelectedModel(els.modelInput.value));
  els.modelInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveSelectedModel(els.modelInput.value);
      els.input.focus();
    }
  });
  els.useSelectionBtn.addEventListener('click', useSelectionContext);
  els.quickPromptSelect.addEventListener('change', () => {
    const prompt = els.quickPromptSelect.value;
    if (!prompt) return;
    els.input.value = prompt;
    els.quickPromptSelect.value = '';
    autoGrowInput();
    els.input.focus();
  });
  els.clearChatBtn.addEventListener('click', async () => {
    state.conversationHistory = [];
    renderMessages();
    await persist();
    setStatus(t('sidePanelChatCleared'), 'success');
  });
  els.clearContextBtn.addEventListener('click', async () => {
    state.context = { text: '', images: [] };
    renderContext();
    await persist();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.apiKey || changes.model || changes.baseUrl || changes.quickPrompts) {
      loadState();
    }
  });

  applyI18n();
  loadState();
})();
