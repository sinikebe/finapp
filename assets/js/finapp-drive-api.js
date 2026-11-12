/** Drive v3 transport: new files only; bearer tokens never enter URLs or storage. */
import { MAX_BACKUP_BYTES } from './backup.js';
import { fingerprint } from './finapp-drive-format.js';

const API = 'https://www.googleapis.com/drive/v3/';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FIELDS = 'id,name,mimeType,parents,appProperties,size,sha256Checksum,createdTime,modifiedTime,ownedByMe,shared,trashed,driveId,capabilities(canEdit,canDownload)';
const quote = (value) => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
export const propertyQuery = (key, value) => `appProperties has { key=${quote(key)} and value=${quote(value)} }`;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Only known reason codes are retained; Google messages and metadata can contain private data.
const ERROR_MESSAGES = Object.freeze({
  accessNotConfigured: 'Le projet Google Cloud ne permet pas cet accès. Vérifier que Google Drive API est activée dans le même projet que le client OAuth de Finapp.',
  SERVICE_DISABLED: 'L’API Google Drive est désactivée dans le projet du client OAuth. L’activer dans Google Cloud, attendre quelques minutes puis réessayer.',
  insufficientPermissions: 'L’autorisation Google Drive est insuffisante. Se déconnecter puis se reconnecter en accordant l’accès demandé par Finapp.',
  ACCESS_TOKEN_SCOPE_INSUFFICIENT: 'L’autorisation Google Drive est insuffisante. Se déconnecter puis se reconnecter en accordant l’accès demandé par Finapp.',
  insufficientFilePermissions: 'Ce compte Google n’a pas les droits nécessaires sur ce fichier ou dossier. Vérifier le compte et les autorisations Drive.',
  appNotAuthorizedToFile: 'Ce fichier ou dossier n’est pas autorisé pour cette application. Vérifier le compte Google et le projet du client OAuth.',
  domainPolicy: 'L’administrateur Google Workspace bloque l’accès de Finapp à Drive. Contacter l’administrateur du compte.',
  storageQuotaExceeded: 'Le stockage Google Drive est plein. Les copies locales sont conservées.',
  dailyLimitExceeded: 'Le quota de requêtes du projet Google Cloud est atteint. Vérifier les quotas de Google Drive API ou réessayer plus tard.',
  quotaExceeded: 'Le quota de requêtes du projet Google Cloud est atteint. Vérifier les quotas de Google Drive API ou réessayer plus tard.',
  rateLimitExceeded: 'Trop de requêtes Google Drive. Patienter quelques instants puis réessayer.',
  userRateLimitExceeded: 'Trop de requêtes Google Drive. Patienter quelques instants puis réessayer.',
  RATE_LIMIT_EXCEEDED: 'Trop de requêtes Google Drive. Patienter quelques instants puis réessayer.',
});
const ENGLISH_ERRORS = Object.freeze({
  accessNotConfigured: 'Enable Google Drive API in the Google Cloud project associated with the OAuth client.',
  SERVICE_DISABLED: 'Google Drive API is disabled in the OAuth client project. Enable it and try again in a few minutes.',
  insufficientPermissions: 'Google Drive permission is insufficient. Disconnect and reconnect, granting Finapp access.',
  ACCESS_TOKEN_SCOPE_INSUFFICIENT: 'Google Drive permission is insufficient. Disconnect and reconnect, granting Finapp access.',
  insufficientFilePermissions: 'This account cannot access the file or folder. Check the account and Drive permissions.',
  appNotAuthorizedToFile: 'This file or folder is not authorized for this app. Check the account and OAuth project.',
  domainPolicy: 'The Google Workspace administrator blocks Finapp Drive access. Contact the account administrator.',
  storageQuotaExceeded: 'Google Drive is full. Your local copy remains available.',
  dailyLimitExceeded: 'The Google Cloud project quota has been reached. Try again later.',
  quotaExceeded: 'The Google Cloud project quota has been reached. Try again later.',
  rateLimitExceeded: 'Too many Google Drive requests. Try again shortly.',
  userRateLimitExceeded: 'Too many Google Drive requests. Try again shortly.',
  RATE_LIMIT_EXCEEDED: 'Too many Google Drive requests. Try again shortly.',
});
const knownReason = (reason) => typeof reason === 'string' && Object.hasOwn(ERROR_MESSAGES, reason);

