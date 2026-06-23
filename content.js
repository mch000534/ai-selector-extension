(() => {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) return;

  let _contextInvalid = false;
  function contextValid() {
    if (_contextInvalid) return false;
    try {
      if (chrome.runtime && chrome.runtime.id == null) {
        _contextInvalid = true;
        return false;
      }
    } catch (e) {
      _contextInvalid = true;
      return false;
    }
    return true;
  }

  const PREFIX = '__aiext_';
  let floatingIcon = null;
  let currentContext = { text: '', images: [] };
  let _showFloating = true;
  const dialogs = new Map();
  let dialogIdCounter = 0;
  const Z_BASE = 2147483400;
  let topZ = Z_BASE;

  function normalizeBaseUrl(url) {
    let normalized = url.trim().replace(/\/+$/, '');
    if (!/\/v\d+$/i.test(normalized)) {
      normalized += '/v1';
    }
    return normalized;
  }

  function t(key, ...args) {
    if (!contextValid() || !chrome.i18n || !chrome.i18n.getMessage) return key;
    try { return chrome.i18n.getMessage(key, args) || key; }
    catch (e) { _contextInvalid = true; return key; }
  }

  const _isRtl = chrome.i18n && chrome.i18n.getUILanguage
    ? ['ar', 'iw', 'fa', 'ur'].some(l => chrome.i18n.getUILanguage().startsWith(l))
    : false;

  function getThemeColors() {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) {
      return {
        bg: '#1a1a2e', bgGlass: 'rgba(26,26,46,0.9)', bgSecondary: '#16213e', bgTertiary: '#0f3460',
        bgInput: '#1e1e3a', bgHover: '#2a2a4a', bgSelected: 'rgba(102,126,234,0.15)',
        text: '#e0e0e0', textSecondary: '#b0b0b0', textMuted: '#808080',
        border: '#2a2a4a', borderLight: '#1e1e3a',
        accent: '#7c8ff0', accentHover: '#8fa0f5', accentActive: '#667eea',
        userBubble: '#5a6fd6', userBubbleText: '#fff',
        assistantBubble: '#1e1e3a', assistantBubbleText: '#e0e0e0',
        codeBg: '#0d0d1a', codeText: '#d4d4d4', inlineCodeBg: '#2a2a4a',
        errorText: '#ff6b6b', errorBg: '#3d1a1a',
        successText: '#6bcf7f', successBg: '#1a3d1a',
        warningText: '#b0b0b0',
        dotColor: '#808080',
        pinActive: '#7c8ff0', pinActiveBg: 'rgba(124,143,240,0.15)',
        chipBg: '#1e1e3a', chipText: '#b0b0b0', chipHoverBg: '#2a2a4a',
        cameraBg: '#1e1e3a', cameraText: '#b0b0b0',
      };
    }
    return {
      bg: '#fff', bgGlass: 'rgba(255,255,255,0.75)', bgSecondary: '#f5f5f5', bgTertiary: '#f9f9f9',
      bgInput: '#fff', bgHover: '#f5f5f5', bgSelected: '#f8f9fa',
      text: '#333', textSecondary: '#666', textMuted: '#999',
      border: '#ddd', borderLight: '#eee',
      accent: '#667eea', accentHover: '#5a6fd6', accentActive: '#667eea',
      userBubble: '#667eea', userBubbleText: 'white',
      assistantBubble: '#f0f2f5', assistantBubbleText: '#333',
      codeBg: '#1e1e1e', codeText: '#d4d4d4', inlineCodeBg: '#e0e0e0',
      errorText: '#e74c3c', errorBg: '#fdeaea',
      successText: '#1a8a3a', successBg: '#d4f4dd',
      warningText: '#666',
      dotColor: '#999',
      pinActive: '#667eea', pinActiveBg: '#eef0ff',
      chipBg: '#f0f2f5', chipText: '#555', chipHoverBg: '#e0e3e8',
      cameraBg: '#f5f5f5', cameraText: '#666',
    };
  }

  let _hoveredImage = null;
  let _shadowHost = null;
  let _shadowRoot = null;
  function _ensureRoot() {
    if (_shadowRoot) return _shadowRoot;
    if (!document.body) return null;
    _shadowHost = document.createElement('div');
    _shadowHost.id = 'aiext-root';
    _shadowHost.setAttribute('data-aiext', '1');
    Object.assign(_shadowHost.style, {
      all: 'initial',
      position: 'static',
      display: 'block',
      width: '0',
      height: '0',
      pointerEvents: 'none',
      zIndex: '0'
    });
    document.body.appendChild(_shadowHost);
    _shadowRoot = _shadowHost.attachShadow({ mode: 'open' });
    return _shadowRoot;
  }
  function _shadow() { return _shadowRoot || _ensureRoot(); }
  function _shadowAppend(el) { const s = _shadow(); if (s) s.appendChild(el); else document.body.appendChild(el); }
  function _shadowQuery(sel) { const s = _shadow(); return s ? s.querySelector(sel) : document.querySelector(sel); }
  function _shadowQueryAll(sel) { const s = _shadow(); return s ? s.querySelectorAll(sel) : document.querySelectorAll(sel); }

  let _iconHoverTimer = null;

  function injectStyles() {
    const root = _shadow();
    const old = root ? root.querySelector('style[data-aiext-styles]') : document.querySelector('style[data-aiext-styles]');
    if (old) old.remove();
    const c = getThemeColors();
    const style = document.createElement('style');
    style.setAttribute('data-aiext-styles', '1');
    style.textContent = `
      .${PREFIX}icon {
        all: initial;
        position: fixed !important;
        width: 32px !important;
        height: 32px !important;
        background: transparent !important;
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
        overflow: hidden !important;
      }
      .${PREFIX}icon:hover { transform: scale(1.1) !important; }
      .${PREFIX}icon img { width: 32px; height: 32px; border-radius: 50%; pointer-events: none; display: block; }
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
        background: ${c.bgGlass} !important;
        backdrop-filter: blur(16px) saturate(180%) !important;
        -webkit-backdrop-filter: blur(16px) saturate(180%) !important;
        border: 1px solid ${c.borderLight} !important;
        border-radius: 12px !important;
        box-shadow: 0 8px 32px rgba(0,0,0,0.15) !important;
        display: flex !important;
        flex-direction: column !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        overflow: auto !important;
        pointer-events: auto !important;
        color: ${c.text} !important;
        font-size: 15px !important;
        line-height: 1.5 !important;
        resize: both !important;
      }
      .${PREFIX}header {
        all: unset;
        display: flex !important;
        padding: 10px 12px !important;
        border-bottom: 1px solid ${c.borderLight} !important;
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
        color: ${c.text} !important;
        flex: 1 !important;
      }
      .${PREFIX}pin {
        all: unset;
        width: 24px !important;
        height: 24px !important;
        cursor: pointer !important;
        font-size: 14px !important;
        color: ${c.textMuted} !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border-radius: 4px !important;
        transition: color 0.2s, background 0.2s !important;
      }
      .${PREFIX}pin:hover { background: ${c.bgHover} !important; color: ${c.textSecondary} !important; }
      .${PREFIX}pin-active {
        color: ${c.pinActive} !important;
        background: ${c.pinActiveBg} !important;
      }
      .${PREFIX}pin-active:hover { background: ${c.pinActiveBg} !important; color: ${c.accentHover} !important; }
      .${PREFIX}model-input {
        all: unset;
        font-size: 12px !important;
        padding: 2px 6px !important;
        border: 1px solid ${c.border} !important;
        border-radius: 4px !important;
        color: ${c.textSecondary} !important;
        background: ${c.bgInput} !important;
        max-width: 140px !important;
        outline: none !important;
      }
      .${PREFIX}model-input:focus { border-color: ${c.accent} !important; }
      .${PREFIX}close {
        all: unset;
        width: 24px !important;
        height: 24px !important;
        cursor: pointer !important;
        font-size: 18px !important;
        color: ${c.textMuted} !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border-radius: 4px !important;
      }
      .${PREFIX}close:hover { background: ${c.bgHover} !important; color: ${c.textSecondary} !important; }
      .${PREFIX}minimize {
        all: unset;
        width: 24px !important;
        height: 24px !important;
        cursor: pointer !important;
        font-size: 14px !important;
        color: ${c.textMuted} !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border-radius: 4px !important;
        transition: color 0.2s, background 0.2s !important;
      }
      .${PREFIX}minimize:hover { background: ${c.bgHover} !important; color: ${c.textSecondary} !important; }
      .${PREFIX}dialog-minimized {
        max-height: none !important;
        min-height: auto !important;
        height: auto !important;
        resize: none !important;
        overflow: hidden !important;
      }
      .${PREFIX}dialog-minimized .${PREFIX}selected,
      .${PREFIX}dialog-minimized .${PREFIX}messages,
      .${PREFIX}dialog-minimized .${PREFIX}prompts,
      .${PREFIX}dialog-minimized .${PREFIX}input-row,
      .${PREFIX}dialog-minimized .${PREFIX}screenshot-preview {
        display: none !important;
      }
      .${PREFIX}selected {
        all: unset;
        display: block !important;
        padding: 10px 16px !important;
        background: ${c.bgSelected} !important;
        border-bottom: 1px solid ${c.borderLight} !important;
        flex-shrink: 0 !important;
        box-sizing: border-box !important;
      }
      .${PREFIX}selected-label {
        all: unset;
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        font-size: 12px !important;
        color: ${c.textMuted} !important;
        margin-bottom: 4px !important;
        gap: 6px !important;
      }
      .${PREFIX}selected-clear {
        all: unset;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 16px !important;
        height: 16px !important;
        font-size: 12px !important;
        line-height: 1 !important;
        color: ${c.textMuted} !important;
        background: transparent !important;
        border-radius: 50% !important;
        cursor: pointer !important;
        transition: background 0.15s, color 0.15s !important;
        flex-shrink: 0 !important;
      }
      .${PREFIX}selected-clear:hover {
        background: ${c.errorBg} !important;
        color: ${c.errorText} !important;
      }
      .${PREFIX}selected-text {
        all: unset;
        display: block !important;
        font-size: 14px !important;
        color: ${c.textSecondary} !important;
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
      .${PREFIX}selected-img-wrap {
        all: unset;
        display: inline-block !important;
        position: relative !important;
        max-width: 80px !important;
        max-height: 60px !important;
      }
      .${PREFIX}selected-img {
        all: unset;
        display: block !important;
        max-height: 60px !important;
        max-width: 80px !important;
        border-radius: 4px !important;
        object-fit: cover !important;
        border: 1px solid ${c.border} !important;
        overflow: hidden !important;
      }
      .${PREFIX}selected-img-remove {
        all: unset;
        position: absolute !important;
        top: -6px !important;
        ${_isRtl ? 'left' : 'right'}: -6px !important;
        width: 16px !important;
        height: 16px !important;
        font-size: 12px !important;
        line-height: 1 !important;
        color: #fff !important;
        background: ${c.accent} !important;
        border-radius: 50% !important;
        cursor: pointer !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        box-shadow: 0 1px 3px rgba(0,0,0,0.3) !important;
        transition: background 0.15s !important;
      }
      .${PREFIX}selected-img-remove:hover { background: ${c.errorText} !important; }
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
      .${PREFIX}msg-user { text-align: ${_isRtl ? 'left' : 'right'} !important; }
      .${PREFIX}bubble {
        all: unset;
        display: inline-block !important;
        padding: 8px 12px !important;
        border-radius: 8px !important;
        font-size: 15px !important;
        line-height: 1.5 !important;
        max-width: 85% !important;
        text-align: ${_isRtl ? 'right' : 'left'} !important;
        word-wrap: break-word !important;
        box-sizing: border-box !important;
      }
      .${PREFIX}msg-user .${PREFIX}bubble {
        background: ${c.userBubble} !important;
        color: ${c.userBubbleText} !important;
      }
      .${PREFIX}msg-assistant .${PREFIX}bubble {
        background: ${c.assistantBubble} !important;
        color: ${c.assistantBubbleText} !important;
      }
      .${PREFIX}msg-system {
        text-align: center !important;
      }
      .${PREFIX}msg-system .${PREFIX}bubble {
        display: inline-block !important;
        background: transparent !important;
        color: ${c.textMuted} !important;
        font-size: 12px !important;
        font-style: italic !important;
        padding: 4px 8px !important;
      }
      .${PREFIX}msg-assistant .${PREFIX}bubble pre {
        position: relative !important;
        background: ${c.codeBg} !important;
        color: ${c.codeText} !important;
        padding: 24px 8px 8px 8px !important;
        border-radius: 4px !important;
        overflow-x: auto !important;
        font-size: 13px !important;
        margin: 4px 0 !important;
      }
      .${PREFIX}msg-assistant .${PREFIX}bubble code {
        background: ${c.inlineCodeBg} !important;
        padding: 1px 4px !important;
        border-radius: 3px !important;
        font-size: 13px !important;
      }
      .${PREFIX}msg-assistant .${PREFIX}bubble pre code {
        background: none !important;
        padding: 0 !important;
      }
      .${PREFIX}code-copy {
        all: unset;
        position: absolute !important;
        top: 4px !important;
        ${_isRtl ? 'left' : 'right'}: 4px !important;
        width: 22px !important;
        height: 22px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 0 !important;
        color: ${c.textMuted} !important;
        background: ${c.bgTertiary} !important;
        border: 1px solid ${c.border} !important;
        border-radius: 4px !important;
        cursor: pointer !important;
        user-select: none !important;
        transition: background 0.15s, color 0.15s, border-color 0.15s !important;
        z-index: 1 !important;
      }
      .${PREFIX}code-copy svg {
        width: 13px !important;
        height: 13px !important;
        display: block !important;
        pointer-events: none !important;
      }
      .${PREFIX}code-copy:hover {
        background: ${c.bgHover} !important;
        color: ${c.textPrimary} !important;
      }
      .${PREFIX}code-copy.${PREFIX}code-copy-ok {
        color: ${c.successText} !important;
        border-color: ${c.successText} !important;
      }
      .${PREFIX}input-row {
        all: unset;
        display: flex !important;
        padding: 12px 16px !important;
        border-top: 1px solid ${c.borderLight} !important;
        gap: 8px !important;
        flex-shrink: 0 !important;
        box-sizing: border-box !important;
      }
      .${PREFIX}input {
        all: unset;
        display: block !important;
        flex: 1 !important;
        padding: 8px 12px !important;
        border: 1px solid ${c.border} !important;
        border-radius: 6px !important;
        font-size: 15px !important;
        font-family: inherit !important;
        line-height: 1.4 !important;
        white-space: pre-wrap !important;
        word-wrap: break-word !important;
        overflow-y: auto !important;
        max-height: 140px !important;
        min-height: 38px !important;
        resize: none !important;
        box-sizing: border-box !important;
        color: ${c.text} !important;
        background: ${c.bgInput} !important;
      }
      .${PREFIX}input:focus { border-color: ${c.accent} !important; }
      .${PREFIX}send {
        all: unset;
        padding: 8px 16px !important;
        background: ${c.accent} !important;
        color: white !important;
        border-radius: 6px !important;
        font-size: 15px !important;
        cursor: pointer !important;
        box-sizing: border-box !important;
      }
      .${PREFIX}send:hover { background: ${c.accentHover} !important; }
      .${PREFIX}send:disabled { background: ${c.textMuted} !important; cursor: not-allowed !important; }
      .${PREFIX}camera {
        all: unset;
        padding: 8px 10px !important;
        background: ${c.cameraBg} !important;
        color: ${c.cameraText} !important;
        border-radius: 6px !important;
        font-size: 16px !important;
        cursor: pointer !important;
        box-sizing: border-box !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        transition: background 0.2s !important;
      }
      .${PREFIX}camera:hover { background: ${c.bgHover} !important; color: ${c.text} !important; }
      .${PREFIX}camera:disabled { opacity: 0.5 !important; cursor: not-allowed !important; }
      .${PREFIX}screenshot-preview {
        all: unset;
        display: flex !important;
        flex-wrap: wrap !important;
        gap: 6px !important;
        padding: 8px 16px !important;
        border-top: 1px solid ${c.borderLight} !important;
        box-sizing: border-box !important;
      }
      .${PREFIX}screenshot-preview:empty { display: none !important; padding: 0 !important; border: none !important; }
      .${PREFIX}screenshot-thumb {
        all: unset;
        position: relative !important;
        display: inline-block !important;
      }
      .${PREFIX}screenshot-thumb img {
        all: unset;
        display: block !important;
        max-height: 60px !important;
        max-width: 80px !important;
        border-radius: 4px !important;
        object-fit: cover !important;
        border: 1px solid ${c.border} !important;
        overflow: hidden !important;
      }
      .${PREFIX}screenshot-remove {
        all: unset;
        position: absolute !important;
        top: -6px !important;
        right: -6px !important;
        width: 18px !important;
        height: 18px !important;
        background: #e74c3c !important;
        color: white !important;
        border-radius: 50% !important;
        font-size: 12px !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        line-height: 1 !important;
      }
      .${PREFIX}screenshot-remove:hover { background: #c0392b !important; }
      .${PREFIX}crop-overlay {
        all: initial;
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        background-size: 100% 100% !important;
        background-position: center !important;
        cursor: crosshair !important;
        z-index: 2147483647 !important;
      }
      .${PREFIX}crop-overlay::before {
        content: '' !important;
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        background: rgba(0, 0, 0, 0.5) !important;
      }
      .${PREFIX}crop-selection {
        all: unset;
        position: absolute !important;
        border: 2px solid ${c.accent} !important;
        background: transparent !important;
        box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5) !important;
        pointer-events: none !important;
      }
      .${PREFIX}crop-hint {
        all: unset;
        position: fixed !important;
        top: 20px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        background: rgba(0, 0, 0, 0.8) !important;
        color: white !important;
        padding: 8px 16px !important;
        border-radius: 6px !important;
        font-size: 14px !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        z-index: 2147483647 !important;
        pointer-events: none !important;
      }
      .${PREFIX}prompts {
        all: unset;
        display: flex !important;
        flex-wrap: wrap !important;
        gap: 6px !important;
        padding: 8px 16px !important;
        border-top: 1px solid ${c.borderLight} !important;
        box-sizing: border-box !important;
      }
      .${PREFIX}prompt-chip {
        all: unset;
        display: inline-block !important;
        padding: 4px 10px !important;
        background: ${c.chipBg} !important;
        color: ${c.chipText} !important;
        border-radius: 12px !important;
        font-size: 13px !important;
        cursor: pointer !important;
        white-space: nowrap !important;
        transition: background 0.2s !important;
      }
      .${PREFIX}prompt-chip:hover { background: ${c.chipHoverBg} !important; color: ${c.text} !important; }
      .${PREFIX}error {
        all: unset;
        display: block !important;
        color: ${c.errorText} !important;
        font-size: 12px !important;
        padding: 8px 12px !important;
        background: ${c.errorBg} !important;
        border-radius: 6px !important;
        margin-bottom: 8px !important;
      }
      .${PREFIX}warning {
        all: unset;
        display: block !important;
        padding: 20px !important;
        text-align: center !important;
        color: ${c.warningText} !important;
        font-size: 13px !important;
      }
      .${PREFIX}warning-free {
        all: unset;
        display: block !important;
        margin-top: 14px !important;
        padding-top: 14px !important;
        border-top: 1px solid ${c.borderLight} !important;
        font-size: 12px !important;
        color: ${c.textMuted} !important;
        text-align: ${_isRtl ? 'right' : 'left'} !important;
      }
      .${PREFIX}warning-free-title {
        all: unset;
        display: block !important;
        margin-bottom: 8px !important;
        font-size: 12px !important;
        color: ${c.textMuted} !important;
      }
      .${PREFIX}warning-free-list {
        all: unset;
        display: flex !important;
        flex-direction: column !important;
        gap: 6px !important;
      }
      .${PREFIX}warning-free-btn {
        all: unset;
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 10px !important;
        padding: 8px 12px !important;
        border: 1px solid ${c.border} !important;
        border-radius: 8px !important;
        background: ${c.bgTertiary} !important;
        color: ${c.textPrimary} !important;
        font-size: 13px !important;
        cursor: pointer !important;
        transition: border-color 0.15s, background 0.15s !important;
      }
      .${PREFIX}warning-free-btn:hover {
        border-color: ${c.accent} !important;
        background: ${c.bgHover} !important;
      }
      .${PREFIX}warning-free-btn-name { font-weight: 600 !important; }
      .${PREFIX}warning-free-btn-host { color: ${c.textMuted} !important; font-size: 11px !important; }
      .${PREFIX}warning-free-btn-cta {
        font-size: 11px !important;
        color: ${c.accent} !important;
        font-weight: 600 !important;
        flex-shrink: 0 !important;
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
        background: ${c.dotColor} !important;
        border-radius: 50% !important;
        animation: ${PREFIX}bounce 1.4s infinite !important;
      }
      .${PREFIX}dot:nth-child(2) { animation-delay: 0.2s !important; }
      .${PREFIX}dot:nth-child(3) { animation-delay: 0.4s !important; }
      @keyframes ${PREFIX}bounce {
        0%, 60%, 100% { transform: translateY(0); }
        30% { transform: translateY(-4px); }
      }
      .${PREFIX}dialog::-webkit-scrollbar,
      .${PREFIX}messages::-webkit-scrollbar,
      .${PREFIX}selected-text::-webkit-scrollbar {
        width: 8px;
      }
      .${PREFIX}dialog::-webkit-scrollbar-track,
      .${PREFIX}messages::-webkit-scrollbar-track,
      .${PREFIX}selected-text::-webkit-scrollbar-track {
        background: transparent;
      }
      .${PREFIX}dialog::-webkit-scrollbar-thumb,
      .${PREFIX}messages::-webkit-scrollbar-thumb,
      .${PREFIX}selected-text::-webkit-scrollbar-thumb {
        background: ${c.textMuted} !important;
        border-radius: 4px;
      }
      .${PREFIX}dialog::-webkit-scrollbar-thumb:hover,
      .${PREFIX}messages::-webkit-scrollbar-thumb:hover,
      .${PREFIX}selected-text::-webkit-scrollbar-thumb:hover {
        background: ${c.textSecondary} !important;
      }
      .${PREFIX}dialog {
        scrollbar-width: thin;
        scrollbar-color: ${c.textMuted} transparent;
      }
      .${PREFIX}messages {
        scrollbar-width: thin;
        scrollbar-color: ${c.textMuted} transparent;
      }
    `;
    if (root) root.appendChild(style);
    else document.head.appendChild(style);
  }

  function showCropOverlay(dataUrl) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = `${PREFIX}crop-overlay`;
      overlay.setAttribute('data-aiext', '1');
      overlay.style.backgroundImage = `url(${dataUrl})`;

      const selection = document.createElement('div');
      selection.className = `${PREFIX}crop-selection`;
      selection.setAttribute('data-aiext', '1');
      selection.style.display = 'none';

      const hint = document.createElement('div');
      hint.className = `${PREFIX}crop-hint`;
      hint.textContent = t('cropHint');

      overlay.appendChild(selection);
      overlay.appendChild(hint);
      _shadowAppend(overlay);

      let isDragging = false;
      let startX = 0, startY = 0;

      function cleanup() {
        overlay.remove();
        document.removeEventListener('keydown', onKeyDown);
      }

      function onKeyDown(e) {
        if (e.key === 'Escape') {
          cleanup();
          resolve(null);
        }
      }
      document.addEventListener('keydown', onKeyDown);

      overlay.addEventListener('mousedown', (e) => {
        if (e.target !== overlay && e.target !== selection) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        selection.style.left = startX + 'px';
        selection.style.top = startY + 'px';
        selection.style.width = '0px';
        selection.style.height = '0px';
        selection.style.display = 'block';
        e.preventDefault();
      });

      overlay.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const currentX = e.clientX;
        const currentY = e.clientY;
        const left = Math.min(startX, currentX);
        const top = Math.min(startY, currentY);
        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);
        selection.style.left = left + 'px';
        selection.style.top = top + 'px';
        selection.style.width = width + 'px';
        selection.style.height = height + 'px';
        e.preventDefault();
      });

      overlay.addEventListener('mouseup', async (e) => {
        if (!isDragging) return;
        isDragging = false;

        const rect = {
          x: parseInt(selection.style.left),
          y: parseInt(selection.style.top),
          width: parseInt(selection.style.width),
          height: parseInt(selection.style.height),
        };

        if (rect.width < 5 || rect.height < 5) {
          cleanup();
          resolve(null);
          return;
        }

        const img = new Image();
        img.onload = () => {
          const scaleX = img.naturalWidth / window.innerWidth;
          const scaleY = img.naturalHeight / window.innerHeight;

          const cropX = Math.round(rect.x * scaleX);
          const cropY = Math.round(rect.y * scaleY);
          const cropWidth = Math.round(rect.width * scaleX);
          const cropHeight = Math.round(rect.height * scaleY);

          const canvas = document.createElement('canvas');
          canvas.width = cropWidth;
          canvas.height = cropHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
          const croppedDataUrl = canvas.toDataURL('image/png');
          cleanup();
          resolve(croppedDataUrl);
        };
        img.onerror = () => {
          cleanup();
          resolve(null);
        };
        img.src = dataUrl;
        e.preventDefault();
      });
    });
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  async function imageToDataURL(imgEl) {
    try {
      const rawSrc = imgEl.src || imgEl.getAttribute('src');
      if (!rawSrc) return null;
      if (rawSrc.startsWith('data:')) return rawSrc;

      let absoluteSrc;
      try { absoluteSrc = new URL(rawSrc, document.baseURI).href; }
      catch (e) { absoluteSrc = rawSrc; }

      let res;
      try {
        res = await fetch(absoluteSrc, { mode: 'cors' });
      } catch (e) { res = null; }

      if (!res || !res.ok) {
        if (contextValid() && chrome.runtime && chrome.runtime.sendMessage) {
          try {
            const reply = await chrome.runtime.sendMessage({ action: 'fetchImageAsDataUrl', url: absoluteSrc });
            if (reply && reply.dataUrl) return reply.dataUrl;
          } catch (e) { /* fall through */ }
        }
        return null;
      }

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

  function attachCodeCopyButtons(bubble) {
    if (!bubble) return;
    const COPY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    const CHECK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    const pres = bubble.querySelectorAll('pre');
    pres.forEach(pre => {
      if (pre.querySelector(`.${PREFIX}code-copy`)) return;
      const btn = document.createElement('button');
      btn.className = `${PREFIX}code-copy`;
      btn.setAttribute('data-aiext', '1');
      btn.type = 'button';
      btn.setAttribute('aria-label', t('codeCopyBtn') || 'Copy');
      btn.title = t('codeCopyBtn') || 'Copy';
      btn.innerHTML = COPY_ICON;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const code = pre.querySelector('code');
        const text = (code ? code.textContent : pre.textContent) || '';
        const resetIcon = () => {
          btn.innerHTML = COPY_ICON;
          btn.classList.remove(`${PREFIX}code-copy-ok`);
          btn.setAttribute('aria-label', t('codeCopyBtn') || 'Copy');
          btn.title = t('codeCopyBtn') || 'Copy';
        };
        const onSuccess = () => {
          btn.innerHTML = CHECK_ICON;
          btn.classList.add(`${PREFIX}code-copy-ok`);
          btn.setAttribute('aria-label', t('codeCopied') || 'Copied');
          btn.title = t('codeCopied') || 'Copied';
          setTimeout(resetIcon, 1500);
        };
        const onFail = () => {
          btn.textContent = '⚠';
          setTimeout(resetIcon, 1500);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(onSuccess).catch(onFail);
        } else {
          try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            onSuccess();
          } catch (err) { onFail(); }
        }
      });
      pre.appendChild(btn);
    });
  }

  function getConfig() {
    return new Promise((resolve) => {
      try {
        if (!chrome.storage || !chrome.storage.sync) return resolve({});
        chrome.storage.sync.get(['apiKey', 'model', 'baseUrl'], resolve);
      } catch (e) {
        resolve({});
      }
    });
  }

  function getQuickPrompts() {
    return new Promise((resolve) => {
      try {
        if (!chrome.storage || !chrome.storage.sync) return resolve([]);
        chrome.storage.sync.get(['quickPrompts'], (result) => {
          resolve(result.quickPrompts || []);
        });
      } catch (e) {
        resolve([]);
      }
    });
  }

  function getShowFloating() {
    return new Promise((resolve) => {
      try {
        if (!contextValid() || !chrome.storage || !chrome.storage.sync) return resolve(true);
        chrome.storage.sync.get(['showFloating'], (result) => {
          resolve(result.showFloating !== false);
        });
      } catch (e) {
        resolve(true);
      }
    });
  }

  // ─── Conversation Persistence ───
  const STORAGE_KEY = 'aiext_dialogs_v1';
  const TTL_MS = 7 * 24 * 3600 * 1000;
  const MAX_PER_HOST = 10;
  const MAX_TOTAL = 50;
  const MAX_IMAGES_PER_DIALOG = 2;
  const MAX_IMAGE_BYTES = 300 * 1024;
  const _persistedIds = new Set();

  function _storageAvailable() {
    return contextValid() && chrome.storage && chrome.storage.local;
  }

  async function loadDialogRecords() {
    if (!_storageAvailable()) return [];
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([STORAGE_KEY], (r) => {
          const data = r && r[STORAGE_KEY];
          resolve(Array.isArray(data && data.dialogs) ? data.dialogs : []);
        });
      } catch (e) { resolve([]); }
    });
  }

  async function saveDialogRecords(dialogs) {
    if (!_storageAvailable()) return;
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: { dialogs } });
    } catch (e) { /* quota exceeded etc. */ }
  }

  function pruneExpired(dialogs) {
    const now = Date.now();
    return dialogs.filter(d => d && d.lastActive && (now - d.lastActive) < TTL_MS);
  }

  function _trimImageList(images) {
    if (!Array.isArray(images)) return [];
    return images
      .filter(img => typeof img === 'string' && img.startsWith('data:'))
      .slice(0, MAX_IMAGES_PER_DIALOG)
      .filter(img => img.length <= MAX_IMAGE_BYTES * 1.37);  // base64 overhead
  }

  function toRecord(state) {
    if (!state) return null;
    const dlg = state.dialog;
    const rect = dlg ? dlg.getBoundingClientRect() : null;
    const pos = dlg ? {
      x: parseFloat(dlg.style.left) || (rect ? rect.left : 0),
      y: parseFloat(dlg.style.top) || (rect ? rect.top : 0)
    } : null;
    const size = dlg ? {
      width: parseFloat(dlg.style.width) || (rect ? rect.width : 0),
      height: parseFloat(dlg.style.height) || (rect ? rect.height : 0)
    } : null;
    return {
      id: state.persistId || (state.persistId = (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'd' + Date.now() + Math.random())),
      url: location.href,
      hostname: location.hostname,
      createdAt: state.persistedAt || (state.persistedAt = Date.now()),
      lastActive: Date.now(),
      conversationHistory: (state.conversationHistory || [])
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && (typeof m.content === 'string' || Array.isArray(m.content)))
        .map(m => Array.isArray(m.content)
          ? { role: m.role, content: m.content.filter(p => p && p.type === 'text').map(p => ({ type: 'text', text: p.text })) }
          : { role: m.role, content: m.content }),
      context: {
        text: (state.context && state.context.text) ? String(state.context.text).slice(0, 2000) : '',
        images: _trimImageList(state.context && state.context.images)
      },
      model: (state.config && state.config.model) || '',
      position: pos,
      size: size
    };
  }

  async function persistState(id) {
    const state = dialogs.get(id);
    if (!state) return;
    let records = pruneExpired(await loadDialogRecords());
    const rec = toRecord(state);
    if (!rec) return;
    const idx = records.findIndex(r => r && r.id === rec.id);
    if (idx >= 0) records[idx] = rec;
    else records.push(rec);
    // per-host cap
    const perHost = records.filter(r => r.hostname === rec.hostname);
    if (perHost.length > MAX_PER_HOST) {
      perHost.sort((a, b) => a.lastActive - b.lastActive);
      const toDrop = perHost.slice(0, perHost.length - MAX_PER_HOST);
      const dropIds = new Set(toDrop.map(d => d.id));
      records = records.filter(r => !dropIds.has(r.id));
    }
    // total cap
    if (records.length > MAX_TOTAL) {
      records.sort((a, b) => a.lastActive - b.lastActive);
      records = records.slice(records.length - MAX_TOTAL);
    }
    _persistedIds.add(rec.id);
    await saveDialogRecords(records);
  }

  async function deleteRecord(id) {
    const state = dialogs.get(id);
    const persistId = state && state.persistId;
    if (!persistId) return;
    let records = await loadDialogRecords();
    records = records.filter(r => r && r.id !== persistId);
    _persistedIds.delete(persistId);
    await saveDialogRecords(records);
  }

  async function restoreDialogsOnLoad() {
    if (!_storageAvailable()) return;
    let records = pruneExpired(await loadDialogRecords());
    const hostname = location.hostname;
    const matches = records.filter(r => r.hostname === hostname && !r.closedAt);
    if (matches.length === 0) return;
    const config = await getConfig();
    if (!config || !config.apiKey) return;
    const quickPrompts = await getQuickPrompts();
    for (const r of matches) {
      const ctx = { text: (r.context && r.context.text) || '', images: (r.context && r.context.images) || [] };
      const id = createDialog(
        { ...config, model: r.model || config.model },
        null,
        quickPrompts,
        ctx
      );
      const st = dialogs.get(id);
      if (!st) continue;
      st.persistId = r.id;
      st.persistedAt = r.createdAt;
      _persistedIds.add(r.id);
      if (r.position) {
        st.dialog.style.left = r.position.x + 'px';
        st.dialog.style.top = r.position.y + 'px';
        st.dialog.style.right = 'auto';
      }
      if (r.size && r.size.width) {
        st.dialog.style.width = r.size.width + 'px';
        if (r.size.height) st.dialog.style.height = r.size.height + 'px';
      }
      st.conversationHistory = (r.conversationHistory || []).map(m => ({ role: m.role, content: m.content }));
      st.conversationHistory.forEach(m => {
        if (m.role === 'user' || m.role === 'assistant') {
          const content = typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? m.content.filter(p => p && p.type === 'text').map(p => p.text).join('\n') : '');
          if (content) addMessage(id, m.role, content);
        }
      });
      addMessage(id, 'system', t('dialogRestoredHint'));
    }
    await saveDialogRecords(records);
  }

  function isOurElement(el) {
    if (!el) return false;
    if (_shadowRoot && typeof el.getRootNode === 'function' && el.getRootNode() === _shadowRoot) return true;
    while (el) {
      if (el.getAttribute && el.getAttribute('data-aiext')) return true;
      if (el === _shadowHost) return true;
      el = el.parentElement;
    }
    return false;
  }

  // ─── Floating Icon ───
  function showFloatingIcon(x, y, imgEl) {
    if (!_showFloating) return;
    hideFloatingIcon();
    floatingIcon = document.createElement('div');
    floatingIcon.className = `${PREFIX}icon`;
    floatingIcon.setAttribute('data-aiext', '1');
    let _iconUrl = '';
    try {
      if (contextValid() && chrome.runtime && chrome.runtime.getURL) {
        _iconUrl = chrome.runtime.getURL('icons/icon48.png');
      }
    } catch (e) { _contextInvalid = true; }
    floatingIcon.innerHTML = _iconUrl ? `<img src="${_iconUrl}" alt="">` : '';

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
          const dataUrl = await imageToDataURL(imgEl);
          const src = imgEl.src || imgEl.getAttribute('src');
          const imageUrl = dataUrl || (src && !src.startsWith('blob:') ? src : null);
          currentContext = { text: '', images: imageUrl ? [imageUrl] : [] };
          openDialog();
        })();
      } else {
        openDialog();
      }
    });

    _shadowAppend(floatingIcon);
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
      pendingScreenshots: [],
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
    if (_isRtl) state.dialog.setAttribute('dir', 'rtl');
    state.dialog.dataset.dialogId = id;
    state.dialog.innerHTML = `
      <div class="${PREFIX}header" data-aiext="1">
        <span class="${PREFIX}title">${t('dialogTitle')}</span>
        <input class="${PREFIX}model-input" data-aiext="1" type="text" list="${PREFIX}model-list-${id}" value="${config.model || ''}" placeholder="${t('dialogModelPlaceholder')}" title="${t('dialogModelTooltip')}" autocomplete="off">
        <datalist id="${PREFIX}model-list-${id}"></datalist>
        <span class="${PREFIX}pin" data-aiext="1" title="${t('dialogPinTooltip')}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>
        </span>
        <span class="${PREFIX}minimize" data-aiext="1" title="${t('dialogMinimizeTooltip')}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
        </span>
        <span class="${PREFIX}close" data-aiext="1">&times;</span>
      </div>
      ${hasContent ? `
      <div class="${PREFIX}selected">
        ${ctx.text ? `<div class="${PREFIX}selected-label"><span data-aiext="1">${t('dialogSelectedText')}</span><button class="${PREFIX}selected-clear" data-aiext="1" data-clear-type="text" type="button" title="${t('dialogClearTooltip')}">&times;</button></div><div class="${PREFIX}selected-text">${escapeHtml(ctx.text.length > 200 ? ctx.text.slice(0, 200) + '...' : ctx.text)}</div>` : ''}
        ${ctx.images && ctx.images.length > 0 ? `<div class="${PREFIX}selected-label"><span data-aiext="1">${t('dialogSelectedImages')}</span><button class="${PREFIX}selected-clear" data-aiext="1" data-clear-type="images" type="button" title="${t('dialogClearTooltip')}">&times;</button></div><div class="${PREFIX}selected-images">${ctx.images.map((src, i) => `<span class="${PREFIX}selected-img-wrap" data-aiext="1" data-image-index="${i}"><img class="${PREFIX}selected-img" src="${src}" data-aiext="1" style="overflow:hidden"><button class="${PREFIX}selected-img-remove" data-aiext="1" data-image-index="${i}" type="button" title="${t('dialogClearTooltip')}">&times;</button></span>`).join('')}</div>` : ''}
      </div>` : ''}
      <div class="${PREFIX}messages"></div>
      ${quickPrompts && quickPrompts.length > 0 ? `
      <div class="${PREFIX}prompts">
        ${quickPrompts.map((p, i) => `<span class="${PREFIX}prompt-chip" data-aiext="1" data-prompt-index="${i}">${escapeHtml(p)}</span>`).join('')}
      </div>` : ''}
      <div class="${PREFIX}input-row">
        <textarea class="${PREFIX}input" rows="1" placeholder="${t('dialogInputPlaceholder')}" data-aiext="1"></textarea>
        <button class="${PREFIX}camera" data-aiext="1" title="${t('dialogCameraTooltip')}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        </button>
        <button class="${PREFIX}send" data-aiext="1">${t('dialogSendBtn')}</button>
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

    _shadowAppend(state.overlay);
    _shadowAppend(state.dialog);
    dialogs.set(id, state);

    // Events
    state.dialog.querySelector(`.${PREFIX}close`).addEventListener('click', () => closeDialog(id));
    state.dialog.querySelector(`.${PREFIX}pin`).addEventListener('click', () => togglePin(id));

    state.dialog.querySelectorAll(`.${PREFIX}selected-clear`).forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.clearType;
        const labelRow = btn.closest(`.${PREFIX}selected-label`);
        const target = labelRow ? labelRow.nextElementSibling : null;
        if (labelRow) labelRow.remove();
        if (target) target.remove();
        if (type === 'text') state.context.text = '';
        else if (type === 'images') state.context.images = [];
        const selDiv = state.dialog.querySelector(`.${PREFIX}selected`);
        if (selDiv && !selDiv.querySelector(`.${PREFIX}selected-label`)) selDiv.remove();
        persistState(id);
      });
    });

    state.dialog.querySelectorAll(`.${PREFIX}selected-img-remove`).forEach(btn => {
      btn.addEventListener('click', () => {
        const wrap = btn.closest(`.${PREFIX}selected-img-wrap`);
        if (!wrap) return;
        const imagesDiv = wrap.parentElement;
        const labelRow = imagesDiv ? imagesDiv.previousElementSibling : null;
        wrap.remove();
        if (imagesDiv) {
          const remaining = Array.from(imagesDiv.querySelectorAll(`.${PREFIX}selected-img-wrap`));
          state.context.images = remaining.map(w => {
            const img = w.querySelector(`.${PREFIX}selected-img`);
            return img ? img.src : '';
          }).filter(Boolean);
          if (remaining.length === 0) {
            imagesDiv.remove();
            if (labelRow) labelRow.remove();
            const selDiv = state.dialog.querySelector(`.${PREFIX}selected`);
            if (selDiv && !selDiv.querySelector(`.${PREFIX}selected-label`)) selDiv.remove();
          }
        }
        persistState(id);
      });
    });

    const minimizeBtn = state.dialog.querySelector(`.${PREFIX}minimize`);
    minimizeBtn.addEventListener('click', () => {
      const isMinimized = state.dialog.classList.toggle(`${PREFIX}dialog-minimized`);
      if (isMinimized) {
        state._savedHeight = state.dialog.style.height;
        state.dialog.style.height = 'auto';
        minimizeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;
        minimizeBtn.title = t('dialogExpandTooltip');
      } else {
        if (state._savedHeight) state.dialog.style.height = state._savedHeight;
        minimizeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;
        minimizeBtn.title = t('dialogMinimizeTooltip');
      }
    });

    setupDrag(id);
    bringToFront(id);

    state.dialog.addEventListener('mousedown', () => {
      if (!state.isDragging && state.zIndex !== topZ) bringToFront(id);
    });

    const modelInput = state.dialog.querySelector(`.${PREFIX}model-input`);
    let _persistModelTimer = null;
    modelInput.addEventListener('input', () => {
      state.config.model = modelInput.value.trim();
      clearTimeout(_persistModelTimer);
      _persistModelTimer = setTimeout(() => persistState(id), 600);
    });
    modelInput.addEventListener('mousedown', (e) => e.stopPropagation());
    fetchModelsForDialog(id);

    const input = state.dialog.querySelector(`.${PREFIX}input`);
    const sendBtn = state.dialog.querySelector(`.${PREFIX}send`);

    function autoGrowInput() {
      if (!input) return;
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 140) + 'px';
    }
    input.addEventListener('input', autoGrowInput);

    sendBtn.addEventListener('click', () => sendMessage(id));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(id);
      }
      if (e.key === 'Escape' && !state.isPinned) closeDialog(id);
    });

    input.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;
          if (state.pendingScreenshots.length >= 4) {
            addMessage(id, 'system', t('pasteTooManyImages'));
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            if (state.pendingScreenshots.length >= 4) {
              addMessage(id, 'system', t('pasteTooManyImages'));
              return;
            }
            state.pendingScreenshots.push(reader.result);
            renderScreenshotPreview();
          };
          reader.readAsDataURL(file);
        }
      }
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

    const screenshotPreview = document.createElement('div');
    screenshotPreview.className = `${PREFIX}screenshot-preview`;
    screenshotPreview.setAttribute('data-aiext', '1');
    state.dialog.insertBefore(screenshotPreview, state.dialog.querySelector(`.${PREFIX}input-row`));

    const cameraBtn = state.dialog.querySelector(`.${PREFIX}camera`);
    cameraBtn.addEventListener('click', async () => {
      if (state.pendingScreenshots.length >= 4) {
        addMessage(id, 'system', t('pasteTooManyImages'));
        return;
      }
      cameraBtn.disabled = true;
      const origDialogDisplay = state.dialog.style.display;
      const origOverlayDisplay = state.overlay ? state.overlay.style.display : '';
      state.dialog.style.display = 'none';
      if (state.overlay) state.overlay.style.display = 'none';

      await new Promise(r => setTimeout(r, 50));

      try {
        if (!contextValid() || !chrome.runtime || !chrome.runtime.sendMessage) {
          throw new Error('Extension context invalidated');
        }
        const response = await chrome.runtime.sendMessage({ action: 'captureScreenshot' });

        if (response && response.dataUrl) {
          const croppedDataUrl = await showCropOverlay(response.dataUrl);
          state.dialog.style.display = origDialogDisplay;
          if (state.overlay) state.overlay.style.display = origOverlayDisplay;

          if (croppedDataUrl) {
            state.pendingScreenshots.push(croppedDataUrl);
            renderScreenshotPreview();
          }
        } else {
          state.dialog.style.display = origDialogDisplay;
          if (state.overlay) state.overlay.style.display = origOverlayDisplay;
        }
      } catch (e) {
        state.dialog.style.display = origDialogDisplay;
        if (state.overlay) state.overlay.style.display = origOverlayDisplay;
      }
      cameraBtn.disabled = false;
      input.focus();
    });

    function renderScreenshotPreview() {
      screenshotPreview.innerHTML = '';
      state.pendingScreenshots.forEach((src, i) => {
        const thumb = document.createElement('div');
        thumb.className = `${PREFIX}screenshot-thumb`;
        thumb.innerHTML = `<img src="${src}" data-aiext="1" style="overflow:hidden"><span class="${PREFIX}screenshot-remove" data-index="${i}">&times;</span>`;
        thumb.querySelector(`.${PREFIX}screenshot-remove`).addEventListener('click', () => {
          state.pendingScreenshots.splice(i, 1);
          renderScreenshotPreview();
        });
        screenshotPreview.appendChild(thumb);
      });
    }

    setTimeout(() => input.focus(), 50);
    return id;
  }

  function closeDialog(id) {
    const state = dialogs.get(id);
    if (!state) return;
    if (state.persistId) {
      (async () => {
        let records = await loadDialogRecords();
        const idx = records.findIndex(r => r && r.id === state.persistId);
        if (idx >= 0) {
          records[idx].closedAt = Date.now();
          await saveDialogRecords(records);
        }
      })();
    }
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
      const container = _shadow() || document.body;
      container.insertBefore(state.overlay, state.dialog);
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
      const url = normalizeBaseUrl(baseUrl) + '/models';
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
      attachCodeCopyButtons(bubble);
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
    const hasScreenshots = state.pendingScreenshots && state.pendingScreenshots.length > 0;
    if (!text && !hasScreenshots) return;

    input.value = '';
    input.dispatchEvent(new Event('input'));
    addMessage(id, 'user', text || t('screenshotLabel'));
    state.conversationHistory.push({ role: 'user', content: text || t('screenshotLabel') });

    state.isStreaming = true;
    sendBtn.disabled = true;

    const typing = addTypingIndicator(id);

    try {
      const ctx = state.context;
      const allImages = [...(ctx.images || []), ...(state.pendingScreenshots || [])];
      let uiLang = 'en';
      try {
        if (contextValid() && chrome.i18n && chrome.i18n.getUILanguage) {
          uiLang = chrome.i18n.getUILanguage() || 'en';
        }
      } catch (e) { _contextInvalid = true; }
      const langInstruction = uiLang.startsWith('zh')
        ? `Please respond in the same Chinese variant (Traditional or Simplified) as the user's input.`
        : `Please respond in ${uiLang} unless the user writes in another language.`;
      const textPart = `You are an AI assistant. ${ctx.text ? `The user selected the following text as context:\n"${ctx.text}"\n` : ''}${allImages.length > 0 ? `The user also provided ${allImages.length} image(s) as context.` : ''} ${langInstruction} Please answer the user's question based on this context. If the question is unrelated to the selection, you may answer directly.`;

      const messages = [
        { role: 'system', content: textPart },
      ];

      if (allImages.length > 0) {
        const imgContent = [{ type: 'text', text: 'Here are the images provided by the user as context:' }];
        for (const img of allImages) {
          imgContent.push({ type: 'image_url', image_url: { url: img } });
        }
        messages.push({ role: 'user', content: imgContent });
        messages.push({ role: 'assistant', content: 'Got it, I have reviewed the image context. Please go ahead and ask your question.' });
      }

      messages.push(...state.conversationHistory);

      if (typing) typing.remove();

      let response = await callAI(id, state.config, messages);

      if (response.error) {
        const messagesEl = state.dialog.querySelector(`.${PREFIX}messages`);
        const errDiv = document.createElement('div');
        errDiv.className = `${PREFIX}error`;
        errDiv.textContent = response.error;
        messagesEl.appendChild(errDiv);
      } else if (response.bubble) {
        response.bubble.innerHTML = renderMarkdown(response.content);
        attachCodeCopyButtons(response.bubble);
        state.conversationHistory.push({ role: 'assistant', content: response.content });
      } else {
        addMessage(id, 'assistant', response.content);
        state.conversationHistory.push({ role: 'assistant', content: response.content });
      }

      // Clear pending screenshots
      state.pendingScreenshots.length = 0;
      const previewEl = state.dialog.querySelector(`.${PREFIX}screenshot-preview`);
      if (previewEl) previewEl.innerHTML = '';
    } catch (err) {
      if (typing) typing.remove();
      const messagesEl = state.dialog.querySelector(`.${PREFIX}messages`);
      if (messagesEl) {
        const errDiv = document.createElement('div');
        errDiv.className = `${PREFIX}error`;
        errDiv.textContent = t('errorRequestFailed', err.message);
        messagesEl.appendChild(errDiv);
      }
    } finally {
      persistState(id);
    }

    state.isStreaming = false;
    sendBtn.disabled = false;
    input.focus();
  }

  // ─── AI Calls ───
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function messagesHaveImages(messages) {
    return messages.some(m => Array.isArray(m.content) && m.content.some(p => p && p.type === 'image_url'));
  }

  function stripImagesFromMessages(messages) {
    return messages.map(m => {
      if (!Array.isArray(m.content)) return m;
      const textOnly = m.content.filter(p => p && p.type !== 'image_url');
      if (textOnly.length === 1 && textOnly[0].type === 'text') {
        return { role: m.role, content: textOnly[0].text };
      }
      return { role: m.role, content: textOnly };
    });
  }

  async function callAI(id, config, messages) {
    const { apiKey, model, baseUrl } = config;
    const url = normalizeBaseUrl(baseUrl || 'https://api.openai.com/v1') + '/chat/completions';

    const state = dialogs.get(id);
    const messagesEl = state && state.dialog ? state.dialog.querySelector(`.${PREFIX}messages`) : null;
    const retryBubble = messagesEl ? addMessage(id, 'system', '') : null;
    if (retryBubble && retryBubble.parentElement) retryBubble.parentElement.style.display = 'none';

    let aborted = false;
    let currentController = null;
    let cancelEl = null;

    if (retryBubble) {
      const cancelBtn = document.createElement('span');
      cancelBtn.className = `${PREFIX}retry-cancel`;
      cancelBtn.setAttribute('data-aiext', '1');
      cancelBtn.textContent = '✕';
      cancelBtn.style.cssText = 'margin-left:8px;cursor:pointer;opacity:0.7;';
      cancelBtn.addEventListener('click', () => {
        aborted = true;
        if (currentController) try { currentController.abort(); } catch (e) {}
      });
      retryBubble.appendChild(cancelBtn);
      cancelEl = cancelBtn;
    }

    let attempt = 0;
    const MAX_ATTEMPTS = 3;
    let fallbackTriggered = false;
    let result = { error: t('errorRequestFailed', 'unknown'), status: 0, code: 'unknown' };

    try {
      while (attempt < MAX_ATTEMPTS) {
        if (aborted) {
          result = { error: t('retryCancelled'), status: 0, code: 'cancelled' };
          break;
        }

        const controller = new AbortController();
        currentController = controller;
        let res;
        try {
          res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({ model: model || 'gpt-4o', messages, stream: true }),
            signal: controller.signal
          });
        } catch (fetchErr) {
          if (aborted) {
            result = { error: t('retryCancelled'), status: 0, code: 'cancelled' };
            break;
          }
          attempt++;
          if (attempt >= MAX_ATTEMPTS) {
            result = { error: t('errorRequestFailed', fetchErr.message || 'network'), status: 0, code: 'network' };
            break;
          }
          if (retryBubble && retryBubble.parentElement) {
            retryBubble.parentElement.style.display = '';
            if (cancelEl) retryBubble.insertBefore(document.createTextNode(t('retrying', String(attempt))), cancelEl);
            const prev = cancelEl.previousSibling;
            if (prev && prev.previousSibling && prev.previousSibling.nodeType === 3) {
              retryBubble.removeChild(prev.previousSibling);
            }
          }
          await sleep(Math.min(1000 * Math.pow(2, attempt - 1), 8000));
          continue;
        }

        if (res.status === 400 && messagesHaveImages(messages) && !fallbackTriggered) {
          fallbackTriggered = true;
          if (retryBubble && retryBubble.parentElement) {
            retryBubble.parentElement.style.display = '';
            const notice = document.createTextNode(t('fallbackTextOnly') + ' ');
            retryBubble.insertBefore(notice, cancelEl);
          }
          messages = stripImagesFromMessages(messages);
          continue;
        }

        if (res.status === 429 || (res.status >= 500 && res.status <= 504)) {
          attempt++;
          if (attempt >= MAX_ATTEMPTS) {
            const errText = await res.text().catch(() => '');
            result = { error: t('errorApiError', String(res.status), errText.slice(0, 200)), status: res.status, code: res.status === 429 ? 'rate_limited' : 'server' };
            break;
          }
          if (retryBubble && retryBubble.parentElement) {
            retryBubble.parentElement.style.display = '';
            const node = document.createTextNode(t('retrying', String(attempt)) + ' ');
            retryBubble.insertBefore(node, cancelEl);
            const prev = cancelEl.previousSibling;
            if (prev && prev.previousSibling && prev.previousSibling.nodeType === 3 && prev.previousSibling !== node) {
              retryBubble.removeChild(prev.previousSibling);
            }
          }
          await sleep(Math.min(1000 * Math.pow(2, attempt - 1), 8000));
          continue;
        }

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          result = { error: t('errorApiError', String(res.status), errText.slice(0, 200)), status: res.status, code: 'api_error' };
          break;
        }

        result = await readStream(id, res);
        break;
      }
    } finally {
      if (retryBubble && retryBubble.parentElement) {
        retryBubble.parentElement.remove();
      }
      currentController = null;
    }

    return result;
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

    const settings = await new Promise(r => {
      try {
        if (!chrome.storage || !chrome.storage.sync) return r({});
        chrome.storage.sync.get(['defaultPin'], r);
      } catch (e) {
        r({});
      }
    });
    if (settings.defaultPin !== false) togglePin(id);
    persistState(id);
  }

  let _providersCache = null;
  async function getAllProviders() {
    if (_providersCache) return _providersCache;
    try {
      if (!contextValid() || !chrome.runtime || !chrome.runtime.getURL) return [];
      const res = await fetch(chrome.runtime.getURL('providers.json'));
      const data = await res.json();
      const order = data.displayOrder || Object.keys(data.providers || {});
      _providersCache = order
        .map(key => {
          const p = (data.providers || {})[key];
          return p ? { key, ...p } : null;
        })
        .filter(Boolean);
      return _providersCache;
    } catch (e) {
      return [];
    }
  }

  async function showSettingsWarning() {
    closeAllDialogs();
    const providers = await getAllProviders();

    const overlay = document.createElement('div');
    overlay.className = `${PREFIX}overlay`;
    overlay.setAttribute('data-aiext', '1');
    overlay.addEventListener('click', () => { overlay.remove(); if (dlg) dlg.remove(); });

    const dlg = document.createElement('div');
    dlg.className = `${PREFIX}dialog`;
    dlg.setAttribute('data-aiext', '1');
    dlg.style.cssText = 'top:50% !important; left:50% !important; transform:translate(-50%,-50%) !important; width:360px !important;';

    const getBtnHtml = providers.map(p => `
      <button class="${PREFIX}warning-free-btn" data-aiext="1" data-provider="${p.key}" type="button">
        <span class="${PREFIX}warning-free-btn-name" data-aiext="1">${escapeHtml(p.name)}</span>
        <span class="${PREFIX}warning-free-btn-host" data-aiext="1">${escapeHtml(p.host)}</span>
        <span class="${PREFIX}warning-free-btn-cta" data-aiext="1">${t('settingsWarningFreeGetKey')} →</span>
      </button>
    `).join('');

    dlg.innerHTML = `
      <div class="${PREFIX}header" data-aiext="1">
        <span class="${PREFIX}title">${t('settingsWarningTitle')}</span>
        <span class="${PREFIX}close" data-aiext="1">&times;</span>
      </div>
      <div class="${PREFIX}warning">
        <p>${t('settingsWarningMessage')}</p>
        <p style="margin-top:8px;font-size:12px;">${t('settingsWarningSubMessage')}</p>
        ${providers.length > 0 ? `
        <div class="${PREFIX}warning-free">
          <span class="${PREFIX}warning-free-title">${t('settingsWarningFreeIntro')}</span>
          <div class="${PREFIX}warning-free-list">${getBtnHtml}</div>
        </div>` : ''}
      </div>
    `;

    _shadowAppend(overlay);
    _shadowAppend(dlg);
    overlay.style.zIndex = 2147483640;
    dlg.style.zIndex = 2147483641;
    dlg.querySelector(`.${PREFIX}close`).addEventListener('click', () => { overlay.remove(); dlg.remove(); });

    dlg.querySelectorAll(`.${PREFIX}warning-free-btn`).forEach(btn => {
      btn.addEventListener('click', async () => {
        const provider = providers.find(p => p.key === btn.dataset.provider);
        if (!provider) return;
        try {
          if (contextValid() && chrome.runtime && chrome.runtime.sendMessage) {
            await chrome.runtime.sendMessage({
              action: 'saveProviderPreset',
              baseUrl: provider.baseUrl,
              model: provider.model
            });
          }
        } catch (e) { /* context invalidated */ }
        window.open(provider.signup, '_blank', 'noopener');
        overlay.remove();
        dlg.remove();
      });
    });
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
  try {
    if (chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'openDialog') {
      (async () => {
        try {
          if (msg.srcUrl) {
            currentContext = { text: '', images: [msg.srcUrl] };
          } else {
            const sel = window.getSelection();
            if (sel.toString().trim() || (sel.rangeCount > 0 && sel.getRangeAt(0).cloneContents().querySelectorAll('img').length > 0)) {
              currentContext = await extractContextFromSelection(sel);
            } else {
              currentContext = { text: '', images: [] };
            }
          }
          await openDialog();
          if (typeof msg.initialText === 'string' && msg.initialText) {
            await new Promise(r => setTimeout(r, 0));
            const entries = Array.from(dialogs.values()).reverse();
            for (const state of entries) {
              const inputEl = state.dialog ? state.dialog.querySelector('.' + PREFIX + 'input') : null;
              if (inputEl) {
                inputEl.value = msg.initialText;
                inputEl.dispatchEvent(new Event('input'));
                inputEl.focus();
                break;
              }
            }
          }
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
        }
      })();
      return true;
    } else if (msg.action === 'fillInput' && typeof msg.text === 'string') {
      (async () => {
        try {
          if (msg.srcUrl) {
            currentContext = { text: '', images: [msg.srcUrl] };
            for (const state of dialogs.values()) {
              if (!state.dialog || !state.context) continue;
              const imgs = Array.isArray(state.context.images) ? state.context.images.slice() : [];
              if (!imgs.includes(msg.srcUrl)) {
                imgs.push(msg.srcUrl);
                state.context.images = imgs;
              }
            }
          }
          const entries = Array.from(dialogs.values()).reverse();
          for (const state of entries) {
            if (!state.dialog) continue;
            if (state.dialog.style.display === 'none') continue;
            const inputEl = state.dialog.querySelector('.' + PREFIX + 'input');
            if (inputEl) {
              inputEl.value = msg.text;
              inputEl.dispatchEvent(new Event('input'));
              inputEl.focus();
              sendResponse({ ok: true });
              return;
            }
          }
          sendResponse({ ok: false, error: 'no_dialog' });
        } catch (e) {
          sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
        }
      })();
      return true;
    } else if (msg.action === 'listClosedDialogs') {
      (async () => {
        try {
          const records = pruneExpired(await loadDialogRecords());
          const hostname = location.hostname;
          const closed = records
            .filter(r => r.hostname === hostname && r.closedAt)
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
                  preview = last.content
                    .filter(p => p && p.type === 'text')
                    .map(p => p.text)
                    .join(' ');
                }
              }
              return {
                id: r.id,
                hostname: r.hostname,
                url: r.url || '',
                closedAt: r.closedAt,
                messageCount: Array.isArray(r.conversationHistory) ? r.conversationHistory.length : 0,
                preview: preview.slice(0, 120),
                model: r.model || ''
              };
            });
          sendResponse({ ok: true, items: closed });
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
      })();
      return true;
    } else if (msg.action === 'restoreClosedDialog' && msg.persistId) {
      (async () => {
        try {
          let records = pruneExpired(await loadDialogRecords());
          const idx = records.findIndex(r => r && r.id === msg.persistId);
          if (idx < 0) return sendResponse({ ok: false, error: 'not_found' });
          const r = records[idx];
          delete r.closedAt;
          records[idx] = r;
          await saveDialogRecords(records);
          const config = await getConfig();
          if (!config || !config.apiKey) return sendResponse({ ok: false, error: 'no_api_key' });
          const quickPrompts = await getQuickPrompts();
          const ctx = { text: (r.context && r.context.text) || '', images: (r.context && r.context.images) || [] };
          const id = createDialog(
            { ...config, model: r.model || config.model },
            null,
            quickPrompts,
            ctx
          );
          const st = dialogs.get(id);
          if (!st) return sendResponse({ ok: false, error: 'state_missing' });
          st.persistId = r.id;
          st.persistedAt = r.createdAt;
          _persistedIds.add(r.id);
          if (r.position) {
            st.dialog.style.left = r.position.x + 'px';
            st.dialog.style.top = r.position.y + 'px';
            st.dialog.style.right = 'auto';
          }
          if (r.size && r.size.width) {
            st.dialog.style.width = r.size.width + 'px';
            if (r.size.height) st.dialog.style.height = r.size.height + 'px';
          }
          st.conversationHistory = (r.conversationHistory || []).map(m => ({ role: m.role, content: m.content }));
          st.conversationHistory.forEach(m => {
            if (m.role === 'user' || m.role === 'assistant') {
              const content = typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? m.content.filter(p => p && p.type === 'text').map(p => p.text).join('\n') : '');
              if (content) addMessage(id, m.role, content);
            }
          });
          addMessage(id, 'system', t('dialogRestoredHint'));
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
      })();
      return true;
    }
      });
    }
  } catch (e) {
    // Extension context invalidated
  }

  // Initialize showFloating cache and react to user changes in popup
  (async () => { _showFloating = await getShowFloating(); })();
  try {
    if (contextValid() && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.showFloating !== undefined) {
          _showFloating = changes.showFloating.newValue !== false;
          if (!_showFloating) hideFloatingIcon();
        }
      });
    }
  } catch (e) { _contextInvalid = true; }

  injectStyles();

  window.addEventListener('beforeunload', () => {
    if (!_storageAvailable()) return;
    const snapshots = [];
    for (const [id, st] of dialogs) {
      const rec = toRecord(st);
      if (rec) snapshots.push({ id, rec });
    }
    if (snapshots.length === 0) return;
    // Best-effort synchronous-ish flush via the promise we started — chrome.storage.local.set is async,
    // so we kick it off; browsers typically let storage calls complete during beforeunload.
    (async () => {
      let records = pruneExpired(await loadDialogRecords());
      const byId = new Map(records.map(r => [r.id, r]));
      for (const { rec } of snapshots) byId.set(rec.id, rec);
      records = [...byId.values()];
      if (records.length > MAX_TOTAL) {
        records.sort((a, b) => a.lastActive - b.lastActive);
        records = records.slice(records.length - MAX_TOTAL);
      }
      await saveDialogRecords(records);
    })();
  });

  restoreDialogsOnLoad();

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!contextValid()) return;
    try { injectStyles(); } catch (e) { /* context invalidated */ }
  });
})();
