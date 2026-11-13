import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { assertCacheDiff, assertWorkersRevision, buildCloudflareWorker } from '../tools/build-cloudflare-worker.mjs';
import { assertPublishTarget, assertWranglerVersion } from '../tools/check-cloudflare-publish.mjs';
import { deploymentFor } from '../assets/js/deployment.js';
import { suiteLinks } from '../assets/js/app-switcher.js';
import { supportsWorkerSession } from '../assets/js/finapp-worker-session.js';
import { deploymentDriveNamespace } from '../assets/js/finapp-drive-format.js';

const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

test('Workers Builds accepts production and Preview branches only at the checked-out revision', () => {
  for (const branch of ['main', 'dev', 'feature/new-view']) {
    const context = assertWorkersRevision({ workersCI: '1', branch, revision });
    assert.equal(context.sourceBranch, branch);
    assert.equal(context.environment, branch === 'main' ? 'main' : 'dev');
  }
  assert.throws(() => assertWorkersRevision({ workersCI: '1', branch: 'main', revision: 'none' }), /Cloudflare commit="none", checkout commit=[a-f0-9]{40}/);
  assert.throws(() => assertWorkersRevision({ workersCI: '1', branch: 'dev', revision: 'none' }), /checked-out revision/);
  assert.throws(() => assertWorkersRevision({ workersCI: '1', branch: '', revision }), /source branch/);
});

test('static Worker Previews preserve dashboard domains and use pinned modern Wrangler', async () => {
  const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(config.name, 'siniverse-finapp-site');
  assert.equal(config.assets.directory, './dist');
  assert.equal(config.assets.not_found_handling, 'single-page-application');
  assert.equal(config.main, undefined, 'the separate API Worker must not be bundled into the static site');
  assert.equal(config.workers_dev, true);
  assert.equal(config.preview_urls, true, 'workers.dev provides a Preview URL before custom-domain activation');
  assert.equal(config.routes, undefined, 'dashboard-managed custom domains must not be replaced by a partial list');
  assert.deepEqual(config.previews, {}, 'the static site has no production API credentials or data bindings to inherit');
  assert.equal(config.env, undefined, 'a Preview belongs to the same Worker, not a second env.dev Worker');
  const workflow = await readFile(new URL('../.github/workflows/cloudflare.yml', import.meta.url), 'utf8');
  assert.match(workflow, /node tools\/build-cloudflare\.mjs/);
  assert.doesNotMatch(workflow, /wrangler-action|pages deploy|CLOUDFLARE_DEPLOY_ENABLED|CLOUDFLARE_API_TOKEN/);
  assert.match(workflow, /wrangler deploy --dry-run/);
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.devDependencies.wrangler, '4.161.0');
  assert.match(manifest.scripts['deploy:cloudflare'], /check-cloudflare-publish\.mjs production && npx wrangler deploy$/);
  assert.match(manifest.scripts['preview:cloudflare'], /check-cloudflare-publish\.mjs preview && npx wrangler preview$/);
  assert.doesNotMatch(manifest.scripts['preview:cloudflare'], /versions upload/);
});

test('publication commands cannot mix branches, revisions or production and Preview artifacts', () => {
  for (const sourceBranch of ['main', 'dev', 'feature/new-view']) {
    const environment = sourceBranch === 'main' ? 'main' : 'dev';
    const context = { sourceBranch, revision, environment };
    const artifact = { app: 'finapp', ...context };
    const mode = sourceBranch === 'main' ? 'production' : 'preview';
    assert.deepEqual(assertPublishTarget(mode, context, artifact), [sourceBranch === 'main' ? 'deploy' : 'preview']);
    assert.throws(() => assertPublishTarget(mode === 'preview' ? 'production' : 'preview', context, artifact), /Only main/);
    for (const changed of [{ revision: '0'.repeat(40) }, { sourceBranch: 'another-branch' }, { environment: environment === 'main' ? 'dev' : 'main' }]) {
      assert.throws(() => assertPublishTarget(mode, context, { ...artifact, ...changed }), /Rebuild the artifact/);
    }
  }
  assertWranglerVersion('4.161.0', '4.161.0');
  assert.throws(() => assertWranglerVersion('4.134.0', '4.134.0'), /4.135.0/);
  assert.throws(() => assertWranglerVersion('4.162.0', '4.161.0'), /pinned Wrangler/);
});

test('generated Previews isolate identity and Drive, carry noindex and keep the Garapp link working', async () => {
  const root = await mkdtemp(join(tmpdir(), 'finapp-worker-build-'));
  const saved = Object.fromEntries(['WORKERS_CI', 'WORKERS_CI_BRANCH', 'WORKERS_CI_COMMIT_SHA'].map((key) => [key, process.env[key]]));
  for (const key of Object.keys(saved)) delete process.env[key];
  try {
    for (const branch of ['main', 'dev', 'feature/new-view']) {
      const out = join(root, branch.replaceAll('/', '-'));
      await buildCloudflareWorker({ branch, out });
      const artifact = JSON.parse(await readFile(join(out, 'deployment.json'), 'utf8'));
      assert.equal(artifact.sourceBranch, branch);
      assert.equal(artifact.revision, revision);
      const text = await readFile(join(out, 'assets/js/deployment-config.js'), 'utf8');
      const { DEPLOYMENT } = await import(`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`);
      const address = branch === 'main' ? 'https://finapp.siniverse.cc/' : 'https://dev.finapp.siniverse.cc/';
      const deployment = deploymentFor(address, DEPLOYMENT);
      assert.equal(deployment.preview, branch !== 'main');
      assert.equal(deployment.prefix, branch === 'main' ? '' : 'finapp-preview:/:');
      assert.equal(supportsWorkerSession(address, deployment.preview), branch === 'main');
      assert.equal(await deploymentDriveNamespace(deployment.preview), await deploymentDriveNamespace(branch !== 'main'));
      assert.equal(suiteLinks(address, DEPLOYMENT).apps.find((app) => app.id === 'garapp').href, 'https://garapp.siniverse.cc/');
      if (branch === 'main') await assert.rejects(readFile(join(out, '_headers')), { code: 'ENOENT' });
      else {
        assert.match(await readFile(join(out, '_headers'), 'utf8'), /X-Robots-Tag: noindex, nofollow/);
        assert.match(await readFile(join(out, 'manifest.webmanifest'), 'utf8'), /Finapp dev/);
        assert.notEqual(await deploymentDriveNamespace(true), await deploymentDriveNamespace(false));
        for (const previewHost of ['https://dev.dev.finapp.siniverse.cc/',
          'https://feature-new-view.dev.finapp.siniverse.cc/', 'https://branch-worker.example.workers.dev/']) {
          const preview = deploymentFor(previewHost, DEPLOYMENT);
          assert.equal(preview.preview, true);
          assert.equal(preview.prefix, 'finapp-preview:/:');
          assert.equal(supportsWorkerSession(previewHost, preview.preview), false);
        }
      }
      await assert.rejects(buildCloudflareWorker({ branch, out }), /EEXIST/);
    }
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test('a changed cached asset requires a cache-version bump in the published revision', () => {
  assert.throws(() => assertCacheDiff('assets/app.js', ''), /without a service-worker CACHE_VERSION bump/);
  assert.throws(() => assertCacheDiff('index.html', '+const CACHE_PREFIX = "new";'), /without a service-worker CACHE_VERSION bump/);
  assert.doesNotThrow(() => assertCacheDiff('assets/app.js', '-const CACHE_VERSION = "first";\n+const CACHE_VERSION = "second";'));
  assert.doesNotThrow(() => assertCacheDiff('', ''));
});
