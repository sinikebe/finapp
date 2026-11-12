import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertCacheDiff, assertWorkersRevision, buildCloudflareWorker } from '../tools/build-cloudflare-worker.mjs';

test('the Git-connected Worker build refuses a preview branch before creating an output directory', async () => {
  await assert.rejects(buildCloudflareWorker({ branch: 'dev' }), /Only main may be deployed/);
});

test('Workers Builds refuses a non-main or mismatched git revision', () => {
  assert.doesNotThrow(() => assertWorkersRevision({ workersCI: '' }));
  assert.throws(() => assertWorkersRevision({ workersCI: '1', branch: 'dev', revision: 'none' }), /current main revision/);
  assert.throws(() => assertWorkersRevision({ workersCI: '1', branch: 'main', revision: 'none' }), /current main revision/);
});

test('static Workers route only Finapp hosts and ship the isolated, tested asset bundle', async () => {
  const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(config.name, 'siniverse-finapp-site');
  assert.equal(config.env.dev.name, 'siniverse-finapp-site-dev');
  assert.equal(config.assets.directory, './dist');
  assert.equal(config.assets.not_found_handling, 'single-page-application');
  assert.equal(config.main, undefined, 'the separate API Worker must not be bundled into the static site');
  assert.equal(config.workers_dev, true, 'preview must deploy before Pages custom-domain cutover');
  assert.equal(config.routes, undefined, 'Pages still owns the production custom domain during the first deployment');
  assert.equal(config.env.dev.routes, undefined, 'development environment must not publish a domain');
  assert.equal(config.env.dev.assets.directory, './dist');

  const workflow = await readFile(new URL('../.github/workflows/cloudflare.yml', import.meta.url), 'utf8');
  assert.match(workflow, /node tools\/build-cloudflare\.mjs/);
  assert.doesNotMatch(workflow, /wrangler-action|pages deploy|CLOUDFLARE_DEPLOY_ENABLED|CLOUDFLARE_API_TOKEN/);
  const packageSource = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  assert.match(packageSource, /build-cloudflare-worker\.mjs/);
});

test('a changed cached asset requires a cache-version bump in the published revision', () => {
  assert.throws(() => assertCacheDiff('assets/app.js', ''), /without a service-worker CACHE_VERSION bump/);
  assert.throws(() => assertCacheDiff('index.html', '+const CACHE_PREFIX = "new";'),
    /without a service-worker CACHE_VERSION bump/);
  assert.doesNotThrow(() => assertCacheDiff('assets/app.js', '-const CACHE_VERSION = "first";\n+const CACHE_VERSION = "second";'));
  assert.doesNotThrow(() => assertCacheDiff('', ''));
});
