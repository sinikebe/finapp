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

export function assertWranglerVersion(installed, pinned) {
  const parts = String(installed).split('.').map(Number);
  if (installed !== pinned || parts.length !== 3 || parts.some((part) => !Number.isInteger(part))
      || parts[0] < 4 || parts[0] === 4 && parts[1] < 135) {
    throw new Error('Run npm ci: the pinned Wrangler must support Worker Previews (4.135.0 or later).');
  }
}

export async function checkCloudflarePublish(mode) {
  const context = assertWorkersRevision();
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
