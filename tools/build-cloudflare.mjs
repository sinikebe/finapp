/** Package a single tested branch at the root of its own Cloudflare Worker host. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copySite, labelPreview } from './build-pages.mjs';

function hostDomain(value) {
  const domain = String(value ?? '').toLowerCase();
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
    throw new Error('Provide a fully qualified domain without a scheme, path or port.');
  }
  return domain;
}

export function suiteDomains(domain) {
  const name = hostDomain(domain);
  return {
    finapp: `https://finapp.${name}/`, garapp: `https://garapp.${name}/`,
    devFinapp: `https://dev.finapp.${name}/`, devGarapp: `https://dev.garapp.${name}/`,
  };
}

async function retargetSuiteLinks(directory, suite, branch) {
  const page = join(directory, 'index.html');
  const seen = new Set();
  const html = (await readFile(page, 'utf8')).replace(/<a\b[^>]*\bdata-suite-app="(finapp|garapp)"[^>]*>/g, (tag, app) => {
    if (seen.has(app) || !/\bhref="[^"]*"/.test(tag)) throw new Error(`Invalid ${app} launcher link.`);
    seen.add(app);
    const key = branch === 'dev' ? `dev${app === 'finapp' ? 'Finapp' : 'Garapp'}` : app;
    return tag.replace(/\bhref="[^"]*"/, `href="${suite[key]}"`);
  });
  if (seen.size !== 2) throw new Error('Both Finapp and Garapp launcher links are required.');
  await writeFile(page, html);
}

export async function buildCloudflare({ source, out, branch, domain }) {
  if (!['main', 'dev'].includes(branch)) throw new Error('Cloudflare builds only the main or dev branch.');
  const suite = suiteDomains(domain);
  const origin = resolve(source), target = resolve(out);
  const child = relative(origin, target);
  if (!child || (!child.startsWith('..') && !isAbsolute(child))) throw new Error('Output must be outside the source tree.');
  // The old dev page shares an origin with production. Do not deploy it as production by accident.
  if (branch === 'dev') {
    const storage = await readFile(join(origin, 'assets/js/deployment.js'), 'utf8');
    const worker = await readFile(join(origin, 'sw.js'), 'utf8');
    if (!storage.includes('finapp-preview:') || !worker.includes('finapp@')) throw new Error('Dev must isolate storage and service-worker caches.');
  }
  await mkdir(target); // Refuse an existing output: never delete a caller's files.
  await copySite(origin, target);
  if (branch === 'dev') await labelPreview(target);
  await retargetSuiteLinks(target, suite, branch);
  await writeFile(join(target, 'assets/js/deployment-config.js'),
    `/** Generated for this tested Cloudflare Worker deployment. */\nexport const DEPLOYMENT = Object.freeze(${JSON.stringify({ environment: branch, suite })});\n`);
  await writeFile(join(target, 'deployment.json'), JSON.stringify({ app: 'finapp', branch, suite }) + '\n');
  return target;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, at, list) => {
    if (at % 2 === 0) pairs.push([value, list[at + 1]]);
    return pairs;
  }, []));
  if (process.argv.length !== 8 || !options['--branch'] || !options['--domain'] || !options['--out']) {
    throw new Error('Usage: node tools/build-cloudflare.mjs --branch main|dev --domain example.fr --out ABSOLUTE_DIRECTORY');
  }
  console.log(await buildCloudflare({ source: process.cwd(), branch: options['--branch'],
    domain: options['--domain'], out: options['--out'] }));
}
