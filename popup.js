document.addEventListener('DOMContentLoaded', () => {
  const { normalizeBaseUrl } = window.__aiext.utils;
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
  const profileSelect = document.getElementById('profile');
  const saveProfileBtn = document.getElementById('saveProfileBtn');
  const deleteProfileBtn = document.getElementById('deleteProfileBtn');

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

    // API keys live in storage.local (this device); the rest stays in sync.
    await window.__aiext.storage.ensureLocalApiKey();
    const [syncResult, localResult] = await Promise.all([
      window.__aiext.storage.getSync(['model', 'baseUrl', 'quickPrompts', 'defaultPin', 'showFloating'], {}),
      window.__aiext.storage.getLocal(['apiKey'], {}),
    ]);
    const result = { ...syncResult, apiKey: (localResult && localResult.apiKey) || syncResult.apiKey || '' };
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
    await loadProfiles();
    await loadBuiltInActions();
  });

  providerSelect.addEventListener('change', () => {
    const key = providerSelect.value;
    if (key === 'custom' || !PROVIDERS[key]) return;
    const { baseUrl, model } = PROVIDERS[key];
    baseUrlInput.value = baseUrl;
    modelInput.value = model;
    updateBaseUrlHint();
    save();
  });

  // ─── Provider profiles (per-endpoint keys in storage.local) ───
  let profiles = [];

  // ─── Built-in quick actions (independent of the prompt quota) ───
  const builtInList = document.getElementById('builtInList');

  async function loadBuiltInActions() {
    if (!builtInList || !window.__aiext.actions) return;
    const data = await window.__aiext.storage.getSync(['builtInActions'], {});
    const enabled = new Set(window.__aiext.actions.normalizeEnabledIds(data.builtInActions));
    builtInList.textContent = '';
    window.__aiext.actions.DEFINITIONS.forEach(def => {
      const label = document.createElement('label');
      label.className = 'toggle-label';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = enabled.has(def.id);
      box.dataset.action = def.id;
      box.addEventListener('change', async () => {
        const ids = Array.from(builtInList.querySelectorAll('input[data-action]:checked'))
          .map(el => el.dataset.action);
        // normalizeEnabledIds falls back to all when empty; an explicit
        // empty selection is preserved so users can disable the whole group.
        await window.__aiext.storage.setSync({ builtInActions: ids });
      });
      const text = document.createElement('span');
      text.textContent = chrome.i18n.getMessage(def.labelKey) || def.id;
      label.appendChild(box);
      label.appendChild(text);
      builtInList.appendChild(label);
    });
  }

  async function persistProfiles() {
    await window.__aiext.storage.setLocal({ [window.__aiext.profiles.STORAGE_KEY]: profiles });
  }

  function renderProfileOptions(selectedId) {
    if (!profileSelect) return;
    profileSelect.textContent = '';
    profiles.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.model ? `${p.name} · ${p.model}` : p.name;
      profileSelect.appendChild(opt);
    });
    if (selectedId && profiles.some(p => p.id === selectedId)) {
      profileSelect.value = selectedId;
    } else {
      const match = profiles.find(p => p.baseUrl === baseUrlInput.value.trim());
      profileSelect.value = match ? match.id : '';
    }
  }

  function applyProfile(id) {
    const p = window.__aiext.profiles.findProfile(profiles, id);
    if (!p) return;
    apiKeyInput.value = p.apiKey || '';
    baseUrlInput.value = p.baseUrl || '';
    modelInput.value = p.model || '';
    providerSelect.value = detectProvider(p.baseUrl);
    updateBaseUrlHint();
    save();
  }

  async function loadProfiles() {
    const data = await window.__aiext.storage.getLocal([window.__aiext.profiles.STORAGE_KEY], {});
    profiles = window.__aiext.profiles.normalizeProfiles(data && data[window.__aiext.profiles.STORAGE_KEY]);
    if (profiles.length === 0) {
      // Seed one profile from the current connection so existing users keep
      // one-click switching without re-entering credentials.
      const baseUrl = baseUrlInput.value.trim();
      if (baseUrl) {
        const seeded = window.__aiext.profiles.upsertProfile([], {
          baseUrl,
          apiKey: apiKeyInput.value.trim(),
          model: modelInput.value.trim(),
        });
        profiles = seeded.profiles;
        await persistProfiles();
      }
    }
    renderProfileOptions();
  }

  if (profileSelect) {
    profileSelect.addEventListener('change', () => {
      if (profileSelect.value) applyProfile(profileSelect.value);
    });
  }
  if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', async () => {
      const baseUrl = baseUrlInput.value.trim();
      if (!baseUrl) {
        showStatus(chrome.i18n.getMessage('statusNeedUrlAndKey'), 'error');
        return;
      }
      const { profiles: next, id } = window.__aiext.profiles.upsertProfile(profiles, {
        baseUrl,
        apiKey: apiKeyInput.value.trim(),
        model: modelInput.value.trim(),
      });
      profiles = next;
      await persistProfiles();
      renderProfileOptions(id);
      showStatus(chrome.i18n.getMessage('statusAutoSaved'), 'success');
    });
  }
  if (deleteProfileBtn) {
    deleteProfileBtn.addEventListener('click', async () => {
      const id = profileSelect && profileSelect.value;
      if (!id) return;
      profiles = window.__aiext.profiles.deleteProfile(profiles, id);
      await persistProfiles();
      renderProfileOptions();
      showStatus(chrome.i18n.getMessage('statusAutoSaved'), 'success');
    });
  }

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
    // Keys stay on this device (local); the rest roams via sync.
    Promise.all([
      window.__aiext.storage.setLocal({ apiKey }),
      window.__aiext.storage.setSync({ model, baseUrl, quickPrompts, defaultPin, showFloating }),
    ]).then(() => {
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

  // ─── Conversation manager ───
  // Lists every stored record (open + closed, all hosts) with search,
  // rename, export and batch delete. Reads storage directly; only Restore
  // needs the live tab's content script.
  const convBtn = document.getElementById('convBtn');
  const convSection = document.getElementById('convSection');
  const convSearch = document.getElementById('convSearch');
  const convList = document.getElementById('convList');
  const convDeleteSelected = document.getElementById('convDeleteSelected');
  const STORAGE_KEY = 'aiext_dialogs_v1';
  const CONV_LIST_CAP = 50;

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

  let convRecords = [];

  async function loadConvRecords() {
    try {
      const data = await window.__aiext.storage.getLocal([STORAGE_KEY], {});
      const records = (data && data[STORAGE_KEY] && data[STORAGE_KEY].dialogs) || [];
      convRecords = records.filter(r => r && r.id);
    } catch (e) {
      convRecords = [];
    }
  }

  async function writeConvRecords() {
    await window.__aiext.storage.setLocal({ [STORAGE_KEY]: { dialogs: convRecords } });
  }

  function convMatches(rec, q) {
    if (!q) return true;
    const item = chat.buildClosedListItem(rec);
    const hay = `${chat.deriveTitle(rec)} ${item ? item.preview : ''} ${rec.hostname || ''} ${rec.model || ''}`.toLowerCase();
    return hay.includes(q);
  }

  function updateDeleteSelected() {
    if (!convDeleteSelected) return;
    const n = convList.querySelectorAll('.conv-select:checked').length;
    convDeleteSelected.disabled = n === 0;
  }

  function renderConvList() {
    const q = ((convSearch && convSearch.value) || '').trim().toLowerCase();
    convList.textContent = '';
    const shown = convRecords
      .slice()
      .sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0))
      .slice(0, CONV_LIST_CAP)
      .filter(r => convMatches(r, q));
    if (shown.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'conv-empty';
      empty.textContent = chrome.i18n.getMessage('conversationsEmpty');
      convList.appendChild(empty);
    }
    shown.forEach(rec => renderConvItem(rec));
    updateDeleteSelected();
  }

  function sanitizeFilename(s) {
    const clean = String(s || 'conversation').replace(/[^\w\-]+/g, '_').slice(0, 40);
    return clean || 'conversation';
  }

  function downloadFile(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function copyText(text) {
    const done = ok => showStatus(
      ok ? chrome.i18n.getMessage('statusAutoSaved') : 'copy failed',
      ok ? 'success' : 'error'
    );
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => done(true)).catch(() => done(false));
      return;
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      done(!!ok);
    } catch (e) {
      done(false);
    }
  }

  function renderConvItem(rec) {
    const item = chat.buildClosedListItem(rec) || {
      id: rec.id, hostname: rec.hostname || '', preview: '',
      messageCount: 0, model: rec.model || '', closedAt: 0, lastActive: 0, url: ''
    };
    const isOpen = !rec.closedAt;
    const title = chat.deriveTitle(rec) || item.preview.slice(0, 40) || rec.hostname || '';
    const dateTs = rec.closedAt || rec.lastActive || rec.createdAt || 0;

    const el = document.createElement('div');
    el.className = 'conv-item';
    el.dataset.persistId = rec.id || '';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'conv-select';
    checkbox.setAttribute('aria-label', 'select');
    checkbox.addEventListener('change', updateDeleteSelected);
    el.appendChild(checkbox);

    const body = document.createElement('div');
    body.className = 'conv-item-body';
    el.appendChild(body);

    const top = document.createElement('div');
    top.className = 'conv-item-top';
    body.appendChild(top);

    const titleEl = document.createElement('span');
    titleEl.className = 'conv-item-title';
    titleEl.textContent = title;
    titleEl.title = chrome.i18n.getMessage('conversationsRename');
    titleEl.addEventListener('click', () => startConvRename(rec.id, titleEl));
    top.appendChild(titleEl);

    const badge = document.createElement('span');
    badge.className = 'conv-badge ' + (isOpen ? 'conv-badge-open' : 'conv-badge-closed');
    badge.textContent = chrome.i18n.getMessage(isOpen ? 'conversationsOpenBadge' : 'conversationsClosedBadge');
    top.appendChild(badge);

    const dateEl = document.createElement('span');
    dateEl.className = 'conv-item-date';
    dateEl.textContent = formatRelativeTime(dateTs);
    top.appendChild(dateEl);

    const hostLine = [rec.hostname || '', item.messageCount ? `${item.messageCount} msg` : '', rec.model || '']
      .filter(Boolean).join(' · ');
    if (hostLine) {
      const hostEl = document.createElement('div');
      hostEl.className = 'conv-item-host';
      hostEl.textContent = hostLine;
      body.appendChild(hostEl);
    }
    if (item.preview) {
      const previewEl = document.createElement('div');
      previewEl.className = 'conv-item-preview';
      previewEl.textContent = item.preview;
      body.appendChild(previewEl);
    }

    const actions = document.createElement('div');
    actions.className = 'conv-item-actions';
    body.appendChild(actions);

    function mkAction(label, fn, danger) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'conv-action' + (danger ? ' conv-action-danger' : '');
      b.textContent = label;
      b.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await fn();
      });
      actions.appendChild(b);
    }

    if (!isOpen) {
      mkAction(chrome.i18n.getMessage('conversationsRestore'), async () => {
        const res = await sendToActiveTab({ action: 'restoreClosedDialog', persistId: rec.id });
        if (res && res.ok) {
          await loadConvRecords();
          renderConvList();
          showStatus(chrome.i18n.getMessage('statusAutoSaved'), 'success');
        } else {
          showStatus((res && res.error) || 'restore failed', 'error');
        }
      });
    }
    mkAction(chrome.i18n.getMessage('conversationsExportMd'), async () => {
      downloadFile(`${sanitizeFilename(title)}.md`, chat.buildConversationMarkdown(rec), 'text/markdown');
    });
    mkAction(chrome.i18n.getMessage('conversationsCopyMd'), async () => {
      copyText(chat.buildConversationMarkdown(rec));
    });
    mkAction(chrome.i18n.getMessage('conversationsExportJson'), async () => {
      downloadFile(`${sanitizeFilename(title)}.json`, JSON.stringify(rec, null, 2), 'application/json');
    });
    mkAction(chrome.i18n.getMessage('conversationsDelete'), async () => {
      convRecords = convRecords.filter(r => r.id !== rec.id);
      await writeConvRecords();
      renderConvList();
    }, true);

    convList.appendChild(el);
  }

  function startConvRename(id, titleEl) {
    const rec = convRecords.find(r => r.id === id);
    if (!rec) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'conv-rename-input';
    input.value = chat.deriveTitle(rec);
    titleEl.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    function commit() {
      if (done) return;
      done = true;
      const val = input.value.trim();
      if (val) {
        rec.title = val.slice(0, 80);
        rec.titleExplicit = true;
        writeConvRecords().then(() => renderConvList());
      } else {
        renderConvList();
      }
    }
    function cancel() {
      if (done) return;
      done = true;
      renderConvList();
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', commit);
  }

  if (convBtn && convSection) {
    convBtn.addEventListener('click', async () => {
      const opening = convSection.hasAttribute('hidden');
      if (opening) {
        convSection.removeAttribute('hidden');
        convBtn.classList.add('open');
        await loadConvRecords();
        renderConvList();
      } else {
        convSection.setAttribute('hidden', '');
        convBtn.classList.remove('open');
      }
    });
  }

  if (convSearch) {
    convSearch.addEventListener('input', renderConvList);
  }

  if (convDeleteSelected) {
    convDeleteSelected.addEventListener('click', async () => {
      const checked = convList.querySelectorAll('.conv-select:checked');
      if (checked.length === 0) return;
      const ids = new Set(Array.from(checked).map(box => box.closest('.conv-item').dataset.persistId));
      convRecords = convRecords.filter(r => !ids.has(r.id));
      await writeConvRecords();
      renderConvList();
      showStatus(chrome.i18n.getMessage('statusAutoSaved'), 'success');
    });
  }
});
