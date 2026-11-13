/** Build a tested main-branch artifact for Git-connected Workers Static Assets. */
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCloudflare } from './build-cloudflare.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

function git(directory, ...args) {
  return execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();
}

export function assertCacheDiff(changed, workerDiff) {
  if (!changed) return;
  if (!workerDiff.split('\n').some((line) => /^[+-]const CACHE_VERSION/.test(line))) {
    throw new Error(`Precached files changed without a service-worker CACHE_VERSION bump:\n${changed}`);
  }
}

/** Fail closed when the published assets changed without a service-worker cache bump. */
export function assertCacheVersion(directory = root) {
  if (git(directory, 'rev-parse', '--is-shallow-repository') === 'true') {
    const revision = git(directory, 'rev-parse', '--verify', 'HEAD');
    git(directory, 'fetch', '--no-tags', '--quiet', '--depth=2', 'origin', revision);
  }
  const previous = git(directory, 'rev-parse', '--verify', 'HEAD^');
  const changed = git(directory, 'diff', '--name-only', previous, 'HEAD', '--',
    'index.html', 'manifest.webmanifest', 'manifest.fr.webmanifest', 'assets');
  if (changed) assertCacheDiff(changed, git(directory, 'diff', previous, 'HEAD', '--', 'sw.js'));
}

/** Refuse a production Worker build from an unexpected branch or commit. */
export function assertWorkersRevision({ workersCI = process.env.WORKERS_CI,
  branch = process.env.WORKERS_CI_BRANCH, revision = process.env.WORKERS_CI_COMMIT_SHA } = {}, directory = root) {
  if (!workersCI) return;
  if (branch !== 'main') {
    throw new Error(`Workers Builds may publish only the current main revision: branch=${JSON.stringify(branch ?? null)} (expected "main").`);
  }
  const checkoutRevision = git(directory, 'rev-parse', 'HEAD');
  if (revision !== checkoutRevision) {
    throw new Error(`Workers Builds may publish only the current main revision: Cloudflare commit=${JSON.stringify(revision ?? null)}, checkout commit=${checkoutRevision}.`);
  }
}

export async function buildCloudflareWorker({ branch = 'main' } = {}) {
  if (branch !== 'main') throw new Error('Only main may be deployed by Workers Builds.');
  if (resolve(git(root, 'rev-parse', '--show-toplevel')) !== resolve(root)) {
    throw new Error('Run the Workers build from the FinApp repository root.');
  }
  assertWorkersRevision();
  assertCacheVersion();
  const target = join(root, 'dist');
  const staging = await mkdtemp(join(tmpdir(), 'finapp-worker-'));
  try {
    const output = join(staging, 'site');
    await buildCloudflare({ source: root, out: output, branch, domain: 'siniverse.cc' });
    await mkdir(target); // Never overwrite a previous or caller-provided output.
    await cp(output, target, { recursive: true, errorOnExist: false, force: false });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return target;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(await buildCloudflareWorker());
}
