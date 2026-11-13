import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildContext, buildCloudflareWorker } from '../tools/build-cloudflare-worker.mjs';
import { assertCacheDiff, assertCacheVersion } from '../tools/check-cache-version.mjs';
import { deploymentFor } from '../assets/js/deployment.js';
import { suiteLinks } from '../assets/js/app-switcher.js';
import { supportsWorkerSession } from '../assets/js/finapp-worker-session.js';
import { deploymentDriveNamespace } from '../assets/js/finapp-drive-format.js';

const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const cases = [['main', 'production'], ['dev', 'preview'], ['main', 'test'], ['feature/new-view', 'test']];

test('the Finapp adapter consumes the shared packaging environment at the exact checkout', () => {
  for (const [branch, environment] of cases) {
    const context = buildContext({ branch, environment, revision });
    assert.equal(context.sourceBranch, branch);
    assert.equal(context.environment, branch === 'main' ? 'main' : 'dev');
  }
  assert.throws(() => buildContext({ branch: 'main', environment: 'production', revision: 'none' }), /checked-out revision/);
  assert.throws(() => buildContext({ branch: '', revision }), /source branch/);
  for (const [branch, environment] of [['dev', 'production'], ['main', 'preview'], ['main', 'unknown']]) {
    assert.throws(() => buildContext({ branch, environment, revision }), /Use main for production/);
  }
});

test('static previews preserve dashboard domains and use the shared pinned toolchain', async () => {
  const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(config.name, 'siniverse-finapp-site');
  assert.equal(config.assets.directory, './dist');
  assert.equal(config.assets.not_found_handling, 'single-page-application');
  assert.equal(config.main, undefined, 'the separate session API must not be bundled into the static site');
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.routes, undefined, 'do not replace dashboard-managed domains with a partial list');
  assert.deepEqual(config.previews, {});
  assert.equal(config.env, undefined);
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.devDependencies.wrangler, '4.161.0');
  assert.deepEqual(manifest.engines, { node: '>=24' });
  assert.equal(manifest.packageManager, 'npm@11.19.1');
  assert.equal((await readFile(new URL('../.node-version', import.meta.url), 'utf8')).trim(), '24.22.2');
  assert.match(manifest.scripts['ci:check'], /check-cache-version\.mjs/);
  assert.match(manifest.scripts['ci:build'], /build-cloudflare-worker\.mjs/);
  assert.equal(manifest.scripts['deploy:cloudflare'], undefined);
  assert.equal(manifest.scripts['preview:cloudflare'], undefined);
});

test('generated artifacts preserve main/dev Drive identity and leave common metadata to the controller', async () => {
  const root = await mkdtemp(join(tmpdir(), 'finapp-worker-build-'));
  try {
    for (const [branch, environment] of cases) {
      const preview = branch !== 'main';
      const out = join(root, `${branch.replaceAll('/', '-')}-${environment}`);
      await buildCloudflareWorker({ branch, revision, environment, out });
      await assert.rejects(readFile(join(out, 'deployment.json')), { code: 'ENOENT' });
      const text = await readFile(join(out, 'assets/js/deployment-config.js'), 'utf8');
      const { DEPLOYMENT } = await import(`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`);
      const address = preview ? 'https://dev.finapp.siniverse.cc/' : 'https://finapp.siniverse.cc/';
      const deployment = deploymentFor(address, DEPLOYMENT);
      assert.equal(deployment.preview, preview);
      assert.equal(deployment.prefix, preview ? 'finapp-preview:/:' : '');
      assert.equal(supportsWorkerSession(address, deployment.preview), !preview);
      assert.equal(await deploymentDriveNamespace(deployment.preview), await deploymentDriveNamespace(preview));
      assert.equal(suiteLinks(address, DEPLOYMENT).apps.find(app => app.id === 'garapp').href, 'https://garapp.siniverse.cc/');
      if (!preview) await assert.rejects(readFile(join(out, '_headers')), { code: 'ENOENT' });
      else {
        assert.match(await readFile(join(out, '_headers'), 'utf8'), /X-Robots-Tag: noindex, nofollow/);
        assert.match(await readFile(join(out, 'manifest.webmanifest'), 'utf8'), /Finapp dev/);
        assert.notEqual(await deploymentDriveNamespace(true), await deploymentDriveNamespace(false));
        for (const host of ['https://dev.dev.finapp.siniverse.cc/', 'https://branch-worker.example.workers.dev/']) {
          const identity = deploymentFor(host, DEPLOYMENT);
          assert.equal(identity.preview, true);
          assert.equal(supportsWorkerSession(host, identity.preview), false);
        }
      }
      await assert.rejects(buildCloudflareWorker({ branch, revision, environment, out }), /EEXIST/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('PWA checks retain the release-wide baseline when a bump and asset span two commits', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finapp-cache-history-'));
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('init', '-q');
    git('config', 'user.name', 'Finapp fixture');
    git('config', 'user.email', 'fixture@example.invalid');
    await writeFile(join(directory, 'sw.js'), "const CACHE_VERSION = 'v1';\n");
    await writeFile(join(directory, 'index.html'), '<title>first</title>\n');
    git('add', '.'); git('commit', '-qm', 'Initial release');
    const base = git('rev-parse', 'HEAD');
    git('update-ref', 'refs/remotes/origin/main', base);
    await writeFile(join(directory, 'sw.js'), "const CACHE_VERSION = 'v2';\n");
    git('add', '.'); git('commit', '-qm', 'Bump cache');
    const before = git('rev-parse', 'HEAD');
    await writeFile(join(directory, 'index.html'), '<title>second</title>\n');
    git('add', '.'); git('commit', '-qm', 'Update shell');
    assert.equal(assertCacheVersion(directory, { base: before }).base, base);
    assert.doesNotThrow(() => assertCacheVersion(directory, { event: { pull_request: { base: { sha: base } } } }));
    assert.throws(() => assertCacheVersion(directory, { event: { pull_request: { base: { sha: before } } } }), /CACHE_VERSION bump/);
    git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD'));
    assert.throws(() => assertCacheVersion(directory, { base: before }), /CACHE_VERSION bump/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a changed cached asset requires a cache-version bump', () => {
  assert.throws(() => assertCacheDiff('assets/app.js', ''), /CACHE_VERSION bump/);
  assert.throws(() => assertCacheDiff('index.html', '+const CACHE_PREFIX = "new";'), /CACHE_VERSION bump/);
  assert.doesNotThrow(() => assertCacheDiff('assets/app.js', '-const CACHE_VERSION = "first";\n+const CACHE_VERSION = "second";'));
  assert.doesNotThrow(() => assertCacheDiff('', ''));
});
