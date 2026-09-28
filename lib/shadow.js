window.__aiext = window.__aiext || {};
window.__aiext.PREFIX = '__aiext_';

window.__aiext.shadow = (() => {
  let host = null;
  let root = null;

  function ensure() {
    // Heal automatically when an SPA replaced document.body: the cached host
    // is detached, so drop it and rebuild instead of returning a dead tree.
    if (root && host && host.isConnected) return root;
    host = null;
    root = null;
    if (!document.body) return null;
    host = document.createElement('div');
    host.id = 'aiext-root';
    host.setAttribute('data-aiext', '1');
    Object.assign(host.style, {
      all: 'initial',
      position: 'static',
      display: 'block',
      width: '0',
      height: '0',
      pointerEvents: 'none',
      zIndex: '0'
    });
    document.body.appendChild(host);
    root = host.attachShadow({ mode: 'closed' });
    return root;
  }

  function destroy() {
    try { if (host && host.remove) host.remove(); } catch (e) {}
    host = null;
    root = null;
  }

  return {
    get root() { return root || ensure(); },
    get host() { return host; },
    connected() { return !!(host && host.isConnected); },
    ensure,
    destroy,
    append(el) { const r = ensure(); if (r) r.appendChild(el); else document.body.appendChild(el); },
    query(sel) { const r = root || ensure(); return r ? r.querySelector(sel) : document.querySelector(sel); },
    queryAll(sel) { const r = root || ensure(); return r ? r.querySelectorAll(sel) : document.querySelectorAll(sel); },
    isOurElement(el) {
      if (!el) return false;
      if (root && typeof el.getRootNode === 'function' && el.getRootNode() === root) return true;
      while (el) {
        if (el.getAttribute && el.getAttribute('data-aiext')) return true;
        if (el === host) return true;
        el = el.parentElement;
      }
      return false;
    },
  };
})();
