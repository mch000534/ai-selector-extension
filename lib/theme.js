window.__aiext = window.__aiext || {};

window.__aiext.isRtl = (chrome.i18n && chrome.i18n.getUILanguage
  ? ['ar', 'iw', 'fa', 'ur'].some(l => chrome.i18n.getUILanguage().startsWith(l))
  : false);

window.__aiext.theme = {
  getThemeColors() {
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
  },

  applyThemeVars() {
    const root = window.__aiext.shadow.root;
    if (!root) return;
    const c = this.getThemeColors();
    const vars = Object.entries(c).map(([k, v]) => `--aiext-${k}: ${v};`).join(' ');
    const css = `:host { ${vars} }`;
    let el = root.querySelector('style[data-aiext-theme]');
    if (el) { el.textContent = css; return; }
    el = document.createElement('style');
    el.setAttribute('data-aiext-theme', '1');
    el.textContent = css;
    root.appendChild(el);
  },
};
