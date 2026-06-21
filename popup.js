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
  const baseUrlHint = document.getElementById('baseUrlHint');
  const toggleApiKeyBtn = document.getElementById('toggleApiKey');

  let quickPrompts = [];

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
      ? `有效位址：${normalized}`
      : '';
  }

  chrome.storage.sync.get(['apiKey', 'model', 'baseUrl', 'quickPrompts', 'defaultPin'], (result) => {
    if (result.apiKey) apiKeyInput.value = result.apiKey;
    if (result.baseUrl) baseUrlInput.value = result.baseUrl;
    if (result.model) modelInput.value = result.model;
    defaultPinCheckbox.checked = result.defaultPin !== false;
    quickPrompts = result.quickPrompts || [];
    renderPrompts();
    updateBaseUrlHint();
  });

  function renderPrompts() {
    promptsList.innerHTML = quickPrompts.map((p, i) => `
      <div class="prompt-item" data-index="${i}">
        <span class="prompt-drag" draggable="true">⠿</span>
        <span class="prompt-text" title="點擊編輯">${escapeHtml(p)}</span>
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
      showStatus('請先輸入 Base URL 和 API Key', 'error');
      return;
    }

    fetchModelsBtn.disabled = true;
    fetchModelsBtn.textContent = '...';
    modelHint.textContent = '正在獲取模型列表...';

    try {
      const url = normalizeBaseUrl(baseUrl) + '/models';
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const models = (data.data || data.models || []).map(m => m.id || m.name).filter(Boolean).sort();

      if (models.length === 0) {
        showStatus('未找到模型', 'error');
        return;
      }

      const current = modelInput.value;
      modelList.innerHTML = '';
      models.forEach(id => {
        const opt = document.createElement('option');
        opt.value = id;
        modelList.appendChild(opt);
      });
      modelHint.textContent = `找到 ${models.length} 個模型，可輸入篩選`;
      showStatus('模型列表已更新', 'success');
    } catch (err) {
      showStatus('獲取失敗：' + err.message, 'error');
      modelHint.textContent = '獲取失敗，請檢查 URL 和 Key';
    } finally {
      fetchModelsBtn.disabled = false;
      fetchModelsBtn.textContent = '獲取';
    }
  });

  function save() {
    const apiKey = apiKeyInput.value.trim();
    const model = modelInput.value.trim();
    const baseUrl = baseUrlInput.value.trim();
    const defaultPin = defaultPinCheckbox.checked;
    chrome.storage.sync.set({ apiKey, model, baseUrl, quickPrompts, defaultPin }, () => {
      showStatus('已自動儲存', 'success');
    });
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
});
