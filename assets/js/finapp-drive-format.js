/** Private Finapp snapshots: validated JSON, immutable revisions, verified ancestry. */
import { MAX_BACKUP_BYTES, parseBackup, validateWorkspace, backupSummary } from './backup.js';

export const DRIVE_FOLDER = 'application/vnd.google-apps.folder';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const MAX_PARENTS = 60;
const HASH = /^[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const invalid = () => Error('The Drive history is incomplete or has changed. Earlier versions remain available.');

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export async function fingerprint(blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function workspaceHash(workspace) {
  return fingerprint(new Blob([canonical(workspace)]));
}

export async function driveNamespace(base) {
  return (await fingerprint(new Blob([new URL('./', base).href]))).slice(0, 32);
}

export function assertPrivate(file) {
  if (!file?.id || file.trashed || file.ownedByMe !== true || file.shared === true || file.driveId || file.capabilities?.canEdit !== true) {
    throw Error('This Drive file must be private, accessible and owned by the connected account.');
  }
  return file;
}

export function assertFolder(file, namespace) {
  assertPrivate(file);
  if (file.mimeType !== DRIVE_FOLDER || file.appProperties?.finapp !== 'workspace-v1' || file.appProperties.namespace !== namespace) {
    throw Error('This folder does not belong to this Finapp workspace.');
  }
  return file;
}

export async function makeSnapshot(workspace, parents, namespace, folderId, development = false) {
  parents = [...new Set(parents)].sort();
  if (parents.length > MAX_PARENTS || parents.some((id) => !REVISION.test(id))) throw invalid();
  const valid = validateWorkspace(workspace);
  const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), workspace: valid })], { type: 'application/json' });
  if (blob.size > MAX_BACKUP_BYTES) throw Error('The backup exceeds the 20 MB limit.');
  const revision = crypto.randomUUID();
  const hash = await workspaceHash(valid);
  const count = backupSummary(valid);
  const appProperties = {
    finapp: 'snapshot-v1', namespace, revision, hash, wire: await fingerprint(blob), pc: String(parents.length),
    counts: JSON.stringify([count.projects, count.strategies]),
  };
  for (let i = 0; i < parents.length; i += 3) appProperties[`p${i / 3}`] = JSON.stringify(parents.slice(i, i + 3));
  return { blob, hash, revision, parents, metadata: {
    name: `finapp${development ? '-dev' : ''}-${new Date().toISOString().replace(/:/g, '-')}-${revision.slice(0, 8)}.json`,
    mimeType: 'application/json', parents: [folderId], appProperties,
  } };
}

export function snapshotInfo(file, namespace, folderId) {
  assertPrivate(file);
  const props = file.appProperties ?? {};
  if (file.mimeType !== 'application/json' || !file.parents?.includes(folderId)
      || props.finapp !== 'snapshot-v1' || props.namespace !== namespace
      || !REVISION.test(props.revision) || !HASH.test(props.hash) || !HASH.test(props.wire)) throw invalid();
  const size = Number(file.size), count = Number(props.pc);
  if (!Number.isSafeInteger(size) || size < 2 || size > MAX_BACKUP_BYTES
      || !/^(0|[1-9]\d*)$/.test(props.pc) || count > MAX_PARENTS
      || file.sha256Checksum && file.sha256Checksum !== props.wire) throw invalid();
  const parents = []; let counts;
  try {
    counts = JSON.parse(props.counts);
    for (let i = 0; i < Math.ceil(count / 3); i++) {
      const chunk = JSON.parse(props[`p${i}`]);
      if (!Array.isArray(chunk) || chunk.length !== Math.min(3, count - i * 3)) throw invalid();
      parents.push(...chunk);
    }
  } catch { throw invalid(); }
  if (!Array.isArray(counts) || counts.length !== 2 || counts.some((value) => !Number.isSafeInteger(value) || value < 0)
      || parents.some((id) => !REVISION.test(id) || id === props.revision) || new Set(parents).size !== count) throw invalid();
  return { id: file.id, revision: props.revision, parents, hash: props.hash, wire: props.wire, size, counts, at: file.createdTime, name: file.name, file };
}

/** Missing parents and cycles require an error: they are never interpreted as a blank workspace. */
export function revisionGraph(nodes) {
  const byRevision = new Map();
  for (const node of nodes) {
    if (byRevision.has(node.revision)) throw invalid();
    byRevision.set(node.revision, node);
  }
  const referenced = new Set(), children = new Map(), degrees = new Map();
  for (const node of nodes) {
    degrees.set(node.revision, node.parents.length);
    for (const parent of node.parents) {
      if (!byRevision.has(parent)) throw invalid();
      referenced.add(parent);
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(node.revision);
    }
  }
  const queue = nodes.filter((node) => !node.parents.length).map((node) => node.revision);
  for (let i = 0; i < queue.length; i++) for (const child of children.get(queue[i]) ?? []) {
    degrees.set(child, degrees.get(child) - 1);
    if (!degrees.get(child)) queue.push(child);
  }
  if (queue.length !== nodes.length) throw invalid();
  return { nodes, byRevision, heads: nodes.filter((node) => !referenced.has(node.revision)).sort((a, b) => a.revision.localeCompare(b.revision)) };
}

/** Authenticate the bytes and the original JSON workspace before migration/normalization. */
export async function readSnapshot(blob, node) {
  if (blob.size !== node.size || await fingerprint(blob) !== node.wire) throw invalid();
  const raw = await blob.text();
  let original;
  try { original = JSON.parse(raw); } catch { throw invalid(); }
  if (await workspaceHash(original?.workspace) !== node.hash) throw invalid();
  return parseBackup(raw).workspace;
}
