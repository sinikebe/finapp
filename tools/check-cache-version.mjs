/** Preserve Finapp's release-wide PWA cache check independently of the CI provider. */
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const cached = ['index.html', 'manifest.webmanifest', 'manifest.fr.webmanifest', 'assets'];

function git(directory, ...args) {
  return execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function assertCacheDiff(changed, workerDiff) {
  if (changed && !workerDiff.split('\n').some(line => /^[+-]const CACHE_VERSION/.test(line))) {
    throw new Error(`Precached files changed without a service-worker CACHE_VERSION bump:\n${changed}`);
  }
}

export function cacheBaseline(directory = root, { event = {}, base = process.env.SINIVERSE_BASE_SHA } = {}) {
  const head = git(directory, 'rev-parse', 'HEAD');
  const pullBase = event.pull_request?.base?.sha;
  if (pullBase) return git(directory, 'rev-parse', '--verify', `${pullBase}^{commit}`);
  const defaultBranch = event.repository?.default_branch ?? 'main';
  git(directory, 'check-ref-format', '--branch', defaultBranch);
  let releaseBase;
  try { releaseBase = git(directory, 'merge-base', head, `refs/remotes/origin/${defaultBranch}`); } catch { /* Use the supplied baseline or parent below. */ }
  if (releaseBase && releaseBase !== head) return releaseBase;
  const candidate = base ?? event.before;
  if (candidate && !/^0+$/.test(candidate)) {
    try { return git(directory, 'rev-parse', '--verify', `${candidate}^{commit}`); } catch { /* A rewritten history must still pass the parent check. */ }
  }
  return git(directory, 'rev-parse', '--verify', 'HEAD^');
}

export function assertCacheVersion(directory = root, options = {}) {
  const base = cacheBaseline(directory, options);
  const changed = git(directory, 'diff', '--name-only', base, 'HEAD', '--', ...cached);
  assertCacheDiff(changed, changed ? git(directory, 'diff', base, 'HEAD', '--', 'sw.js') : '');
  return { base, changed };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8')) : {};
  const result = assertCacheVersion(root, { event });
  console.log(`PWA cache check passed against ${result.base}.`);
}
