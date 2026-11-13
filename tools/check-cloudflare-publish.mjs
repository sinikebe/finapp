/** Guard the production and Preview commands before Wrangler can publish. */
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertWorkersRevision } from './build-cloudflare-worker.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

export function assertPublishTarget(mode, context, artifact) {
  if (!['production', 'preview'].includes(mode)) throw new Error('Choose production or preview.');
  const environment = mode === 'production' ? 'main' : 'dev';
  if ((context.sourceBranch === 'main') !== (mode === 'production')) {
    throw new Error('Only main can deploy production; every other branch must use wrangler preview.');
  }
  if (artifact?.app !== 'finapp' || artifact.environment !== environment
      || artifact.sourceBranch !== context.sourceBranch || artifact.revision !== context.revision) {
    throw new Error('Rebuild the artifact for this exact branch, revision and environment before publishing.');
  }
  return mode === 'production' ? ['deploy'] : ['preview'];
}

/** GitHub publication requires a trusted push or explicit manual main/dev request. */
export function assertGithubPublication(mode, context, { eventName, ref, sha, repository, deploy = false } = {}) {
  const branch = mode === 'production' ? 'main' : mode === 'preview' ? 'dev' : null;
  const authorizedEvent = eventName === 'push' || eventName === 'workflow_dispatch' && deploy === true;
  if (!authorizedEvent || repository !== 'sinikebe/finapp' || !branch
      || ref !== `refs/heads/${branch}` || context.sourceBranch !== branch
      || !/^[a-f0-9]{40}$/.test(sha ?? '') || sha !== context.revision) {
    throw new Error('GitHub publication requires an authorized push or explicit manual deployment of the exact main production or dev Preview revision in sinikebe/finapp.');
  }
}

export function assertWranglerVersion(installed, pinned) {
  const parts = String(installed).split('.').map(Number);
  if (installed !== pinned || parts.length !== 3 || parts.some((part) => !Number.isInteger(part))
      || parts[0] < 4 || parts[0] === 4 && parts[1] < 135) {
    throw new Error('Run npm ci: the pinned Wrangler must support Worker Previews (4.135.0 or later).');
  }
}

export async function checkCloudflarePublish(mode) {
  const context = assertWorkersRevision();
  if (process.env.GITHUB_ACTIONS === 'true') {
    const event = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch'
      ? JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8')) : {};
    assertGithubPublication(mode, context, {
      eventName: process.env.GITHUB_EVENT_NAME, ref: process.env.GITHUB_REF,
      sha: process.env.GITHUB_SHA, repository: process.env.GITHUB_REPOSITORY,
      deploy: event.inputs?.deploy === true || event.inputs?.deploy === 'true',
    });
  }
  const artifact = JSON.parse(await readFile(join(root, 'dist/deployment.json'), 'utf8'));
  const command = assertPublishTarget(mode, context, artifact);
  const project = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const installed = JSON.parse(await readFile(join(root, 'node_modules/wrangler/package.json'), 'utf8'));
  assertWranglerVersion(installed.version, project.devDependencies?.wrangler);
  return { command, ...context };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error('Usage: node tools/check-cloudflare-publish.mjs production|preview');
  const plan = await checkCloudflarePublish(process.argv[2]);
  console.log(`Validated wrangler ${plan.command[0]} for ${plan.sourceBranch} at ${plan.revision}.`);
}
