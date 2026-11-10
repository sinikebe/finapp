import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkspace, snapshotOf } from '../assets/js/state.js';
import { validateWorkspace } from '../assets/js/backup.js';
import { fingerprint, workspaceHash } from '../assets/js/finapp-drive-format.js';
import { FinappDriveSync } from '../assets/js/finapp-drive-sync.js';

const seed = () => validateWorkspace(snapshotOf(loadWorkspace()));
const edit = (workspace, title) => {
  const copy = structuredClone(workspace);
  copy.shelf.projects[0].name = title;
  return validateWorkspace(copy);
};

class FakeDrive {
  files = new Map();
  nextId = 1;
  afterUpload = () => {};
  async get(id) { const file = this.files.get(id); if (!file) throw Error('Missing synthetic Drive file'); return file; }
  async list(query) {
    const namespace = /key='namespace' and value='([^']+)'/.exec(query)?.[1];
    return [...this.files.values()].filter((file) => file.appProperties?.namespace === namespace
      && (query.includes("mimeType = 'application/vnd.google-apps.folder'")
        ? file.mimeType === 'application/vnd.google-apps.folder'
        : file.mimeType === 'application/json' && query.includes(`'${file.parents[0]}' in parents`)));
  }
  async createFolder(metadata) {
    const file = { ...metadata, id: `folder-${this.nextId++}`, ownedByMe: true, shared: false,
      trashed: false, capabilities: { canEdit: true, canDownload: true } };
    this.files.set(file.id, file);
    return file;
  }
  async upload(metadata, blob) {
    const file = { ...metadata, id: `file-${this.nextId++}`, ownedByMe: true, shared: false,
      trashed: false, capabilities: { canEdit: true, canDownload: true },
      sha256Checksum: await fingerprint(blob), size: String(blob.size), createdTime: new Date().toISOString(), blob };
    this.files.set(file.id, file);
    this.afterUpload();
    return file;
  }
  async download(node) { return (await this.get(node.id)).blob; }
  close() {}
}

function device(cloud, initial = seed(), settingsValue = null, namespace = 'synthetic-finapp-prod') {
  let workspace = structuredClone(initial), saved = settingsValue;
  const calls = { applied: 0, saves: 0 };
  const sync = new FinappDriveSync({ namespace,
    settings: { load: async () => saved, save: async (next) => { saved = structuredClone(next); calls.saves++; } },
    getWorkspace: () => workspace,
    canSync: () => true, canApply: () => true,
    applyWorkspace: async (incoming, expected) => {
      assert.deepEqual(workspace, expected);
      workspace = structuredClone(incoming); calls.applied++;
    },
  });
  sync.api = cloud;
  return { sync, calls, workspace: () => workspace, edit: (title) => { workspace = edit(workspace, title); }, settings: () => saved };
}

test('creating a folder sends one complete immutable backup and sync does not duplicate it', async () => {
  const cloud = new FakeDrive(), a = device(cloud);
  assert.equal(await a.sync.create('Synthetic planning'), true);
  assert.equal(a.sync.statusCode, 'created');
  assert.equal(cloud.files.size, 2);
  const snapshot = a.sync.graph.nodes[0];
  assert.deepEqual(JSON.parse(await (await cloud.download(snapshot)).text()).workspace, a.workspace());
  assert.equal(await a.sync.sync(), true);
  assert.equal(a.sync.statusCode, 'synced');
  assert.equal(cloud.files.size, 2);
  assert.equal(a.calls.applied, 0);
  assert.deepEqual(a.settings().baseline.heads.map(({ revision }) => revision), [snapshot.revision]);
});

test('a second device only adopts a newer version after it has verified the shared baseline', async () => {
  const cloud = new FakeDrive(), original = seed(), a = device(cloud, original), b = device(cloud, original);
  await a.sync.create();
  await b.sync.bind(a.sync.state.binding.id);
  assert.equal(await b.sync.sync(), true);
  assert.equal(b.sync.statusCode, 'synced');
  a.edit('Synthetic updated project');
  await a.sync.sync();
  assert.equal(a.sync.graph.nodes.length, 2);
  await b.sync.sync();
  assert.deepEqual(b.workspace(), a.workspace());
  assert.equal(b.calls.applied, 1);
  assert.equal(b.sync.statusCode, 'synced');
});

test('a first connection never replaces a different local workspace automatically', async () => {
  const cloud = new FakeDrive(), a = device(cloud), b = device(cloud);
  await a.sync.create();
  b.edit('Synthetic private local plan');
  const originalLocal = b.workspace();
  await b.sync.bind(a.sync.state.binding.id);
  await b.sync.sync();
  assert.equal(b.sync.statusCode, 'needsReview');
  assert.equal(b.calls.applied, 0);
  assert.deepEqual(b.workspace(), originalLocal);
  assert.equal(cloud.files.size, 2);
});

