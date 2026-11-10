import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkspace, snapshotOf } from '../assets/js/state.js';
import { parseBackup, validateWorkspace } from '../assets/js/backup.js';
import { DRIVE_FOLDER, assertFolder, driveNamespace, makeSnapshot, readSnapshot, revisionGraph, snapshotInfo, workspaceHash } from '../assets/js/finapp-drive-format.js';

const original = () => snapshotOf(loadWorkspace());
const metadata = (snapshot, id = 'snapshot-1') => ({
  id, ...snapshot.metadata, size: String(snapshot.blob.size), sha256Checksum: snapshot.metadata.appProperties.wire,
  ownedByMe: true, shared: false, trashed: false, capabilities: { canEdit: true, canDownload: true },
});

test('Finapp prod and dev have distinct namespaces; Garapp folders cannot be reused', async () => {
  const prod = await driveNamespace('https://sinikebe.github.io/finapp/');
  const dev = await driveNamespace('https://sinikebe.github.io/finapp/dev/');
  const garapp = await driveNamespace('https://sinikebe.github.io/Garapp/');
  assert.notEqual(prod, dev);
  assert.notEqual(prod, garapp);
  assert.notEqual(dev, garapp);
  const folder = { id: 'folder-1', mimeType: DRIVE_FOLDER, ownedByMe: true, shared: false,
    capabilities: { canEdit: true }, appProperties: { finapp: 'workspace-v1', namespace: prod } };
  assert.equal(assertFolder(folder, prod), folder);
  assert.throws(() => assertFolder({ ...folder, appProperties: { garapp: 'workspace-v1', namespace: prod } }, prod));
  assert.throws(() => assertFolder(folder, dev));
  assert.throws(() => assertFolder({ ...folder, shared: true }, prod));
});

test('a Drive snapshot is a downloadable version 1 backup and verifies the original bytes first', async () => {
  const workspace = original();
  const snapshot = await makeSnapshot(workspace, [], 'namespace', 'folder-1');
  assert.equal(snapshot.metadata.appProperties.finapp, 'snapshot-v1');
  assert.deepEqual(parseBackup(await snapshot.blob.text()).workspace, validateWorkspace(workspace));
  const node = snapshotInfo(metadata(snapshot), 'namespace', 'folder-1');
  assert.deepEqual(await readSnapshot(snapshot.blob, node), validateWorkspace(workspace));
  const changedBytes = new Blob([(await snapshot.blob.text()).replace('"version":1', '"version":2')]);
  await assert.rejects(readSnapshot(changedBytes, node), /Drive history/);
});

test('workspace digest tolerates key ordering, not changed project data, and wire digest protects full original JSON', async () => {
  const workspace = original();
  const opposite = { shelf: workspace.shelf, flat: workspace.flat };
  assert.equal(await workspaceHash(workspace), await workspaceHash(opposite));
  const revised = structuredClone(workspace);
  revised.shelf.projects[0].name = 'Synthetic changed plan';
  assert.notEqual(await workspaceHash(workspace), await workspaceHash(revised));
  const snapshot = await makeSnapshot(workspace, [], 'namespace', 'folder-1');
  const node = snapshotInfo(metadata(snapshot), 'namespace', 'folder-1');
  const rewritten = new Blob([JSON.stringify({ exportedAt: JSON.parse(await snapshot.blob.text()).exportedAt, workspace, version: 1 })]);
  assert.equal(await rewritten.size, snapshot.blob.size);
  await assert.rejects(readSnapshot(rewritten, node), /Drive history/);
});

test('snapshots cannot impersonate another folder or contain broken metadata', async () => {
  const snapshot = await makeSnapshot(original(), [], 'namespace', 'folder-1');
  const valid = metadata(snapshot);
  assert.throws(() => snapshotInfo(valid, 'other-namespace', 'folder-1'));
  assert.throws(() => snapshotInfo(valid, 'namespace', 'folder-2'));
  assert.throws(() => snapshotInfo({ ...valid, sha256Checksum: '0'.repeat(64) }, 'namespace', 'folder-1'));
  assert.throws(() => snapshotInfo({ ...valid, size: String(20 * 1024 * 1024 + 1) }, 'namespace', 'folder-1'));
  assert.throws(() => snapshotInfo({ ...valid, appProperties: { ...valid.appProperties, pc: '1' } }, 'namespace', 'folder-1'));
  assert.throws(() => snapshotInfo({ ...valid, ownedByMe: false }, 'namespace', 'folder-1'));
});

test('revision history exposes independent heads and refuses missing ancestors or cycles', async () => {
  const root = await makeSnapshot(original(), [], 'namespace', 'folder-1');
  const branchA = await makeSnapshot(original(), [root.revision], 'namespace', 'folder-1');
  const branchB = await makeSnapshot(original(), [root.revision], 'namespace', 'folder-1');
  const nodes = [root, branchA, branchB].map((snapshot, at) => snapshotInfo(metadata(snapshot, `id-${at}`), 'namespace', 'folder-1'));
  assert.deepEqual(revisionGraph(nodes).heads.map((node) => node.revision).sort(), [branchA.revision, branchB.revision].sort());
  assert.throws(() => revisionGraph(nodes.slice(1)), /Drive history/);
  assert.throws(() => revisionGraph([{ ...nodes[0], parents: [nodes[2].revision] }, ...nodes.slice(1)]), /Drive history/);
});
