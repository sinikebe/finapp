/** Isolate preview storage, including when dev lives at the root of its own host. */
import { DEPLOYMENT } from './deployment-config.js';

export function deploymentFor(url, target = DEPLOYMENT) {
  const base = new URL('./', url);
  if (!['legacy', 'main', 'dev'].includes(target.environment)) throw new Error('Unknown Finapp deployment environment.');
  const preview = target.environment === 'legacy' ? /\/dev\/$/.test(base.pathname) : target.environment === 'dev';
  return { preview, prefix: preview ? `finapp-preview:${base.pathname}:` : '', base };
}

/** Label development installs without changing their manifest identity or scope. */
export function deploymentTitle(title, preview = false) {
  return preview ? title.replace(/^Finapp(?: dev)?(?=\s|$)/, 'Finapp dev') : title;
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
