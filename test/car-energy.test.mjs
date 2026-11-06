import test from 'node:test';
import assert from 'node:assert/strict';
import { CAR_ENERGY, CAR_ENERGY_BUDGET, buildCarEnergy, monthlyCarEnergy, hasCarEnergyExample } from '../assets/js/car-energy.js';
import { templateOf } from '../assets/js/templates.js';
import { project } from '../assets/js/projection.js';
import { normalizeFields, updateField } from '../assets/js/fields.js';
import { spreadField, updateStrategy } from '../assets/js/strategies.js';
import { roundMoney } from '../assets/js/numbers.js';

const row = (strategy, key) => strategy.fields.find((field) => field.labelKey === `field.default.${key}`);
const run = (strategy, months = 60) => project({ fields: normalizeFields(strategy.fields), months, inflation: 0, spread: 0, tax: 0 });

test('the car comparison preserves the dated Allure catalogue and energy inputs', () => {
  assert.equal(CAR_ENERGY.model, 'Peugeot 308');
  assert.equal(CAR_ENERGY.trim, 'Allure');
  assert.equal(CAR_ENERGY.catalogueDate, '2024-05-02');
  assert.equal(CAR_ENERGY.currency, 'EUR');
  assert.deepEqual(CAR_ENERGY.variants.map(({ id, price, consumption, unit, unitPrice }) => [id, price, consumption, unit, unitPrice]), [
    ['Petrol', 33770, 5.9, 'L', 1.78],
    ['Diesel', 36270, 5.1, 'L', 1.69],
    ['Electric', 43900, 15.1, 'kWh', 0.2516],
    ['Hybrid', 33800, 5, 'L', 1.78],
  ]);
  for (const variant of CAR_ENERGY.variants) assert.equal(variant.consumption, variant.wltp[1]);
  assert.match(CAR_ENERGY.variants[3].engine, /48 V/);
  assert.equal(templateOf('car-energy').build, buildCarEnergy);
  assert.equal(CAR_ENERGY.sources.length, 3);
  assert.ok(CAR_ENERGY.sources.every((source) => new URL(source.url).protocol === 'https:'));
});

test('monthly energy follows identical mileage and the correct fuel or electricity tariff', () => {
  assert.equal(CAR_ENERGY_BUDGET.annualKm, 15000);
  assert.deepEqual(CAR_ENERGY.variants.map((variant) => monthlyCarEnergy(variant)), [131.28, 107.74, 47.49, 111.25]);
  assert.equal(monthlyCarEnergy(CAR_ENERGY.variants[0], 30000), 262.55);
  const plan = buildCarEnergy();
  assert.deepEqual(plan.strategies.map((strategy) => Number(row(strategy, 'carEnergy').amount)), [131.28, 107.74, 47.49, 111.25]);
});

test('insurance shares one identity; purchases, energy, maintenance and residuals remain independent', () => {
  const { strategies } = buildCarEnergy();
  const insurance = strategies.map((strategy) => row(strategy, 'carInsurance'));
  assert.equal(new Set(insurance.map((field) => field.id)).size, 1);
  assert.equal(new Set(insurance).size, 4, 'linked rows do not share mutable objects');
  const changed = spreadField(strategies, { ...insurance[0], amount: '90' });
  assert.ok(changed.every((strategy) => row(strategy, 'carInsurance').amount === '90'));
  for (const key of ['carPurchase', 'carEnergy', 'carMaintenance', 'carResidual']) {
    assert.equal(new Set(strategies.map((strategy) => row(strategy, key).id)).size, 4);
    assert.ok(strategies.every((strategy) => !row(strategy, key).synced));
  }
  const fuel = row(strategies[0], 'carEnergy');
  const edited = updateStrategy(strategies, strategies[0].id, { fields: updateField(strategies[0].fields, fuel.id, { amount: '200' }) });
  assert.deepEqual(edited.map((strategy) => row(strategy, 'carEnergy').amount), ['200', '107.74', '47.49', '111.25']);
});

test('five-year cash costs and residual assets are counted once, from month 1', () => {
  const plan = buildCarEnergy();
  assert.equal(plan.months, 60);
  assert.deepEqual(plan.milestones, []);
  const expectedExpenses = [48347, 49684.2, 54199.6, 47175.2];
  for (const [index, strategy] of plan.strategies.entries()) {
    assert.ok(strategy.fields.every((field) => field.startMonth === 1));
    assert.ok(strategy.fields.every((field) => field.kind === 'asset' || field.direction === 'expense'));
    assert.ok(strategy.fields.every((field) => field.kind !== 'loan'));
    assert.equal(Boolean(row(strategy, 'carCharger')), index === 2);
    const result = run(strategy);
    assert.equal(result.points[0].net, 0);
    assert.equal(result.points[0].owned, 0);
    assert.equal(result.points[0].worth, 0);
    assert.equal(result.points[1].owned, CAR_ENERGY.variants[index].price);
    assert.equal(result.totals.income, 0);
    assert.equal(result.totals.expenses, expectedExpenses[index]);
    let residual = CAR_ENERGY.variants[index].price;
    for (let month = 2; month <= 60; month++) residual = roundMoney(residual * (1 - 0.15 / 12));
    assert.equal(result.totals.owned, residual);
    assert.equal(result.totals.worth, roundMoney(residual - expectedExpenses[index]));
    assert.equal(result.totals.debt, 0);
    assert.equal(result.totals.invested, 0);
  }
});

test('building or editing examples cannot change the source baseline or another project', () => {
  const baseline = JSON.stringify([CAR_ENERGY, CAR_ENERGY_BUDGET]);
  const a = buildCarEnergy(); const b = buildCarEnergy();
  const ids = (plan) => plan.strategies.flatMap((strategy) => [strategy.id, ...strategy.fields.map((field) => field.id)]);
  const otherIds = new Set(ids(b));
  assert.ok(ids(a).every((id) => !otherIds.has(id)));
  row(a.strategies[0], 'carPurchase').amount = '1';
  assert.equal(row(b.strategies[0], 'carPurchase').amount, '33770');
  assert.equal(JSON.stringify([CAR_ENERGY, CAR_ENERGY_BUDGET]), baseline);
  assert.equal(hasCarEnergyExample(a.strategies), true);
  assert.equal(hasCarEnergyExample(templateOf('car').build().strategies), false);
  assert.equal(hasCarEnergyExample([]), false);
});
