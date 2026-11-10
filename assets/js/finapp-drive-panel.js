/** Opt-in Drive controls. Google tokens live only in DriveAuthorization memory. */
import { DRIVE_CLIENT_IDS } from './finapp-drive-config.js';
import { DriveAuthorization, loadGoogleIdentity } from './finapp-drive-auth.js';
import { DriveAPI } from './finapp-drive-api.js';
import { driveNamespace, revisionGraph } from './finapp-drive-format.js';
import { FinappDriveSync } from './finapp-drive-sync.js';

const $ = (id) => document.getElementById(id);
const MAX_VISIBLE_DIFFS = 80;

export class FinappDrivePanel {
  constructor({ base, development, getWorkspace, canSync, canApply, applyWorkspace, storage, t, language, download }) {
    Object.assign(this, { base, development, getWorkspace, canSync, canApply, applyWorkspace, storage, t, language, download });
    this.clientId = DRIVE_CLIENT_IDS[development ? 'dev' : 'main'];
    this.engine = null;
    this.auth = null;
    this.folders = [];
    this.choices = {};
    this.visibleDiffs = MAX_VISIBLE_DIFFS;
    this.loading = false;
    this.listing = false;
    this.problem = '';
    this.timer = null;
    this.poll = null;
    this.folderId = null;

    $('drive-open').addEventListener('click', () => {
      document.querySelector('.tools-menu').open = false;
      $('drive-dialog').showModal();
      void this.prepare();
      this.render();
    });
    $('drive-close').addEventListener('click', () => $('drive-dialog').close());
    $('drive-dialog').addEventListener('cancel', (event) => { if (this.busy()) event.preventDefault(); });
    $('drive-dialog').addEventListener('close', () => { if (this.engine?.state.auto) this.changed(false); });
    $('drive-connect').addEventListener('click', () => {
      // requestAccessToken must happen synchronously in this user gesture.
      if (this.auth && !this.auth.pending) { this.problem = ''; this.auth.connect(); this.render(); }
      else if (!this.auth) void this.prepare();
    });
    $('drive-disconnect').addEventListener('click', () => this.disconnect());
    $('drive-list').addEventListener('click', () => { void this.listFolders(); });
    $('drive-folders').addEventListener('change', () => {
      $('drive-use').disabled = !this.connected() || this.busy() || !$('drive-folders').value;
    });
    $('drive-create').addEventListener('click', () => this.run(async () => {
      if (await this.engine.create($('drive-name').value)) await this.listFolders();
    }));
    $('drive-use').addEventListener('click', () => this.run(async () => {
      const id = $('drive-folders').value;
      if (!id) return;
      if (await this.engine.bind(id)) await this.engine.refresh();
    }));
    $('drive-sync').addEventListener('click', () => this.run(() => this.engine.sync()));
    $('drive-seed').addEventListener('click', () => this.run(() => this.engine.seed()));
    $('drive-auto').addEventListener('change', () => this.run(async () => {
      await this.engine.setAuto($('drive-auto').checked);
      if (this.engine.state.auto) await this.engine.sync();
    }));
    $('drive-preview-close').addEventListener('click', () => $('drive-preview-dialog').close());
    $('drive-preview-dialog').addEventListener('cancel', (event) => { if (this.busy()) event.preventDefault(); });
    $('drive-preview-dialog').addEventListener('close', () => {
      if (!this.engine?.busy && this.engine) this.engine.preview = null;
      this.choices = {};
      this.changed(false);
    });
    for (const [id, choice] of [['drive-keep-local', 'local'], ['drive-use-remote', 'remote'], ['drive-merge', 'merge']]) {
      $(id).addEventListener('click', () => { void this.resolve(choice); });
    }
    $('drive-export-local').addEventListener('click', () => { void this.exportPreview('local'); });
    $('drive-export-remote').addEventListener('click', () => { void this.exportPreview('remote'); });

    window.addEventListener('online', () => this.wake());
    window.addEventListener('focus', () => this.wake());
    document.addEventListener('visibilitychange', () => this.wake());
    this.render();
  }

  lang() { return this.language(); }
  word(key, ...args) { return this.t()(key, ...args); }
  connected() { return Boolean(this.auth?.token() && this.engine?.api); }
  busy() { return this.loading || this.listing || Boolean(this.auth?.pending || this.engine?.busy); }

