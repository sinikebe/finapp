/** Compare complete workspaces by identity without silently dropping data. */
import { validateWorkspace } from './backup.js';
import { MAX_PROJECTS, planOf, PROJECT_KEYS } from './projects.js';
import { loadWorkspace } from './state.js';

export class BackupMergeError extends Error {
  constructor(code) { super(code); this.code = code; }
}

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function equal(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, index) => equal(value, b[index]));
  if (!object(a) || !object(b)) return false;
  const aKeys = Object.keys(a), bKeys = Object.keys(b);
  return aKeys.length === bKeys.length && aKeys.every((key) => Object.hasOwn(b, key) && equal(a[key], b[key]));
}

/** The open plan lives in flat; all other plans live in the project shelf. */
function unpack(source) {
  const snapshot = validateWorkspace(source);
  const state = loadWorkspace(snapshot);
  const { projectId, ...flat } = snapshot.flat;
  for (const key of PROJECT_KEYS) delete flat[key];
  return {
    snapshot,
    comparable: {
      settings: flat,
      openProjectId: state.openProjectId,
      projects: state.projects.map((project) => ({
        ...clone(project),
        plan: clone(project.id === state.openProjectId ? planOf(state) : project.plan),
      })),
    },
  };
}

const COLLECTIONS = { projects: 'project', strategies: 'scenario', fields: 'field', milestones: 'target' };
const SECTIONS = {
  en: { project: 'Project', scenario: 'Scenario', field: 'Field', target: 'Target', settings: 'Settings', order: 'Order', openProjectId: 'Open project' },
  fr: { project: 'Projet', scenario: 'Scénario', field: 'Ligne', target: 'Objectif', settings: 'Paramètres', order: 'Ordre', openProjectId: 'Projet ouvert' },
};
const ATTRIBUTES = {
  en: { name: 'Name', nameKey: 'Default name', label: 'Name', labelKey: 'Default label', months: 'Horizon', amount: 'Amount', fees: 'Fees', tax: 'Tax', spread: 'Spread', inflation: 'Inflation', realMoney: 'Real values', showRange: 'Range', activeId: 'Active scenario', strategies: 'Scenarios', milestones: 'Targets', annualRate: 'Annual rate', direction: 'Direction', kind: 'Type', periodMonths: 'Frequency', startMonth: 'Starts', endMonth: 'Ends', sellMonth: 'Sale', startAt: 'Start target', endAt: 'End target', sellAt: 'Sale target', termMonths: 'Term', metric: 'Metric', origin: 'Origin', imprint: 'Original scenario', synced: 'Shared field' },
  fr: { name: 'Nom', nameKey: 'Nom par défaut', label: 'Nom', labelKey: 'Libellé par défaut', months: 'Horizon', amount: 'Montant', fees: 'Frais', tax: 'Impôt', spread: 'Écart', inflation: 'Inflation', realMoney: 'Valeurs réelles', showRange: 'Plage', activeId: 'Scénario actif', strategies: 'Scénarios', milestones: 'Objectifs', annualRate: 'Taux annuel', direction: 'Sens', kind: 'Type', periodMonths: 'Fréquence', startMonth: 'Début', endMonth: 'Fin', sellMonth: 'Vente', startAt: 'Objectif de début', endAt: 'Objectif de fin', sellAt: 'Objectif de vente', termMonths: 'Durée', metric: 'Mesure', origin: 'Origine', imprint: 'Scénario initial', synced: 'Ligne commune' },
};

function labels(path) {
  const format = (language) => path.map((segment) => {
    const { type, key, name } = segment;
    if (type === 'item') return `${SECTIONS[language][key]} « ${name} »`;
    return ATTRIBUTES[language][key] ?? SECTIONS[language][key] ?? key;
  }).join(' · ');
  return { en: format('en'), fr: format('fr') };
}

function named(one, id, collection) {
  return one?.name || one?.label || one?.nameKey || one?.labelKey || id || collection;
}

const keyed = (list) => Array.isArray(list) && list.every((item) => object(item) && typeof item.id === 'string');

