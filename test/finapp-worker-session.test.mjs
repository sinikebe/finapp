import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkerSessionAuthorization, WORKER_API, supportsWorkerSession } from '../assets/js/finapp-worker-session.js';
import { DriveAPI } from '../assets/js/finapp-drive-api.js';

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const origin = 'https://finapp.siniverse.cc';

test('persistent sessions are offered only on the production application origin', () => {
  assert.equal(supportsWorkerSession(`${origin}/`), true);
  for (const [site, dev] of [
    [`${origin}/`, true], ['https://dev.finapp.siniverse.cc/', false],
    ['https://sinikebe.github.io/finapp/', false], ['https://finapp.siniverse.cc.attacker.test/', false],
  ]) assert.equal(supportsWorkerSession(site, dev), false);
});

test('a remembered HttpOnly session restores silently without browser storage or an OAuth popup', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let accesses = 0, now = 1000;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { accesses++; throw Error('No local storage'); } });
  try {
    const requests = [];
    const auth = new WorkerSessionAuthorization({ now: () => now, location: { href: `${origin}/#private-plan` }, fetcher: async (url, options) => {
      requests.push({ url, options });
      return url.endsWith('/session') ? json({ connected: true }) : json({ access_token: 'short-lived-token', expires_in: 240 });
    } });
    assert.equal(await auth.restore(), true);
    assert.equal(auth.isConnected(), true);
    assert.equal(auth.token(), 'short-lived-token');
    assert.equal(accesses, 0);
    assert.deepEqual(requests.map(({ url }) => url), [`${WORKER_API}/v1/finapp/session`, `${WORKER_API}/v1/finapp/token`]);
    assert.ok(requests.every(({ options }) => options.credentials === 'include' && options.cache === 'no-store'
      && options.redirect === 'error' && options.referrerPolicy === 'no-referrer'));
    assert.equal(JSON.stringify(auth).includes('short-lived-token'), false);
    now += 220000;
    assert.equal(auth.token(), null);
    await auth.accessToken();
    assert.equal(requests.length, 3, 'access token renewed without a user gesture');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});

test('session probe without a Worker falls back to ordinary Google sign-in', async () => {
  for (const response of [() => json({}, 404), () => { throw Error('Offline'); }, () => json({ connected: 'invalid' })]) {
    const auth = new WorkerSessionAuthorization({ fetcher: response });
    assert.equal(await auth.restore(), false);
    assert.equal(auth.isConnected(), false);
  }
});

test('connect passes only the current trusted path and disconnect clears server session first', async () => {
  const calls = [], navigations = [];
  const location = { href: `${origin}/?search=private#shared-plan`, assign: (value) => navigations.push(value) };
  const auth = new WorkerSessionAuthorization({ location, fetcher: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/session')) return json({ connected: true });
    if (url.endsWith('/token')) return json({ access_token: 'sensitive-short-token', expires_in: 240 });
    return new Response(null, { status: 204 });
  } });
  assert.equal(await auth.restore(), true);
  auth.connect();
  assert.deepEqual(navigations, [`${WORKER_API}/v1/finapp/connect?return_to=${encodeURIComponent(`${origin}/`)}`]);
  assert.doesNotMatch(navigations[0], /private|shared-plan|sensitive-short-token/);
  await auth.disconnect();
  assert.equal(auth.token(), null);
  assert.equal(auth.isConnected(), false);
  assert.equal(calls.at(-1).options.method, 'POST');
  assert.equal(calls.at(-1).options.credentials, 'include');
});

test('a failed server logout keeps the connected state and Google token available', async () => {
  const auth = new WorkerSessionAuthorization({ location: { href: `${origin}/` }, fetcher: async (url) => {
    if (url.endsWith('/session')) return json({ connected: true });
    if (url.endsWith('/token')) return json({ access_token: 'ephemeral', expires_in: 120 });
    return json({}, 503);
  } });
  await auth.restore();
  await assert.rejects(auth.disconnect(), /Could not disconnect/);
  assert.equal(auth.isConnected(), true);
  assert.equal(auth.token(), 'ephemeral');
});

test('an already expired server session can be forgotten after a 401 logout', async () => {
  const auth = new WorkerSessionAuthorization({ fetcher: async (url) => url.endsWith('/disconnect')
    ? json({}, 401) : url.endsWith('/session') ? json({ connected: true }) : json({ access_token: 'temporary', expires_in: 120 }) });
  await auth.restore();
  await auth.disconnect();
  assert.equal(auth.isConnected(), false);
  assert.equal(auth.token(), null);
});

test('disconnect keeps controls busy and sends only one request until the server confirms it', async () => {
  let release, requests = 0;
  const auth = new WorkerSessionAuthorization({ fetcher: async (url) => {
    if (url.endsWith('/session')) return json({ connected: true });
    if (url.endsWith('/token')) return json({ access_token: 'ephemeral', expires_in: 120 });
    requests++;
    return new Promise((resolve) => { release = () => resolve(new Response(null, { status: 204 })); });
  } });
  await auth.restore();
  const logout = auth.disconnect();
  assert.equal(auth.pending, true);
  await auth.disconnect();
  assert.equal(requests, 1);
  assert.equal(auth.isConnected(), true);
  release(); await logout;
  assert.equal(auth.pending, false);
  assert.equal(auth.isConnected(), false);
});

test('a Google 401 renews the Worker token and retries a safe read without deleting the server session', async () => {
  let renewals = 0;
  const auth = new WorkerSessionAuthorization({ fetcher: async (url) => url.endsWith('/session')
    ? json({ connected: true }) : json({ access_token: `token-${++renewals}`, expires_in: 120 }) });
  await auth.restore();
  const sent = [];
  const api = new DriveAPI({ token: () => auth.accessToken(),
    onExpired: async () => { auth.clearToken(); return Boolean(await auth.accessToken()); },
    fetcher: async (_url, options) => {
      sent.push(options.headers.Authorization);
      return sent.length === 1 ? json({}, 401) : json({ id: 'fixture' });
    } });
  assert.deepEqual(await api.get('fixture'), { id: 'fixture' });
  assert.deepEqual(sent, ['Bearer token-1', 'Bearer token-2']);
  assert.equal(auth.isConnected(), true);
});

test('concurrent Drive requests refresh an expired token once; Drive never sends a cookie to Google', async () => {
  let now = 1000, renewals = 0;
  const auth = new WorkerSessionAuthorization({ now: () => now, fetcher: async (url) => {
    if (url.endsWith('/session')) return json({ connected: true });
    renewals++;
    return json({ access_token: `token-${renewals}`, expires_in: 120 });
  } });
  await auth.restore(); now += 95000;
  const google = [];
  const api = new DriveAPI({ token: () => auth.accessToken(), fetcher: async (url, options) => {
    google.push({ url, options }); return json({ id: 'fixture' });
  } });
  await Promise.all([api.get('a'), api.get('b')]);
  assert.equal(renewals, 2);
  assert.ok(google.every(({ options }) => options.headers.Authorization === 'Bearer token-2'
    && options.credentials === 'omit' && options.cache === 'no-store'));
});

test('expired server session does not reuse an old token or expose user data', async () => {
  let now = 1000;
  const auth = new WorkerSessionAuthorization({ now: () => now, fetcher: async (url) => {
    if (url.endsWith('/session')) return json({ connected: true });
    if (now === 1000) return json({ access_token: 'old', expires_in: 120 });
    return json({}, 401);
  } });
  await auth.restore(); now += 95000;
  assert.equal(await auth.accessToken(), null);
  assert.equal(auth.isConnected(), false);
  assert.equal(auth.token(), null);
});
