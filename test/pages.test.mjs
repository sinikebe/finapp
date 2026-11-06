import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPages } from '../tools/build-pages.mjs';

async function fixture(work) {
  const root = await mkdtemp(join(tmpdir(), 'finapp-pages-'));
  try {
    const main = join(root, 'main'); const dev = join(root, 'dev'); const out = join(root, 'site');
    for (const [directory, text] of [[main, 'stable'], [dev, 'preview']]) {
      await mkdir(join(directory, 'assets/js'), { recursive: true });
      for (const file of ['index.html', 'manifest.webmanifest', 'manifest.fr.webmanifest']) await writeFile(join(directory, file), text);
      await writeFile(join(directory, 'sw.js'), 'const prefix = "finapp@";');
      await writeFile(join(directory, 'assets/js/deployment.js'), 'const prefix = "finapp-preview:";');
      await writeFile(join(directory, 'private.txt'), 'must not be published');
      await mkdir(join(directory, '.git')); await writeFile(join(directory, '.git/config'), 'private config');
    }
    await work({ main, dev, out });
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('Pages preserves main at the root and publishes dev beneath /dev/', async () => {
  await fixture(async (args) => {
    await buildPages(args);
    assert.equal(await readFile(join(args.out, 'index.html'), 'utf8'), 'stable');
    assert.equal(await readFile(join(args.out, 'dev/index.html'), 'utf8'), 'preview');
    const files = await readdir(args.out);
    assert.ok(files.includes('.nojekyll')); assert.ok(!files.includes('.git')); assert.ok(!files.includes('private.txt'));
    assert.ok(!(await readdir(join(args.out, 'dev'))).includes('private.txt'));
  });
});

test('Pages rejects unsafe previews, source-contained outputs, existing outputs and symlinks', async () => {
  await fixture(async (args) => {
    await assert.rejects(buildPages({ ...args, out: join(args.main, 'output') }), /outside/);
    await mkdir(args.out); await assert.rejects(buildPages(args), /EEXIST/); await rm(args.out, { recursive: true });
    await writeFile(join(args.dev, 'sw.js'), 'const prefix = "finapp-";');
    await assert.rejects(buildPages(args), /isolate/);
    await writeFile(join(args.dev, 'sw.js'), 'const prefix = "finapp@";');
    await symlink(join(args.main, 'private.txt'), join(args.dev, 'assets/leak'));
    await assert.rejects(buildPages(args), /symbolic link/);
  });
});

test('Pages only runs after same-repository successful push CI and deploys without checkout credentials', async () => {
  const workflow = await readFile(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflows: \[CI\]/);
  assert.match(workflow, /branches: \[main, dev\]/);
  assert.match(workflow, /workflow_run\.event == 'push'/);
  assert.match(workflow, /workflow_run\.head_repository\.full_name == github\.repository/);
  assert.match(workflow, /event: 'push', status: 'success'/);
  assert.match(workflow, /ref: \$\{\{ steps.refs.outputs.main \}\}/);
  assert.match(workflow, /ref: \$\{\{ steps.refs.outputs.dev \}\}/);
  assert.equal((workflow.match(/persist-credentials: false/g) || []).length, 2);
  assert.match(workflow, /data\.build_type === 'workflow'/);
  assert.match(workflow, /if: needs.build.outputs.deploy == 'true'/);
});
