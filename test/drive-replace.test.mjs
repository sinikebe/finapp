import test from 'node:test';
import assert from 'node:assert/strict';
import { createSaveController } from '../assets/js/save-controller.js';

function fixture() {
  let visible = { projects: ['Synthetic local'] };
  let token = 'original';
  let finish;
  const staged = [];
  const store = {
    read: () => ({ token, data: visible }),
    drafts: () => staged,
    stage: (snapshot) => { staged.push(structuredClone(snapshot)); return true; },
    discardDraft: () => {},
    save: (snapshot, expected) => {
      assert.equal(expected, 'original');
      return new Promise((resolve) => {
        finish = (result = { status: 'saved' }) => {
          if (result.status === 'saved') token = 'updated';
          resolve({ ...result, latest: { token, data: snapshot } });
        };
      });
    },
  };
  const controller = createSaveController({ store, initial: store.read(), snapshot: () => visible,
    adopt: (next) => { visible = next; }, clock: { setTimeout() {}, clearTimeout() {} },
  });
  return { controller, store, get: () => visible, edit: (next) => { visible = next; }, finish: (...args) => finish(...args), external: () => { token = 'foreign'; }, staged };
}

test('a failed local write cannot replace the workspace displayed on screen', async () => {
  const f = fixture();
  const pending = f.controller.replacePersisted({ projects: ['Synthetic Drive'] });
  assert.deepEqual(f.get(), { projects: ['Synthetic local'] });
  f.finish({ status: 'error' });
  assert.equal((await pending).status, 'error');
  assert.deepEqual(f.get(), { projects: ['Synthetic local'] });
});

test('a Drive workspace is adopted only when its local write completes', async () => {
  const f = fixture();
  const pending = f.controller.replacePersisted({ projects: ['Synthetic Drive'] });
  assert.deepEqual(f.get(), { projects: ['Synthetic local'] });
  f.finish();
  assert.equal((await pending).status, 'saved');
  assert.deepEqual(f.get(), { projects: ['Synthetic Drive'] });
  assert.equal(f.controller.status().dirty, false);
});

test('an edit during persistence is kept as a draft instead of being discarded', async () => {
  const f = fixture();
  const pending = f.controller.replacePersisted({ projects: ['Synthetic Drive'] });
  f.edit({ projects: ['Synthetic unsaved edit'] });
  f.finish();
  assert.equal((await pending).status, 'conflict');
  assert.deepEqual(f.get(), { projects: ['Synthetic unsaved edit'] });
  assert.deepEqual(f.staged, [{ projects: ['Synthetic unsaved edit'] }]);
});

test('a newer tab revision stops a Drive replacement before writing', async () => {
  const f = fixture();
  f.external();
  assert.equal((await f.controller.replacePersisted({ projects: ['Synthetic Drive'] })).status, 'conflict');
  assert.deepEqual(f.get(), { projects: ['Synthetic local'] });
});
