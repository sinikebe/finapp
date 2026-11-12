import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCacheDiff, buildCloudflarePages } from '../tools/build-cloudflare-pages.mjs';

test('a Pages build refuses a preview branch before creating an output directory', async () => {
  await assert.rejects(buildCloudflarePages({ branch: 'dev' }), /Only main may be deployed/);
});

test('a changed cached asset requires a cache-version bump in the published revision', () => {
  assert.throws(() => assertCacheDiff('assets/app.js', ''), /without a service-worker CACHE_VERSION bump/);
  assert.throws(() => assertCacheDiff('index.html', '+const CACHE_PREFIX = "new";'),
    /without a service-worker CACHE_VERSION bump/);
  assert.doesNotThrow(() => assertCacheDiff('assets/app.js', '-const CACHE_VERSION = "first";\n+const CACHE_VERSION = "second";'));
  assert.doesNotThrow(() => assertCacheDiff('', ''));
});
