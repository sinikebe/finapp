/**
 * i18n.js — English and French copy.
 *
 * Every string the reader sees lives here. Values are either plain strings or
 * functions of their parameters, so a language can put the parts in its own
 * order — and can carry its own punctuation, such as the no-break space French
 * sets before a colon. The static markup ships English; `applyLanguage()` in
 * app.js swaps in whichever language is chosen and updates <html lang>.
 */

export const LANGUAGES = ['en', 'fr'];

/** English needs count agreement where French does not: "mois" is invariant. */
const plural = (count, one, many) => (count === 1 ? one : many);

/** Fallback Intl tags, used when the browser's own tags don't match the choice. */
const DEFAULT_LOCALES = { en: 'en-US', fr: 'fr-FR' };

const STRINGS = {
  en: {
    'html.lang': 'en',
    'manifest.href': './manifest.webmanifest',
    'doc.title': 'Finapp — estimate your financial future',
    'doc.description': 'An offline-first calculator that projects cumulative income, expenses and net over the months ahead.',
    'skip.link': 'Skip to content',
    'action.install': 'Install app',
    'theme.auto': 'Auto',
    'theme.light': 'Light',
    'theme.dark': 'Dark',
    'theme.aria.auto': 'Colour theme: follow system',
    'theme.aria.light': 'Colour theme: light',
    'theme.aria.dark': 'Colour theme: dark',
    'lang.label': 'EN',
    'lang.aria': 'Language: English. Switch to French',

    'inputs.heading': 'What comes in and goes out',
    'inputs.hint': 'Name each amount, say whether it comes in or goes out, how often it lands, and how much. A loan works out its own repayments; an investment grows at the rate you give it.',
    'inputs.periodNote': 'Anything less frequent than monthly lands at the end of each period — a yearly amount at month 12, 24, and so on.',
    'inputs.currencyNote': 'Amounts are in your own currency — the app never converts or stores them anywhere but this device.',

    'field.default.income': 'Income',
    'field.default.rent': 'Rent',
    'field.name': 'Field name',
    'field.namePlaceholder': 'Name this field',
    'field.direction': 'Income or expense',
    'field.kind': 'What this is',
    'field.kind.plain': 'Amount',
    'field.kind.loan': 'Loan',
    'field.kind.investment': 'Investment',
    'field.amount.plain': 'Amount each time',
    'field.amount.loan': 'Amount borrowed',
    'field.amount.investment': 'Amount invested each time',
    'field.rate.loan': 'Interest rate a year, as a percentage',
    'field.rate.investment': 'Return a year, as a percentage',
    'field.rate.plain': 'Rate a year, as a percentage',
    'field.rateUnit': '% a year',
    'field.rateUnitShort': '%',
    'field.termUnit': 'months',
    'field.termUnitShort': 'mo',
    'field.term': 'Number of monthly payments',
    'field.loanSummary': (payment, term, interest) =>
      `${payment} a month for ${term} ${term === 1 ? 'month' : 'months'} · ${interest} of that is interest`,
    'field.period': 'How often it lands',
    'field.period.1': 'Every month',
    'field.period.3': 'Every quarter',
    'field.period.6': 'Every 6 months',
    'field.period.12': 'Every year',
    'field.directionNamed': (name) => `Income or expense for ${name}`,
    'field.amountNamed': (name) => `Amount each month for ${name}`,
    'field.income': 'In',
    'field.expense': 'Out',
    'field.untitled': 'this field',
    'field.add': 'Add a field',
    'field.duplicateNamed': (name) => `Duplicate ${name}`,
    'field.removeNamed': (name) => `Remove ${name}`,
    'field.copyOf': (name) => `${name} (copy)`,
    'fields.empty': 'No fields yet. Add one to start projecting.',

    'strategy.defaultName': (position) => `Strategy ${position}`,
    'strategy.tabsAria': 'Your strategies',
    'strategy.nameAria': 'Name of the strategy you are editing',
    'strategy.namePlaceholder': 'Name this strategy',
    'strategy.add': 'Add a strategy',
    'strategy.addFirst': 'Compare another strategy',
    'strategy.switchTo': (name) => `Switch to ${name}`,
    'strategy.removeNamed': (name) => `Remove ${name}`,
    'strategy.copyOf': (name) => `${name} (copy)`,

    'compare.heading': 'Strategies side by side',
    'compare.note': (name, amount, months) =>
      `${name} comes out ahead: ${amount} after ${months} ${months === 1 ? 'month' : 'months'}.`,
    'compare.chartTitle': (metric) => `${metric}, by strategy`,
    'compare.chartDescription': 'One line per strategy, all on one scale.',
    'compare.metricAria': 'What to compare',
    'compare.metric.net': 'Net',
    'compare.metric.income': 'In',
    'compare.metric.expenses': 'Out',
    'compare.metric.invested': 'Investments',
    'compare.strategyColumn': 'Strategy',
    'compare.deltaColumn': 'Net vs the first',
    'compare.baseline': 'the first',
    'compare.ahead': (amount) => `+${amount}`,
    'compare.behind': (amount) => `−${amount}`,
    'compare.tableCaption': (months) => `Where each strategy stands after ${months} ${months === 1 ? 'month' : 'months'}`,
    'compare.aria': (months, count) =>
      `${count} strategies compared over ${months} ${months === 1 ? 'month' : 'months'}. `
      + 'Use the table below this chart for every value.',

    'summary.heading': 'Projected totals',
    'summary.heroLabel': (months) => `Net after ${months} ${plural(months, 'month', 'months')}`,
    'summary.totalIncome': 'Total income',
    'summary.totalExpenses': 'Total expenses',
    'summary.monthlyNet': 'Kept per month, on average',
    'summary.invested': 'Investments are worth',
    'summary.surplus': (amount) => `You keep ${amount} a month on average`,
    'summary.shortfall': (amount) => `Expenses outrun income by ${amount} a month on average`,

    'filter.label': 'Projection length',
    'filter.readout': (months, horizon) => `${months} ${plural(months, 'month', 'months')} · ${horizon}`,
    'filter.readoutShort': (months) => `${months} ${plural(months, 'month', 'months')}`,
    'filter.presetsAria': 'Preset projection lengths',
    'filter.preset': (years) => (years === 1 ? '1 yr' : `${years} yr`),

    'charts.heading': 'Cumulative over time',
    'charts.notePrompt': 'Give a field an amount to project the months ahead.',
    'charts.noteFilled': (horizon, income, expenses, net) =>
      `Over ${horizon}: ${income} in, ${expenses} out, ${net} left over.`,
    'charts.scaleNote': 'The flow charts share one vertical scale, so they can be read against each other. Month 0 is today: nothing earned, nothing paid. Money put into an investment counts as paid out; what it is worth is a balance, not a flow, so that card carries its own scale.',
    'charts.empty': 'Give a field an amount above.',

    'chart.income.title': 'Cumulative income',
    'chart.income.description': 'Everything earned since month 0, added up.',
    'chart.income.series': 'Income to date',
    'chart.expenses.title': 'Cumulative expenses',
    'chart.expenses.description': 'Everything paid out since month 0, added up.',
    'chart.expenses.series': 'Expenses to date',
    'chart.invested.title': 'Investment value',
    'chart.invested.description': 'What the money you invested is worth, growth included.',
    'chart.invested.series': 'Value to date',
    'chart.net.title': 'Cumulative net',
    'chart.net.description': 'What is left once expenses come out of income.',
    'chart.net.series': 'Net to date',
    'chart.showTable': 'Show table',
    'chart.hideTable': 'Hide table',
    'chart.tableCaption': (title) => `${title} — every month`,
    'chart.monthColumn': 'Month',
    'chart.aria': (title, months, endValue) =>
      `${title}. Line chart over ${months} ${plural(months, 'month', 'months')}, `
      + `ending at ${endValue}. Use the table below this chart for every value.`,
    'chart.reading': (month, value) => `${month}: ${value}`,

    'month.start': 'Start',
    'month.nth': (month) => `Month ${month}`,
    'horizon.years': (years) => `${years} yr`,
    'horizon.months': (months) => `${months} mo`,

    'footer.note': 'Everything is calculated on your device and saved only in this browser. No account, no network.',
    'update.ready': 'A new version is ready.',
    'update.reload': 'Reload',
  },

  fr: {
    'html.lang': 'fr',
    'manifest.href': './manifest.fr.webmanifest',
    'doc.title': 'Finapp — estimez votre avenir financier',
    'doc.description': 'Un calculateur hors ligne qui projette les revenus, les dépenses et le solde net cumulés sur les mois à venir.',
    'skip.link': 'Aller au contenu',
    'action.install': 'Installer l’application',
    'theme.auto': 'Auto',
    'theme.light': 'Clair',
    'theme.dark': 'Sombre',
    'theme.aria.auto': 'Thème : suivre le système',
    'theme.aria.light': 'Thème : clair',
    'theme.aria.dark': 'Thème : sombre',
    'lang.label': 'FR',
    'lang.aria': 'Langue : français. Passer à l’anglais',

    'inputs.heading': 'Ce qui entre et ce qui sort',
    'inputs.hint': 'Nommez chaque montant, indiquez s’il entre ou s’il sort, à quelle fréquence il tombe, et combien. Un emprunt calcule ses mensualités ; un investissement croît au taux que vous indiquez.',
    'inputs.periodNote': 'Tout ce qui revient moins souvent que chaque mois tombe à la fin de chaque période — un montant annuel au mois 12, 24, et ainsi de suite.',
    'inputs.currencyNote': 'Les montants sont dans votre devise — l’application ne convertit rien et n’enregistre rien ailleurs que sur cet appareil.',

    'field.default.income': 'Revenu',
    'field.default.rent': 'Loyer',
    'field.name': 'Nom du champ',
    'field.namePlaceholder': 'Nommez ce champ',
    'field.direction': 'Revenu ou dépense',
    'field.kind': 'De quoi il s’agit',
    'field.kind.plain': 'Montant',
    'field.kind.loan': 'Emprunt',
    'field.kind.investment': 'Placement',
    'field.amount.plain': 'Montant à chaque fois',
    'field.amount.loan': 'Montant emprunté',
    'field.amount.investment': 'Montant investi à chaque fois',
    'field.rate.loan': 'Taux d’intérêt annuel, en pourcentage',
    'field.rate.investment': 'Rendement annuel, en pourcentage',
    'field.rate.plain': 'Taux annuel, en pourcentage',
    'field.rateUnit': '% par an',
    'field.rateUnitShort': '%',
    'field.termUnit': 'mois',
    'field.termUnitShort': 'mois',
    'field.term': 'Nombre de mensualités',
    'field.loanSummary': (payment, term, interest) =>
      `${payment} par mois pendant ${term} mois · dont ${interest} d’intérêts`,
    'field.period': 'À quelle fréquence',
    'field.period.1': 'Chaque mois',
    'field.period.3': 'Chaque trimestre',
    'field.period.6': 'Tous les 6 mois',
    'field.period.12': 'Chaque année',
    'field.directionNamed': (name) => `Revenu ou dépense pour ${name}`,
    'field.amountNamed': (name) => `Montant par mois pour ${name}`,
    'field.income': 'Entrée',
    'field.expense': 'Sortie',
    'field.untitled': 'ce champ',
    'field.add': 'Ajouter un champ',
    'field.duplicateNamed': (name) => `Dupliquer ${name}`,
    'field.removeNamed': (name) => `Supprimer ${name}`,
    'field.copyOf': (name) => `${name} (copie)`,
    'fields.empty': 'Aucun champ pour l’instant. Ajoutez-en un pour lancer la projection.',

    'strategy.defaultName': (position) => `Stratégie ${position}`,
    'strategy.tabsAria': 'Vos stratégies',
    'strategy.nameAria': 'Nom de la stratégie en cours de modification',
    'strategy.namePlaceholder': 'Nommez cette stratégie',
    'strategy.add': 'Ajouter une stratégie',
    'strategy.addFirst': 'Comparer une autre stratégie',
    'strategy.switchTo': (name) => `Passer à ${name}`,
    'strategy.removeNamed': (name) => `Supprimer ${name}`,
    'strategy.copyOf': (name) => `${name} (copie)`,

    'compare.heading': 'Les stratégies côte à côte',
    'compare.note': (name, amount, months) =>
      `${name} arrive en tête : ${amount} après ${months} mois.`,
    'compare.chartTitle': (metric) => `${metric}, par stratégie`,
    'compare.chartDescription': 'Une ligne par stratégie, toutes sur la même échelle.',
    'compare.metricAria': 'Ce qu’il faut comparer',
    'compare.metric.net': 'Solde net',
    'compare.metric.income': 'Entrées',
    'compare.metric.expenses': 'Sorties',
    'compare.metric.invested': 'Placements',
    'compare.strategyColumn': 'Stratégie',
    'compare.deltaColumn': 'Écart avec la première',
    'compare.baseline': 'la première',
    'compare.ahead': (amount) => `+${amount}`,
    'compare.behind': (amount) => `−${amount}`,
    'compare.tableCaption': (months) => `Où en est chaque stratégie après ${months} mois`,
    'compare.aria': (months, count) =>
      `${count} stratégies comparées sur ${months} mois. `
      + 'Le tableau sous ce graphique donne toutes les valeurs.',

    'summary.heading': 'Totaux projetés',
    'summary.heroLabel': (months) => `Solde net après ${months} mois`,
    'summary.totalIncome': 'Revenus cumulés',
    'summary.totalExpenses': 'Dépenses cumulées',
    'summary.monthlyNet': 'Reste par mois, en moyenne',
    'summary.invested': 'Valeur des investissements',
    'summary.surplus': (amount) => `Vous gardez ${amount} par mois en moyenne`,
    'summary.shortfall': (amount) => `Les dépenses dépassent les revenus de ${amount} par mois en moyenne`,

    'filter.label': 'Durée de la projection',
    'filter.readout': (months, horizon) => `${months} mois · ${horizon}`,
    'filter.readoutShort': (months) => `${months} mois`,
    'filter.presetsAria': 'Durées de projection prédéfinies',
    'filter.preset': (years) => (years === 1 ? '1 an' : `${years} ans`),

    'charts.heading': 'Cumul au fil du temps',
    'charts.notePrompt': 'Saisissez un montant dans un champ pour projeter les mois à venir.',
    'charts.noteFilled': (horizon, income, expenses, net) =>
      `Sur ${horizon} : ${income} encaissés, ${expenses} dépensés, ${net} restants.`,
    'charts.scaleNote': 'Les graphiques de flux partagent la même échelle verticale : ils se lisent les uns par rapport aux autres. Le mois 0, c’est aujourd’hui — rien de gagné, rien de payé. Les sommes investies comptent comme payées ; leur valeur est un solde, pas un flux, et cette carte a donc sa propre échelle.',
    'charts.empty': 'Saisissez un montant dans un champ ci-dessus.',

    'chart.income.title': 'Revenus cumulés',
    'chart.income.description': 'Tout ce qui a été gagné depuis le mois 0, additionné.',
    'chart.income.series': 'Revenus cumulés',
    'chart.expenses.title': 'Dépenses cumulées',
    'chart.expenses.description': 'Tout ce qui a été payé depuis le mois 0, additionné.',
    'chart.expenses.series': 'Dépenses cumulées',
    'chart.invested.title': 'Valeur des investissements',
    'chart.invested.description': 'Ce que valent les sommes investies, croissance comprise.',
    'chart.invested.series': 'Valeur à ce jour',
    'chart.net.title': 'Solde net cumulé',
    'chart.net.description': 'Ce qu’il reste une fois les dépenses déduites des revenus.',
    'chart.net.series': 'Solde net cumulé',
    'chart.showTable': 'Afficher le tableau',
    'chart.hideTable': 'Masquer le tableau',
    'chart.tableCaption': (title) => `${title} — mois par mois`,
    'chart.monthColumn': 'Mois',
    'chart.aria': (title, months, endValue) =>
      `${title}. Graphique linéaire sur ${months} mois, se terminant à ${endValue}. `
      + 'Le tableau sous ce graphique donne toutes les valeurs.',
    'chart.reading': (month, value) => `${month} : ${value}`,

    'month.start': 'Début',
    'month.nth': (month) => `Mois ${month}`,
    'horizon.years': (years) => (years === 1 ? '1 an' : `${years} ans`),
    'horizon.months': (months) => `${months} mois`,

    'footer.note': 'Tout est calculé sur votre appareil et enregistré uniquement dans ce navigateur. Aucun compte, aucun réseau.',
    'update.ready': 'Une nouvelle version est prête.',
    'update.reload': 'Recharger',
  },
};

