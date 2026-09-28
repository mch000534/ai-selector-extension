const __aiextNetRoot = typeof window !== 'undefined' ? window : globalThis;
__aiextNetRoot.__aiext = __aiextNetRoot.__aiext || {};
__aiextNetRoot.__aiext.net = {
  // Upper bound for a single fetched image (memory DoS guard).
  MAX_FETCH_IMAGE_BYTES: 5 * 1024 * 1024,
  MAX_FETCH_REDIRECTS: 3,

  // Reject localhost, private, and link-local hosts to prevent SSRF via
  // attacker-controlled <img src> routed through fetchImageAsDataUrl.
  // NOTE: string-based check only; DNS rebinding (TOCTOU) is out of scope.
  isSafeFetchUrl(urlStr) {
    let u;
    try { u = new URL(urlStr); } catch (e) { return false; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    let host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    // WHATWG URL normalizes ::ffff:127.0.0.1 to ::ffff:7f00:1, so match the
    // prefix rather than the dotted form. Block all IPv4-mapped IPv6 — no
    // legitimate public image host uses that literal.
    if (host.startsWith('::ffff:')) return false;
    const mapped = host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) host = mapped[1];
    if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') return false;
    const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (v4) {
      const a = Number(v4[1]), b = Number(v4[2]);
      if (a === 0 || a === 127) return false;
      if (a === 10) return false;
      if (a === 172 && b >= 16 && b <= 31) return false;
      if (a === 192 && b === 168) return false;
      if (a === 169 && b === 254) return false; // link-local incl. cloud metadata
      if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT 100.64.0.0/10
      if (a === 198 && (b === 18 || b === 19)) return false; // 198.18.0.0/15 benchmark
      if (a >= 224) return false; // multicast + limited broadcast (224.0.0.0/4, 255.255.255.255)
    }
    if (host.startsWith('fe80:') || host.startsWith('fec0:')) return false; // link-local + site-local
    if (host.startsWith('fc') || host.startsWith('fd')) return false; // unique-local
    if (host.startsWith('64:ff9b:')) return false; // NAT64 64:ff9b::/96
    return true;
  },
};
