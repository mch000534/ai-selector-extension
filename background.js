chrome.runtime.onInstalled.addListener(() => {
  const i18n = chrome.i18n;
  chrome.contextMenus.create({
    id: 'ai-selector-open',
    title: (i18n && i18n.getMessage) ? i18n.getMessage('contextMenuTitle') : 'AI Selection Assistant',
    contexts: ['all'],
  });
  chrome.contextMenus.create({
    id: 'ai-selector-image',
    title: (i18n && i18n.getMessage) ? i18n.getMessage('contextMenuImageTitle') : 'AI Image Assistant',
    contexts: ['image'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'ai-selector-open') {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'openDialog' });
    } catch {
      // content script not loaded on this page (e.g. chrome:// URLs)
    }
  } else if (info.menuItemId === 'ai-selector-image') {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'openDialogWithImage', srcUrl: info.srcUrl });
    } catch {
      // content script not loaded on this page
    }
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
});
