/** Atomic workspace saves, legacy mirrors and recoverable per-tab drafts. */
import { newId } from './fields.js';
import { planOf } from './projects.js';

export const STORE_KEY = 'finapp.workspace.v1';
export const STATE_KEY = 'finapp.state.v3';
export const PROJECTS_KEY = 'finapp.projects.v1';
export const LEGACY_FIELDS_KEY = 'finapp.state.v2';
export const LEGACY_INPUT_KEY = 'finapp.inputs.v1';
export const DRAFT_PREFIX = 'finapp.draft.v1.';
export const STORE_KEYS = [STORE_KEY, STATE_KEY, PROJECTS_KEY];

function parse(raw, fallback = null) {
  try { return raw === null ? fallback : JSON.parse(raw); } catch { return fallback; }
}

export function readValue(storage, key, fallback = null) {
  try { return parse(storage().getItem(key), fallback); } catch { return fallback; }
}

export function writeValue(storage, key, value) {
  try { storage().setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

const valid = (value) => value && Array.isArray(value.flat?.strategies)
  && Array.isArray(value.shelf?.projects) && typeof value.revision === 'string';
const copy = (value) => JSON.parse(JSON.stringify(value));

/**
 * withLock runs a callback exclusively across tabs. The browser supplies Web
 * Locks; tests supply a shared queue. Without it the app remains editable and
 * exportable, but never pretends that an unsafe write has been saved.
 */
export function createPlanStore(storage, { withLock, tabId = newId() } = {}) {
  const draftKey = DRAFT_PREFIX + tabId;
  const raw = (key) => { try { return storage().getItem(key); } catch { return null; } };

  function read() {
    const atomicRaw = raw(STORE_KEY);
    const flatRaw = raw(STATE_KEY);
    const shelfRaw = raw(PROJECTS_KEY);
    const atomic = parse(atomicRaw);
    const flat = parse(flatRaw);
    const shelf = parse(shelfRaw);
    let data = { flat, shelf };
    let source = 'legacy';
    if (valid(atomic) && atomic.version === 1) {
      const flatAfter = JSON.stringify(atomic.flat);
      const shelfAfter = JSON.stringify(atomic.shelf);
      const foreignFlat = flatRaw !== flatAfter && flatRaw !== atomic.before?.flat;
      const foreignShelf = shelfRaw !== shelfAfter && shelfRaw !== atomic.before?.shelf;
      data = { flat: atomic.flat, shelf: atomic.shelf };
      source = 'atomic';
      const adoptFlat = foreignFlat && Array.isArray(flat?.strategies);
      const adoptShelf = foreignShelf && Array.isArray(shelf?.projects);
      if (adoptFlat || adoptShelf) {
        // An older build edited a mirror. Park the canonical open plan before
        // adopting it, so switching subjects cannot empty the previous project.
        const parked = atomic.shelf.projects.filter((one) => one && typeof one === 'object').map((one) => one.id === atomic.shelf.openProjectId
          ? { ...one, plan: planOf(atomic.flat) } : one);
        const fallback = new Map(parked.map((one) => [one.id, one.plan]));
        const incoming = adoptShelf ? shelf : atomic.shelf;
        data = {
          flat: adoptFlat ? flat : atomic.flat,
          shelf: { ...incoming, projects: incoming.projects.filter((one) => one && typeof one === 'object').map((one) => (
            one.plan ? one : { ...one, plan: fallback.get(one.id) || null }
          )) },
        };
        source = 'legacy';
      }
    }
    return {
      data: {
        ...copy(data),
        legacyFields: parse(raw(LEGACY_FIELDS_KEY)), legacyInputs: parse(raw(LEGACY_INPUT_KEY)),
      },
      token: JSON.stringify([atomicRaw, flatRaw, shelfRaw]),
      source,
    };
  }

  function stage(snapshot) {
    return writeValue(storage, draftKey, { snapshot, updatedAt: Date.now() });
  }

  function drafts() {
    const current = read().data;
    const saved = JSON.stringify({ flat: current.flat, shelf: current.shelf });
    try {
      const db = storage();
      const found = [];
      for (let at = 0; at < db.length; at += 1) {
        const key = db.key(at);
        if (!key?.startsWith(DRAFT_PREFIX)) continue;
        const draft = parse(db.getItem(key));
        if (draft?.snapshot?.flat?.strategies && draft.snapshot.shelf?.projects
            && JSON.stringify(draft.snapshot) !== saved) found.push({ ...draft, key });
      }
      return found.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch { return []; }
  }

  async function save(snapshot, expected) {
    const frozen = copy(snapshot);
    if (!withLock) return { status: 'unavailable' };
    try {
      return await withLock(() => {
        const before = read();
        if (before.token !== expected) return { status: 'conflict', latest: before };
        const db = storage();
        const record = {
          version: 1, revision: newId(), ...frozen,
          before: { flat: db.getItem(STATE_KEY), shelf: db.getItem(PROJECTS_KEY) },
        };
        // The only authoritative write. Either the entire workspace is here,
        // or the previous one remains untouched, including the arriving plan.
        db.setItem(STORE_KEY, JSON.stringify(record));
        let mirrored = false;
        try {
          db.setItem(PROJECTS_KEY, JSON.stringify(frozen.shelf));
          db.setItem(STATE_KEY, JSON.stringify(frozen.flat));
          mirrored = true;
        } catch { /* a mirror failure cannot invalidate the atomic save */ }
        if (mirrored) {
          for (const key of [LEGACY_FIELDS_KEY, LEGACY_INPUT_KEY]) {
            try { db.removeItem(key); } catch { /* harmless legacy copy */ }
          }
        }
        // A keystroke may have staged a newer draft while the lock was queued.
        if (JSON.stringify(parse(raw(draftKey))?.snapshot) === JSON.stringify(frozen)) {
          try { db.removeItem(draftKey); } catch { /* a redundant recovery copy */ }
        }
        return { status: 'saved', latest: read(), mirrored };
      });
    } catch { return { status: 'error' }; }
  }

  function discardDraft(key = draftKey) {
    if (typeof key !== 'string' || !key.startsWith(DRAFT_PREFIX)) return;
    try { storage().removeItem(key); } catch { /* recovery copy can remain */ }
  }

  function keepRecovery(snapshot) {
    const key = `${DRAFT_PREFIX}recovery-${newId()}`;
    return writeValue(storage, key, { snapshot: copy(snapshot), updatedAt: Date.now() }) ? key : null;
  }

  return { read, stage, save, drafts, discardDraft, keepRecovery };
}
