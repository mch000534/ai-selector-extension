const MENU_PARENT_ID = 'ai-selector-parent';
const MENU_OPEN_ID = 'ai-selector-open';
const MENU_OPEN_SIDE_PANEL_ID = 'ai-selector-open-side-panel';
const MENU_PROMPT_PREFIX = 'ai-selector-prompt-';
const MENU_PROMPT_MORE = 'ai-selector-prompt-more';
const MENU_SEPARATOR_ID = 'ai-selector-separator';
const MAX_PROMPTS_IN_MENU = 20;

let _buildMenuPromise = null;

try {
  importScripts('lib/chat.js', 'lib/net.js');
} catch {}

const createOpenDrawerMessage = (options) => {
  const helper = globalThis.__aiext && globalThis.__aiext.chat && globalThis.__aiext.chat.createOpenDrawerMessage;
  if (helper) return helper(options || {});
  const msg = { action: 'openDrawer' };
  if (options && options.srcUrl) msg.srcUrl = options.srcUrl;
  if (options && options.initialText) msg.initialText = options.initialText;
  return msg;
};

// Fail-closed aliases for lib/net.js (shared with tests via vm loading).
const _net = (globalThis.__aiext && globalThis.__aiext.net) || null;
function isSafeFetchUrl(urlStr) {
  if (!_net) return false;
  return _net.isSafeFetchUrl(urlStr);
}

// Upper bound for a single fetched image (memory DoS guard).
const MAX_FETCH_IMAGE_BYTES = (_net && _net.MAX_FETCH_IMAGE_BYTES) || 5 * 1024 * 1024;
const MAX_FETCH_REDIRECTS = (_net && _net.MAX_FETCH_REDIRECTS) || 3;

function getMessage(key) {
  try {
    return chrome.i18n.getMessage(key) || key;
  } catch {
    return key;
  }
}

async function buildMenu() {
  if (_buildMenuPromise) return _buildMenuPromise;
  _buildMenuPromise = (async () => {
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

    chrome.contextMenus.create({
      id: MENU_OPEN_SIDE_PANEL_ID,
      parentId: MENU_PARENT_ID,
      title: getMessage('contextMenuOpenSidePanel'),
      contexts: ['all'],
    });

    let quickPrompts = [];
    try {
      const result = await chrome.storage.sync.get(['quickPrompts']);
      quickPrompts = Array.isArray(result.quickPrompts) ? result.quickPrompts : [];
    } catch {}

    if (quickPrompts.length > 0) {
      chrome.contextMenus.create({
        id: MENU_SEPARATOR_ID,
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
  })();
  try { return await _buildMenuPromise; }
  finally { _buildMenuPromise = null; }
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
    if (info.menuItemId === MENU_OPEN_SIDE_PANEL_ID) {
      const payload = createOpenDrawerMessage({ srcUrl: info.srcUrl || '' });
      await chrome.tabs.sendMessage(tab.id, payload);
    } else if (info.menuItemId === MENU_OPEN_ID || info.menuItemId === MENU_PROMPT_MORE) {
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
  if (sender.id !== chrome.runtime.id) return;

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
        if (!isSafeFetchUrl(msg.url)) {
          return sendResponse({ error: 'URL not allowed' });
        }
        // Manual redirect handling: each hop is re-validated so a 302 to
        // 169.254.169.254 (or any other blocked host) cannot bypass the check.
        let currentUrl = msg.url;
        let res = null;
        for (let hop = 0; hop <= MAX_FETCH_REDIRECTS; hop++) {
          res = await fetch(currentUrl, { redirect: 'manual' });
          if (res.status >= 300 && res.status < 400) {
            const loc = res.headers.get('location');
            if (!loc) return sendResponse({ error: `HTTP ${res.status}` });
            let next;
            try { next = new URL(loc, currentUrl).toString(); }
            catch (e) { return sendResponse({ error: 'Bad redirect URL' }); }
            if (!isSafeFetchUrl(next)) {
              return sendResponse({ error: 'URL not allowed' });
            }
            currentUrl = next;
            continue;
          }
          break;
        }
        if (!res) return sendResponse({ error: 'Fetch failed' });
        if (res.status >= 300 && res.status < 400) {
          return sendResponse({ error: 'Too many redirects' });
        }
        if (!res.ok) return sendResponse({ error: `HTTP ${res.status}` });
        const lenHeader = res.headers.get('content-length');
        if (lenHeader !== null && Number(lenHeader) > MAX_FETCH_IMAGE_BYTES) {
          return sendResponse({ error: 'Image too large' });
        }
        const contentType = res.headers.get('content-type');
        if (contentType && !contentType.toLowerCase().startsWith('image/')) {
          return sendResponse({ error: 'Not an image' });
        }
        const blob = await res.blob();
        if (blob.size > MAX_FETCH_IMAGE_BYTES) {
          return sendResponse({ error: 'Image too large' });
        }
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
