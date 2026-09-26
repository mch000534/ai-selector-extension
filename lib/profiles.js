const __aiextProfilesRoot = typeof window !== 'undefined' ? window : globalThis;
__aiextProfilesRoot.__aiext = __aiextProfilesRoot.__aiext || {};

const Profiles = __aiextProfilesRoot.__aiext.profiles = {
  STORAGE_KEY: 'aiext_profiles_v1',

  newId() {
    try {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) {}
    return 'p' + Date.now().toString(36) + Math.floor(Math.random() * 0xffffff).toString(36);
  },

  // Best-effort display name for a base URL (hostname, no credentials).
  deriveName(baseUrl) {
    try {
      const u = new URL(String(baseUrl || '').trim());
      return u.hostname || 'custom';
    } catch (e) {
      return 'custom';
    }
  },

  normalizeProfiles(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter(p => p && typeof p === 'object')
      .map(p => ({
        id: typeof p.id === 'string' && p.id ? p.id : Profiles.newId(),
        name: typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 80) : Profiles.deriveName(p.baseUrl),
        baseUrl: typeof p.baseUrl === 'string' ? p.baseUrl.trim() : '',
        apiKey: typeof p.apiKey === 'string' ? p.apiKey : '',
        model: typeof p.model === 'string' ? p.model.trim() : '',
      }))
      .filter(p => p.baseUrl);
  },

  findProfile(list, id) {
    if (!Array.isArray(list) || !id) return null;
    return list.find(p => p && p.id === id) || null;
  },

  // Upsert keyed by normalized baseUrl: re-saving the same endpoint updates
  // the stored key/model instead of duplicating the profile.
  // Returns { profiles, id } with the affected profile id.
  upsertProfile(list, { baseUrl, apiKey, model }) {
    const profiles = Profiles.normalizeProfiles(list);
    const normUrl = typeof baseUrl === 'string' ? baseUrl.trim() : '';
    if (!normUrl) return { profiles, id: null };
    const existing = profiles.find(p => p.baseUrl === normUrl);
    if (existing) {
      if (typeof apiKey === 'string') existing.apiKey = apiKey;
      if (typeof model === 'string') existing.model = model.trim();
      return { profiles, id: existing.id };
    }
    const created = {
      id: Profiles.newId(),
      name: Profiles.deriveName(normUrl),
      baseUrl: normUrl,
      apiKey: typeof apiKey === 'string' ? apiKey : '',
      model: typeof model === 'string' ? model.trim() : '',
    };
    profiles.push(created);
    return { profiles, id: created.id };
  },

  deleteProfile(list, id) {
    if (!Array.isArray(list) || !id) return Array.isArray(list) ? list : [];
    return list.filter(p => p && p.id !== id);
  },
};
