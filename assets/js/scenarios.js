/** Build projections from the reader's original fields, never a placed subset. */
import { project, inTodaysMoney, shiftReturns, toNumber } from './projection.js';
import { schedule } from './schedule.js';

export function createScenarioRunner(options) {
  const plain = (fields) => {
    const projection = project({ fields, months: options.months, taxRate: options.tax });
    return options.realMoney ? inTodaysMoney(projection, options.inflation) : projection;
  };
  const run = (fields) => {
    const placed = schedule({ fields, milestones: options.milestones, run: plain, read: toNumber });
    return { ...plain(placed.fields), schedule: placed };
  };
  return {
    plain,
    run,
    range: (fields, spread) => ({
      low: run(shiftReturns(fields, -spread)),
      high: run(shiftReturns(fields, spread)),
    }),
  };
}
