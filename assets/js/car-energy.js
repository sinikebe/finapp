/** A dated, sourced car comparison. Facts and adjustable budgets stay separate. */
import { createField } from './fields.js';
import { createStrategy } from './strategies.js';
import { roundMoney } from './numbers.js';

/** French list prices on 2 May 2024, 308 hatchback, Allure, automatic. */
export const CAR_ENERGY = Object.freeze({
  model: 'Peugeot 308', trim: 'Allure', catalogueDate: '2024-05-02', currency: 'EUR',
  sources: Object.freeze([
    Object.freeze({ key: 'carExample.sourceCatalogue', url: 'https://manuals.plus/m/10960f41827c52e466ae27fcde5304eb6232c7ff5f07dc9792e8f34f6d899953' }),
    Object.freeze({ key: 'carExample.sourceFuel', url: 'https://www.ecologie.gouv.fr/sites/default/files/documents/Prix%20des%20produits%20p%C3%A9troliers%20en%202024.pdf' }),
    Object.freeze({ key: 'carExample.sourceElectricity', url: 'https://www.gazelec.fr/media/1426/tarif-dom-trv-f%C3%A9vrier2024.pdf' }),
  ]),
  // Upper end of each hatchback engine's combined WLTP range, not a road test.
  variants: Object.freeze([
    Object.freeze({ id: 'Petrol', engine: 'PureTech 130 S&S EAT8', price: 33770, consumption: 5.9, wltp: Object.freeze([5.7, 5.9]), unit: 'L', unitPrice: 1.78 }),
    Object.freeze({ id: 'Diesel', engine: 'BlueHDi 130 S&S EAT8', price: 36270, consumption: 5.1, wltp: Object.freeze([4.9, 5.1]), unit: 'L', unitPrice: 1.69 }),
    Object.freeze({ id: 'Electric', engine: 'E-308 156 ch · 54 kWh', price: 43900, consumption: 15.1, wltp: Object.freeze([14.9, 15.1]), unit: 'kWh', unitPrice: 0.2516 }),
    Object.freeze({ id: 'Hybrid', engine: 'Hybrid 136 e-DCS6 · 48 V', price: 33800, consumption: 5, wltp: Object.freeze([4.7, 5]), unit: 'L', unitPrice: 1.78 }),
  ]),
});

/** Illustrative usage and provisions, not manufacturer quotes or resale forecasts. */
export const CAR_ENERGY_BUDGET = Object.freeze({
  months: 60, annualKm: 15000, insuranceYear: 840, charger: 1500, decline: -15,
  maintenanceYear: Object.freeze({ Petrol: 500, Diesel: 550, Electric: 350, Hybrid: 500 }),
});

/** Fixed monthly provision: km/year ÷ 12 ÷ 100 × WLTP × €/unit. */
export function monthlyCarEnergy(variant, annualKm = CAR_ENERGY_BUDGET.annualKm) {
  return roundMoney(annualKm / 12 / 100 * variant.consumption * variant.unitPrice);
}

/** Fresh project and row IDs; only the common insurance provision is linked. */
export function buildCarEnergy() {
  const insurance = createField({
    labelKey: 'field.default.carInsurance', direction: 'expense',
    amount: String(CAR_ENERGY_BUDGET.insuranceYear / 12), startMonth: 1, synced: true,
  });
  return {
    nameKey: 'project.default.carEnergy', months: CAR_ENERGY_BUDGET.months, milestones: [],
    strategies: CAR_ENERGY.variants.map((variant) => createStrategy({
      nameKey: `strategy.default.car${variant.id}`,
      fields: [
        createField({ labelKey: 'field.default.carPurchase', kind: 'once', direction: 'expense', amount: String(variant.price), startMonth: 1 }),
        createField({ labelKey: 'field.default.carResidual', kind: 'asset', amount: String(variant.price), annualRate: String(CAR_ENERGY_BUDGET.decline), startMonth: 1 }),
        { ...insurance },
        createField({ labelKey: 'field.default.carEnergy', direction: 'expense', amount: String(monthlyCarEnergy(variant)), startMonth: 1 }),
        createField({ labelKey: 'field.default.carMaintenance', direction: 'expense', amount: String(roundMoney(CAR_ENERGY_BUDGET.maintenanceYear[variant.id] / 12)), startMonth: 1 }),
        ...(variant.id === 'Electric' ? [createField({ labelKey: 'field.default.carCharger', kind: 'once', direction: 'expense', amount: String(CAR_ENERGY_BUDGET.charger), startMonth: 1 })] : []),
      ],
    })),
  };
}

/** Recognise the example's lineage without imposing a new persisted schema. */
export function hasCarEnergyExample(strategies) {
  return strategies.some((strategy) => CAR_ENERGY.variants.some((variant) => strategy.nameKey === `strategy.default.car${variant.id}`));
}
