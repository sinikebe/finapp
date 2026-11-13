/** Publish old Pages entry points without changing the Workers application. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copySite, labelPreview } from './build-pages.mjs';
import { stampSiteVersion } from './stamp-version.mjs';
import { assertPublicVersion } from './check-cache-version.mjs';

export async function buildLegacyPages({ source, devSource = source, out, mainVersion, devVersion }) {
  const origin = resolve(source), development = resolve(devSource), target = resolve(out);
  for (const directory of [origin, development]) {
    const child = relative(directory, target);
    if (!child || (!child.startsWith('..') && !isAbsolute(child))) throw new Error('Output must be outside both source trees.');
  }
  const isolation = await readFile(join(development, 'assets/js/deployment.js'), 'utf8');
  const previousWorker = await readFile(join(development, 'sw.js'), 'utf8');
  if (!isolation.includes('finapp-preview:') || !previousWorker.includes('finapp@')) {
    throw new Error('The development recovery application must isolate its storage and caches.');
  }
  const [template, redirect, worker] = await Promise.all(
    ['index.html', 'redirect.js', 'retire-sw.js'].map((name) => readFile(new URL(`legacy-pages/${name}`, import.meta.url), 'utf8')),
  );
  await mkdir(target); // Refuse an existing output; never erase a caller's files.
  for (const preview of [false, true]) {
    const directory = preview ? join(target, 'dev') : target;
    const scope = preview ? '/finapp/dev/' : '/finapp/';
    await copySite(preview ? development : origin, directory);
    if (preview) await labelPreview(directory);
    const build = await stampSiteVersion({ source: preview ? development : origin, target: directory,
      version: preview ? devVersion : mainVersion, branch: preview ? 'dev' : 'main' });
    await writeFile(join(directory, 'recovery.html'), await readFile(join(directory, 'index.html')));
    const page = template.replace('@@SCRIPT@@', `${scope}redirect.js`).replace('@@RECOVERY@@', `${scope}recovery.html`);
    await Promise.all([
      writeFile(join(directory, 'index.html'), page),
      writeFile(join(directory, '404.html'), page),
      writeFile(join(directory, 'redirect.js'), redirect),
      writeFile(join(directory, 'sw.js'), worker),
    ]);
    await assertPublicVersion(directory, build.version, 'recovery.html');
  }
  await writeFile(join(target, '.nojekyll'), '');
  return target;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4) throw new Error('Usage: node tools/build-legacy-pages.mjs SOURCE NEW_OUTPUT');
  console.log(await buildLegacyPages({ source: process.argv[2], out: process.argv[3] }));
}
