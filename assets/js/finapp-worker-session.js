/** Restore a production Drive session without persisting Google access tokens. */
export const WORKER_API = 'https://api.siniverse.cc';
export const WORKER_APP = 'https://finapp.siniverse.cc';

export function supportsWorkerSession(base, development = false) {
  return !development && new URL(base).origin === WORKER_APP;
}

export class WorkerSessionAuthorization {
  #accessToken = null;
  #expiresAt = 0;
  #connected = false;
  #refresh = null;
  #generation = 0;

  constructor({ fetcher = globalThis.fetch.bind(globalThis), location = globalThis.location,
    now = () => Date.now(), onError = () => {} } = {}) {
    this.fetcher = fetcher;
    this.location = location;
    this.now = now;
    this.onError = onError;
    this.pending = false;
  }

  async #request(path, method = 'GET') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      return await this.fetcher(`${WORKER_API}/v1/finapp/${path}`, {
        method, credentials: 'include', cache: 'no-store', redirect: 'error',
        referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
    } finally { clearTimeout(timer); }
  }

  /** False means this installation has no usable Worker API; GIS may be offered. */
  async restore() {
    try {
      const response = await this.#request('session');
      if (!response.ok) return false;
      const state = await response.json();
      if (typeof state?.connected !== 'boolean') return false;
      this.#connected = state.connected;
      if (this.#connected) {
        // A transient token error must not discard a valid server-side session.
        try { await this.accessToken(); } catch { /* Retry on the next Drive action. */ }
      }
      return true;
    } catch { return false; }
  }

  isConnected() { return this.#connected; }
  token() {
    if (this.#expiresAt <= this.now() + 30000) this.clearToken();
    return this.#accessToken;
  }
  timeUntilExpiration() { return null; }
  clearToken() { this.#accessToken = null; this.#expiresAt = 0; }

  /** A short-lived token is requested only when Drive needs one. */
  async accessToken() {
    if (this.token()) return this.#accessToken;
    if (!this.#connected) return null;
    if (this.#refresh) return this.#refresh;
    const generation = this.#generation;
    this.#refresh = (async () => {
      const response = await this.#request('token');
      if (response.status === 401) {
        if (generation === this.#generation) { this.clearToken(); this.#connected = false; }
        return null;
      }
      if (!response.ok) throw Error('Drive session temporarily unavailable.');
      const body = await response.json();
      const lifetime = Number(body?.expires_in);
      if (typeof body?.access_token !== 'string' || !body.access_token || body.access_token.length > 4096
          || !Number.isFinite(lifetime) || lifetime <= 30 || lifetime > 86400) {
        throw Error('Invalid Drive session response.');
      }
      if (generation !== this.#generation) return null;
      this.#accessToken = body.access_token;
      this.#expiresAt = this.now() + Math.min(lifetime, 3600) * 1000;
      return this.#accessToken;
    })();
    try { return await this.#refresh; }
    finally { this.#refresh = null; }
  }

  /** A top-level navigation keeps OAuth and refresh credentials out of the PWA. */
  connect() {
    const app = new URL(this.location.href);
    if (app.origin !== WORKER_APP) { this.onError('Google Drive session is unavailable here.'); return; }
    const returnTo = `${app.origin}${app.pathname}`;
    this.location.assign(`${WORKER_API}/v1/finapp/connect?${new URLSearchParams({ return_to: returnTo })}`);
  }

  /** A failed server logout must not be shown as a successful disconnect. */
  async disconnect() {
    if (this.pending) return;
    this.pending = true;
    try {
      const response = await this.#request('disconnect', 'POST');
      if (response.status !== 204 && response.status !== 401) throw Error('Could not disconnect Google Drive. Retry.');
      this.#generation++;
      this.clearToken();
      this.#connected = false;
    } finally { this.pending = false; }
  }
}
