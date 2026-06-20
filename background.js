chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'ai-selector-open',
    title: 'AI 劃詞助手',
    contexts: ['all'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'ai-selector-open') return;
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'openDialog' });
  } catch {
    // content script not loaded on this page (e.g. chrome:// URLs)
  }
});
