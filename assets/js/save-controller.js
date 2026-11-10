/** Debounced saves with recoverable edits and deferred foreign updates. No DOM. */
export function createSaveController({ store, snapshot, initial, initialBaseline, adopt, editing = () => false, notify = () => {}, clock = globalThis, delay = 250 }) {
  let loaded = initial || store.read();
  let baseline = initialBaseline ?? JSON.stringify(snapshot());
  let dirty = false;
  let state = 'saved';
  let pendingRemote = false;
  let saving = null;
  let timer = null;
  let recoveries = store.drafts();

  const status = () => ({ dirty, state, pendingRemote, saving: Boolean(saving), recoveries });
  function clearTimer() { if (timer !== null) clock.clearTimeout(timer); timer = null; }
  function stage() {
    const value = snapshot();
    dirty = JSON.stringify(value) !== baseline;
    // Undo during a queued save is an edit too: the queued write may still land.
    if ((dirty || saving) && !store.stage(value)) state = 'error';
    return value;
  }
  function clean() {
    if (!saving) { store.discardDraft(); state = 'saved'; recoveries = store.drafts(); }
  }
  function receive() {
    const latest = store.read();
    if (latest.token === loaded.token) return;
    pendingRemote = true;
    if (dirty || saving || editing()) { state = dirty ? 'conflict' : 'remote'; notify(); return; }
    loaded = latest;
    adopt(latest.data);
    baseline = JSON.stringify(snapshot());
    dirty = false;
    pendingRemote = false;
    state = 'saved';
    recoveries = store.drafts();
    notify();
  }
  async function save() {
    clearTimer();
    const value = stage();
    if (saving) return saving;
    if (!dirty) { clean(); receive(); notify(); return { status: state }; }
    const written = JSON.stringify(value);
    state = 'pending';
    saving = store.save(value, loaded.token);
    notify();
    const result = await saving;
    saving = null;
    if (result.status === 'saved') {
      loaded = result.latest;
      baseline = written;
      dirty = JSON.stringify(snapshot()) !== baseline;
      state = dirty ? 'pending' : 'saved';
      recoveries = store.drafts();
      if (dirty) timer = clock.setTimeout(save, 0);
    } else { state = result.status; pendingRemote = state === 'conflict'; }
    notify();
    return result;
  }
  function persist() {
    clearTimer();
    stage();
    if (dirty || saving) {
      if (!['error', 'conflict', 'unavailable'].includes(state)) state = 'pending';
      timer = clock.setTimeout(save, delay);
    } else { clean(); receive(); }
    notify();
  }
  function loadLatest() {
    if (saving) return false;
    clearTimer();
    store.discardDraft();
    loaded = store.read();
    adopt(loaded.data);
    baseline = JSON.stringify(snapshot());
    dirty = pendingRemote = false;
    state = 'saved';
    recoveries = store.drafts();
    notify();
    return true;
  }
  async function replace(value) {
    if (saving) return { status: 'busy' };
    const latest = store.read();
    if (latest.token !== loaded.token) { state = 'conflict'; pendingRemote = true; notify(); return { status: 'conflict' }; }
    loaded = latest;
    // An explicit restoration is checked against the current saved revision.
    baseline = '';
    adopt(value);
    persist();
    return save();
  }

  /** Adopt a Drive copy only after the local store has accepted its complete snapshot. */
  async function replacePersisted(value, isCurrent = () => true) {
    if (saving || dirty || pendingRemote || editing()) return { status: 'busy' };
    const before = JSON.stringify(snapshot());
    const latest = store.read();
    if (latest.token !== loaded.token || !isCurrent()) {
      state = 'conflict'; pendingRemote = true; notify();
      return { status: 'conflict' };
    }
    const frozen = JSON.parse(JSON.stringify(value));
    clearTimer();
    state = 'pending';
    saving = store.save(frozen, loaded.token);
    notify();
    let result;
    try { result = await saving; }
    catch { result = { status: 'error' }; }
    saving = null;
    if (result.status !== 'saved') {
      state = result.status; pendingRemote = state === 'conflict'; notify();
      return result;
    }
    loaded = result.latest;
    baseline = JSON.stringify(frozen);
    if (!isCurrent() || JSON.stringify(snapshot()) !== before || store.read().token !== loaded.token) {
      dirty = true; pendingRemote = true; state = store.stage(snapshot()) ? 'conflict' : 'error';
      recoveries = store.drafts(); notify();
      return { status: state };
    }
    adopt(frozen);
    baseline = JSON.stringify(snapshot());
    dirty = pendingRemote = false;
    state = 'saved';
    recoveries = store.drafts();
    notify();
    return result;
  }
  return { status, persist, save, receive, stage, loadLatest, replace, replacePersisted };
}