  async restore() {
    const settings = {
      load: async () => {
        try { return JSON.parse(this.storage().getItem('finapp.drive.v1') || 'null'); }
        catch { return null; }
      },
      save: async (value) => {
        // Persist only the chosen folder, hashes and revision pointers. No credentials.
        this.storage().setItem('finapp.drive.v1', JSON.stringify({
          binding: value.binding, baseline: value.baseline, auto: value.auto === true, checkedAt: value.checkedAt,
        }));
      },
    };
    this.engine = new FinappDriveSync({ namespace: await driveNamespace(this.base), settings,
      development: this.development, language: this.language, getWorkspace: this.getWorkspace, canSync: this.canSync,
      canApply: this.canApply, applyWorkspace: this.applyWorkspace, onChange: () => this.render(),
    });
    await this.engine.restore();
    this.poll = window.setInterval(() => this.wake(), 5 * 60 * 1000);
    this.render();
    if ($('drive-dialog').open) await this.prepare();
  }

  async prepare() {
    if (this.auth || this.loading || !this.engine) return;
    this.loading = true; this.problem = ''; this.render();
    try {
      const oauth = await loadGoogleIdentity(document, this.lang());
      this.auth = new DriveAuthorization({ clientId: this.clientId, oauth, language: this.lang(),
        onToken: () => { void this.onConnected(); },
        onError: (message) => { this.problem = message; this.render(); },
      });
    } catch (error) { this.problem = error.message; }
    finally { this.loading = false; this.render(); }
  }

  async onConnected() {
    this.problem = '';
    this.engine.api?.close?.();
    this.engine.graph = revisionGraph([]);
    this.engine.api = new DriveAPI({ token: () => this.auth?.token(), language: this.lang(),
      onExpired: () => { this.auth?.clearToken(); this.problem = this.word('drive.connectionExpired'); this.render(); },
    });
    this.render();
    await this.listFolders();
    if (this.engine.state.binding) {
      await this.run(() => this.engine.state.auto && this.canSync() ? this.engine.sync() : this.engine.refresh());
    }
    this.render();
  }

  disconnect() {
    window.clearTimeout(this.timer);
    this.auth?.disconnect();
    this.engine?.disconnect();
    this.folders = [];
    this.problem = '';
    this.render();
  }

  async run(operation) {
    if (!this.connected() || this.busy()) return;
    try { this.problem = ''; await operation(); }
    catch (error) { this.problem = error.message; }
    finally { this.render(); }
  }

  async listFolders() {
    if (!this.connected() || this.engine?.busy || this.listing) return;
    this.listing = true; this.render();
    try { this.folders = await this.engine.folders(); this.problem = ''; }
    catch (error) { this.problem = error.message; }
    finally { this.listing = false; this.render(); }
  }

  wake() {
    if (!this.connected() || !this.engine?.state.auto || this.engine.busy || this.engine.preview
        || document.visibilityState !== 'visible' || navigator.onLine === false || !this.canSync()) return;
    void this.engine.sync();
  }