/** The language a browser asks for, if the app speaks it. */
export function detectLanguage(nav = typeof navigator === 'undefined' ? null : navigator) {
  const tags = [...(nav && nav.languages ? nav.languages : []), nav && nav.language];
  for (const tag of tags) {
    if (typeof tag !== 'string') continue;
    const base = tag.toLowerCase().split(/[-_@]/)[0];
    if (LANGUAGES.includes(base)) return base;
  }
  return 'en';
}

/** The best Intl tag for a chosen language: the reader's own region if it matches. */
export function localeFor(language, nav = typeof navigator === 'undefined' ? null : navigator) {
  const tags = [...(nav && nav.languages ? nav.languages : []), nav && nav.language];
  for (const tag of tags) {
    if (typeof tag !== 'string' || !tag) continue;
    if (tag.toLowerCase().split(/[-_@]/)[0] !== language) continue;
    try {
      Intl.getCanonicalLocales(tag);
      return tag;
    } catch {
      /* a malformed tag such as `fr-FR@posix` — keep looking */
    }
  }
  return DEFAULT_LOCALES[language] || DEFAULT_LOCALES.en;
}

/** A lookup bound to one language, falling back to English then to the key. */
export function makeTranslator(language) {
  const dictionary = STRINGS[language] || STRINGS.en;
  return function t(key, ...params) {
    const entry = key in dictionary ? dictionary[key] : STRINGS.en[key];
    if (entry === undefined) return key;
    return typeof entry === 'function' ? entry(...params) : entry;
  };
}

export { STRINGS };
