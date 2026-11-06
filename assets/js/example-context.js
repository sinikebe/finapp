/** Source baseline for the car example; never claims edited rows are unchanged. */
import { html } from './dom.js';
import { CAR_ENERGY, hasCarEnergyExample, monthlyCarEnergy } from './car-energy.js';

export function createExampleContext(container) {
  const lead = html('p', 'hint', container);
  const details = html('details', 'example-notes', container);
  const summary = html('summary', null, details);
  const scope = html('p', 'hint', details);
  const scroll = html('div', 'example-table-scroll', details);
  scroll.tabIndex = 0; scroll.setAttribute('role', 'region');
  const table = html('table', 'example-table', scroll);
  const caption = html('caption', null, table);
  const head = html('tr', null, html('thead', null, table));
  const headings = ['carExample.engine', 'carExample.price', 'carExample.consumption', 'carExample.energyMonth'].map((key) => ({ key, node: html('th', null, head) }));
  for (const { node } of headings) node.scope = 'col';
  const body = html('tbody', null, table);
  const rows = CAR_ENERGY.variants.map((variant) => {
    const tr = html('tr', null, body);
    const name = html('th', null, tr); name.scope = 'row';
    const engine = html('span', 'hint', name);
    return { variant, name, engine, title: name.insertBefore(document.createTextNode(''), engine), price: html('td', null, tr), consumption: html('td', null, tr), energy: html('td', null, tr) };
  });
  const notes = ['carExample.energy', 'carExample.budgets', 'carExample.residual', 'carExample.exclusions', 'carExample.reading', 'carExample.edit'].map((key) => ({ key, node: html('p', 'hint', details) }));
  const sources = html('ul', 'example-sources', details);
  const links = CAR_ENERGY.sources.map((source) => {
    const link = html('a', null, html('li', null, sources));
    link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    return { key: source.key, node: link };
  });
  return {
    update(strategies, t) {
      container.hidden = !hasCarEnergyExample(strategies);
      if (container.hidden) return;
      lead.textContent = t('carExample.lead'); summary.textContent = t('carExample.heading');
      scope.textContent = t('carExample.scope'); caption.textContent = t('carExample.baseline');
      scroll.setAttribute('aria-label', t('carExample.baseline'));
      const locale = document.documentElement.lang || 'en';
      const euros = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
      const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
      for (const { key, node } of [...headings, ...notes, ...links]) node.textContent = t(key);
      for (const row of rows) {
        row.title.textContent = t(`strategy.default.car${row.variant.id}`);
        row.engine.textContent = row.variant.engine;
        row.price.textContent = euros.format(row.variant.price);
        row.consumption.textContent = `${number.format(row.variant.consumption)} ${row.variant.unit}/100 km`;
        row.energy.textContent = euros.format(monthlyCarEnergy(row.variant));
      }
    },
  };
}
