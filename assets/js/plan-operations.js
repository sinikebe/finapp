/** Commands that change a plan and must preserve references across strategies. */
import { newId } from './fields.js';
import { markShared, MAX_STRATEGIES } from './strategies.js';
import { MAX_MILESTONES, removeMilestone } from './milestones.js';
import { toNumber, roundMoney } from './numbers.js';

export const TARGET_REFS = ['startAt', 'endAt', 'sellAt'];

export function referencesTo(strategies, id) {
  return strategies.reduce((sum, strategy) => sum + strategy.fields.filter(
    (field) => TARGET_REFS.some((key) => field[key] === id),
  ).length, 0);
}

export function missingTargets(strategies, milestones) {
  const known = new Set(milestones.map((one) => one.id));
  return [...new Set(strategies.flatMap((strategy) => strategy.fields.flatMap(
    (field) => TARGET_REFS.map((key) => field[key]).filter((id) => id && !known.has(id)),
  )))];
}

/** Validating a name must never add an empty amount to the patch. */
export function settleTargetPatch(patch, format) {
  const next = { ...patch };
  if ('amount' in next) {
    const amount = toNumber(next.amount);
    next.amount = Number.isFinite(amount) ? format(roundMoney(amount)) : '';
  }
  return next;
}

/** Refuse a referenced removal; the user can first choose a month or another target. */
export function removeTarget(plan, id) {
  if (referencesTo(plan.strategies, id)) return null;
  return { ...plan, milestones: removeMilestone(plan.milestones, id) };
}

/** Append a complete comparison without replacing the kept plans' targets. */
export function mergeSharedPlan(current, incoming, replacing = false) {
  const kept = replacing ? [] : current.strategies;
  const sent = incoming.strategies.slice(0, MAX_STRATEGIES - kept.length);
  const priorTargets = replacing ? [] : current.milestones;
  if (priorTargets.length + incoming.milestones.length > MAX_MILESTONES) {
    return { error: 'targetsFull' };
  }
  if (missingTargets(sent, incoming.milestones).length) return { error: 'missingTargets' };

  const ids = new Map(incoming.milestones.map((one) => [one.id, newId()]));
  const fieldIds = new Map();
  const strategies = markShared(sent.map((strategy) => ({
    ...strategy,
    id: newId(),
    fields: strategy.fields.map((field) => {
      if (!fieldIds.has(field.id)) fieldIds.set(field.id, newId());
      return {
        ...field, id: fieldIds.get(field.id),
        ...Object.fromEntries(TARGET_REFS.map((key) => [key, ids.get(field[key]) || ''])),
      };
    }),
  })));
  return {
    plan: {
      strategies: [...kept, ...strategies],
      activeId: strategies[0]?.id || current.activeId,
      months: incoming.months,
      milestones: [...priorTargets, ...incoming.milestones.map((one) => ({ ...one, id: ids.get(one.id) }))],
    },
  };
}
