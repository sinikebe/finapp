import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/*
 * app.js and the view modules export nothing and run at import, so the facts
 * worth holding about them are held by reading the source — the same way
 * about.test.mjs reads sw.js for its cache version. A grep is a weak test and
 * is used here only for things that have no other witness.
 */

const sourceOf = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('a live region is written to only when what it says has changed', async () => {
  // Both of these are `role="status"` and both are written from a render, which
  // is to say on every keystroke anywhere in the app. Assigning the same
  // sentence again still counts as a change to a screen reader, so an unguarded
  // write means a reader who undid something — or who asked what a target would
  // take — has it read at them on every letter they type afterwards. The guard
  // is one line and invisible when it is right, which is exactly why it wants a
  // test: the undo receipt was written with it and the milestone answer was not.
  const guarded = [
    ['assets/js/app.js', 'undoSaid'],
    ['assets/js/milestone-list.js', 'answer'],
  ];

  for (const [file, node] of guarded) {
    const source = await sourceOf(file);
    // Clearing a region is exempt: writing '' where '' already stood announces
    // nothing, and the clear has to be unconditional so it cannot be skipped.
    const writes = [...source.matchAll(new RegExp(`\\.${node}\\.textContent = (?!'')`, 'g'))];
    assert.ok(writes.length > 0, `${file} still writes to ${node}`);
    for (const write of writes) {
      const before = source.slice(Math.max(0, write.index - 240), write.index);
      assert.match(
        before,
        // The guard sits on the same line, and the match itself starts partway
        // through the identifier it writes to, so the tail of that identifier is
        // what the window ends on.
        /if \([\w.]+\.textContent !== \w+\)\s*[\w.]*$/,
        `${file}: the write to ${node}.textContent is guarded on the text having changed`,
      );
    }
  }
});