  changed(edited = true) {
    if (edited) { this.engine?.changed(); this.render(); return; }
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.wake(), 1500);
    this.render();
  }

  pauseForImport() {
    window.clearTimeout(this.timer);
    this.engine?.pauseForImport();
  }

  refreshLanguage() {
    if (this.auth) this.auth.language = this.lang();
    if (this.engine?.api) this.engine.api.language = this.lang();
    this.render();
    if ($('drive-preview-dialog').open) this.renderDifferences();
  }

  formatDate(value) {
    const time = new Date(value);
    return Number.isFinite(time.getTime()) ? time.toLocaleString(this.lang() === 'fr' ? 'fr-FR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }) : this.word('drive.unknownDate');
  }

  status() {
    if (this.problem) return this.problem;
    if (this.engine?.error) return this.engine.error;
    if (this.loading) return this.word('drive.loading');
    if (this.listing) return this.word('drive.statusBusy');
    if (this.auth?.pending) return this.word('drive.connecting');
    if (!this.connected()) return this.engine?.state.binding ? this.word('drive.reconnect') : this.word('drive.disconnected');
    if (this.engine?.busy) return this.word(this.engine.statusCode === 'uploading' ? 'drive.state.uploading' : 'drive.statusBusy');
    if (!this.engine?.state.binding) return this.word('drive.statusNeedsFolder');
    if (new Set(this.engine.graph.heads.map((node) => node.hash)).size > 1) return this.word('drive.statusDiverged');
    if (this.engine.localChanged && this.engine.statusCode !== 'needsReview') return this.word('drive.statusChanges');
    const key = `drive.state.${this.engine.statusCode}`;
    return this.word(key) === key ? this.word(this.engine.state.auto ? 'drive.statusSynced' : 'drive.statusPaused') : this.word(key);
  }

  render() {
    const engine = this.engine, connected = this.connected(), busy = this.busy();
    $('drive-connect').hidden = connected;
    $('drive-connect').disabled = !engine || busy;
    $('drive-connect').textContent = this.problem && !this.auth ? this.word('drive.retry') : this.word('drive.connect');
    $('drive-disconnect').hidden = !connected && !this.auth?.pending;
    $('drive-disconnect').disabled = engine?.busy;
    $('drive-close').disabled = Boolean(engine?.busy);
    $('drive-status').textContent = this.status();
    $('drive-status').dataset.error = String(Boolean(this.problem || engine?.error));
    $('drive-connected').hidden = !connected;
    $('drive-folder').textContent = engine?.state.binding?.name || this.word('drive.folderSelectPrompt');
    if (this.folderId !== engine?.state.binding?.id) {
      $('drive-folder-settings').open = !engine?.state.binding;
      this.folderId = engine?.state.binding?.id;
    }
    const select = $('drive-folders');
    const folderKey = JSON.stringify([this.folders.map(({ id, name }) => [id, name]), this.lang()]);
    if (this.foldersKey !== folderKey) {
      const previous = select.value || engine?.state.binding?.id || '';
      select.replaceChildren();
      const first = document.createElement('option');
      first.value = ''; first.textContent = this.word('drive.folderSelect'); select.append(first);
      for (const folder of this.folders) {
        const option = document.createElement('option');
        option.value = folder.id; option.textContent = folder.name; select.append(option);
      }
      select.value = this.folders.some((folder) => folder.id === previous) ? previous : '';
      this.foldersKey = folderKey;
    }
    $('drive-name').placeholder = this.word('drive.folderDefault');
    $('drive-folder-settings').hidden = !connected;
    $('drive-list').disabled = !connected || busy;
    $('drive-folders').disabled = !connected || busy;
    $('drive-use').disabled = !connected || busy || !select.value;
    $('drive-create').disabled = !connected || busy;
    $('drive-name').disabled = !connected || busy;
    $('drive-sync').disabled = !connected || busy || !engine?.state.binding;
    $('drive-seed').hidden = !engine?.state.binding || Boolean(engine?.graph.nodes.length || engine?.state.baseline);
    $('drive-seed').disabled = !connected || busy;
    $('drive-auto').checked = engine?.state.auto === true;
    $('drive-auto').disabled = !connected || busy || !engine?.state.binding;
    $('drive-notice').hidden = !engine?.notice;
    $('drive-notice').textContent = engine?.notice ? this.word(`drive.notice.${engine.notice}`) : '';
    $('drive-history').hidden = !connected || !engine?.graph.nodes.length;
    $('drive-review').hidden = !connected;
    $('drive-preview-close').disabled = Boolean(engine?.busy);
    const hasPreview = Boolean(engine?.preview);
    for (const id of ['drive-keep-local', 'drive-use-remote', 'drive-export-local', 'drive-export-remote']) $(id).disabled = !hasPreview || Boolean(engine?.busy);
    const differences = engine?.preview?.comparison?.differences ?? [];
    $('drive-merge').disabled = !hasPreview || Boolean(engine?.busy) || !differences.length || differences.some((difference) => difference.conflict && !this.choices[difference.id]);
    $('drive-differences').querySelectorAll('select, button').forEach((control) => { control.disabled = Boolean(engine?.busy); });
    $('drive-preview-error').hidden = !(engine?.error || this.problem);
    $('drive-preview-error').textContent = engine?.error || this.problem;
    this.renderVersions();
  }

  renderVersions() {
    const engine = this.engine, list = $('drive-versions'), review = $('drive-review-list');
    if (!this.connected() || !engine?.state.binding) {
      list.replaceChildren(); review.replaceChildren(); this.versionsKey = null;
      $('drive-review').hidden = true;
      $('drive-history').hidden = true;
      return;
    }
    const heads = new Set(engine.graph.heads.map((node) => node.revision));
    const nodes = [...engine.graph.nodes].sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const changed = !engine.state.baseline || engine.graph.heads.some((node) => node.hash !== engine.state.baseline.hash);
    const divergent = new Set(engine.graph.heads.map((node) => node.hash)).size > 1;
    const reviewNodes = changed ? divergent ? engine.graph.heads : nodes.slice(0, 1) : [];
    $('drive-review').hidden = !reviewNodes.length;
    const visible = nodes.filter((node, at) => at < 20 || heads.has(node.revision));
    const versionsKey = JSON.stringify([this.lang(), visible.map(({ id, at, counts }) => [id, at, counts]), reviewNodes.map((node) => node.id)]);
    $('drive-history-note').textContent = this.word('drive.historyCount', nodes.length);
    if (this.versionsKey === versionsKey) {
      for (const button of [...list.querySelectorAll('button'), ...review.querySelectorAll('button')]) button.disabled = engine.busy;
      return;
    }
    this.versionsKey = versionsKey;
    list.replaceChildren(); review.replaceChildren();
    const add = (target, node) => {
      const row = document.createElement('li');
      const summary = document.createElement('span');
      summary.textContent = `${this.formatDate(node.at)} · ${this.word('drive.projectCount', node.counts?.[0] ?? 0)}`;
      const button = document.createElement('button');
      button.className = 'ghost-button'; button.type = 'button';
      button.textContent = this.word('drive.versionCompare');
      button.disabled = engine.busy;
      button.addEventListener('click', () => { void this.compare(node.revision); });
      row.append(summary, button); target.append(row);
    };
    reviewNodes.forEach((node) => add(review, node));
    visible.forEach((node) => add(list, node));
  }

  async compare(revision) {
    if (!this.connected() || this.busy()) return;
    await this.engine.compare(revision);
    if (!this.engine.preview) { this.render(); return; }
    this.choices = {};
    this.visibleDiffs = MAX_VISIBLE_DIFFS;
    $('drive-preview-description').textContent = `${this.word('drive.versionReview')} · ${this.formatDate(this.engine.preview.node.at)}`;
    this.renderDifferences();
    $('drive-preview-dialog').showModal();
    this.render();
  }

  describeValue(value) {
    if (value === undefined) return this.word('drive.diffMissing');
    if (value === null) return '—';
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return text.length > 220 ? `${text.slice(0, 220)}…` : text;
  }

  renderDifferences() {
    const comparison = this.engine?.preview?.comparison;
    const container = $('drive-differences');
    container.replaceChildren();
    if (!comparison) return;
    const differences = comparison.differences;
    $('drive-review-summary').textContent = differences.length
      ? this.word('drive.diffCount', differences.length) : this.word('drive.noDifference');
    for (const difference of differences.slice(0, this.visibleDiffs)) {
      const card = document.createElement('article'); card.className = 'drive-difference';
      const label = document.createElement('h3');
      label.textContent = difference.labels?.[this.lang()] || difference.label;
      card.append(label);
      const pair = document.createElement('div'); pair.className = 'drive-difference-values';
      for (const [side, key] of [['local', 'drive.diffLocal'], ['remote', 'drive.diffRemote']]) {
        const item = document.createElement('div');
        const heading = document.createElement('strong'); heading.textContent = this.word(key);
        const value = document.createElement('span'); value.textContent = this.describeValue(difference[side]);
        item.append(heading, value); pair.append(item);
      }
      card.append(pair);
      if (difference.conflict) {
        const selectLabel = document.createElement('label'); selectLabel.className = 'drive-difference-choice'; selectLabel.textContent = this.word('drive.diffSelect');
        const selector = document.createElement('select'); selector.setAttribute('aria-label', `${this.word('drive.diffSelect')} · ${label.textContent}`);
        for (const [value, key] of [['', 'drive.diffSelect'], ['local', 'drive.diffKeep'], ['remote', 'drive.diffTake']]) {
          const option = document.createElement('option'); option.value = value; option.textContent = this.word(key); selector.append(option);
        }
        selector.value = this.choices[difference.id] ?? '';
        selector.addEventListener('change', () => {
          if (selector.value) this.choices[difference.id] = selector.value;
          else delete this.choices[difference.id];
          $('drive-merge').disabled = differences.some((entry) => entry.conflict && !this.choices[entry.id]);
        });
        selectLabel.append(selector); card.append(selectLabel);
      }
      container.append(card);
    }
    if (differences.length > this.visibleDiffs) {
      const more = document.createElement('button'); more.type = 'button'; more.className = 'ghost-button';
      more.textContent = this.word('drive.showMore', differences.length - this.visibleDiffs);
      more.addEventListener('click', () => { this.visibleDiffs += MAX_VISIBLE_DIFFS; this.renderDifferences(); });
      container.append(more);
    }
  }

  async resolve(choice) {
    if (!this.engine?.preview || this.busy()) return;
    if (choice === 'merge' && $('drive-merge').disabled) return;
    const done = await this.engine.resolve(choice, this.choices);
    if (done) {
      $('drive-preview-dialog').close();
      this.choices = {};
    }
    this.render();
  }

  async exportPreview(source) {
    if (!this.engine?.preview || this.busy()) return;
    const workspace = source === 'remote' ? this.engine.preview.incoming : this.engine.preview.local;
    const contents = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), workspace }, null, 2);
    const filename = `finapp-${source === 'remote' ? 'drive' : 'local'}-${new Date().toISOString().slice(0, 10)}.json`;
    try { await this.download(contents, filename); }
    catch (error) { this.problem = error.message; this.render(); }
  }
}