function walk(local, remote, choices = null) {
  const differences = [];

  function difference(path, a, b, conflict, kind = 'changed') {
    const id = `diff-${differences.length}`;
    const description = labels(path);
    differences.push({ id, label: description.en, labels: description, local: clone(a), remote: clone(b), conflict, kind });
    if (!conflict) return clone(a === undefined ? b : a);
    const selected = choices?.[id];
    if (choices && selected !== 'local' && selected !== 'remote') throw new BackupMergeError('choices');
    return clone(selected === 'remote' ? b : a);
  }

  function visit(a, b, path = []) {
    if (equal(a, b)) return clone(a);
    if (a === undefined || b === undefined) return difference(path, a, b, false, a === undefined ? 'onlyRemote' : 'onlyLocal');
    if (Array.isArray(a) && Array.isArray(b) && keyed(a) && keyed(b)) {
      const aMap = new Map(a.map((one) => [one.id, one]));
      const bMap = new Map(b.map((one) => [one.id, one]));
      const collection = path.at(-1)?.key;
      const item = COLLECTIONS[collection];
      const ids = [...aMap.keys(), ...bMap.keys()].filter((id, index, all) => all.indexOf(id) === index);
      const combined = new Map(ids.map((id) => {
        const title = named(aMap.get(id) || bMap.get(id), id, collection);
        return [id, visit(aMap.get(id), bMap.get(id), [...path, { type: 'item', key: item, name: title }])];
      }));
      const sharedA = a.map((one) => one.id).filter((id) => bMap.has(id));
      const sharedB = b.map((one) => one.id).filter((id) => aMap.has(id));
      if (!equal(sharedA, sharedB)) {
        difference([...path, { key: 'order' }], sharedA, sharedB, true, 'order');
        const choice = choices?.[differences.at(-1).id];
        const preferred = choice === 'remote' ? b.map((one) => one.id) : a.map((one) => one.id);
        return [...preferred, ...ids].filter((id, index, all) => all.indexOf(id) === index).map((id) => combined.get(id));
      }
      return ids.map((id) => combined.get(id));
    }
    if (object(a) && object(b)) {
      const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
      return Object.fromEntries(keys.map((key) => [key, visit(a[key], b[key], [...path, { key }])]).filter(([, value]) => value !== undefined));
    }
    return difference(path, a, b, true);
  }

  const merged = visit(local, remote);
  return { merged, differences };
}

/** Differences are the only entries to present; identical values are omitted. */
export function compareBackups(local, remote) {
  const left = unpack(local), right = unpack(remote);
  const { differences } = walk(left.comparable, right.comparable);
  return { local: left.snapshot, remote: right.snapshot, differences, signature: JSON.stringify([left.snapshot, right.snapshot]) };
}

/** Every conflicting value needs an explicit choice; additions from either side survive. */
export function mergeBackups(comparison, choices = {}) {
  if (!comparison || JSON.stringify([comparison.local, comparison.remote]) !== comparison.signature) throw new BackupMergeError('changed');
  const left = unpack(comparison.local), right = unpack(comparison.remote);
  const { merged, differences } = walk(left.comparable, right.comparable, choices);
  if (!equal(differences.map(({ id, kind }) => ({ id, kind })), comparison.differences.map(({ id, kind }) => ({ id, kind })))) throw new BackupMergeError('changed');
  if (merged.projects.length > MAX_PROJECTS) throw new BackupMergeError('tooManyProjects');
  const opened = merged.projects.find((one) => one.id === merged.openProjectId);
  if (!opened || !opened.plan) throw new BackupMergeError('invalidMerge');
  const flat = { ...merged.settings, ...opened.plan, projectId: opened.id };
  const shelf = { openProjectId: opened.id, projects: merged.projects.map((one) => one.id === opened.id ? { ...one, plan: null } : one) };
  try {
    const validated = validateWorkspace({ flat, shelf });
    // Normalisation must not change the selected values or drop a list entry.
    const normalized = unpack(validated).comparable;
    if (!equal(normalized, merged)) throw new BackupMergeError('invalidMerge');
    return validated;
  } catch (error) {
    if (error instanceof BackupMergeError) throw error;
    throw new BackupMergeError('invalidMerge');
  }
}

export const compareWorkspaces = compareBackups;
export const mergeWorkspaces = mergeBackups;