test('simultaneous edits create two immutable heads and a reviewed field merge keeps both originals', async () => {
  const cloud = new FakeDrive(), original = seed(), a = device(cloud, original), b = device(cloud, original);
  await a.sync.create();
  await b.sync.bind(a.sync.state.binding.id); await b.sync.sync();
  a.edit('Synthetic first device'); b.edit('Synthetic second device');
  await a.sync.sync(); await b.sync.sync();
  assert.equal(b.sync.statusCode, 'divergence');
  assert.equal(b.sync.graph.heads.length, 2);
  const remote = b.sync.graph.heads.find((one) => one.hash !== b.sync.state.baseline.hash);
  assert.ok(remote);
  assert.equal(await b.sync.compare(remote.revision), true);
  assert.equal(b.sync.preview.comparison.differences.length > 0, true);
  const choices = Object.fromEntries(b.sync.preview.comparison.differences.filter((difference) => difference.conflict).map(({ id }) => [id, 'remote']));
  assert.equal(await b.sync.resolve('merge', choices), true, b.sync.error);
  assert.equal(b.sync.graph.heads.length, 1);
  assert.equal(cloud.files.size, 5);
  assert.equal(b.workspace().shelf.projects[0].name, 'Synthetic first device');
  assert.equal(a.workspace().shelf.projects[0].name, 'Synthetic first device');
  await a.sync.sync();
  assert.equal(a.sync.statusCode, 'synced');
});

test('a changed workspace during an upload is kept locally, and the uploaded copy remains recoverable', async () => {
  const cloud = new FakeDrive(), a = device(cloud);
  await a.sync.create();
  a.edit('Synthetic saved version');
  cloud.afterUpload = () => a.edit('Synthetic later edit');
  await a.sync.sync();
  assert.equal(a.sync.statusCode, 'pendingLocal');
  assert.equal(a.workspace().shelf.projects[0].name, 'Synthetic later edit');
  assert.equal(a.sync.graph.nodes.length, 2);
  cloud.afterUpload = () => {};
  await a.sync.sync();
  assert.equal(a.sync.statusCode, 'synced');
  assert.equal(a.sync.graph.nodes.length, 3);
});

test('a broken downloaded version never changes local data or baseline', async () => {
  const cloud = new FakeDrive(), a = device(cloud);
  await a.sync.create();
  const before = structuredClone(a.workspace());
  const version = a.sync.graph.heads[0], file = await cloud.get(version.id);
  file.blob = new Blob(['{"version":1,"workspace":{"wrong":true}}']);
  assert.equal(await a.sync.compare(version.revision), false);
  assert.equal(a.sync.preview, null);
  assert.deepEqual(a.workspace(), before);
  assert.equal(a.calls.applied, 0);
});

test('a workspace edited during comparison invalidates preview', async () => {
  const cloud = new FakeDrive(), a = device(cloud);
  await a.sync.create();
  const originalDownload = cloud.download.bind(cloud);
  cloud.download = async (node) => { a.edit('Synthetic concurrent local update'); return originalDownload(node); };
  assert.equal(await a.sync.compare(a.sync.graph.heads[0].revision), false);
  assert.equal(a.sync.preview, null);
  assert.equal(a.workspace().shelf.projects[0].name, 'Synthetic concurrent local update');
});

test('a locally remembered folder remains isolated between deployment namespaces', async () => {
  const cloud = new FakeDrive(), a = device(cloud), dev = device(cloud, seed(), null, 'synthetic-finapp-dev');
  await a.sync.create();
  assert.equal((await dev.sync.folders()).length, 0);
  assert.equal(await dev.sync.bind(a.sync.state.binding.id), false);
  assert.equal(dev.sync.state.binding, undefined);
});

test('an older valid snapshot with new defaults requires review before adoption', async () => {
  const cloud = new FakeDrive(), original = seed(), a = device(cloud, original), b = device(cloud, original);
  await a.sync.create();
  await b.sync.bind(a.sync.state.binding.id); await b.sync.sync();
  const root = a.sync.graph.heads[0], old = await cloud.get(root.id);
  const raw = JSON.parse(await old.blob.text());
  delete raw.workspace.flat.realMoney;
  const blob = new Blob([JSON.stringify(raw)]);
  const newFile = { ...old, id: 'file-synthetic-legacy', blob, size: String(blob.size), sha256Checksum: await fingerprint(blob),
    appProperties: { ...old.appProperties, revision: crypto.randomUUID(), hash: await workspaceHash(raw.workspace),
      wire: await fingerprint(blob), pc: '1', p0: JSON.stringify([root.revision]) } };
  cloud.files.set(newFile.id, newFile);
  assert.equal(await b.sync.sync(), true);
  assert.equal(b.sync.statusCode, 'needsReview');
  assert.deepEqual(b.workspace(), original);
  assert.equal(b.calls.applied, 0);
  assert.equal(await b.sync.compare(newFile.appProperties.revision), true);
  assert.equal(await b.sync.resolve('remote'), true, b.sync.error);
  assert.equal(b.sync.graph.heads.length, 1);
  assert.equal(cloud.files.size, 4);
});

test('internal errors are localized when the user changes the app language', async () => {
  const a = device(new FakeDrive());
  let language = 'fr';
  a.sync.language = () => language;
  assert.equal(await a.sync.sync(), false);
  assert.match(a.sync.error, /Connectez Google Drive/);
  language = 'en';
  assert.match(a.sync.error, /Connect Google Drive/);
});

test('automatic sync preserves an open Drive comparison', async () => {
  const a = device(new FakeDrive());
  let calls = 0;
  a.sync.sync = () => { calls++; };
  a.sync.state.auto = true; a.sync.state.binding = { id: 'folder-1', name: 'Synthetic' };
  a.sync.preview = { node: { id: 'snapshot-1' } };
  a.sync.changed();
  await new Promise((resolve) => setTimeout(resolve, 750));
  assert.equal(calls, 0);
  assert.ok(a.sync.preview);
  assert.equal(a.sync.autoTimer, null);
});
