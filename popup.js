document.addEventListener('DOMContentLoaded', () => {
  const { escapeHtml, normalizeBaseUrl } = window.__aiext.utils;
  const chat = window.__aiext.chat;
  const apiKeyInput = document.getElementById('apiKey');
  const modelInput = document.getElementById('model');
  const modelList = document.getElementById('modelList');
  const baseUrlInput = document.getElementById('baseUrl');
  const modelHint = document.getElementById('modelHint');
  const fetchModelsBtn = document.getElementById('fetchModelsBtn');
  const statusEl = document.getElementById('status');
  const openDrawerBtn = document.getElementById('openDrawerBtn');
  const promptsList = document.getElementById('promptsList');
  const newPromptInput = document.getElementById('newPrompt');
  const addPromptBtn = document.getElementById('addPromptBtn');

  const defaultPinCheckbox = document.getElementById('defaultPin');
  const showFloatingCheckbox = document.getElementById('showFloating');
  const baseUrlHint = document.getElementById('baseUrlHint');
  const toggleApiKeyBtn = document.getElementById('toggleApiKey');
  const providerSelect = document.getElementById('provider');

  let PROVIDERS = {};
  let PROVIDER_ORDER = [];

  async function loadProviders() {
    try {
      const res = await fetch(chrome.runtime.getURL('providers.json'));
      const data = await res.json();
      PROVIDERS = data.providers || {};
      PROVIDER_ORDER = data.displayOrder || Object.keys(PROVIDERS);
    } catch (e) {
      PROVIDERS = {};
      PROVIDER_ORDER = [];
    }
  }

  function renderProviderOptions() {
    if (!providerSelect) return;
    const currentValue = providerSelect.value;
    providerSelect.querySelectorAll('option:not([value="custom"])').forEach(o => o.remove());
    PROVIDER_ORDER.forEach(key => {
      const p = PROVIDERS[key];
      if (!p) return;
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = `${p.name} — ${p.host}`;
      if (p.free) opt.dataset.free = '1';
      providerSelect.appendChild(opt);
    });
    if (PROVIDER_ORDER.includes(currentValue)) providerSelect.value = currentValue;
  }

  let quickPrompts = [];

  // Baseline of connection-critical settings. Dialog history is only cleared
  // when apiKey or baseUrl actually changes — not on every save() (e.g.
  // typing the API key fires debouncedSave every 500ms, editing quick
  // prompts also calls save()). Null until initial load completes.
  let baselineApiKey = null;
  let baselineBaseUrl = null;

  function applyI18n() {
    const lang = chrome.i18n.getUILanguage();
    const rtlLangs = ['ar', 'iw', 'fa', 'ur'];
    const isRtl = rtlLangs.some(l => lang.startsWith(l));
    document.documentElement.lang = lang;
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      const msg = chrome.i18n.getMessage(key);
      if (msg) el.textContent = msg;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.dataset.i18nPlaceholder;
      const msg = chrome.i18n.getMessage(key);
      if (msg) el.placeholder = msg;
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.dataset.i18nTitle;
      const msg = chrome.i18n.getMessage(key);
      if (msg) el.title = msg;
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      const key = el.dataset.i18nAria;
      const msg = chrome.i18n.getMessage(key);
      if (msg) el.setAttribute('aria-label', msg);
    });

    if (providerSelect) {
      const freeBadge = chrome.i18n.getMessage('providersFreeBadge') || 'Free';
      providerSelect.querySelectorAll('option[data-free="1"]').forEach(opt => {
        const base = opt.textContent.replace(/\s*[\(\[]?\s*Free[^)\]]*[\)\]]?\s*$/i, '').trim();
        opt.textContent = `${base}  [${freeBadge}]`;
        opt.dataset.baseText = base;
      });
    }
  }

  function updateBaseUrlHint() {
    const raw = baseUrlInput.value.trim();
    if (!raw) {
      baseUrlHint.textContent = '';
      return;
    }
    const normalized = normalizeBaseUrl(raw);
    baseUrlHint.textContent = normalized !== raw
      ? chrome.i18n.getMessage('baseUrlValidHint', [normalized])
      : '';
  }

  applyI18n();

  function detectProvider(savedUrl) {
    if (!savedUrl) return 'custom';
    const u = savedUrl.trim().replace(/\/+$/, '').replace(/\/v\d+\/?$/i, '');
    for (const [key, p] of Object.entries(PROVIDERS)) {
      const pu = p.baseUrl.replace(/\/+$/, '');
      if (u === pu || u.startsWith(pu + '/')) return key;
    }
    return 'custom';
  }

  (async () => {
    await loadProviders();
    renderProviderOptions();
  applyI18n();

  try {
    if (window.__aiext.theme && window.__aiext.theme.applyDocumentVars) {
      window.__aiext.theme.applyDocumentVars(document);
    }
  } catch (e) { /* popup keeps CSS fallbacks */ }

    window.__aiext.storage.getSync(['apiKey', 'model', 'baseUrl', 'quickPrompts', 'defaultPin', 'showFloating'], {}).then((result) => {
    if (result.apiKey) apiKeyInput.value = result.apiKey;
    if (result.baseUrl) baseUrlInput.value = result.baseUrl;
    if (result.model) modelInput.value = result.model;
    baselineApiKey = (result.apiKey || '').trim();
    baselineBaseUrl = (result.baseUrl || '').trim();
    defaultPinCheckbox.checked = result.defaultPin !== false;
    showFloatingCheckbox.checked = result.showFloating !== false;
    providerSelect.value = detectProvider(result.baseUrl);
    quickPrompts = result.quickPrompts || [];
    renderPrompts();
    updateBaseUrlHint();
  });
  })();

  providerSelect.addEventListener('change', () => {
    const key = providerSelect.value;
    if (key === 'custom' || !PROVIDERS[key]) return;
    const { baseUrl, model } = PROVIDERS[key];
    baseUrlInput.value = baseUrl;
    modelInput.value = model;
    updateBaseUrlHint();
    save();
  });

  baseUrlInput.addEventListener('input', () => {
    const detected = detectProvider(baseUrlInput.value);
    if (detected !== providerSelect.value) providerSelect.value = 'custom';
  });
  modelInput.addEventListener('input', () => {
    const key = providerSelect.value;
    if (key !== 'custom' && PROVIDERS[key] && modelInput.value.trim() !== PROVIDERS[key].model) {
      providerSelect.value = 'custom';
    }
  });

  function renderPrompts() {
    const editTooltip = chrome.i18n.getMessage('quickPromptsEditTooltip');
    // Built with DOM APIs (not innerHTML) so prompt text can never break out
    // into markup: textContent assigns, never parses.
    promptsList.textContent = '';
    quickPrompts.forEach((p, i) => {
      const item = document.createElement('div');
      item.className = 'prompt-item';
      item.dataset.index = String(i);

      const drag = document.createElement('span');
      drag.className = 'prompt-drag';
      drag.draggable = true;
      drag.textContent = '⠿';
      item.appendChild(drag);

      const label = document.createElement('span');
      label.className = 'prompt-text';
      label.title = editTooltip;
      label.textContent = p;
      item.appendChild(label);

      const remove = document.createElement('button');
      remove.className = 'prompt-remove';
      remove.dataset.index = String(i);
      remove.textContent = '×';
      item.appendChild(remove);

      promptsList.appendChild(item);
    });

    promptsList.querySelectorAll('.prompt-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        quickPrompts.splice(index, 1);
        renderPrompts();
        save();
      });
    });

    promptsList.querySelectorAll('.prompt-text').forEach(span => {
      span.addEventListener('click', () => {
        const index = parseInt(span.closest('.prompt-item').dataset.index);
        editPrompt(index, span);
      });
    });

    let dragSrcIndex = null;

    promptsList.querySelectorAll('.prompt-drag').forEach(handle => {
      handle.addEventListener('dragstart', (e) => {
        const item = handle.closest('.prompt-item');
        dragSrcIndex = parseInt(item.dataset.index);
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
    });

    promptsList.querySelectorAll('.prompt-item').forEach(item => {
      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        promptsList.querySelectorAll('.prompt-item').forEach(el => el.classList.remove('drag-over'));
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        item.classList.add('drag-over');
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('drag-over');
        const dropIndex = parseInt(item.dataset.index);
        if (dragSrcIndex !== null && dragSrcIndex !== dropIndex) {
          const [moved] = quickPrompts.splice(dragSrcIndex, 1);
          quickPrompts.splice(dropIndex, 0, moved);
          renderPrompts();
          save();
        }
      });
    });
  }

  function editPrompt(index, spanEl) {
    const input = document.createElement('input');
    input.className = 'prompt-edit-input';
    input.value = quickPrompts[index];
    spanEl.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    function commit() {
      if (done) return;
      done = true;
      const val = input.value.trim();
      if (val) {
        quickPrompts[index] = val;
        save();
      }
      renderPrompts();
    }
    function cancel() {
      if (done) return;
      done = true;
      renderPrompts();
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', commit);
  }

  function addPrompt() {
    const text = newPromptInput.value.trim();
    if (text && quickPrompts.length < 10) {
      quickPrompts.push(text);
      newPromptInput.value = '';
      renderPrompts();
      save();
    }
  }

  addPromptBtn.addEventListener('click', addPrompt);
  newPromptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addPrompt(); }
  });

  fetchModelsBtn.addEventListener('click', async () => {
    const baseUrl = baseUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    if (!baseUrl || !apiKey) {
      showStatus(chrome.i18n.getMessage('statusNeedUrlAndKey'), 'error');
      return;
    }

    fetchModelsBtn.disabled = true;
    fetchModelsBtn.textContent = chrome.i18n.getMessage('modelFetching');
    modelHint.textContent = chrome.i18n.getMessage('modelFetchingHint');

    try {
      const models = await window.__aiext.api.fetchModels({ baseUrl, apiKey });

      if (!models || models.length === 0) {
        showStatus(chrome.i18n.getMessage('modelNoModels'), 'error');
        return;
      }

      modelList.innerHTML = '';
      models.forEach(id => {
        const opt = document.createElement('option');
        opt.value = id;
        modelList.appendChild(opt);
      });
      modelHint.textContent = chrome.i18n.getMessage('modelFound', [String(models.length)]);
      showStatus(chrome.i18n.getMessage('modelUpdated'), 'success');
    } catch (err) {
      showStatus(chrome.i18n.getMessage('modelFetchFailed', [err.message]), 'error');
      modelHint.textContent = chrome.i18n.getMessage('modelFetchFailedHint');
    } finally {
      fetchModelsBtn.disabled = false;
      fetchModelsBtn.textContent = chrome.i18n.getMessage('modelFetchBtn');
    }
  });

  function save() {
    const apiKey = apiKeyInput.value.trim();
    const model = modelInput.value.trim();
    const baseUrl = baseUrlInput.value.trim();
    const defaultPin = defaultPinCheckbox.checked;
    const showFloating = showFloatingCheckbox.checked;
    window.__aiext.storage.setSync({ apiKey, model, baseUrl, quickPrompts, defaultPin, showFloating }).then(() => {
      showStatus(chrome.i18n.getMessage('statusAutoSaved'), 'success');
    });
    // Only clear persisted conversations when the connection config actually
    // changed — they belong to the previous endpoint/credential.
    if (baselineApiKey !== null && baselineBaseUrl !== null &&
        (apiKey !== baselineApiKey || baseUrl !== baselineBaseUrl)) {
      baselineApiKey = apiKey;
      baselineBaseUrl = baseUrl;
      try {
        chrome.storage.local.remove(['aiext_dialogs_v1']);
      } catch (e) { /* ignore */ }
    }
  }

  let saveTimer = null;
  function debouncedSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 500);
  }

  baseUrlInput.addEventListener('input', () => {
    updateBaseUrlHint();
    debouncedSave();
  });
  baseUrlInput.addEventListener('blur', () => {
    const raw = baseUrlInput.value.trim();
    if (raw) {
      const normalized = normalizeBaseUrl(raw);
      if (normalized !== raw) {
        baseUrlInput.value = normalized;
        updateBaseUrlHint();
        save();
      }
    }
  });
  apiKeyInput.addEventListener('input', debouncedSave);
  modelInput.addEventListener('input', debouncedSave);
  defaultPinCheckbox.addEventListener('change', save);
  showFloatingCheckbox.addEventListener('change', save);

  if (openDrawerBtn) {
    openDrawerBtn.addEventListener('click', async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || typeof tab.id !== 'number') throw new Error('no_active_tab');
        const response = await chrome.tabs.sendMessage(tab.id, chat.createOpenDrawerMessage({}));
        if (response && response.error) throw new Error(response.error);
        window.close();
      } catch (err) {
        showStatus(chrome.i18n.getMessage('openDrawerFailed', [err.message]), 'error');
      }
    });
  }

  toggleApiKeyBtn.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    toggleApiKeyBtn.classList.toggle('visible', isPassword);
  });

  function showStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = 'status ' + type;
    setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'status'; }, 3000);
  }

  const versionEl = document.querySelector('.version');
  if (versionEl) {
    const manifest = chrome.runtime.getManifest();
    versionEl.textContent = `v${manifest.version}`;
  }

  // ─── Recently closed ───
  const recentClosedBtn = document.getElementById('recentClosedBtn');
  const recentClosedSection = document.getElementById('recentClosedSection');
  const recentClosedList = document.getElementById('recentClosedList');
  const recentClosedClearAll = document.getElementById('recentClosedClearAll');
  const STORAGE_KEY = 'aiext_dialogs_v1';

  function formatRelativeTime(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    const day = Math.floor(hr / 24);
    return `${day}d`;
  }

  async function getActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab || null;
    } catch (e) {
      return null;
    }
  }

  async function sendToActiveTab(message) {
    const tab = await getActiveTab();
    if (!tab || !tab.id) return { ok: false, error: 'no_active_tab' };
    try {
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch (e) {
      return { ok: false, error: 'no_content_script' };
    }
  }

  async function fetchClosedList() {
    recentClosedList.innerHTML = '';
    const res = await sendToActiveTab({ action: 'listClosedDialogs' });
    if (!res || !res.ok) {
      // Fallback: read storage directly (won't be hostname-scoped)
      try {
        const data = await window.__aiext.storage.getLocal([STORAGE_KEY], {});
        const records = (data && data[STORAGE_KEY] && data[STORAGE_KEY].dialogs) || [];
        const now = Date.now();
        const TTL_MS = 7 * 24 * 3600 * 1000;
        const closed = records
          .filter(r => r && r.closedAt && (now - r.closedAt) < TTL_MS)
          .sort((a, b) => b.closedAt - a.closedAt)
          .slice(0, 10)
          .map(r => chat.buildClosedListItem(r))
          .filter(Boolean);
        renderClosedList(closed);
      } catch (e) {
        renderEmpty();
      }
      return;
    }
    renderClosedList(res.items || []);
  }

  function renderEmpty() {
    recentClosedList.innerHTML = `<div class="recent-closed-empty">${escapeHtml(chrome.i18n.getMessage('recentClosedEmpty'))}</div>`;
  }

  function renderClosedList(items) {
    if (!Array.isArray(items) || items.length === 0) {
      renderEmpty();
      return;
    }
    // Built with DOM APIs (not innerHTML): preview/host/meta come from stored
    // conversation data and are assigned via textContent, never parsed.
    recentClosedList.textContent = '';
    items.forEach(item => {
      const preview = item.preview || '';
      const host = item.hostname || '';
      const dateStr = formatRelativeTime(item.closedAt);
      const meta = [
        item.messageCount ? `${item.messageCount} msg` : '',
        item.model || ''
      ].filter(Boolean).join(' · ');

      const el = document.createElement('div');
      el.className = 'recent-closed-item';
      el.dataset.persistId = item.id || '';

      const body = document.createElement('div');
      body.className = 'recent-closed-item-body';
      el.appendChild(body);

      const top = document.createElement('div');
      top.className = 'recent-closed-item-top';
      body.appendChild(top);

      const hostEl = document.createElement('span');
      hostEl.className = 'recent-closed-item-host';
      hostEl.textContent = host;
      top.appendChild(hostEl);

      const dateEl = document.createElement('span');
      dateEl.className = 'recent-closed-item-date';
      dateEl.textContent = dateStr;
      top.appendChild(dateEl);

      if (preview) {
        const previewEl = document.createElement('div');
        previewEl.className = 'recent-closed-item-preview';
        previewEl.textContent = preview;
        body.appendChild(previewEl);
      }
      if (meta) {
        const metaEl = document.createElement('div');
        metaEl.className = 'recent-closed-item-meta';
        metaEl.textContent = meta;
        body.appendChild(metaEl);
      }

      el.addEventListener('click', async () => {
        const id = el.dataset.persistId;
        if (!id) return;
        el.style.opacity = '0.5';
        el.style.pointerEvents = 'none';
        const res = await sendToActiveTab({ action: 'restoreClosedDialog', persistId: id });
        if (res && res.ok) {
          el.remove();
          if (!recentClosedList.querySelector('.recent-closed-item')) renderEmpty();
          showStatus(chrome.i18n.getMessage('statusAutoSaved'), 'success');
        } else {
          el.style.opacity = '';
          el.style.pointerEvents = '';
          const errMsg = document.createElement('div');
          errMsg.className = 'recent-closed-error';
          errMsg.textContent = (res && res.error) || 'restore failed';
          recentClosedList.prepend(errMsg);
          setTimeout(() => errMsg.remove(), 3000);
        }
      });
      recentClosedList.appendChild(el);
    });
  }

  if (recentClosedBtn && recentClosedSection) {
    recentClosedBtn.addEventListener('click', () => {
      const opening = recentClosedSection.hasAttribute('hidden');
      if (opening) {
        recentClosedSection.removeAttribute('hidden');
        recentClosedBtn.classList.add('open');
        fetchClosedList();
      } else {
        recentClosedSection.setAttribute('hidden', '');
        recentClosedBtn.classList.remove('open');
      }
    });
  }

  if (recentClosedClearAll) {
    recentClosedClearAll.addEventListener('click', async () => {
      try {
        const data = await window.__aiext.storage.getLocal([STORAGE_KEY], {});
        const records = (data && data[STORAGE_KEY] && data[STORAGE_KEY].dialogs) || [];
        const kept = records.filter(r => !r.closedAt);
        await window.__aiext.storage.setLocal({ [STORAGE_KEY]: { dialogs: kept } });
        renderEmpty();
      } catch (e) {
        // ignore
      }
    });
  }
});
