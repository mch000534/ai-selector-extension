window.__aiext = window.__aiext || {};
window.__aiext.utils = {
  escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
  },

  normalizeBaseUrl(url) {
    let normalized = url.trim().replace(/\/+$/, '');
    if (!/\/v\d+$/i.test(normalized)) {
      normalized += '/v1';
    }
    return normalized;
  },
};
