chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'ai-selector-open',
    title: 'AI 劃詞助手',
    contexts: ['all'],
  });
  chrome.contextMenus.create({
    id: 'ai-selector-image',
    title: 'AI 圖片助手',
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
});
