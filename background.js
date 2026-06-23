const MENU_PARENT_ID = 'ai-selector-parent';
const MENU_OPEN_ID = 'ai-selector-open';
const MENU_PROMPT_PREFIX = 'ai-selector-prompt-';
const MENU_PROMPT_MORE = 'ai-selector-prompt-more';
const MAX_PROMPTS_IN_MENU = 20;

function getMessage(key) {
  try {
    return chrome.i18n.getMessage(key) || key;
  } catch {
    return key;
  }
}

async function buildMenu() {
  try {
    await chrome.contextMenus.removeAll();
  } catch {}

  chrome.contextMenus.create({
    id: MENU_PARENT_ID,
    title: getMessage('contextMenuTitle'),
    contexts: ['all'],
  });

  chrome.contextMenus.create({
    id: MENU_OPEN_ID,
    parentId: MENU_PARENT_ID,
    title: getMessage('contextMenuOpenDialog'),
    contexts: ['all'],
  });

  let quickPrompts = [];
  try {
    const result = await chrome.storage.sync.get(['quickPrompts']);
    quickPrompts = Array.isArray(result.quickPrompts) ? result.quickPrompts : [];
  } catch {}

  if (quickPrompts.length > 0) {
    chrome.contextMenus.create({
      type: 'separator',
      parentId: MENU_PARENT_ID,
      contexts: ['all'],
    });

    const visible = quickPrompts.slice(0, MAX_PROMPTS_IN_MENU);
    visible.forEach((prompt, i) => {
      const title = (typeof prompt === 'string' && prompt.length > 80) ? prompt.slice(0, 77) + '...' : String(prompt || '');
      chrome.contextMenus.create({
        id: `${MENU_PROMPT_PREFIX}${i}`,
        parentId: MENU_PARENT_ID,
        title: title || '·',
        contexts: ['all'],
      });
    });

    if (quickPrompts.length > MAX_PROMPTS_IN_MENU) {
      chrome.contextMenus.create({
        id: MENU_PROMPT_MORE,
        parentId: MENU_PARENT_ID,
        title: getMessage('contextMenuMorePrompts'),
        contexts: ['all'],
      });
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  buildMenu();
});

chrome.runtime.onStartup.addListener(() => {
  buildMenu();
});

buildMenu();

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || typeof tab.id !== 'number') return;
  try {
    if (info.menuItemId === MENU_OPEN_ID || info.menuItemId === MENU_PROMPT_MORE) {
      const payload = { action: 'openDialog' };
      if (info.srcUrl) payload.srcUrl = info.srcUrl;
      await chrome.tabs.sendMessage(tab.id, payload);
    } else if (typeof info.menuItemId === 'string' && info.menuItemId.startsWith(MENU_PROMPT_PREFIX)) {
      const index = parseInt(info.menuItemId.slice(MENU_PROMPT_PREFIX.length), 10);
      let prompt = '';
      if (!isNaN(index)) {
        try {
          const result = await chrome.storage.sync.get(['quickPrompts']);
          const prompts = Array.isArray(result.quickPrompts) ? result.quickPrompts : [];
          prompt = prompts[index] || '';
        } catch {}
      }
      if (prompt) {
        const payload = { action: 'openDialog', initialText: prompt };
        if (info.srcUrl) payload.srcUrl = info.srcUrl;
        try {
          await chrome.tabs.sendMessage(tab.id, payload);
        } catch {
          const fallback = { action: 'fillInput', text: prompt };
          if (info.srcUrl) fallback.srcUrl = info.srcUrl;
          await chrome.tabs.sendMessage(tab.id, fallback);
        }
      }
    }
  } catch {
    // content script not loaded on this page (e.g. chrome:// URLs)
  }
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.quickPrompts) {
    buildMenu();
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'captureScreenshot') {
    (async () => {
      try {
        const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
        sendResponse({ dataUrl });
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

  if (msg.action === 'fetchImageAsDataUrl' && msg.url) {
    (async () => {
      try {
        const res = await fetch(msg.url);
        if (!res.ok) return sendResponse({ error: `HTTP ${res.status}` });
        const blob = await res.blob();
        const reader = new FileReader();
        reader.onload = () => sendResponse({ dataUrl: reader.result });
        reader.onerror = () => sendResponse({ error: 'FileReader failed' });
        reader.readAsDataURL(blob);
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

  if (msg.action === 'saveProviderPreset' && msg.baseUrl && msg.model) {
    (async () => {
      try {
        await chrome.storage.sync.set({ baseUrl: msg.baseUrl, model: msg.model });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

  if (msg.action === 'rebuildContextMenu') {
    (async () => {
      try {
        await buildMenu();
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }
});
