(() => {
  const PREFIX = '__aiext_';
  let floatingIcon = null;
  let currentContext = { text: '', images: [] };
  const dialogs = new Map();
  let dialogIdCounter = 0;
  const Z_BASE = 2147483400;
  let topZ = Z_BASE;
  let _hoveredImage = null;
  let _iconHoverTimer = null;

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .${PREFIX}icon {
        all: initial;
        position: fixed !important;
        width: 32px !important;
        height: 32px !important;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
        border-radius: 50% !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2) !important;
        z-index: 2147483647 !important;
        transition: transform 0.15s !important;
        user-select: none !important;
        pointer-events: auto !important;
      }
      .${PREFIX}icon:hover { transform: scale(1.1) !important; }
      .${PREFIX}icon svg { width: 18px; height: 18px; fill: white; pointer-events: none; }
      .${PREFIX}overlay {
        all: initial;
        position: fixed !important;
        top: 0 !important; left: 0 !important;
        width: 100vw !important; height: 100vh !important;
        background: transparent !important;
        pointer-events: auto !important;
      }
      .${PREFIX}dialog {
        all: initial;
        position: fixed !important;
        width: 420px;
        max-height: 90vh !important;
        min-width: 280px !important;
        min-height: 250px !important;
        max-width: 90vw !important;
        background: rgba(255, 255, 255, 0.75) !important;
        backdrop-filter: blur(16px) saturate(180%) !important;
        -webkit-backdrop-filter: blur(16px) saturate(180%) !important;
        border: 1px solid rgba(255, 255, 255, 0.3) !important;
        border-radius: 12px !important;
        box-shadow: 0 8px 32px rgba(0,0,0,0.15) !important;
        display: flex !important;
        flex-direction: column !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        overflow: auto !important;
        pointer-events: auto !important;
        color: #333 !important;
        font-size: 15px !important;
        line-height: 1.5 !important;
        resize: both !important;
      }
      .${PREFIX}header {
        all: unset;
        display: flex !important;
        padding: 10px 12px !important;
        border-bottom: 1px solid #eee !important;
        align-items: center !important;
        flex-shrink: 0 !important;
        box-sizing: border-box !important;
        cursor: move !important;
        user-select: none !important;
        gap: 8px !important;
      }
      .${PREFIX}title {
        all: unset;
        font-size: 16px !important;
        font-weight: 600 !important;
        color: #333 !important;
        flex: 1 !important;
      }
      .${PREFIX}pin {
        all: unset;
        width: 24px !important;
        height: 24px !important;
        cursor: pointer !important;
        font-size: 14px !important;
        color: #bbb !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border-radius: 4px !important;
        transition: color 0.2s, background 0.2s !important;
      }
      .${PREFIX}pin:hover { background: #f5f5f5 !important; color: #666 !important; }
      .${PREFIX}pin-active {
        color: #667eea !important;
        background: #eef0ff !important;
      }
      .${PREFIX}pin-active:hover { background: #dde1ff !important; color: #5a6fd6 !important; }
      .${PREFIX}model-input {
        all: unset;
        font-size: 12px !important;
        padding: 2px 6px !important;
        border: 1px solid #ddd !important;
        border-radius: 4px !important;
        color: #555 !important;
        background: #fff !important;
        max-width: 140px !important;
        outline: none !important;
      }
      .${PREFIX}model-input:focus { border-color: #667eea !important; }
      .${PREFIX}close {
        all: unset;
        width: 24px !important;
        height: 24px !important;
        cursor: pointer !important;
        font-size: 18px !important;
        color: #999 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border-radius: 4px !important;
      }
      .${PREFIX}close:hover { background: #f5f5f5 !important; color: #666 !important; }
      .${PREFIX}selected {
        all: unset;
        display: block !important;
        padding: 10px 16px !important;
        background: #f8f9fa !important;
        border-bottom: 1px solid #eee !important;
        flex-shrink: 0 !important;
        box-sizing: border-box !important;
      }
      .${PREFIX}selected-label {
        all: unset;
        display: block !important;
        font-size: 12px !important;
        color: #888 !important;
        margin-bottom: 4px !important;
      }
      .${PREFIX}selected-text {
        all: unset;
        display: block !important;
        font-size: 14px !important;
        color: #555 !important;
        max-height: 60px !important;
        overflow-y: auto !important;
        line-height: 1.4 !important;
      }
      .${PREFIX}selected-images {
        all: unset;
        display: flex !important;
        gap: 6px !important;
        margin-top: 6px !important;
        flex-wrap: wrap !important;
      }
      .${PREFIX}selected-img {
        all: unset;
        display: block !important;
        max-height: 60px !important;
        max-width: 80px !important;
        border-radius: 4px !important;
        object-fit: cover !important;
        border: 1px solid #ddd !important;
      }
      .${PREFIX}messages {
        all: unset;
        display: block !important;
        flex: 1 !important;
        overflow-y: auto !important;
        padding: 12px 16px !important;
        min-height: 80px !important;
        box-sizing: border-box !important;
      }
      .${PREFIX}msg {
        all: unset;
        display: block !important;
        margin-bottom: 12px !important;
      }
      .${PREFIX}msg-user { text-align: right !important; }
      .${PREFIX}bubble {
        all: unset;
        display: inline-block !important;
        padding: 8px 12px !important;
        border-radius: 8px !important;
        font-size: 15px !important;
        line-height: 1.5 !important;
        max-width: 85% !important;
        text-align: left !important;
        word-wrap: break-word !important;
        box-sizing: border-box !important;
      }
      .${PREFIX}msg-user .${PREFIX}bubble {
        background: #667eea !important;
        color: white !important;
      }
      .${PREFIX}msg-assistant .${PREFIX}bubble {
        background: #f0f2f5 !important;
        color: #333 !important;
      }
      .${PREFIX}msg-assistant .${PREFIX}bubble pre {
        background: #1e1e1e !important;
        color: #d4d4d4 !important;
        padding: 8px !important;
        border-radius: 4px !important;
        overflow-x: auto !important;
        font-size: 13px !important;
        margin: 4px 0 !important;
      }
      .${PREFIX}msg-assistant .${PREFIX}bubble code {
        background: #e0e0e0 !important;
        padding: 1px 4px !important;
        border-radius: 3px !important;
        font-size: 13px !important;
      }
      .${PREFIX}msg-assistant .${PREFIX}bubble pre code {
        background: none !important;
        padding: 0 !important;
      }
      .${PREFIX}input-row {
        all: unset;
        display: flex !important;
        padding: 12px 16px !important;
        border-top: 1px solid #eee !important;
        gap: 8px !important;
        flex-shrink: 0 !important;
        box-sizing: border-box !important;
      }
      .${PREFIX}input {
        all: unset;
        flex: 1 !important;
        padding: 8px 12px !important;
        border: 1px solid #ddd !important;
        border-radius: 6px !important;
        font-size: 15px !important;
        box-sizing: border-box !important;
        color: #333 !important;
        background: #fff !important;
      }
      .${PREFIX}input:focus { border-color: #667eea !important; }
      .${PREFIX}send {
        all: unset;
        padding: 8px 16px !important;
        background: #667eea !important;
        color: white !important;
        border-radius: 6px !important;
        font-size: 15px !important;
        cursor: pointer !important;
        box-sizing: border-box !important;
      }
      .${PREFIX}send:hover { background: #5a6fd6 !important; }
      .${PREFIX}send:disabled { background: #ccc !important; cursor: not-allowed !important; }
      .${PREFIX}prompts {
        all: unset;
        display: flex !important;
        flex-wrap: wrap !important;
        gap: 6px !important;
        padding: 8px 16px !important;
        border-top: 1px solid #eee !important;
        box-sizing: border-box !important;
      }
      .${PREFIX}prompt-chip {
        all: unset;
        display: inline-block !important;
        padding: 4px 10px !important;
        background: #f0f2f5 !important;
        color: #555 !important;
        border-radius: 12px !important;
        font-size: 13px !important;
        cursor: pointer !important;
        white-space: nowrap !important;
        transition: background 0.2s !important;
      }
      .${PREFIX}prompt-chip:hover { background: #e0e3e8 !important; color: #333 !important; }
      .${PREFIX}error {
        all: unset;
        display: block !important;
        color: #e74c3c !important;
        font-size: 12px !important;
        padding: 8px 12px !important;
        background: #fdeaea !important;
        border-radius: 6px !important;
        margin-bottom: 8px !important;
      }
      .${PREFIX}warning {
        all: unset;
        display: block !important;
        padding: 20px !important;
        text-align: center !important;
        color: #666 !important;
        font-size: 13px !important;
      }
      .${PREFIX}typing {
        display: inline-flex !important;
        gap: 4px !important;
        padding: 8px 12px !important;
      }
      .${PREFIX}dot {
        all: unset;
        display: block !important;
        width: 6px !important;
        height: 6px !important;
        background: #999 !important;
        border-radius: 50% !important;
        animation: ${PREFIX}bounce 1.4s infinite !important;
      }
      .${PREFIX}dot:nth-child(2) { animation-delay: 0.2s !important; }
      .${PREFIX}dot:nth-child(3) { animation-delay: 0.4s !important; }
      @keyframes ${PREFIX}bounce {
        0%, 60%, 100% { transform: translateY(0); }
        30% { transform: translateY(-4px); }
      }
    `;
    document.head.appendChild(style);
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  async function imageToDataURL(imgEl) {
    try {
      const src = imgEl.src || imgEl.getAttribute('src');
      if (!src) return null;
      if (src.startsWith('data:')) return src;

      const res = await fetch(src, { mode: 'cors' });
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      return null;
    }
  }

  async function extractContextFromSelection(sel) {
    const text = sel.toString().trim();
    const images = [];

    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const fragment = range.cloneContents();
      const imgEls = fragment.querySelectorAll('img');
      for (const img of imgEls) {
        if (images.length >= 4) break;
        const dataURL = await imageToDataURL(img);
        if (dataURL) images.push(dataURL);
      }
    }

    return { text, images };
  }

  function renderMarkdown(text) {
    if (!text) return '';
    let html = escapeHtml(text);
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  function getConfig() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['apiKey', 'model', 'baseUrl'], resolve);
    });
  }

  function getQuickPrompts() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['quickPrompts'], (result) => {
        resolve(result.quickPrompts || []);
      });
    });
  }

  function isOurElement(el) {
    while (el) {
      if (el.getAttribute && el.getAttribute('data-aiext')) return true;
      el = el.parentElement;
    }
    return false;
  }

  // ─── Floating Icon ───
  function showFloatingIcon(x, y, imgEl) {
    hideFloatingIcon();
    floatingIcon = document.createElement('div');
    floatingIcon.className = `${PREFIX}icon`;
    floatingIcon.setAttribute('data-aiext', '1');
    floatingIcon.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2z"/></svg>`;

    if (imgEl) {
      floatingIcon.addEventListener('mouseenter', () => {
        if (_iconHoverTimer) { clearTimeout(_iconHoverTimer); _iconHoverTimer = null; }
      });
      floatingIcon.addEventListener('mouseleave', () => {
        _iconHoverTimer = setTimeout(() => { hideFloatingIcon(); _hoveredImage = null; }, 200);
      });
    }

    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    let posX = x + 8;
    let posY = y + 8;
    if (posX + 40 > viewW) posX = x - 40;
    if (posY + 40 > viewH) posY = y - 40;
    floatingIcon.style.left = posX + 'px';
    floatingIcon.style.top = posY + 'px';

    floatingIcon.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    floatingIcon.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (imgEl) {
        (async () => {
          const src = await imageToDataURL(imgEl);
          currentContext = { text: '', images: src ? [src] : [] };
          openDialog();
        })();
      } else {
        openDialog();
      }
    });

    document.body.appendChild(floatingIcon);
  }

  function hideFloatingIcon() {
    if (floatingIcon) {
      floatingIcon.remove();
      floatingIcon = null;
    }
  }

  // ─── Dialog Instance ───
  function createDialog(config, rect, quickPrompts, context) {
    const id = ++dialogIdCounter;
    const state = {
      id,
      config,
      context: context || { text: '', images: [] },
      conversationHistory: [],
      isStreaming: false,
      isPinned: false,
      isDragging: false,
      dragOffsetX: 0,
      dragOffsetY: 0,
      overlay: null,
      dialog: null,
    };

    // Overlay
    state.overlay = document.createElement('div');
    state.overlay.className = `${PREFIX}overlay`;
    state.overlay.setAttribute('data-aiext', '1');
    state.overlay.addEventListener('click', () => closeDialog(id));

    // Dialog
    const ctx = state.context;
    const hasContent = ctx.text || (ctx.images && ctx.images.length > 0);
    state.dialog = document.createElement('div');
    state.dialog.className = `${PREFIX}dialog`;
    state.dialog.setAttribute('data-aiext', '1');
    state.dialog.dataset.dialogId = id;
    state.dialog.innerHTML = `
      <div class="${PREFIX}header" data-aiext="1">
        <span class="${PREFIX}title">AI 劃詞助手</span>
        <input class="${PREFIX}model-input" data-aiext="1" type="text" list="${PREFIX}model-list-${id}" value="${config.model || ''}" placeholder="模型" title="輸入或選擇模型" autocomplete="off">
        <datalist id="${PREFIX}model-list-${id}"></datalist>
        <span class="${PREFIX}pin" data-aiext="1" title="固定視窗">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>
        </span>
        <span class="${PREFIX}close" data-aiext="1">&times;</span>
      </div>
      ${hasContent ? `
      <div class="${PREFIX}selected">
        ${ctx.text ? `<div class="${PREFIX}selected-label">選取文字</div><div class="${PREFIX}selected-text">${escapeHtml(ctx.text.length > 200 ? ctx.text.slice(0, 200) + '...' : ctx.text)}</div>` : ''}
        ${ctx.images && ctx.images.length > 0 ? `<div class="${PREFIX}selected-label">${ctx.text ? '' : '選取'}圖片</div><div class="${PREFIX}selected-images">${ctx.images.map(src => `<img class="${PREFIX}selected-img" src="${src}" data-aiext="1">`).join('')}</div>` : ''}
      </div>` : ''}
      <div class="${PREFIX}messages"></div>
      ${quickPrompts && quickPrompts.length > 0 ? `
      <div class="${PREFIX}prompts">
        ${quickPrompts.map((p, i) => `<span class="${PREFIX}prompt-chip" data-aiext="1" data-prompt-index="${i}">${escapeHtml(p)}</span>`).join('')}
      </div>` : ''}
      <div class="${PREFIX}input-row">
        <input class="${PREFIX}input" type="text" placeholder="輸入你的問題..." data-aiext="1" />
        <button class="${PREFIX}send" data-aiext="1">發送</button>
      </div>
    `;

    // Position
    if (rect) {
      let left = rect.left + dialogs.size * 30;
      let top = rect.bottom + 8 + dialogs.size * 30;
      if (left + 420 > window.innerWidth) left = Math.max(10, window.innerWidth - 440);
      if (top + 400 > window.innerHeight) top = Math.max(10, rect.top - 420);
      state.dialog.style.left = left + 'px';
      state.dialog.style.top = top + 'px';
    } else {
      state.dialog.style.right = (20 + dialogs.size * 30) + 'px';
      state.dialog.style.top = (80 + dialogs.size * 30) + 'px';
    }

    document.body.appendChild(state.overlay);
    document.body.appendChild(state.dialog);
    dialogs.set(id, state);

    // Events
    state.dialog.querySelector(`.${PREFIX}close`).addEventListener('click', () => closeDialog(id));
    state.dialog.querySelector(`.${PREFIX}pin`).addEventListener('click', () => togglePin(id));

    setupDrag(id);
    bringToFront(id);

    state.dialog.addEventListener('mousedown', () => {
      if (!state.isDragging && state.zIndex !== topZ) bringToFront(id);
    });

    const modelInput = state.dialog.querySelector(`.${PREFIX}model-input`);
    modelInput.addEventListener('input', () => {
      state.config.model = modelInput.value.trim();
    });
    modelInput.addEventListener('mousedown', (e) => e.stopPropagation());
    fetchModelsForDialog(id);

    const input = state.dialog.querySelector(`.${PREFIX}input`);
    const sendBtn = state.dialog.querySelector(`.${PREFIX}send`);

    sendBtn.addEventListener('click', () => sendMessage(id));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(id);
      }
      if (e.key === 'Escape' && !state.isPinned) closeDialog(id);
    });

    const promptChips = state.dialog.querySelectorAll(`.${PREFIX}prompt-chip`);
    promptChips.forEach((chip, i) => {
      chip.addEventListener('click', () => {
        if (quickPrompts && quickPrompts[i]) {
          input.value = quickPrompts[i];
          input.focus();
        }
      });
    });

    setTimeout(() => input.focus(), 50);
    return id;
  }

  function closeDialog(id) {
    const state = dialogs.get(id);
    if (!state) return;
    if (state.overlay) state.overlay.remove();
    if (state.dialog) state.dialog.remove();
    dialogs.delete(id);
  }

  function bringToFront(id) {
    const state = dialogs.get(id);
    if (!state) return;
    topZ++;
    state.zIndex = topZ;
    state.dialog.style.zIndex = topZ;
    if (state.overlay) state.overlay.style.zIndex = topZ - 1;
  }

  function closeAllDialogs() {
    for (const id of dialogs.keys()) closeDialog(id);
  }

  function togglePin(id) {
    const state = dialogs.get(id);
    if (!state) return;
    state.isPinned = !state.isPinned;
    const pinBtn = state.dialog.querySelector(`.${PREFIX}pin`);
    if (state.isPinned) {
      pinBtn.classList.add(`${PREFIX}pin-active`);
      if (state.overlay) { state.overlay.remove(); state.overlay = null; }
    } else {
      pinBtn.classList.remove(`${PREFIX}pin-active`);
      state.overlay = document.createElement('div');
      state.overlay.className = `${PREFIX}overlay`;
      state.overlay.setAttribute('data-aiext', '1');
      state.overlay.addEventListener('click', () => closeDialog(id));
      state.overlay.style.zIndex = (state.zIndex || topZ) - 1;
      document.body.insertBefore(state.overlay, state.dialog);
    }
  }

  function setupDrag(id) {
    const state = dialogs.get(id);
    if (!state) return;
    const headerEl = state.dialog.querySelector(`.${PREFIX}header`);

    headerEl.addEventListener('mousedown', (e) => {
      if (e.target.closest(`.${PREFIX}pin`) || e.target.closest(`.${PREFIX}close`)) return;
      if (e.target.closest(`.${PREFIX}model-input`)) return;
      state.isDragging = true;
      const rect = state.dialog.getBoundingClientRect();
      state.dragOffsetX = e.clientX - rect.left;
      state.dragOffsetY = e.clientY - rect.top;
      e.preventDefault();
    });
  }

  async function fetchModelsForDialog(id) {
    const state = dialogs.get(id);
    if (!state) return;
    const { baseUrl, apiKey } = state.config;
    if (!baseUrl || !apiKey) return;

    const datalist = state.dialog.querySelector(`#${PREFIX}model-list-${id}`);
    if (!datalist) return;

    try {
      const url = baseUrl.replace(/\/+$/, '') + '/models';
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` } });
      if (!res.ok) return;
      const data = await res.json();
      const models = (data.data || data.models || []).map(m => m.id || m.name).filter(Boolean).sort();
      if (models.length === 0) return;

      datalist.innerHTML = '';
      models.forEach(mid => {
        const opt = document.createElement('option');
        opt.value = mid;
        datalist.appendChild(opt);
      });
    } catch (e) {}
  }

  // Global drag handler
  document.addEventListener('mousemove', (e) => {
    for (const state of dialogs.values()) {
      if (!state.isDragging) continue;
      let newLeft = e.clientX - state.dragOffsetX;
      let newTop = e.clientY - state.dragOffsetY;
      newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - 100));
      newTop = Math.max(0, Math.min(newTop, window.innerHeight - 50));
      state.dialog.style.left = newLeft + 'px';
      state.dialog.style.top = newTop + 'px';
      state.dialog.style.right = 'auto';
    }
  });

  document.addEventListener('mouseup', () => {
    for (const state of dialogs.values()) state.isDragging = false;
  });

  // ─── ESC handler ───
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      for (const state of dialogs.values()) {
        if (!state.isPinned) { closeDialog(state.id); break; }
      }
    }
  });

  // ─── Messages ───
  function addMessage(id, role, content) {
    const state = dialogs.get(id);
    if (!state) return null;
    const messagesEl = state.dialog.querySelector(`.${PREFIX}messages`);
    if (!messagesEl) return null;
    const msg = document.createElement('div');
    msg.className = `${PREFIX}msg ${PREFIX}msg-${role}`;
    msg.setAttribute('data-aiext', '1');
    const bubble = document.createElement('div');
    bubble.className = `${PREFIX}bubble`;
    if (role === 'assistant') {
      bubble.innerHTML = renderMarkdown(content);
    } else {
      bubble.textContent = content;
    }
    msg.appendChild(bubble);
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return bubble;
  }

  function addTypingIndicator(id) {
    const state = dialogs.get(id);
    if (!state) return null;
    const messagesEl = state.dialog.querySelector(`.${PREFIX}messages`);
    if (!messagesEl) return null;
    const msg = document.createElement('div');
    msg.className = `${PREFIX}msg ${PREFIX}msg-assistant`;
    msg.innerHTML = `<div class="${PREFIX}typing"><div class="${PREFIX}dot"></div><div class="${PREFIX}dot"></div><div class="${PREFIX}dot"></div></div>`;
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return msg;
  }

  // ─── Send Message ───
  async function sendMessage(id) {
    const state = dialogs.get(id);
    if (!state || state.isStreaming) return;

    const input = state.dialog.querySelector(`.${PREFIX}input`);
    const sendBtn = state.dialog.querySelector(`.${PREFIX}send`);
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    addMessage(id, 'user', text);
    state.conversationHistory.push({ role: 'user', content: text });

    state.isStreaming = true;
    sendBtn.disabled = true;

    const typing = addTypingIndicator(id);

    try {
      const ctx = state.context;
      const textPart = `你是一個 AI 助手。${ctx.text ? `用戶選取了以下文字作為上下文：\n"${ctx.text}"\n` : ''}${ctx.images && ctx.images.length > 0 ? `用戶還選取了 ${ctx.images.length} 張圖片作為上下文。` : ''}請基於此上下文回答用戶的問題。如果問題與選取內容無關，也可以直接回答。`;

      const messages = [
        { role: 'system', content: textPart },
      ];

      if (ctx.images && ctx.images.length > 0) {
        const imgContent = [{ type: 'text', text: '以下是用戶選取的圖片上下文：' }];
        for (const img of ctx.images) {
          imgContent.push({ type: 'image_url', image_url: { url: img } });
        }
        messages.push({ role: 'user', content: imgContent });
        messages.push({ role: 'assistant', content: '好的，我已了解這些圖片上下文。請提問。' });
      }

      messages.push(...state.conversationHistory);

      if (typing) typing.remove();

      let response = await callAI(id, state.config, messages);

      // If API rejects multimodal content, retry with text-only
      if (response.error && response.error.includes('400')) {
        const textOnlyMessages = [
          { role: 'system', content: textPart },
          ...state.conversationHistory
        ];
        response = await callAI(id, state.config, textOnlyMessages);
      }

      if (response.error) {
        const messagesEl = state.dialog.querySelector(`.${PREFIX}messages`);
        const errDiv = document.createElement('div');
        errDiv.className = `${PREFIX}error`;
        errDiv.textContent = response.error;
        messagesEl.appendChild(errDiv);
      } else if (response.bubble) {
        response.bubble.innerHTML = renderMarkdown(response.content);
        state.conversationHistory.push({ role: 'assistant', content: response.content });
      } else {
        addMessage(id, 'assistant', response.content);
        state.conversationHistory.push({ role: 'assistant', content: response.content });
      }
    } catch (err) {
      if (typing) typing.remove();
      const messagesEl = state.dialog.querySelector(`.${PREFIX}messages`);
      if (messagesEl) {
        const errDiv = document.createElement('div');
        errDiv.className = `${PREFIX}error`;
        errDiv.textContent = '請求失敗：' + err.message;
        messagesEl.appendChild(errDiv);
      }
    }

    state.isStreaming = false;
    sendBtn.disabled = false;
    input.focus();
  }

  // ─── AI Calls ───
  async function callAI(id, config, messages) {
    const { apiKey, model, baseUrl } = config;
    const url = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '') + '/chat/completions';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model: model || 'gpt-4o', messages, stream: true })
    });
    if (!res.ok) {
      const errText = await res.text();
      return { error: `API 錯誤 ${res.status}: ${errText.slice(0, 200)}` };
    }
    return await readStream(id, res);
  }

  async function readStream(id, res) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    const bubble = addMessage(id, 'assistant', '');
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') break;
        try {
          const delta = JSON.parse(data).choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            if (bubble) bubble.innerHTML = renderMarkdown(fullContent);
            const state = dialogs.get(id);
            const m = state && state.dialog.querySelector(`.${PREFIX}messages`);
            if (m) m.scrollTop = m.scrollHeight;
          }
        } catch (e) {}
      }
    }
    return { content: fullContent, bubble };
  }

  // ─── Open Dialog ───
  async function openDialog() {
    hideFloatingIcon();

    const config = await getConfig();
    if (!config || !config.apiKey) {
      showSettingsWarning();
      return;
    }

    const sel = window.getSelection();
    const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    const rect = range ? range.getBoundingClientRect() : null;
    const quickPrompts = await getQuickPrompts();

    const id = createDialog(config, rect, quickPrompts, currentContext);

    const settings = await new Promise(r => chrome.storage.sync.get(['defaultPin'], r));
    if (settings.defaultPin !== false) togglePin(id);
  }

  function showSettingsWarning() {
    closeAllDialogs();
    const overlay = document.createElement('div');
    overlay.className = `${PREFIX}overlay`;
    overlay.setAttribute('data-aiext', '1');
    overlay.addEventListener('click', () => { overlay.remove(); if (dlg) dlg.remove(); });

    const dlg = document.createElement('div');
    dlg.className = `${PREFIX}dialog`;
    dlg.setAttribute('data-aiext', '1');
    dlg.style.cssText = 'top:50% !important; left:50% !important; transform:translate(-50%,-50%) !important;';
    dlg.innerHTML = `
      <div class="${PREFIX}header" data-aiext="1">
        <span class="${PREFIX}title">AI 劃詞助手</span>
        <span class="${PREFIX}close" data-aiext="1">&times;</span>
      </div>
      <div class="${PREFIX}warning">
        <p>請先設定 API Key</p>
        <p style="margin-top:8px;font-size:12px;">點擊瀏覽器工具列的插件圖示打開設定頁面</p>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(dlg);
    overlay.style.zIndex = 2147483640;
    dlg.style.zIndex = 2147483641;
    dlg.querySelector(`.${PREFIX}close`).addEventListener('click', () => { overlay.remove(); dlg.remove(); });
  }

  // ─── Text Selection ───
  document.addEventListener('mouseup', (e) => {
    if (isOurElement(e.target)) return;

    const hasUnpinned = [...dialogs.values()].some(d => !d.isPinned);
    if (hasUnpinned) return;

    setTimeout(async () => {
      const sel = window.getSelection();
      const text = sel.toString().trim();

      let hasImages = false;
      if (text.length === 0 && sel.rangeCount > 0) {
        const fragment = sel.getRangeAt(0).cloneContents();
        hasImages = fragment.querySelectorAll('img').length > 0;
      }

      if (text.length === 0 && !hasImages) return;

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      currentContext = await extractContextFromSelection(sel);
      showFloatingIcon(rect.right, rect.bottom);
    }, 10);
  });

  document.addEventListener('mousedown', (e) => {
    if (isOurElement(e.target)) return;
    if (floatingIcon) hideFloatingIcon();
  });

  // ─── Image Hover ───
  document.addEventListener('mouseover', (e) => {
    const img = e.target.closest('img');
    if (!img || isOurElement(img)) return;
    if (img.naturalWidth < 20 || img.naturalHeight < 20) return;
    if (img === _hoveredImage) return;
    if (_iconHoverTimer) { clearTimeout(_iconHoverTimer); _iconHoverTimer = null; }
    _hoveredImage = img;
    const rect = img.getBoundingClientRect();
    showFloatingIcon(rect.right, rect.top, img);
  });

  document.addEventListener('mouseout', (e) => {
    const img = e.target.closest('img');
    if (!img || img !== _hoveredImage) return;
    if (_iconHoverTimer) clearTimeout(_iconHoverTimer);
    _iconHoverTimer = setTimeout(() => {
      if (!_hoveredImage) return;
      hideFloatingIcon();
      _hoveredImage = null;
    }, 300);
  });

  // ─── Context Menu ───
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'openDialog') {
      (async () => {
        const sel = window.getSelection();
        if (sel.toString().trim() || (sel.rangeCount > 0 && sel.getRangeAt(0).cloneContents().querySelectorAll('img').length > 0)) {
          currentContext = await extractContextFromSelection(sel);
        } else {
          currentContext = { text: '', images: [] };
        }
        openDialog();
      })();
    } else if (msg.action === 'openDialogWithImage' && msg.srcUrl) {
      (async () => {
        currentContext = { text: '', images: [msg.srcUrl] };
        openDialog();
      })();
    }
  });

  injectStyles();
})();
