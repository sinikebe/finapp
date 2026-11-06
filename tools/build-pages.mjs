/** Assemble one Pages artifact: main at / and the isolated dev build at /dev/. */
import { cp, mkdir, readdir, readFile, writeFile, lstat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILES = ['index.html', 'sw.js', 'manifest.webmanifest', 'manifest.fr.webmanifest'];

async function checkTree(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Do not publish a symbolic link: ${path}`);
    if (entry.isDirectory()) await checkTree(path);
    else if (!entry.isFile()) throw new Error(`Not a static file: ${path}`);
  }
}

function outside(source, target) {
  const path = relative(source, target);
  return path.startsWith('..') || isAbsolute(path);
}

async function copySite(source, target) {
  for (const file of FILES) {
    const path = join(source, file);
    if (!(await lstat(path)).isFile()) throw new Error(`Missing regular file: ${path}`);
  }
  if (!(await lstat(join(source, 'assets'))).isDirectory()) throw new Error('Missing assets directory');
  await checkTree(join(source, 'assets'));
  await mkdir(target, { recursive: true });
  for (const file of FILES) await cp(join(source, file), join(target, file));
  await cp(join(source, 'assets'), join(target, 'assets'), { recursive: true });
}

export async function buildPages({ main, dev, out }) {
  const stable = resolve(main); const preview = resolve(dev); const target = resolve(out);
  if (!outside(stable, target) || !outside(preview, target)) throw new Error('The output must be outside both source trees');
  // Old dev releases shared production localStorage and deleted all finapp-* caches.
  // Never accidentally expose such a release beneath the production origin.
  const isolation = await readFile(join(preview, 'assets/js/deployment.js'), 'utf8');
  const worker = await readFile(join(preview, 'sw.js'), 'utf8');
  if (!isolation.includes('finapp-preview:') || !worker.includes('finapp@')) throw new Error('dev must isolate storage and service-worker caches');
  await mkdir(target); // Refuse an existing output rather than deleting arbitrary files.
  await copySite(stable, target);
  await copySite(preview, join(target, 'dev'));
  await writeFile(join(target, '.nojekyll'), '');
  await writeFile(join(target, 'deployment.json'), JSON.stringify({ main: 'main', dev: 'dev', previewPath: './dev/' }) + '\n');
  return target;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [main, dev, out] = process.argv.slice(2);
  if (!main || !dev || !out) throw new Error('Usage: node tools/build-pages.mjs MAIN_DIRECTORY DEV_DIRECTORY OUTPUT_DIRECTORY');
  console.log(await buildPages({ main, dev, out }));
}