function errorReason(body) {
  const error = body?.error;
  const details = Array.isArray(error?.details) ? error.details : [];
  const errors = Array.isArray(error?.errors) ? error.errors : [];
  // ErrorInfo distinguishes a disabled API from the broader accessNotConfigured reason.
  return details.find((detail) => detail?.['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo' && knownReason(detail.reason))?.reason
    ?? errors.find((entry) => knownReason(entry?.reason))?.reason ?? '';
}

export class DriveError extends Error {
  constructor(status, reason = '', language = 'fr') {
    reason = knownReason(reason) ? reason : '';
    const message = language === 'en'
      ? status === 401 ? 'Google sign-in expired. Reconnect to continue.'
        : status === 404 ? 'The Drive folder or version was not found for this account. The local copy is unchanged.'
          : ENGLISH_ERRORS[reason] ?? (status === 403 ? 'Google Drive denied access. Check the account, permissions and quotas.'
            : status === 429 || status >= 500 ? 'Google Drive is temporarily unavailable. Try again later.'
              : 'The Drive transfer failed. Your local copy and previous versions are preserved.')
      : status === 401 ? 'La connexion Google a expiré. Se reconnecter pour poursuivre.'
        : status === 404 ? 'Le dossier ou la version Drive est introuvable pour ce compte. Aucune copie locale n’a été remplacée.'
          : ERROR_MESSAGES[reason] ?? (status === 403 ? 'Google Drive a refusé l’accès. Vérifier le compte, les autorisations et les quotas.'
            : status === 429 || status >= 500 ? 'Google Drive est temporairement indisponible. Réessayer plus tard.'
              : 'Le transfert Drive a échoué. La copie locale et les versions précédentes sont conservées.');
    super(message); this.status = status; this.reason = reason;
  }
}

export class DriveAPI {
  constructor({ token, fetcher = globalThis.fetch.bind(globalThis), onExpired = () => {}, onProgress = () => {}, timeoutMs = 45000, language = 'fr' }) {
    Object.assign(this, { token, fetcher, onExpired, onProgress, timeoutMs, language });
    this.controller = new AbortController();
  }

  close() { this.controller.abort(); }
  message(fr, en) { return this.language === 'en' ? en : fr; }
  error(status, reason = '') { return new DriveError(status, reason, this.language); }

  async request(url, options = {}, retries = options.method && options.method !== 'GET' ? 0 : 2) {
    url = new URL(url);
    if (url.origin !== 'https://www.googleapis.com' || !(/^\/drive\/v3\//.test(url.pathname) || url.pathname === '/upload/drive/v3/files')) throw Error(this.message('Adresse de transfert Drive non autorisée.', 'Unauthorized Drive transfer URL.'));
    for (let attempt = 0; ; attempt++) {
      let response;
      const timeout = new AbortController();
      const timer = setTimeout(() => timeout.abort(), this.timeoutMs);
      try {
        const token = this.token();
        if (!token) { this.onExpired(); throw this.error(401); }
        response = await this.fetcher(url.href, {
          ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` },
          credentials: 'omit', cache: 'no-store', redirect: 'error',
          signal: AbortSignal.any([this.controller.signal, timeout.signal]),
        });
      } catch (error) {
        if (this.controller.signal.aborted) throw new DOMException('Transfert interrompu.', 'AbortError');
        if (error instanceof DriveError) throw error;
        if (attempt < retries) { await delay(250 * 2 ** attempt); continue; }
        throw this.error(0);
      } finally { clearTimeout(timer); }
      if (response.ok || response.status === 308) return response;
      if ((response.status === 429 || response.status >= 500) && attempt < retries) { await delay(250 * 2 ** attempt); continue; }
      if (response.status === 401) this.onExpired();
      let reason = '';
      try { reason = errorReason(await this.json(response)); } catch { /* Error bodies are never exposed. */ }
      throw this.error(response.status, reason);
    }
  }

  async get(id) {
    return this.json(await this.request(`${API}files/${encodeURIComponent(id)}?${new URLSearchParams({ fields: FIELDS })}`));
  }

  async account() {
    const { user } = await this.json(await this.request(`${API}about?fields=user(displayName,emailAddress)`, {}, 0));
    if (!user || typeof user !== 'object') return null;
    const name = typeof user.displayName === 'string' ? user.displayName.slice(0, 200) : '';
    const email = typeof user.emailAddress === 'string' ? user.emailAddress.slice(0, 320) : '';
    return name || email ? { name, email } : null;
  }

  async list(query) {
    const files = [], tokens = new Set(); let pageToken = '';
    do {
      const params = new URLSearchParams({ q: `trashed = false and (${query})`, spaces: 'drive', corpora: 'user', fields: `nextPageToken,incompleteSearch,files(${FIELDS})`, pageSize: '1000' });
      if (pageToken) params.set('pageToken', pageToken);
      const page = await this.json(await this.request(`${API}files?${params}`));
      if (page.incompleteSearch || !Array.isArray(page.files)) throw Error(this.message('La liste Drive est incomplète. Réessayer avant de synchroniser.', 'The Drive listing is incomplete. Try again before syncing.'));
      files.push(...page.files);
      pageToken = page.nextPageToken ?? '';
      if (files.length > 10000 || pageToken && tokens.has(pageToken)) throw Error(this.message('L’historique Drive ne peut pas être parcouru entièrement. Les fichiers sont conservés.', 'The Drive history could not be fully listed. The files remain unchanged.'));
      tokens.add(pageToken);
    } while (pageToken);
    return files;
  }

  async readBody(response, limit) {
    const chunks = []; let size = 0;
    const reader = response.body.getReader();
    try {
      for (;;) {
        let timer;
        let result;
        try {
          result = await Promise.race([reader.read(), new Promise((_, reject) => { timer = setTimeout(() => reject(this.error(0)), this.timeoutMs); })]);
        } finally { clearTimeout(timer); }
        const { done, value } = result;
        if (done) break;
        size += value.byteLength;
        if (size > limit) throw Error(this.message('La taille du fichier Drive ne correspond pas à la version attendue.', 'The Drive file size does not match the expected version.'));
        chunks.push(value);
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    return new Blob(chunks, { type: 'application/json' });
  }

  async json(response) { return JSON.parse(await (await this.readBody(response, 16 * 1024 * 1024)).text()); }

  async download(node) {
    if (!Number.isSafeInteger(node.size) || node.size < 0 || node.size > MAX_BACKUP_BYTES) throw Error(this.message('La sauvegarde dépasse 20 Mo.', 'The backup exceeds 20 MB.'));
    const response = await this.request(`${API}files/${encodeURIComponent(node.id)}?alt=media`);
    const blob = await this.readBody(response, node.size);
    if (blob.size !== node.size) throw Error(this.message('Le téléchargement Drive est incomplet. Réessayer avant de remplacer les projets.', 'The Drive download is incomplete. Try again before replacing projects.'));
    return blob;
  }

  async newId() {
    const result = await this.json(await this.request(`${API}files/generateIds?count=1&space=drive&type=files`));
    if (!result.ids?.[0]) throw Error(this.message('Google Drive n’a pas attribué d’identifiant au fichier.', 'Google Drive did not assign a file ID.'));
    return result.ids[0];
  }

  async createFolder(metadata) {
    const id = await this.newId();
    try {
      await this.request(`${API}files?${new URLSearchParams({ fields: FIELDS })}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...metadata, id }) });
    } catch (error) {
      // A lost response may still have created the folder with its reserved ID.
      if (!(error instanceof DriveError) || error.status && error.status < 500 && error.status !== 409) throw error;
      try { const file = await this.get(id); if (file.appProperties?.namespace === metadata.appProperties.namespace) return file; } catch { /* Preserve the original error. */ }
      throw error;
    }
    return this.get(id);
  }

  async upload(metadata, blob) {
    if (blob.size > MAX_BACKUP_BYTES) throw Error(this.message('La sauvegarde dépasse 20 Mo.', 'The backup exceeds 20 MB.'));
    const id = await this.newId();
    metadata = { ...metadata, id };
    try {
      if (blob.size <= 5 * 1024 * 1024) {
        const boundary = `finapp_${crypto.randomUUID()}`;
        const body = new Blob([
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
          `--${boundary}\r\nContent-Type: application/json\r\n\r\n`, blob, `\r\n--${boundary}--\r\n`,
        ]);
        await this.request(`${UPLOAD}?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
      } else await this.resumable(metadata, blob);
    } catch (error) {
      if (!(error instanceof DriveError) || error.status && error.status < 500 && error.status !== 409) throw error;
      try { return await this.verifyUpload(id, metadata, blob); } catch { throw error; }
    }
    return this.verifyUpload(id, metadata, blob);
  }

  async verifyUpload(id, metadata, blob) {
    const file = await this.get(id);
    if (file.size !== String(blob.size) || file.parents?.[0] !== metadata.parents[0] || Object.entries(metadata.appProperties).some(([key, value]) => file.appProperties?.[key] !== value)) throw Error(this.message('Google Drive n’a pas confirmé la version envoyée.', 'Google Drive did not confirm the uploaded version.'));
    const checksum = file.sha256Checksum || await fingerprint(await this.download({ id, size: blob.size }));
    if (checksum !== metadata.appProperties.wire) throw Error(this.message('L’intégrité du fichier envoyé sur Drive n’a pas été confirmée.', 'The Drive file checksum could not be confirmed.'));
    this.onProgress(1);
    return file;
  }

  async resumable(metadata, blob) {
    const start = await this.request(`${UPLOAD}?uploadType=resumable&fields=id`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Upload-Content-Type': 'application/json', 'X-Upload-Content-Length': String(blob.size) }, body: JSON.stringify(metadata),
    });
    const location = start.headers.get('Location');
    if (!location) throw Error(this.message('Google Drive n’a pas fourni de session de transfert.', 'Google Drive did not provide an upload session.'));
    // request() validates the origin before any bearer token is attached.
    let offset = 0, stalled = 0;
    while (offset < blob.size) {
      const end = Math.min(offset + 8 * 1024 * 1024, blob.size);
      let response;
      try {
        response = await this.request(location, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Content-Range': `bytes ${offset}-${end - 1}/${blob.size}` }, body: blob.slice(offset, end) });
      } catch (error) {
        if (!(error instanceof DriveError) || error.status && error.status < 500 && error.status !== 429) throw error;
        if (++stalled > 3) throw error;
        await delay(500 * stalled);
        response = await this.request(location, { method: 'PUT', headers: { 'Content-Range': `bytes */${blob.size}` }, body: new Blob([]) });
      }
      if (response.ok) return;
      const match = /^bytes=0-(\d+)$/.exec(response.headers.get('Range') ?? '');
      const next = match ? Number(match[1]) + 1 : 0;
      if (!Number.isSafeInteger(next) || next < offset || next > end || next === offset && ++stalled > 3) throw Error(this.message('La progression du transfert Drive ne peut pas être confirmée.', 'The Drive upload progress could not be confirmed.'));
      if (next > offset) stalled = 0;
      offset = next; this.onProgress(offset / blob.size);
    }
    throw Error(this.message('La fin du transfert Drive n’a pas été confirmée.', 'The Drive upload completion could not be confirmed.'));
  }
}
