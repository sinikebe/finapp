import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCloudflare, suiteDomains } from '../tools/build-cloudflare.mjs';

async function fixture(work) {
  const root = await mkdtemp(join(tmpdir(), 'finapp-host-'));
  try {
    const source = join(root, 'source');
    await mkdir(join(source, 'assets/js'), { recursive: true });
    await writeFile(join(source, 'index.html'), '<title>Finapp - estimate your financial future</title><meta name="apple-mobile-web-app-title" content="Finapp"><body>Safe app <a href="https://sinikebe.github.io/finapp/" data-suite-app="finapp">Finapp</a><a href="https://sinikebe.github.io/Garapp/" data-suite-app="garapp">Garapp</a></body>');
    for (const file of ['manifest.webmanifest', 'manifest.fr.webmanifest']) {
      await writeFile(join(source, file), await readFile(new URL(`../${file}`, import.meta.url), 'utf8'));
    }
    await writeFile(join(source, 'sw.js'), 'const CACHE_PREFIX = "finapp@";');
    await writeFile(join(source, 'assets/js/deployment.js'), 'const prefix = "finapp-preview:";');
    await writeFile(join(source, 'assets/js/deployment-config.js'), "export const DEPLOYMENT = { environment: 'legacy', suite: null };\n");
    await writeFile(join(source, 'secret.txt'), 'excluded');
    await work({ root, source });
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('Cloudflare builds only requested assets at each independent host root', async () => {
  await fixture(async ({ root, source }) => {
    const suite = suiteDomains('Example.FR');
    assert.equal(suite.devGarapp, 'https://dev.garapp.example.fr/');
    for (const branch of ['main', 'dev']) {
      const out = join(root, branch);
      await buildCloudflare({ source, out, branch, domain: 'example.fr' });
      const config = await readFile(join(out, 'assets/js/deployment-config.js'), 'utf8');
      assert.match(config, new RegExp(`"environment":"${branch}"`));
      assert.match(config, /"devFinapp":"https:\/\/dev\.finapp\.example\.fr\/"/);
      const manifest = JSON.parse(await readFile(join(out, 'manifest.webmanifest'), 'utf8'));
      assert.equal(manifest.short_name, branch === 'dev' ? 'Finapp dev' : 'Finapp');
      assert.equal(new URL(manifest.start_url, suite[branch === 'dev' ? 'devFinapp' : 'finapp']).pathname, '/');
      const html = await readFile(join(out, 'index.html'), 'utf8');
      assert.match(html, branch === 'dev' ? /<title>Finapp dev - / : /<title>Finapp - /);
      assert.match(html, new RegExp(`href="${suite[branch === 'dev' ? 'devFinapp' : 'finapp']}" data-suite-app="finapp"`));
      assert.match(html, new RegExp(`href="${suite[branch === 'dev' ? 'devGarapp' : 'garapp']}" data-suite-app="garapp"`));
      assert.doesNotMatch(html, /href="https:\/\/sinikebe\.github\.io\//);
      assert.ok(!(await readdir(out)).includes('secret.txt'));
      await assert.rejects(buildCloudflare({ source, out, branch, domain: 'example.fr' }), /EEXIST/);
    }
    assert.match(await readFile(join(source, 'assets/js/deployment-config.js'), 'utf8'), /'legacy'/);
  });
});

test('Cloudflare build refuses malformed domain, unexpected branch and output inside source', async () => {
  await fixture(async ({ root, source }) => {
    for (const domain of ['https://example.fr/', '../example.fr', 'example.fr:443', 'example.fr/path', 'localhost', 'foo..fr']) {
      assert.throws(() => suiteDomains(domain), /domain/);
    }
    await assert.rejects(buildCloudflare({ source, out: join(root, 'bad'), branch: 'feature', domain: 'example.fr' }), /main or dev/);
    await assert.rejects(buildCloudflare({ source, out: join(source, 'dist'), branch: 'main', domain: 'example.fr' }), /outside/);
  });
});
