/** Workspace defaults and migrations. All reads are pure; storage owns writes. */
import { toMonths, numberText } from './numbers.js';
import { normalizeFields, migrateLegacyInputs } from './fields.js';
import { normalizeStrategies, activeIdOf, defaultStrategies, migrateFields } from './strategies.js';
import { normalizeMilestones, defaultMilestones } from './milestones.js';
import { normalizeProject, normalizeProjects, normalizePlan, openIdOf, planOf } from './projects.js';
import { TEMPLATES, repairTemplateLinks } from './templates.js';
import { makeTranslator } from './i18n.js';

export const DEFAULT_MONTHS = 240;
export const DEFAULT_INFLATION = '2';
export const DEFAULT_SPREAD = '3';
export const DEFAULT_TAX = '30';
export const METRICS = ['net', 'worth', 'income', 'expenses', 'invested', 'profit', 'owned', 'debt'];
export const projectCoerce = {
  months: (value) => toMonths(value ?? DEFAULT_MONTHS),
  milestones: (value) => normalizeMilestones(value, METRICS),
};

export function toRateText(value, fallback = DEFAULT_INFLATION) {
  return typeof value === 'number' || typeof value === 'string' ? numberText(value) : fallback;
}

export function defaultState() {
  const strategies = defaultStrategies();
  return {
    strategies, activeId: strategies[0].id, months: DEFAULT_MONTHS,
    inflation: DEFAULT_INFLATION, realMoney: false, spread: DEFAULT_SPREAD,
    showRange: false, tax: DEFAULT_TAX,
    milestones: normalizeMilestones(defaultMilestones(), METRICS),
  };
}

export function firstRunProjects(plan, t) {
  const open = normalizeProject({ nameKey: 'project.default.home' }, projectCoerce, true);
  const behind = TEMPLATES.map((template) => {
    const built = template.build(t);
    return normalizeProject({ nameKey: built.nameKey, plan: built }, projectCoerce, false);
  });
  return { projects: [open, ...behind], openProjectId: open.id, plan };
}

function normalizeFlat(saved) {
  const strategies = repairTemplateLinks(normalizeStrategies(saved.strategies));
  return {
    strategies, activeId: activeIdOf(strategies, saved.activeId),
    months: toMonths(saved.months ?? DEFAULT_MONTHS),
    inflation: toRateText(saved.inflation), realMoney: saved.realMoney === true,
    spread: toRateText(saved.spread, DEFAULT_SPREAD), showRange: saved.showRange === true,
    tax: toRateText(saved.tax, DEFAULT_TAX),
    milestones: normalizeMilestones(saved.milestones, METRICS),
    projectId: typeof saved.projectId === 'string' ? saved.projectId : '',
  };
}

/** Adopt old stores without deleting them; the repository retires them after a successful save. */
export function loadWorkspace({ flat, shelf, legacyFields, legacyInputs } = {}, language = 'en') {
  let state;
  let fresh = false;
  if (flat && Array.isArray(flat.strategies)) state = normalizeFlat(flat);
  else if (legacyFields && Array.isArray(legacyFields.fields)) {
    state = normalizeFlat({ strategies: migrateFields(normalizeFields(legacyFields.fields)), months: legacyFields.months });
  } else if (legacyInputs && typeof legacyInputs === 'object') {
    state = normalizeFlat({ strategies: migrateFields(migrateLegacyInputs(legacyInputs)), months: legacyInputs.months });
  } else { state = defaultState(); fresh = true; }

  if (shelf && Array.isArray(shelf.projects) && shelf.projects.length) {
    const wanted = shelf.projects.some((one) => one && one.id === state.projectId)
      ? state.projectId : shelf.openProjectId;
    state.projects = normalizeProjects(shelf.projects, projectCoerce, wanted);
    state.openProjectId = openIdOf(state.projects, wanted);
    if (fresh) {
      const kept = shelf.projects.find((one) => one && one.id === state.openProjectId);
      Object.assign(state, normalizePlan(kept?.plan, projectCoerce));
    }
  } else if (fresh) {
    const { plan, ...projects } = firstRunProjects(planOf(state), makeTranslator(language));
    Object.assign(state, projects, plan);
  } else {
    const only = normalizeProject({}, projectCoerce, true);
    state.projects = [only];
    state.openProjectId = only.id;
  }
  state.projects = state.projects.map((one) => one.plan
    ? { ...one, plan: { ...one.plan, strategies: repairTemplateLinks(one.plan.strategies) } } : one);
  delete state.projectId;
  return state;
}

/** One complete atomic snapshot; legacy shapes are mirrors for older builds. */
export function snapshotOf(state) {
  return {
    flat: {
      strategies: state.strategies, activeId: state.activeId, months: state.months,
      inflation: state.inflation, realMoney: state.realMoney, spread: state.spread,
      showRange: state.showRange, tax: state.tax, milestones: state.milestones,
      projectId: state.openProjectId,
    },
    shelf: { projects: state.projects, openProjectId: state.openProjectId },
  };
}
