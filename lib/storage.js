const __aiextStorageRoot = typeof window !== 'undefined' ? window : globalThis;
__aiextStorageRoot.__aiext = __aiextStorageRoot.__aiext || {};

const Storage = __aiextStorageRoot.__aiext.storage = {
  SCHEMA_VERSION: 1,

  _area(area) {
    try {
      const chromeNs = __aiextStorageRoot.chrome;
      if (!chromeNs || !chromeNs.storage) return null;
      if (!chromeNs.runtime || chromeNs.runtime.id == null) return null;
      const s = chromeNs.storage;
      return (area === 'local' ? s.local : s.sync) || null;
    } catch (e) {
      return null;
    }
  },

  // Promise wrapper with lastError handling: chrome's promise-form storage
  // rejects on lastError, which we convert to the caller-supplied fallback
  // instead of an unhandled rejection inside an async callback.
  async _get(area, keys, fallback) {
    const store = Storage._area(area);
    const empty = fallback !== undefined ? fallback : {};
    if (!store) return empty;
    try {
      const result = await store.get(keys);
      if (!result || typeof result !== 'object') return empty;
      return result;
    } catch (e) {
      return empty;
    }
  },

  getSync(keys, fallback) { return Storage._get('sync', keys, fallback); },
  getLocal(keys, fallback) { return Storage._get('local', keys, fallback); },

  async _set(area, obj) {
    const store = Storage._area(area);
    if (!store) return false;
    try {
      await store.set(obj);
      return true;
    } catch (e) {
      return false;
    }
  },

  setSync(obj) { return Storage._set('sync', obj); },
  setLocal(obj) { return Storage._set('local', obj); },

  // Stamps the schema version on first run so future migrations have a
  // baseline. Returns {migrated, from}. Never throws.
  async ensureSchema() {
    try {
      const cur = await Storage.getSync(['schemaVersion'], {});
      if (!cur || typeof cur.schemaVersion !== 'number') {
        const stamped = await Storage.setSync({ schemaVersion: Storage.SCHEMA_VERSION });
        return { migrated: stamped, from: 0 };
      }
      return { migrated: false, from: cur.schemaVersion };
    } catch (e) {
      return { migrated: false, from: -1 };
    }
  },
};
