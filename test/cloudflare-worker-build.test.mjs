import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildContext, buildCloudflareWorker } from '../tools/build-cloudflare-worker.mjs';
import { assertOfflineVersion, sealOfflineVersion, readBuildStamp } from '../tools/check-cache-version.mjs';
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
  assert.match(manifest.scripts['ci:check'], /npm test && npm run icons && git diff --exit-code/);
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
      await buildCloudflareWorker({ branch, revision, environment, version: '0.0.1', out });
      await assertOfflineVersion(out, '0.0.1');
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
      await assert.rejects(buildCloudflareWorker({ branch, revision, environment, version: '0.0.1', out }), /EEXIST/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('offline generations change with version or content and reject stale mixed artifacts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finapp-cache-proof-'));
  try {
    const first = join(directory, 'first'), next = join(directory, 'next'), changed = join(directory, 'changed');
    for (const [out, version] of [[first, '0.0.1'], [next, '0.0.2']]) {
      await buildCloudflareWorker({ branch: 'main', environment: 'production', revision, version, out });
    }
    const initial = await assertOfflineVersion(first, '0.0.1');
    const updated = await assertOfflineVersion(next, '0.0.2');
    assert.notEqual(initial.cacheVersion, updated.cacheVersion, 'a new CI version changes the worker at the same SHA and baseline');
    assert.equal((await readBuildStamp(next)).version, '0.0.2');
    assert.equal((await readBuildStamp(next)).cacheGeneration, (await readBuildStamp(first)).cacheGeneration);
    await cp(first, changed, { recursive: true });
    await writeFile(join(changed, 'assets/js/numbers.js'), '// changed asset at the same SHA and public version\n');
    await assert.rejects(assertOfflineVersion(changed, '0.0.1'), /worker does not match/);
    const resealed = await sealOfflineVersion(changed, '0.0.1');
    assert.notEqual(resealed.cacheVersion, initial.cacheVersion);
    assert.equal((await sealOfflineVersion(changed, '0.0.1')).cacheVersion, resealed.cacheVersion, 'normalization avoids a hash loop');
    await writeFile(join(changed, 'sw.js'), (await readFile(join(changed, 'sw.js'), 'utf8')) + '\n// changed worker logic\n');
    await assert.rejects(assertOfflineVersion(changed, '0.0.1'), /worker does not match/);
    await sealOfflineVersion(changed, '0.0.1');
    await writeFile(join(next, 'sw.js'), await readFile(join(first, 'sw.js')));
    await assert.rejects(assertOfflineVersion(next, '0.0.2'), /worker does not match/);
    const originalPage = await readFile(join(next, 'index.html'), 'utf8');
    await writeFile(join(next, 'index.html'), originalPage.replace('id="footer-version">v0.0.2', 'id="footer-version">v0.0.1'));
    await assert.rejects(assertOfflineVersion(next, '0.0.2'), /footer is stale/);
    await writeFile(join(next, 'index.html'), originalPage);
    const originalManifest = await readFile(join(next, 'manifest.webmanifest'), 'utf8');
    await writeFile(join(next, 'manifest.webmanifest'), JSON.stringify({ ...JSON.parse(originalManifest), version: '0.0.1' }));
    await assert.rejects(assertOfflineVersion(next, '0.0.2'), /manifest has a stale/);
    await writeFile(join(next, 'manifest.webmanifest'), originalManifest);
    await writeFile(join(next, 'assets/js/version.js'), await readFile(join(first, 'assets/js/version.js')));
    await assert.rejects(assertOfflineVersion(next, '0.0.2'), /module is stale/);
    await writeFile(join(first, 'deployment.json'), '{"builtAt":"volatile controller metadata"}');
    assert.equal((await assertOfflineVersion(first, '0.0.1')).cacheVersion, initial.cacheVersion);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
