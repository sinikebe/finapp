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

    'inputs.heading': 'Your monthly numbers',
    'inputs.hint': 'Name each amount, say whether it comes in or goes out, and set what it repeats every month.',
    'inputs.currencyNote': 'Amounts are in your own currency — the app never converts or stores them anywhere but this device.',

    'field.default.income': 'Income',
    'field.default.rent': 'Rent',
    'field.name': 'Field name',
    'field.namePlaceholder': 'Name this field',
    'field.direction': 'Income or expense',
    'field.amount': 'Amount each month',
    'field.income': 'In',
    'field.expense': 'Out',
    'field.untitled': 'this field',
    'field.add': 'Add a field',
    'field.duplicateNamed': (name) => `Duplicate ${name}`,
    'field.removeNamed': (name) => `Remove ${name}`,
    'field.copyOf': (name) => `${name} (copy)`,
    'fields.empty': 'No fields yet. Add one to start projecting.',

    'summary.heading': 'Projected totals',
    'summary.heroLabel': (months) => `Net after ${months} ${plural(months, 'month', 'months')}`,
    'summary.totalIncome': 'Total income',
    'summary.totalExpenses': 'Total expenses',
    'summary.monthlyNet': 'Kept each month',
    'summary.surplus': (amount) => `You keep ${amount} a month`,
    'summary.shortfall': (amount) => `Expenses outrun income by ${amount} a month`,

    'filter.label': 'Projection length',
    'filter.readout': (months, horizon) => `${months} ${plural(months, 'month', 'months')} · ${horizon}`,
    'filter.readoutShort': (months) => `${months} ${plural(months, 'month', 'months')}`,
    'filter.presetsAria': 'Preset projection lengths',
    'filter.preset': (years) => (years === 1 ? '1 yr' : `${years} yr`),

    'charts.heading': 'Cumulative over time',
    'charts.notePrompt': 'Give a field an amount to project the months ahead.',
    'charts.noteFilled': (horizon, income, expenses, net) =>
      `Over ${horizon}: ${income} in, ${expenses} out, ${net} left over.`,
    'charts.scaleNote': 'All three charts share one vertical scale, so they can be read against each other. Month 0 is today: nothing earned, nothing paid.',
    'charts.empty': 'Give a field an amount above.',

    'chart.income.title': 'Cumulative income',
    'chart.income.description': 'Everything earned since month 0, added up.',
    'chart.income.series': 'Income to date',
    'chart.expenses.title': 'Cumulative expenses',
    'chart.expenses.description': 'Everything paid out since month 0, added up.',
    'chart.expenses.series': 'Expenses to date',
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

    'inputs.heading': 'Vos montants mensuels',
    'inputs.hint': 'Nommez chaque montant, indiquez s’il entre ou s’il sort, puis saisissez ce qu’il représente chaque mois.',
    'inputs.currencyNote': 'Les montants sont dans votre devise — l’application ne convertit rien et n’enregistre rien ailleurs que sur cet appareil.',

    'field.default.income': 'Revenu',
    'field.default.rent': 'Loyer',
    'field.name': 'Nom du champ',
    'field.namePlaceholder': 'Nommez ce champ',
    'field.direction': 'Revenu ou dépense',
    'field.amount': 'Montant par mois',
    'field.income': 'Entrée',
    'field.expense': 'Sortie',
    'field.untitled': 'ce champ',
    'field.add': 'Ajouter un champ',
    'field.duplicateNamed': (name) => `Dupliquer ${name}`,
    'field.removeNamed': (name) => `Supprimer ${name}`,
    'field.copyOf': (name) => `${name} (copie)`,
    'fields.empty': 'Aucun champ pour l’instant. Ajoutez-en un pour lancer la projection.',

    'summary.heading': 'Totaux projetés',
    'summary.heroLabel': (months) => `Solde net après ${months} mois`,
    'summary.totalIncome': 'Revenus cumulés',
    'summary.totalExpenses': 'Dépenses cumulées',
    'summary.monthlyNet': 'Reste chaque mois',
    'summary.surplus': (amount) => `Vous gardez ${amount} par mois`,
    'summary.shortfall': (amount) => `Les dépenses dépassent les revenus de ${amount} par mois`,

    'filter.label': 'Durée de la projection',
    'filter.readout': (months, horizon) => `${months} mois · ${horizon}`,
    'filter.readoutShort': (months) => `${months} mois`,
    'filter.presetsAria': 'Durées de projection prédéfinies',
    'filter.preset': (years) => (years === 1 ? '1 an' : `${years} ans`),

    'charts.heading': 'Cumul au fil du temps',
    'charts.notePrompt': 'Saisissez un montant dans un champ pour projeter les mois à venir.',
    'charts.noteFilled': (horizon, income, expenses, net) =>
      `Sur ${horizon} : ${income} encaissés, ${expenses} dépensés, ${net} restants.`,
    'charts.scaleNote': 'Les trois graphiques partagent la même échelle verticale : ils se lisent les uns par rapport aux autres. Le mois 0, c’est aujourd’hui — rien de gagné, rien de payé.',
    'charts.empty': 'Saisissez un montant dans un champ ci-dessus.',

    'chart.income.title': 'Revenus cumulés',
    'chart.income.description': 'Tout ce qui a été gagné depuis le mois 0, additionné.',
    'chart.income.series': 'Revenus cumulés',
    'chart.expenses.title': 'Dépenses cumulées',
    'chart.expenses.description': 'Tout ce qui a été payé depuis le mois 0, additionné.',
    'chart.expenses.series': 'Dépenses cumulées',
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
