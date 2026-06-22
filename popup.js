document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const modelInput = document.getElementById('model');
  const modelList = document.getElementById('modelList');
  const baseUrlInput = document.getElementById('baseUrl');
  const modelHint = document.getElementById('modelHint');
  const fetchModelsBtn = document.getElementById('fetchModelsBtn');
  const statusEl = document.getElementById('status');
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

  function normalizeBaseUrl(url) {
    let normalized = url.trim().replace(/\/+$/, '');
    if (!/\/v\d+$/i.test(normalized)) {
      normalized += '/v1';
    }
    return normalized;
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

    chrome.storage.sync.get(['apiKey', 'model', 'baseUrl', 'quickPrompts', 'defaultPin', 'showFloating'], (result) => {
    if (result.apiKey) apiKeyInput.value = result.apiKey;
    if (result.baseUrl) baseUrlInput.value = result.baseUrl;
    if (result.model) modelInput.value = result.model;
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
    promptsList.innerHTML = quickPrompts.map((p, i) => `
      <div class="prompt-item" data-index="${i}">
        <span class="prompt-drag" draggable="true">⠿</span>
        <span class="prompt-text" title="${escapeHtml(editTooltip)}">${escapeHtml(p)}</span>
        <button class="prompt-remove" data-index="${i}">&times;</button>
      </div>
    `).join('');

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

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

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
      const url = normalizeBaseUrl(baseUrl) + '/models';
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const models = (data.data || data.models || []).map(m => m.id || m.name).filter(Boolean).sort();

      if (models.length === 0) {
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
    chrome.storage.sync.set({ apiKey, model, baseUrl, quickPrompts, defaultPin, showFloating }, () => {
      showStatus(chrome.i18n.getMessage('statusAutoSaved'), 'success');
    });
    // Clear persisted conversations — they belong to the previous config.
    try {
      chrome.storage.local.remove('aiext_dialogs_v1');
    } catch (e) { /* ignore */ }
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

  function escapeHtmlRecent(s) {
    if (typeof s !== 'string') return '';
    return s.replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
  }

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
        const data = await chrome.storage.local.get([STORAGE_KEY]);
        const records = (data && data[STORAGE_KEY] && data[STORAGE_KEY].dialogs) || [];
        const now = Date.now();
        const TTL_MS = 7 * 24 * 3600 * 1000;
        const closed = records
          .filter(r => r && r.closedAt && (now - r.closedAt) < TTL_MS)
          .sort((a, b) => b.closedAt - a.closedAt)
          .slice(0, 10)
          .map(r => {
            const last = Array.isArray(r.conversationHistory) && r.conversationHistory.length > 0
              ? r.conversationHistory[r.conversationHistory.length - 1]
              : null;
            let preview = '';
            if (last && last.content) {
              if (typeof last.content === 'string') preview = last.content;
              else if (Array.isArray(last.content)) {
                preview = last.content.filter(p => p && p.type === 'text').map(p => p.text).join(' ');
              }
            }
            return {
              id: r.id,
              hostname: r.hostname || '',
              closedAt: r.closedAt,
              messageCount: Array.isArray(r.conversationHistory) ? r.conversationHistory.length : 0,
              preview: preview.slice(0, 120),
              model: r.model || ''
            };
          });
        renderClosedList(closed);
      } catch (e) {
        renderEmpty();
      }
      return;
    }
    renderClosedList(res.items || []);
  }

  function renderEmpty() {
    recentClosedList.innerHTML = `<div class="recent-closed-empty">${escapeHtmlRecent(chrome.i18n.getMessage('recentClosedEmpty'))}</div>`;
  }

  function renderClosedList(items) {
    if (!Array.isArray(items) || items.length === 0) {
      renderEmpty();
      return;
    }
    const html = items.map(item => {
      const preview = item.preview || '';
      const host = item.hostname || '';
      const dateStr = formatRelativeTime(item.closedAt);
      const meta = [
        item.messageCount ? `${item.messageCount} msg` : '',
        item.model || ''
      ].filter(Boolean).join(' · ');
      return `
        <div class="recent-closed-item" data-persist-id="${escapeHtmlRecent(item.id)}">
          <div class="recent-closed-item-body">
            <div class="recent-closed-item-top">
              <span class="recent-closed-item-host">${escapeHtmlRecent(host)}</span>
              <span class="recent-closed-item-date">${escapeHtmlRecent(dateStr)}</span>
            </div>
            ${preview ? `<div class="recent-closed-item-preview">${escapeHtmlRecent(preview)}</div>` : ''}
            ${meta ? `<div class="recent-closed-item-meta">${escapeHtmlRecent(meta)}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
    recentClosedList.innerHTML = html;
    recentClosedList.querySelectorAll('.recent-closed-item').forEach(el => {
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
        const data = await chrome.storage.local.get([STORAGE_KEY]);
        const records = (data && data[STORAGE_KEY] && data[STORAGE_KEY].dialogs) || [];
        const kept = records.filter(r => !r.closedAt);
        await chrome.storage.local.set({ [STORAGE_KEY]: { dialogs: kept } });
        renderEmpty();
      } catch (e) {
        // ignore
      }
    });
  }
});
