/** Presentation choices and guided creation. Neither mode rewrites a plan. */
import { createField } from './fields.js';
import { normalizeStrategy } from './strategies.js';
import { normalizePlan } from './projects.js';
import { projectCoerce } from './state.js';
import { normalizeMilestones } from './milestones.js';

export const VIEW_MODE_KEY = 'finapp.viewMode.v1';
export const INTRO_KEY = 'finapp.introduction.v1';
export const viewModeOf = (value) => value === 'advanced' ? 'advanced' : 'simple';

export function guidedPlan(kind, t) {
  const fields = [
    createField({ labelKey: 'field.default.income', direction: 'income', synced: kind === 'compare' }),
    createField({ labelKey: 'field.default.expense', direction: 'expense', synced: kind === 'compare' }),
  ];
  const first = normalizeStrategy({ name: t('ui.scenarioOne'), origin: 'own', fields });
  const strategies = [first];
  if (kind === 'compare') strategies.push(normalizeStrategy({ name: t('ui.scenarioTwo'), origin: 'own', fields: fields.map((field) => ({ ...field })) }));
  const milestones = kind === 'savings'
    ? normalizeMilestones([{ name: t('ui.savingsGoal'), metric: 'net', amount: '' }], ['net']) : [];
  return normalizePlan({ strategies, activeId: first.id, months: 60, milestones }, projectCoerce);
}

/** Hidden controls must still have a readable explanation in Simple mode. */
export function advancedFields(fields) {
  return fields.filter((field) => field.startAt || field.endAt || field.sellAt
    || field.startMonth > 1 || field.endMonth || field.sellMonth
    || (field.kind === 'plain' && field.annualRate && Number(field.annualRate.replace(',', '.')) !== 0));
}
