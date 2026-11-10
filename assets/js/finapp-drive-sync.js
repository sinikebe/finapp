/** Conservative Drive synchronization: immutable versions and explicit comparison. */
import { backupSummary, validateWorkspace } from './backup.js';
import { compareWorkspaces, mergeWorkspaces } from './backup-merge.js';
import { DRIVE_FOLDER, assertFolder, fingerprint, makeSnapshot, readSnapshot, revisionGraph, snapshotInfo, workspaceHash } from './finapp-drive-format.js';
import { propertyQuery } from './finapp-drive-api.js';

const pointer = (node) => ({ id: node.id, revision: node.revision, wire: node.wire, hash: node.hash });
const headKey = (heads) => heads.map((node) => node.revision).sort().join(',');
const HASH = /^[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

const ERROR_FR = Object.freeze({
  'Connect Google Drive first.': 'Connectez Google Drive pour continuer.',
  'Connect Google Drive and select a Finapp folder.': 'Connectez Google Drive et choisissez un dossier Finapp.',
  'A previously confirmed Drive version is missing or different.': 'Une version Drive confirmée a disparu ou a changé.',
  'A Drive version has changed.': 'Une version Drive a changé. Relancez la comparaison.',
  'The last confirmed Drive version is missing or has changed.': 'La dernière version Drive confirmée a disparu ou a changé.',
  'The selected Drive version changed. Compare again.': 'La version Drive sélectionnée a changé. Relancez la comparaison.',
  'Drive did not confirm the uploaded snapshot.': 'Drive n’a pas confirmé la sauvegarde envoyée.',
  'Finish saving local changes before creating a Drive backup.': 'Terminez l’enregistrement local avant de créer une sauvegarde Drive.',
  'Finish saving local changes before synchronizing.': 'Terminez l’enregistrement local avant de synchroniser.',
  'Finish saving local changes before sending the first backup.': 'Terminez l’enregistrement local avant d’envoyer la première sauvegarde.',
  'Finish saving changes before choosing a version.': 'Terminez l’enregistrement local avant de choisir une version.',
  'The local workspace changed while preparing the backup.': 'Les projets locaux ont changé pendant la préparation. Réessayez.',
  'The local workspace changed during backup. Compare again.': 'Les projets locaux ont changé pendant la sauvegarde. Relancez la comparaison.',
  'The local workspace changed. Compare again.': 'Les projets locaux ont changé. Relancez la comparaison.',
  'The Drive history is empty despite a confirmed backup.': 'L’historique Drive est vide malgré une sauvegarde confirmée.',
  'The local workspace did not confirm the Drive version.': 'L’enregistrement local de la version Drive n’a pas été confirmé.',
  'The local workspace did not confirm the resolved Drive version.': 'L’enregistrement local de la version choisie n’a pas été confirmé.',
  'This Drive version is no longer available. Refresh history.': 'Cette version Drive est introuvable. Actualisez l’historique.',
  'The resolution choice is invalid.': 'Le choix de version est invalide.',
  'A new Drive version arrived. Compare again.': 'Une nouvelle version Drive est arrivée. Relancez la comparaison.',
  'Drive has the chosen version, but this device changed; compare again.': 'Drive conserve la version choisie, mais les projets locaux ont changé. Relancez la comparaison.',
  'The selected Drive folder contains versions. Compare them first.': 'Ce dossier Drive contient déjà des versions. Comparez-les avant de poursuivre.',
  'The Drive history is incomplete or has changed. Earlier versions remain available.': 'L’historique Drive est incomplet ou a changé. Les anciennes versions restent disponibles.',
  'This Drive file must be private, accessible and owned by the connected account.': 'Ce fichier Drive doit être privé, accessible et appartenir au compte connecté.',
  'This folder does not belong to this Finapp workspace.': 'Ce dossier ne correspond pas à cet espace Finapp.',
  'The backup exceeds the 20 MB limit.': 'La sauvegarde dépasse la limite de 20 Mo.',
  choices: 'Choisissez une version pour chaque différence.',
  changed: 'Les versions comparées ont changé. Relancez la comparaison.',
  tooManyProjects: 'La fusion dépasse la limite du nombre de projets.',
  invalidMerge: 'La fusion ne peut pas conserver des projets valides. Choisissez une autre version.',
  invalid: 'Cette sauvegarde est invalide. Aucun projet local n’a changé.',
  version: 'Cette version de sauvegarde n’est pas reconnue.',
  references: 'Cette sauvegarde contient des références manquantes.',
  tooLarge: 'La sauvegarde dépasse la limite de 20 Mo.',
});

export class FinappDriveSync {
  constructor({ namespace, settings, development = false, getWorkspace, canSync, canApply, applyWorkspace, onChange = () => {}, language = () => 'en' }) {
    Object.assign(this, { namespace, settings, development, getWorkspace, canSync, canApply, applyWorkspace, onChange, language });
    this.state = { auto: false }; this.graph = revisionGraph([]); this.api = null;
    this.busy = false; this.failure = ''; this.notice = ''; this.statusCode = 'disconnected';
    this.preview = null; this.pauseGeneration = 0; this.localChanged = false; this.autoTimer = null;
  }

  get error() {
    const message = this.failure?.message ?? this.failure ?? '';
    return this.language() === 'fr' ? ERROR_FR[this.failure?.code ?? message] ?? message : message;
  }
  set error(value) { this.failure = value; }

  /** Finapp mutates its state in place; always capture a validated snapshot. */
  capture() { return validateWorkspace(this.getWorkspace()); }
  hash(workspace) { return workspaceHash(workspace); }
  async unchanged(hash) { return this.canSync() && await this.hash(this.capture()) === hash; }

  async restore() {
    try {
      const value = await this.settings.load();
      if (typeof value?.binding?.id === 'string' && value.binding.id.length) {
        this.state = { binding: { id: value.binding.id, name: String(value.binding.name ?? 'Finapp') }, auto: value.auto === true };
        if (value.baseline && HASH.test(value.baseline.hash) && Array.isArray(value.baseline.heads)
          && value.baseline.heads.length && value.baseline.heads.every((node) =>
            typeof node.id === 'string' && node.id.length && REVISION.test(node.revision)
            && HASH.test(node.wire) && HASH.test(node.hash))) this.state.baseline = value.baseline;
        this.state.checkedAt = typeof value.checkedAt === 'string' ? value.checkedAt : null;
      }
    } catch { this.notice = 'linkUnavailable'; }
    this.onChange();
  }

  async persist() {
    try { await this.settings.save(this.state); }
    catch { this.notice = 'linkNotSaved'; }
  }

  async run(operation) {
    if (this.busy) return false;
    this.busy = true; this.error = ''; this.onChange();
    try { await operation(); return true; }
    catch (error) {
      if (error.name !== 'AbortError') this.error = error;
      return false;
    } finally { this.busy = false; this.onChange(); }
  }

  disconnect() {
    clearTimeout(this.autoTimer); this.autoTimer = null;
    this.api?.close(); this.api = null; this.preview = null; this.graph = revisionGraph([]);
    this.statusCode = 'disconnected'; this.onChange();
  }

  async setAuto(enabled) {
    this.state.auto = enabled === true;
    if (!this.state.auto) { clearTimeout(this.autoTimer); this.autoTimer = null; this.statusCode = 'paused'; }
    await this.persist(); this.onChange();
    if (this.state.auto && this.api && this.state.binding) this.changed();
  }

  changed() {
    this.localChanged = true;
    if (this.state.auto && this.api && this.state.binding && !this.preview && !this.autoTimer) {
      this.autoTimer = setTimeout(() => {
        this.autoTimer = null;
        if (this.canSync() && !this.busy && !this.preview) void this.sync();
      }, 700);
    }
    this.onChange();
  }

  pauseForImport() {
    this.pauseGeneration++;
    clearTimeout(this.autoTimer); this.autoTimer = null;
    this.state.auto = false; this.preview = null;
    if (this.state.binding) this.notice = 'pausedForImport';
    void this.persist(); this.onChange();
  }

  async folders() {
    if (!this.api) throw Error('Connect Google Drive first.');
    const files = await this.api.list(`${propertyQuery('finapp', 'workspace-v1')} and ${propertyQuery('namespace', this.namespace)} and mimeType = '${DRIVE_FOLDER}'`);
    return files.filter((file) => { try { assertFolder(file, this.namespace); return true; } catch { return false; } });
  }

  async inspect() {
    if (!this.api || !this.state.binding) throw Error('Connect Google Drive and select a Finapp folder.');
    const folder = assertFolder(await this.api.get(this.state.binding.id), this.namespace);
    this.state.binding.name = folder.name;
    const files = await this.api.list(`'${folder.id.replace(/'/g, "\\'")}' in parents and ${propertyQuery('finapp', 'snapshot-v1')} and ${propertyQuery('namespace', this.namespace)}`);
    // A recently uploaded snapshot may not yet appear in Drive's search index.
    for (const known of this.state.baseline?.heads ?? []) if (!files.some((file) => file.id === known.id)) {
      const recovered = await this.api.get(known.id);
      if (recovered.appProperties?.revision !== known.revision) throw Error('A previously confirmed Drive version is missing or different.');
      files.push(recovered);
    }
    const nodes = [];
    for (const file of files) {
      const node = snapshotInfo(file, this.namespace, folder.id);
      if (!file.sha256Checksum && await fingerprint(await this.api.download(node)) !== node.wire) throw Error('A Drive version has changed.');
      nodes.push(node);
    }
    const graph = revisionGraph(nodes);
    for (const known of this.state.baseline?.heads ?? []) {
      const found = graph.byRevision.get(known.revision);
      if (!found || found.id !== known.id || found.wire !== known.wire || found.hash !== known.hash) {
        throw Error('The last confirmed Drive version is missing or has changed.');
      }
    }
    this.graph = graph;
    return graph;
  }

  async loadNode(node) {
    const fresh = snapshotInfo(await this.api.get(node.id), this.namespace, this.state.binding.id);
    if (fresh.revision !== node.revision || fresh.wire !== node.wire || fresh.hash !== node.hash
      || headKey(fresh.parents.map((revision) => ({ revision }))) !== headKey(node.parents.map((revision) => ({ revision })))) {
      throw Error('The selected Drive version changed. Compare again.');
    }
    return readSnapshot(await this.api.download(fresh), fresh);
  }

  async acknowledge(hash, heads) {
    this.state.baseline = { hash, heads: heads.map(pointer) };
    this.state.checkedAt = new Date().toISOString();
    await this.persist();
    if (await this.hash(this.capture()) === hash) this.localChanged = false;
  }

  async publish(workspace, parents) {
    assertFolder(await this.api.get(this.state.binding.id), this.namespace);
    const snapshot = await makeSnapshot(workspace, parents, this.namespace, this.state.binding.id, this.development);
    this.statusCode = 'uploading'; this.onChange();
    const node = snapshotInfo(await this.api.upload(snapshot.metadata, snapshot.blob), this.namespace, this.state.binding.id);
    if (node.wire !== snapshot.metadata.appProperties.wire || node.revision !== snapshot.revision) throw Error('Drive did not confirm the uploaded snapshot.');
    return node;
  }

  async create(name = '') {
    return this.run(async () => {
      if (!this.api || !this.canSync()) throw Error('Finish saving local changes before creating a Drive backup.');
      const workspace = this.capture(), hash = await this.hash(workspace);
      if (!await this.unchanged(hash)) throw Error('The local workspace changed while preparing the backup.');
      const folder = assertFolder(await this.api.createFolder({
        name: name.trim() || `Finapp${this.development ? ' dev' : ''} - Backups`,
        mimeType: DRIVE_FOLDER, appProperties: { finapp: 'workspace-v1', namespace: this.namespace },
      }), this.namespace);
      this.state = { binding: { id: folder.id, name: folder.name }, auto: false };
      await this.persist();
      if (!await this.unchanged(hash)) { this.statusCode = 'empty'; return; }
      const node = await this.publish(workspace, []);
      await this.acknowledge(node.hash, [node]); await this.inspect();
      this.statusCode = await this.unchanged(hash) ? 'created' : 'pendingLocal';
    });
  }

  async bind(id) {
    return this.run(async () => {
      if (!this.api) throw Error('Connect Google Drive first.');
      const folder = assertFolder(await this.api.get(id), this.namespace);
      if (this.state.binding?.id !== id) this.state = { binding: { id, name: folder.name }, auto: false };
      this.preview = null; await this.persist(); await this.inspect();
      this.statusCode = 'selected';
    });
  }

  async refresh() {
    return this.run(async () => { await this.inspect(); this.statusCode = 'refreshed'; });
  }

  async sync() {
    return this.run(async () => {
      const generation = this.pauseGeneration;
      if (this.preview) { this.statusCode = 'compared'; return; }
      if (!this.canSync()) throw Error('Finish saving local changes before synchronizing.');
      let graph = await this.inspect();
      let workspace = this.capture(), hash = await this.hash(workspace);
      const baseline = this.state.baseline;
      if (!baseline) {
        if (graph.heads.length && graph.heads.every((node) => node.hash === hash)) {
          for (const node of graph.heads) await this.loadNode(node);
          if (!await this.unchanged(hash)) { this.statusCode = 'pendingLocal'; return; }
          await this.acknowledge(hash, graph.heads); this.statusCode = 'synced';
        } else this.statusCode = graph.heads.length ? 'needsReview' : 'empty';
        return;
      }
      if (hash !== baseline.hash) {
        if (generation !== this.pauseGeneration || !await this.unchanged(hash)) { this.statusCode = 'pendingLocal'; return; }
        // Publish from acknowledged parents, not from heads this device has not reviewed.
        const node = await this.publish(workspace, baseline.heads.map((head) => head.revision));
        await this.acknowledge(hash, [node]); graph = await this.inspect();
      }
      workspace = this.capture(); hash = await this.hash(workspace);
      if (!graph.heads.length) throw Error('The Drive history is empty despite a confirmed backup.');
      if (new Set(graph.heads.map((node) => node.hash)).size > 1) { this.statusCode = 'divergence'; return; }
      const remoteHash = graph.heads[0].hash;
      if (hash !== this.state.baseline.hash) { this.statusCode = 'pendingLocal'; return; }
      let incoming;
      for (const node of graph.heads) {
        const known = this.state.baseline.heads.some((head) => head.id === node.id && head.revision === node.revision && head.wire === node.wire && head.hash === node.hash);
        if (remoteHash !== hash || !known || node.file.sha256Checksum !== node.wire) incoming = await this.loadNode(node);
      }
      if (generation !== this.pauseGeneration || !await this.unchanged(hash)) { this.statusCode = 'pendingLocal'; return; }
      if (remoteHash !== hash) {
        // A newer reader may normalize an intact older backup differently.
        // Offer explicit comparison rather than changing the local workspace
        // behind the user's back and then failing to acknowledge its old hash.
        if (await this.hash(incoming) !== remoteHash) { this.statusCode = 'needsReview'; return; }
        if (!this.canApply(false)) { this.statusCode = 'pendingRemote'; return; }
        await this.applyWorkspace(incoming, workspace, false);
        if (await this.hash(this.capture()) !== remoteHash) throw Error('The local workspace did not confirm the Drive version.');
      }
      await this.acknowledge(remoteHash, graph.heads); this.statusCode = 'synced';
    });
  }

  async compare(revision) {
    return this.run(async () => {
      const graph = await this.inspect(), node = graph.byRevision.get(revision);
      if (!node) throw Error('This Drive version is no longer available. Refresh history.');
      const local = this.capture(), localHash = await this.hash(local), incoming = await this.loadNode(node);
      if (!await this.unchanged(localHash)) throw Error('The local workspace changed. Compare again.');
      this.preview = { node, incoming, local, comparison: compareWorkspaces(local, incoming), heads: graph.heads.map(pointer),
        localCounts: backupSummary(local), remoteCounts: backupSummary(incoming) };
      this.statusCode = 'compared';
    });
  }

  /** Any explicit choice becomes a new Drive revision; original copies remain. */
  async resolve(choice, choices = {}) {
    return this.run(async () => {
      if (!['local', 'remote', 'merge'].includes(choice)) throw Error('The resolution choice is invalid.');
      const preview = this.preview;
      if (!preview || !this.canApply(true)) throw Error('Finish saving changes before choosing a version.');
      const localHash = await this.hash(preview.local);
      if (!await this.unchanged(localHash)) throw Error('The local workspace changed. Compare again.');
      // Resolve and validate all conflicting fields before creating an archive.
      const target = choice === 'merge' ? mergeWorkspaces(preview.comparison, choices) : choice === 'remote' ? preview.incoming : preview.local;
      const graph = await this.inspect();
      if (headKey(graph.heads) !== headKey(preview.heads)) throw Error('A new Drive version arrived. Compare again.');
      await this.loadNode(preview.node);
      if (!await this.unchanged(localHash)) throw Error('The local workspace changed. Compare again.');
      let archive = graph.nodes.find((node) => node.hash === localHash);
      if (archive) await this.loadNode(archive);
      else archive = await this.publish(preview.local, this.state.baseline?.heads.map((node) => node.revision) ?? []);
      await this.acknowledge(localHash, [archive]);
      if (!await this.unchanged(localHash)) throw Error('The local workspace changed during backup. Compare again.');
      const parents = choice === 'merge' ? [preview.node.revision, archive.revision]
        : [...preview.heads.map((node) => node.revision), archive.revision];
      const resolved = await this.publish(target, parents);
      if (choice !== 'local') {
        if (!await this.unchanged(localHash) || !this.canApply(true)) throw Error('Drive has the chosen version, but this device changed; compare again.');
        await this.applyWorkspace(target, preview.local, true);
        if (await this.hash(this.capture()) !== resolved.hash) throw Error('The local workspace did not confirm the resolved Drive version.');
      }
      await this.acknowledge(resolved.hash, [resolved]); this.preview = null;
      const latest = await this.inspect();
      this.statusCode = latest.heads.some((head) => head.hash !== resolved.hash) ? 'divergence' : 'resolved';
    });
  }

  async seed() {
    return this.run(async () => {
      if (!this.canSync()) throw Error('Finish saving local changes before sending the first backup.');
      const graph = await this.inspect();
      if (graph.nodes.length) throw Error('The selected Drive folder contains versions. Compare them first.');
      const workspace = this.capture(), hash = await this.hash(workspace);
      if (!await this.unchanged(hash)) throw Error('The local workspace changed while preparing the backup.');
      const node = await this.publish(workspace, []);
      await this.acknowledge(node.hash, [node]); await this.inspect();
      this.statusCode = await this.unchanged(hash) ? 'created' : 'pendingLocal';
    });
  }
}
