/** Seal and verify offline assets using their public version and actual content. */
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { publicVersion } from './stamp-version.mjs';

const controlFiles = new Set(['deployment.json', '_headers', '.nojekyll']);
const workerVersion = /^const CACHE_VERSION = '([^']+)';$/m;

function normalizedWorker(text, generation) {
  if (!/^v[0-9]+$/.test(generation) || !workerVersion.test(text)) throw new Error('Invalid offline worker baseline.');
  return text.replace(workerVersion, "const CACHE_VERSION = '" + generation + "';");
}

export async function readBuildStamp(directory) {
  const source = await readFile(join(directory, 'assets/js/version.js'), 'utf8');
  const body = source.match(/export const BUILD = Object\.freeze\((\{[\s\S]*\})\);/);
  if (!body) throw new Error('The public version module is not a generated build stamp.');
  return JSON.parse(body[1]);
}

export async function assertPublicVersion(directory, expected, shell = 'index.html') {
  publicVersion(expected);
  const build = await readBuildStamp(directory);
  if (build.version !== expected) throw new Error('The public version module is stale.');
  const page = await readFile(join(directory, shell), 'utf8');
  const labels = [...page.matchAll(/<span id="footer-version">([^<]*)<\/span>/g)];
  if (labels.length !== 1 || labels[0][1] !== 'v' + expected) throw new Error('The version footer is stale.');
  for (const file of ['manifest.webmanifest', 'manifest.fr.webmanifest']) {
    const manifest = JSON.parse(await readFile(join(directory, file), 'utf8'));
    if (manifest.version !== expected) throw new Error('An install manifest has a stale public version.');
  }
  return build;
}

export async function offlineFingerprint(directory, generation) {
  const files = [];
  async function collect(relative = '') {
    for (const entry of await readdir(join(directory, relative), { withFileTypes: true })) {
      const path = relative ? relative + '/' + entry.name : entry.name;
      if (controlFiles.has(path)) continue;
      if (entry.isSymbolicLink()) throw new Error('Offline assets cannot contain symlinks.');
      if (entry.isDirectory()) await collect(path);
      else if (entry.isFile()) files.push(path);
      else throw new Error('Offline assets must be regular files.');
    }
  }
  await collect();
  const hash = createHash('sha256');
  for (const path of files.sort()) {
    let contents = await readFile(join(directory, path));
    if (path === 'sw.js') contents = Buffer.from(normalizedWorker(contents.toString('utf8'), generation));
    hash.update(path).update('\0').update(String(contents.length)).update('\0').update(contents);
  }
  return hash.digest('hex');
}

export async function assertOfflineVersion(directory, expected) {
  const build = await assertPublicVersion(directory, expected);
  const digest = await offlineFingerprint(directory, build.cacheGeneration);
  const cacheVersion = build.cacheGeneration + '+' + expected + '.' + digest;
  const worker = await readFile(join(directory, 'sw.js'), 'utf8');
  if (worker.match(workerVersion)?.[1] !== cacheVersion) throw new Error('The offline worker does not match this version and these assets.');
  return { version: expected, cacheVersion, assetSha256: digest };
}

export async function sealOfflineVersion(directory, expected) {
  const build = await assertPublicVersion(directory, expected);
  const digest = await offlineFingerprint(directory, build.cacheGeneration);
  const cacheVersion = build.cacheGeneration + '+' + expected + '.' + digest;
  const path = join(directory, 'sw.js');
  const worker = normalizedWorker(await readFile(path, 'utf8'), build.cacheGeneration);
  await writeFile(path, worker.replace(workerVersion, "const CACHE_VERSION = '" + cacheVersion + "';"));
  return assertOfflineVersion(directory, expected);
}
