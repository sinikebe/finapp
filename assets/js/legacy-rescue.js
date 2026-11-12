/** Read old-origin export files without writing their contents to this browser. */
import { BackupError, parseBackup } from './backup.js';
import { loadWorkspace, snapshotOf } from './state.js';
import { MAX_FIELDS } from './fields.js';
import { MAX_STRATEGIES } from './strategies.js';
import { MAX_PROJECTS } from './projects.js';
import { readNumericInput } from './input-validation.js';
import {
  createPlanStore, STORE_KEY, STATE_KEY, PROJECTS_KEY,
  LEGACY_FIELDS_KEY, LEGACY_INPUT_KEY, DRAFT_PREFIX,
} from './store.js';

export const MAX_LEGACY_RESCUE_BYTES = 64 * 1024 * 1024;

const invalid = () => { throw new BackupError('invalid'); };
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);

function parse(raw) {
  if (typeof raw !== 'string') return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function withinByteLimit(value) {
  if (typeof value !== 'string' || value.length > MAX_LEGACY_RESCUE_BYTES) return false;
  const encoder = new TextEncoder();
  let bytes = 0;
  for (let start = 0; start < value.length;) {
    let end = Math.min(start + 65536, value.length);
    if (end < value.length && value.charCodeAt(end - 1) >= 0xd800 && value.charCodeAt(end - 1) <= 0xdbff) end++;
    bytes += encoder.encode(value.slice(start, end)).byteLength;
    if (bytes > MAX_LEGACY_RESCUE_BYTES) return false;
    start = end;
  }
  return true;
}

const hasPlan = (value) => object(value) && Array.isArray(value.strategies)
  && value.strategies.length > 0 && value.strategies.length <= MAX_STRATEGIES
  && value.strategies.every((strategy) => object(strategy) && Array.isArray(strategy.fields)
    && strategy.fields.length <= MAX_FIELDS);
const shelfShape = (value) => object(value) && Array.isArray(value.projects)
  && value.projects.length > 0 && value.projects.length <= MAX_PROJECTS
  && value.projects.every((project) => object(project) && (project.plan == null || hasPlan(project.plan)));
const hasShelf = (value) => shelfShape(value)
  && value.projects.some((project) => hasPlan(project.plan)
    || typeof project.name === 'string' && project.name.trim()
    || typeof project.nameKey === 'string' && project.nameKey.trim());
const hasHorizon = (value) => Number.isInteger(Number(value?.months))
  && Number(value.months) >= 1 && Number(value.months) <= 600;
const meaningfulValue = (value) => (typeof value === 'string' || typeof value === 'number')
  && String(value).trim() !== '' && readNumericInput(value, { signed: true }).valid;
const hasFieldData = (value) => object(value) && (
  ['amount', 'fees', 'annualRate'].some((key) => meaningfulValue(value[key]))
  || ['direction', 'kind', 'label', 'labelKey'].some((key) => typeof value[key] === 'string' && value[key].trim())
);

/** The original JSON strings remain in the downloaded file; each choice is independent. */
export function parseLegacyRescue(raw) {
  if (!withinByteLimit(raw)) throw new BackupError('tooLarge');
  const rescue = parse(raw);
  if (rescue?.format !== 'finapps-legacy-rescue-v1' || rescue.app !== 'finapp'
      || !['production', 'development'].includes(rescue.environment) || !object(rescue.entries)) invalid();

  const entries = rescue.entries;
  const read = (key) => parse(Object.hasOwn(entries, key) ? entries[key] : null);
  const atomic = read(STORE_KEY);
  const flat = read(STATE_KEY);
  const shelf = read(PROJECTS_KEY);
  const legacyFields = read(LEGACY_FIELDS_KEY);
  const legacyInputs = read(LEGACY_INPUT_KEY);
  const candidates = [];
  const hasFields = Array.isArray(legacyFields?.fields) && legacyFields.fields.length <= MAX_FIELDS
    && (legacyFields.fields.some(hasFieldData) || hasHorizon(legacyFields));
  const hasInputs = object(legacyInputs)
    && (meaningfulValue(legacyInputs.income) || meaningfulValue(legacyInputs.rent) || hasHorizon(legacyInputs));

  function add(labelKey, input, { index } = {}) {
    try {
      // Normalizers intentionally cap lists. Never present a shortened copy
      // as a complete recovered workspace; the raw rescue remains intact.
      if ((input.flat && !hasPlan(input.flat)) || (input.shelf && !shelfShape(input.shelf))) return;
      const snapshot = snapshotOf(loadWorkspace(input));
      // The existing importer remains the source of truth for every candidate.
      const checked = parseBackup(JSON.stringify({ version: 1, workspace: snapshot, drafts: [] }));
      const independent = ['ui.restoreLegacyFields', 'ui.restoreLegacyInputs', 'ui.restoreLegacyDraft'].includes(labelKey);
      if (!independent && candidates.some((one) => JSON.stringify(one.snapshot) === JSON.stringify(checked.workspace))) return;
      candidates.push({ labelKey, snapshot: checked.workspace, ...(index === undefined ? {} : { index }) });
    } catch { /* A rejected source remains byte-for-byte in the original rescue file. */ }
  }

  const hasAtomic = atomic?.version === 1 && hasPlan(atomic.flat) && shelfShape(atomic.shelf);
  const hasFlat = hasPlan(flat);
  const hasProjects = hasShelf(shelf);
  const beforeFlat = parse(atomic?.before?.flat);
  const beforeShelf = parse(atomic?.before?.shelf);
  const hasBefore = hasPlan(beforeFlat) || hasShelf(beforeShelf);
  const mirrorsDiffer = hasAtomic && ((hasFlat && JSON.stringify(flat) !== JSON.stringify(atomic.flat))
    || (hasProjects && JSON.stringify(shelf) !== JSON.stringify(atomic.shelf)));
  if (hasAtomic || hasFlat || hasProjects) {
    // Reuse the application's own precedence and A/B project reconciliation.
    const storage = { getItem: (key) => typeof entries[key] === 'string' ? entries[key] : null };
    try {
      const selected = createPlanStore(() => storage, { tabId: 'legacy-rescue-read-only' }).read().data;
      if (hasPlan(selected.flat) || hasShelf(selected.shelf)) {
        const label = !hasAtomic && !hasProjects ? 'ui.restoreLegacyFlat'
          : !hasAtomic && !hasFlat ? 'ui.restoreLegacyShelf'
            : hasAtomic && !hasFlat && !hasProjects ? 'ui.restoreLegacyAtomic' : 'ui.restoreLegacyReconciled';
        add(label, selected);
      }
    } catch { /* Other independent sources may still be recoverable. */ }
  }

  if (hasAtomic && (hasFlat || hasProjects || !candidates.length)) {
    add('ui.restoreLegacyAtomic', { flat: atomic.flat, shelf: atomic.shelf });
  }
  if (!hasAtomic && hasPlan(atomic?.flat)) add('ui.restoreLegacyFlat', { flat: atomic.flat });
  if (hasFlat && (hasAtomic || hasProjects || !candidates.length)) {
    add('ui.restoreLegacyFlat', { flat, ...(hasProjects ? { shelf } : {}) });
  }
  if (hasProjects && (!hasAtomic || mirrorsDiffer)) add('ui.restoreLegacyShelf', { shelf });
  if (hasBefore && hasPlan(beforeFlat)) {
    add('ui.restoreLegacyPrevious', { flat: beforeFlat, ...(shelfShape(beforeShelf) ? { shelf: beforeShelf } : {}) });
  } else if (hasBefore) add('ui.restoreLegacyPrevious', { shelf: beforeShelf });
  if (hasFields) {
    add('ui.restoreLegacyFields', { legacyFields });
  }
  if (hasInputs) {
    add('ui.restoreLegacyInputs', { legacyInputs });
  }
  const draftKeys = Object.keys(entries).filter((key) => key.startsWith(DRAFT_PREFIX));
  for (let index = 0; index < draftKeys.length; index++) {
    const draft = read(draftKeys[index]);
    if (hasPlan(draft?.snapshot?.flat) && hasShelf(draft.snapshot.shelf)) {
      add('ui.restoreLegacyDraft', draft.snapshot, { index: index + 1 });
    }
  }
  if (!candidates.length) invalid();
  const [first, ...others] = candidates;
  return {
    workspace: first.snapshot,
    drafts: others.map(({ snapshot, labelKey, index }) => ({ snapshot, labelKey, index, updatedAt: 0 })),
    labelKey: first.labelKey,
    exportedAt: '', legacyEnvironment: rescue.environment,
  };
}

/** Keep normal backup errors and limits unless the alternative is a valid rescue. */
export function parseRestoreText(raw) {
  try { return parseBackup(raw); }
  catch (backupError) {
    try { return parseLegacyRescue(raw); }
    catch { throw backupError; }
  }
}
