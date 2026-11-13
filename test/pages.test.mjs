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
      await writeFile(join(directory, 'index.html'), `<title>Finapp — estimate your financial future</title><meta id="apple-title" name="apple-mobile-web-app-title" content="Finapp"><body>${text}</body>`);
      for (const file of ['manifest.webmanifest', 'manifest.fr.webmanifest']) {
        await writeFile(join(directory, file), await readFile(new URL(`../${file}`, import.meta.url), 'utf8'));
      }
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
    assert.equal(await readFile(join(args.out, 'index.html'), 'utf8'), await readFile(join(args.main, 'index.html'), 'utf8'));
    const preview = await readFile(join(args.out, 'dev/index.html'), 'utf8');
    assert.match(preview, /<body>preview<\/body>/);
    assert.match(preview, /<title>Finapp dev — estimate your financial future<\/title>/);
    assert.match(preview, /name="apple-mobile-web-app-title" content="Finapp dev"/);
    const files = await readdir(args.out);
    assert.ok(files.includes('.nojekyll')); assert.ok(!files.includes('.git')); assert.ok(!files.includes('private.txt'));
    assert.ok(!(await readdir(join(args.out, 'dev'))).includes('private.txt'));
  });
});

test('both development install manifests have distinct names and preserve existing installation identities', async () => {
  await fixture(async (args) => {
    await buildPages(args);
    for (const file of ['manifest.webmanifest', 'manifest.fr.webmanifest']) {
      const original = await readFile(join(args.main, file), 'utf8');
      assert.equal(await readFile(join(args.out, file), 'utf8'), original);
      const main = JSON.parse(original);
      const dev = JSON.parse(await readFile(join(args.out, 'dev', file), 'utf8'));
      assert.equal(main.short_name, 'Finapp');
      assert.equal(dev.short_name, 'Finapp dev');
      assert.ok(dev.name.startsWith('Finapp dev — '));
      assert.deepEqual({ ...dev, name: main.name, short_name: main.short_name }, main);
      for (const key of ['id', 'start_url', 'scope']) {
        assert.equal(new URL(main[key], `https://example.org/finapp/${file}`).pathname, '/finapp/');
        assert.equal(new URL(dev[key], `https://example.org/finapp/dev/${file}`).pathname, '/finapp/dev/');
      }
      // Packaging does not rewrite either source checkout.
      assert.equal(await readFile(join(args.dev, file), 'utf8'), original);
    }
  });
});

test('Pages rejects unsafe previews, source-contained outputs, existing outputs and symlinks', async () => {
  await fixture(async (args) => {
    await assert.rejects(buildPages({ ...args, out: join(args.main, 'output') }), /outside/);
    await mkdir(args.out); await assert.rejects(buildPages(args), /EEXIST/); await rm(args.out, { recursive: true });
    await writeFile(join(args.dev, 'sw.js'), 'const prefix = "finapp-";');
    await assert.rejects(buildPages(args), /isolate/);
    await writeFile(join(args.dev, 'sw.js'), 'const prefix = "finapp@";');
    try { await symlink(join(args.main, 'private.txt'), join(args.dev, 'assets/leak')); }
    catch (error) {
      if (error.code !== 'EPERM') throw error; // Windows without symlink privileges.
      return;
    }
    await assert.rejects(buildPages(args), /symbolic link/);
  });
});

test('Pages only runs after same-repository successful push CI and deploys without checkout credentials', async () => {
  const workflow = await readFile(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflows: \[CI\]/);
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /workflow_run\.event == 'push'/);
  assert.match(workflow, /workflow_run\.head_repository\.full_name == github\.repository/);
  assert.match(workflow, /event: 'push', status: 'success'/);
  assert.match(workflow, /ref: \$\{\{ steps.refs.outputs.main \}\}/);
  assert.doesNotMatch(workflow, /steps.refs.outputs.dev/);
  assert.equal((workflow.match(/persist-credentials: false/g) || []).length, 1);
  assert.match(workflow, /node stable\/tools\/build-legacy-pages.mjs stable pages-site/);
  assert.match(workflow, /data\.build_type === 'workflow'/);
  assert.match(workflow, /if: needs.build.outputs.deploy == 'true'/);
});
