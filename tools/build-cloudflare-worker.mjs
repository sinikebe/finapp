/** Assemble Finapp's static artifact for the shared Siniverse pipeline. */
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCloudflare } from './build-cloudflare.mjs';
import { stampSiteVersion } from './stamp-version.mjs';
import { sealOfflineVersion } from './check-cache-version.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

function git(directory, ...args) {
  return execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();
}

/** Bind the artifact to the exact checkout and identify production versus Preview. */
export function buildContext({ branch = process.env.SINIVERSE_BRANCH,
  revision = process.env.SINIVERSE_SHA, environment = process.env.SINIVERSE_ENVIRONMENT } = {}, directory = root) {
  const sourceBranch = branch ?? git(directory, 'rev-parse', '--abbrev-ref', 'HEAD');
  if (!sourceBranch || sourceBranch === 'HEAD') throw new Error('A source branch is required for the Finapp build.');
  git(directory, 'check-ref-format', '--branch', sourceBranch);
  const checkoutRevision = git(directory, 'rev-parse', 'HEAD');
  if (revision !== undefined && revision !== checkoutRevision) {
    throw new Error(`Finapp must build the checked-out revision: requested commit=${JSON.stringify(revision)}, checkout commit=${checkoutRevision}.`);
  }
  const pipelineEnvironment = environment ?? (sourceBranch === 'main' ? 'production' : 'test');
  if (!['production', 'preview', 'test'].includes(pipelineEnvironment)
      || pipelineEnvironment === 'production' && sourceBranch !== 'main'
      || pipelineEnvironment === 'preview' && sourceBranch !== 'dev') {
    throw new Error('Use main for production, dev for preview, and test for other validation builds.');
  }
  return { sourceBranch, revision: checkoutRevision,
    environment: sourceBranch === 'main' ? 'main' : 'dev' };
}

export async function buildCloudflareWorker({ branch, revision, environment,
  version = process.env.SINIVERSE_VERSION, out = join(root, 'dist') } = {}) {
  if (resolve(git(root, 'rev-parse', '--show-toplevel')) !== resolve(root)) {
    throw new Error('Run the Workers build from the FinApp repository root.');
  }
  const context = buildContext({ branch, revision, environment });
  const target = resolve(out);
  const staging = await mkdtemp(join(tmpdir(), 'finapp-worker-'));
  try {
    const output = join(staging, 'site');
    await buildCloudflare({ source: root, out: output, branch: context.environment, domain: 'siniverse.cc',
      previewGarappOrigin: 'https://garapp.siniverse.cc/', includeDeploymentMetadata: false });
    if (context.environment === 'dev') {
      await writeFile(join(output, '_headers'), '/*\n  X-Robots-Tag: noindex, nofollow\n');
    }
    const build = await stampSiteVersion({ source: root, target: output, version,
      branch: context.sourceBranch, revision: context.revision });
    await sealOfflineVersion(output, build.version);
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
