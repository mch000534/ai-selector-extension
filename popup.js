document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const modelInput = document.getElementById('model');
  const modelList = document.getElementById('modelList');
  const baseUrlInput = document.getElementById('baseUrl');
  const modelHint = document.getElementById('modelHint');
  const fetchModelsBtn = document.getElementById('fetchModelsBtn');
  const saveBtn = document.getElementById('saveBtn');
  const statusEl = document.getElementById('status');
  const promptsList = document.getElementById('promptsList');
  const newPromptInput = document.getElementById('newPrompt');
  const addPromptBtn = document.getElementById('addPromptBtn');

  const defaultPinCheckbox = document.getElementById('defaultPin');

  let quickPrompts = [];

  chrome.storage.sync.get(['apiKey', 'model', 'baseUrl', 'quickPrompts', 'defaultPin'], (result) => {
    if (result.apiKey) apiKeyInput.value = result.apiKey;
    if (result.baseUrl) baseUrlInput.value = result.baseUrl;
    if (result.model) modelInput.value = result.model;
    defaultPinCheckbox.checked = result.defaultPin !== false;
    quickPrompts = result.quickPrompts || [];
    renderPrompts();
  });

  function renderPrompts() {
    promptsList.innerHTML = quickPrompts.map((p, i) => `
      <div class="prompt-item">
        <span class="prompt-text">${escapeHtml(p)}</span>
        <button class="prompt-remove" data-index="${i}">&times;</button>
      </div>
    `).join('');

    promptsList.querySelectorAll('.prompt-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        quickPrompts.splice(index, 1);
        renderPrompts();
      });
    });
  }

  function addPrompt() {
    const text = newPromptInput.value.trim();
    if (text && quickPrompts.length < 10) {
      quickPrompts.push(text);
      newPromptInput.value = '';
      renderPrompts();
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
      const url = baseUrl.replace(/\/+$/, '') + '/models';
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

  saveBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    const model = modelInput.value.trim();
    const baseUrl = baseUrlInput.value.trim();
    const defaultPin = defaultPinCheckbox.checked;

    if (!apiKey) { showStatus('請輸入 API Key', 'error'); return; }
    if (!baseUrl) { showStatus('請輸入 API Base URL', 'error'); return; }
    if (!model) { showStatus('請輸入模型名稱', 'error'); return; }

    chrome.storage.sync.set({ apiKey, model, baseUrl, quickPrompts, defaultPin }, () => {
      showStatus('設定已儲存！', 'success');
    });
  });

  function showStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = 'status ' + type;
    setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'status'; }, 3000);
  }
});
