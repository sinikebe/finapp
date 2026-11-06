/** Isolate a /dev/ preview while keeping existing production storage readable. */
export function deploymentFor(url) {
  const base = new URL('./', url);
  const preview = /\/dev\/$/.test(base.pathname);
  return { preview, prefix: preview ? `finapp-preview:${base.pathname}:` : '', base };
}

export function scopedStorage(getStorage, prefix = '') {
  const physical = (key) => prefix + key;
  const logical = (key) => {
    if (key === null) return null;
    if (!prefix) return key.startsWith('finapp-preview:') ? undefined : key;
    return key.startsWith(prefix) ? key.slice(prefix.length) : undefined;
  };
  const keys = () => {
    const db = getStorage();
    return Array.from({ length: db.length }, (_, at) => db.key(at)).filter((key) => key !== null && logical(key) !== undefined);
  };
  const getter = () => ({
    getItem: (key) => getStorage().getItem(physical(key)),
    setItem: (key, value) => getStorage().setItem(physical(key), value),
    removeItem: (key) => getStorage().removeItem(physical(key)),
    get length() { return keys().length; },
    key: (at) => { const key = keys()[at]; return key === undefined ? null : logical(key); },
  });
  return { storage: getter, physical, logical };
}
