/** Build only the existing legacy redirects and same-origin recovery applications. */
import { resolve } from 'node:path';
import { buildLegacyPages } from './build-legacy-pages.mjs';

const main = process.env.SINIVERSE_PAGES_MAIN_SOURCE;
const dev = process.env.SINIVERSE_PAGES_DEV_SOURCE;
const out = process.env.SINIVERSE_PAGES_OUT;
if (![main, dev, out].every(value => typeof value === 'string' && value.length > 0)) {
  throw new Error('SINIVERSE_PAGES_MAIN_SOURCE, SINIVERSE_PAGES_DEV_SOURCE and SINIVERSE_PAGES_OUT are required.');
}
if (resolve(main) === resolve(dev)) throw new Error('Pages requires distinct main and dev source checkouts.');
console.log(await buildLegacyPages({ source: main, devSource: dev, out,
  mainVersion: process.env.SINIVERSE_PAGES_MAIN_VERSION,
  devVersion: process.env.SINIVERSE_PAGES_DEV_VERSION }));
