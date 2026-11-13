/** Build an isolated production or Preview artifact for Workers Builds. */
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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

/** Bind the artifact to the exact checkout and identify production versus Preview. */
export function assertWorkersRevision({ workersCI = process.env.WORKERS_CI,
  branch, revision = process.env.WORKERS_CI_COMMIT_SHA } = {}, directory = root) {
  const sourceBranch = branch ?? (workersCI ? process.env.WORKERS_CI_BRANCH : git(directory, 'rev-parse', '--abbrev-ref', 'HEAD'));
  if (!sourceBranch || sourceBranch === 'HEAD') throw new Error('A source branch is required for Workers Builds.');
  git(directory, 'check-ref-format', '--branch', sourceBranch);
  const checkoutRevision = git(directory, 'rev-parse', 'HEAD');
  if ((workersCI || revision) && revision !== checkoutRevision) {
    throw new Error(`Workers Builds must use the checked-out revision: Cloudflare commit=${JSON.stringify(revision ?? null)}, checkout commit=${checkoutRevision}.`);
  }
  return { sourceBranch, revision: checkoutRevision, environment: sourceBranch === 'main' ? 'main' : 'dev' };
}

export async function buildCloudflareWorker({ branch, out = join(root, 'dist') } = {}) {
  if (resolve(git(root, 'rev-parse', '--show-toplevel')) !== resolve(root)) {
    throw new Error('Run the Workers build from the FinApp repository root.');
  }
  if (process.env.WORKERS_CI && branch && branch !== process.env.WORKERS_CI_BRANCH) {
    throw new Error('The requested branch differs from Workers Builds.');
  }
  const context = assertWorkersRevision(branch ? { branch } : {});
  assertCacheVersion();
  const target = resolve(out);
  const staging = await mkdtemp(join(tmpdir(), 'finapp-worker-'));
  try {
    const output = join(staging, 'site');
    await buildCloudflare({ source: root, out: output, branch: context.environment, domain: 'siniverse.cc',
      previewGarappOrigin: 'https://garapp.siniverse.cc/' });
    if (context.environment === 'dev') {
      await writeFile(join(output, '_headers'), '/*\n  X-Robots-Tag: noindex, nofollow\n');
    }
    await writeFile(join(output, 'deployment.json'), JSON.stringify({ app: 'finapp', ...context }) + '\n');
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
