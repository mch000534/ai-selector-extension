const __aiextActionsRoot = typeof window !== 'undefined' ? window : globalThis;
__aiextActionsRoot.__aiext = __aiextActionsRoot.__aiext || {};

const Actions = __aiextActionsRoot.__aiext.actions = {
  MAX_SELECTION_CHARS: 2000,

  // Model-facing prompt templates (English by design, like the system
  // prompt). UI labels live in _locales; only ids travel through storage.
  DEFINITIONS: [
    { id: 'translate', labelKey: 'actionTranslate' },
    { id: 'convertChinese', labelKey: 'actionConvertChinese' },
    { id: 'explain', labelKey: 'actionExplain' },
    { id: 'summarize', labelKey: 'actionSummarize' },
    { id: 'polish', labelKey: 'actionPolish' },
    { id: 'tutorial', labelKey: 'actionTutorial' },
  ],

  defaultEnabledIds() {
    return Actions.DEFINITIONS.map(d => d.id);
  },

  // Non-array (absent/corrupt) falls back to all; an explicit empty array
  // stays empty so users can disable the whole group.
  normalizeEnabledIds(ids) {
    const known = new Set(Actions.defaultEnabledIds());
    if (!Array.isArray(ids)) return Actions.defaultEnabledIds();
    return ids.filter(id => typeof id === 'string' && known.has(id));
  },

  convertTarget(uiLang) {
    return /^(zh-TW|zh-HK|zh-Hant)/i.test(String(uiLang || ''))
      ? 'Simplified Chinese'
      : 'Traditional Chinese';
  },

  // Builds the dialog input for a built-in action. Returns null when the
  // action is unknown or there is no selection to act on.
  buildActionPrompt(actionId, { selection, uiLang } = {}) {
    const text = String(selection || '').trim().slice(0, Actions.MAX_SELECTION_CHARS);
    if (!text) return null;
    const lang = String(uiLang || 'en').trim() || 'en';
    const quote = `"""\n${text}\n"""`;
    switch (actionId) {
      case 'translate':
        return `Translate the following text into ${lang}. Respond with the translation only:\n\n${quote}`;
      case 'convertChinese':
        return `Convert the following text to ${Actions.convertTarget(lang)}. Respond with the converted text only:\n\n${quote}`;
      case 'explain':
        return `Explain the following text in ${lang}. Be concise:\n\n${quote}`;
      case 'summarize':
        return `Summarize the following text in ${lang} using 3-5 bullet points:\n\n${quote}`;
      case 'polish':
        return `Proofread and improve the writing of the following text. Keep the original meaning and respond with the revised text only:\n\n${quote}`;
      case 'tutorial':
        return `Write a concise step-by-step tutorial explaining the following. Respond in ${lang}:\n\n${quote}`;
      default:
        return null;
    }
  },
};
