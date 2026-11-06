/** Presentation preferences and commands shared by the three workspaces. */
import { updateField } from './fields.js';
import { updateStrategy, spreadField } from './strategies.js';
import { CAR_ENERGY, monthlyCarEnergy } from './car-energy.js';
import { readNumericInput } from './input-validation.js';

export const LAYOUT_KEY = 'finapp.layout.v1';
export const NAVIGATION_KEY = 'finapp.navigation.v1';
export const LAYOUTS = Object.freeze(['horizon', 'atelier', 'parcours']);
export const layoutOf = (value) => LAYOUTS.includes(value) ? value : 'horizon';
export const stepOf = (value) => Number.isInteger(value) ? Math.max(0, Math.min(2, value)) : 0;

/** View preferences contain no financial values and never travel in app links. */
export function navigationOf(value) {
  return {
    section: ['overview', 'compare', 'data', 'assumptions'].includes(value?.section) ? value.section : 'overview',
    step: stepOf(value?.step),
  };
}

/** Restore the last open project after a reload or an application round trip. */
export function createWorkspaceNavigation({ read, write }) {
  const views = new Map();
  const saved = read(NAVIGATION_KEY, null);
  if (typeof saved?.projectId === 'string' && saved.projectId.length > 0 && saved.projectId.length <= 200) {
    views.set(saved.projectId, navigationOf(saved));
  }
  return {
    forProject: (id) => ({ ...(views.get(id) || navigationOf()) }),
    remember(id, value) {
      const view = navigationOf(value);
      views.set(id, view);
      return write(NAVIGATION_KEY, { projectId: id, ...view });
    },
  };
}

/** Update the requested scenario without changing which one is selected. */
export function editScenarioAmount(strategies, strategyId, fieldId, text) {
  const owner = strategies.find((one) => one.id === strategyId);
  const field = owner?.fields.find((one) => one.id === fieldId);
  const value = readNumericInput(text);
  if (!field || !value.valid) return strategies;
  const edited = { ...field, amount: value.text };
  return field.synced ? spreadField(strategies, edited)
    : updateStrategy(strategies, strategyId, { fields: updateField(owner.fields, fieldId, { amount: value.text }) });
}

/** Only the explicitly recognised car example can use the catalogue formula. */
export function carVariantsOf(strategies) {
  return strategies.map((strategy) => ({ strategy, variant: CAR_ENERGY.variants.find((one) => strategy.nameKey === `strategy.default.car${one.id}`) }))
    .filter(({ strategy, variant }) => variant && strategy.fields.some((field) => field.labelKey === 'field.default.carEnergy'));
}

/** Infer usage from actual amounts: editing energy manually never leaves a stale km label. */
export function annualKmOf(strategies) {
  const variants = carVariantsOf(strategies);
  if (!variants.length || variants.length !== strategies.length) return null;
  const readings = variants.map(({ strategy, variant }) => {
    const amount = readNumericInput(strategy.fields.find((field) => field.labelKey === 'field.default.carEnergy').amount).number;
    return amount / (variant.consumption * variant.unitPrice) * 1200;
  });
  if (!readings.every(Number.isFinite)) return null;
  const midpoint = Math.round(readings.reduce((sum, km) => sum + km, 0) / readings.length);
  // Monthly provisions are rounded to cents, so recover a km value whose
  // formula reproduces every entered budget rather than rounding to 100 km.
  const candidates = [midpoint, midpoint - 1, midpoint + 1, midpoint - 2, midpoint + 2];
  return candidates.find((km) => km >= 0 && variants.every(({ strategy, variant }) => {
    const budget = readNumericInput(strategy.fields.find((field) => field.labelKey === 'field.default.carEnergy').amount).number;
    return Math.abs(monthlyCarEnergy(variant, km) - budget) < .001;
  })) ?? null;
}

export function changeAnnualKm(strategies, value) {
  const km = readNumericInput(value, { min: 0, max: 200000, integer: true, allowEmpty: false });
  if (!km.valid || carVariantsOf(strategies).length !== strategies.length) return strategies;
  return strategies.map((strategy) => {
    const variant = CAR_ENERGY.variants.find((one) => strategy.nameKey === `strategy.default.car${one.id}`);
    const field = strategy.fields.find((one) => one.labelKey === 'field.default.carEnergy');
    return { ...strategy, fields: updateField(strategy.fields, field.id, { amount: String(monthlyCarEnergy(variant, km.number)) }) };
  });
}

/** Cash and net worth always come from the same complete projection. */
export function comparisonReading(strategies, projections, metric = 'net') {
  const car = carVariantsOf(strategies).length === strategies.length && strategies.length > 0
    && strategies.every((one) => one.fields.every((field) => (!['plain', 'once'].includes(field.kind) || field.direction !== 'income') && !['loan', 'investment'].includes(field.kind)));
  const values = projections.map((projection) => car ? -projection.totals.worth : projection.totals[metric]);
  const best = car ? Math.min(...values) : Math.max(...values);
  return { car, values, best, metric: car ? 'cost' : metric };
}
