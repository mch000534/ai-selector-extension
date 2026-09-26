window.__aiext = window.__aiext || {};
window.__aiext.utils = {
  escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
  },

  normalizeBaseUrl(url) {
    const trimmed = String(url == null ? '' : url).trim().replace(/\/+$/, '');
    // Only http(s) endpoints get a version path. Anything else (non-URL
    // garbage, javascript:, data:, …) passes through untouched instead of
    // producing 'javascript:…/v1'.
    try {
      const u = new URL(trimmed);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return trimmed;
    } catch (e) {
      return trimmed;
    }
    let normalized = trimmed;
    if (!/\/v\d+$/i.test(normalized)) {
      normalized += '/v1';
    }
    return normalized;
  },

  // Image sources the extension accepts from messages: data: images or
  // http(s) URLs. Anything else (blob:, javascript:, …) is rejected.
  isTrustedImageSrc(src, base) {
    if (typeof src !== 'string' || !src) return false;
    if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(src)) return true;
    try {
      const u = base ? new URL(src, base) : new URL(src);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (e) {
      return false;
    }
  },
};
