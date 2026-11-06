/** Validate complete backups before any existing workspace is replaced. */
import { MAX_PROJECTS } from './projects.js';
import { MAX_STRATEGIES } from './strategies.js';
import { KINDS, DIRECTIONS, PERIODS, MAX_FIELDS } from './fields.js';
import { MAX_MILESTONES } from './milestones.js';
import { missingTargets } from './plan-operations.js';
import { readNumericInput } from './input-validation.js';
import { METRICS, loadWorkspace, snapshotOf } from './state.js';

export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
export class BackupError extends Error { constructor(code) { super(code); this.code = code; } }
const fail = (code = 'invalid') => { throw new BackupError(code); };
const idValid = (id) => typeof id === 'string' && id.length > 0 && id.length <= 128;
const modelNumber = (value, options) => { const read = readNumericInput(value, options); return read.valid && read.text === String(value ?? '').trim(); };
const uniqueIds = (list) => list.every((one) => one && idValid(one.id)) && new Set(list.map((one) => one.id)).size === list.length;

function checkPlan(plan) {
  if (!plan || !Array.isArray(plan.strategies) || !plan.strategies.length || plan.strategies.length > MAX_STRATEGIES || !uniqueIds(plan.strategies)) fail();
  if (!Array.isArray(plan.milestones) || plan.milestones.length > MAX_MILESTONES || !uniqueIds(plan.milestones)) fail();
  if (!plan.strategies.some((one) => one.id === plan.activeId) || !Number.isInteger(plan.months) || plan.months < 1 || plan.months > 600) fail();
  for (const goal of plan.milestones) if (!METRICS.includes(goal.metric) || !modelNumber(goal.amount, { signed: true, max: Number.MAX_VALUE })) fail();
  for (const strategy of plan.strategies) {
    if (!Array.isArray(strategy.fields) || strategy.fields.length > MAX_FIELDS || !uniqueIds(strategy.fields)) fail();
    for (const field of strategy.fields) {
      if (!KINDS.includes(field.kind) || !DIRECTIONS.includes(field.direction) || !PERIODS.includes(field.periodMonths)) fail();
      for (const key of ['amount', 'fees']) if (!modelNumber(field[key])) fail();
      if (!modelNumber(field.annualRate, { rate: true, min: field.kind === 'loan' ? 0 : -100 })) fail();
      if (!Number.isInteger(field.termMonths) || field.termMonths < 1 || field.termMonths > 600) fail();
      for (const key of ['startMonth', 'endMonth', 'sellMonth']) if (!Number.isInteger(field[key]) || field[key] < 0 || field[key] > 600) fail();
      if (field.endMonth && field.endMonth < field.startMonth) fail();
    }
  }
  if (missingTargets(plan.strategies, plan.milestones).length) fail('references');
}

export function validateWorkspace(value) {
  if (!value || !value.flat || !value.shelf || !Array.isArray(value.shelf.projects)) fail();
  const { projects } = value.shelf;
  if (!projects.length || projects.length > MAX_PROJECTS || !uniqueIds(projects)) fail();
  const open = value.flat.projectId || value.shelf.openProjectId;
  if (!projects.some((one) => one.id === open)) fail();
  if (value.flat.projectId && value.shelf.openProjectId && value.flat.projectId !== value.shelf.openProjectId) fail();
  for (const key of ['tax', 'inflation', 'spread']) if (!modelNumber(value.flat[key], { rate: true, max: key === 'tax' ? 100 : 1000 })) fail();
  checkPlan(value.flat);
  for (const one of projects) if (one.id !== open) checkPlan(one.plan);
  // Same normalisation as a saved workspace; no mutation of the offered object.
  return snapshotOf(loadWorkspace(value));
}

export function parseBackup(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) fail('tooLarge');
  let parsed;
  try { parsed = JSON.parse(text); } catch { fail(); }
  if (parsed?.version !== 1) fail('version');
  const workspace = validateWorkspace(parsed.workspace);
  if (parsed.drafts !== undefined && (!Array.isArray(parsed.drafts) || parsed.drafts.length > 100)) fail();
  const drafts = (parsed.drafts || []).map((one) => ({ snapshot: validateWorkspace(one.snapshot), updatedAt: Number(one.updatedAt) || 0 }));
  const exportedAt = typeof parsed.exportedAt === 'string' && parsed.exportedAt.length < 64 && Number.isFinite(Date.parse(parsed.exportedAt)) ? parsed.exportedAt : '';
  return { workspace, drafts, exportedAt };
}

export function backupSummary(snapshot) {
  const state = loadWorkspace(snapshot);
  return {
    projects: state.projects.length,
    strategies: state.projects.reduce((sum, one) => sum + (one.plan?.strategies || state.strategies).length, 0),
    names: state.projects.map((one) => one.name || one.nameKey || ''),
  };
}
