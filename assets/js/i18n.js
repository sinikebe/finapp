/**
 * i18n.js — English and French copy.
 *
 * Every string the reader sees lives here. Values are either plain strings or
 * functions of their parameters, so a language can put the parts in its own
 * order. The static markup ships English; `applyLanguage()` in app.js swaps in
 * whichever language is chosen and updates <html lang>.
 */

export const LANGUAGES = ['en', 'fr'];

/** Fallback Intl tags, used when the browser's own tags don't match the choice. */
const DEFAULT_LOCALES = { en: 'en-US', fr: 'fr-FR' };

const STRINGS = {
  en: {
    'html.lang': 'en',
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
    'inputs.income': 'Monthly income',
    'inputs.incomeHint': 'What lands in your account each month, after tax.',
    'inputs.rent': 'Monthly rent',
    'inputs.rentHint': 'Rent, paid every month of the projection.',
    'inputs.currencyNote': 'Amounts are in your own currency — the app never converts or stores them anywhere but this device.',
    'summary.heading': 'Projected totals',
    'summary.heroLabel': (months) => `Net after ${months} months`,
    'summary.totalIncome': 'Total income',
    'summary.totalExpenses': 'Total expenses',
    'summary.monthlyNet': 'Kept each month',
    'summary.surplus': (amount) => `You keep ${amount} a month`,
    'summary.shortfall': (amount) => `Rent outruns income by ${amount} a month`,
    'filter.label': 'Projection length',
    'filter.readout': (months, horizon) => `${months} months · ${horizon}`,
    'filter.presetsAria': 'Preset projection lengths',
    'filter.preset': (years) => (years === 1 ? '1 yr' : `${years} yr`),
    'charts.heading': 'Cumulative over time',
    'charts.notePrompt': 'Enter a monthly income and rent to project the months ahead.',
    'charts.noteFilled': (horizon, income, expenses, net) =>
      `Over ${horizon}: ${income} earned, ${expenses} paid in rent, ${net} left over.`,
    'charts.scaleNote': 'All three charts share one vertical scale, so they can be read against each other. Month 0 is today: nothing earned, nothing paid.',
    'charts.empty': 'Enter your monthly income and rent above.',
    'chart.income.title': 'Cumulative income',
    'chart.income.description': 'Everything earned since month 0, added up.',
    'chart.income.series': 'Income to date',
    'chart.expenses.title': 'Cumulative expenses',
    'chart.expenses.description': 'Every rent payment since month 0, added up.',
    'chart.expenses.series': 'Expenses to date',
    'chart.net.title': 'Cumulative net',
    'chart.net.description': 'What is left once rent is taken out of income.',
    'chart.net.series': 'Net to date',
    'chart.showTable': 'Show table',
    'chart.hideTable': 'Hide table',
    'chart.tableCaption': (title) => `${title} — every month`,
    'chart.monthColumn': 'Month',
    'chart.aria': (title, months, endValue) =>
      `${title}. Line chart over ${months} months, ending at ${endValue}. `
      + 'Use the table below this chart for every value.',
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
    'doc.title': 'Finapp — estimez votre avenir financier',
    'doc.description': "Un calculateur hors ligne qui projette les revenus, les dépenses et le solde net cumulés sur les mois à venir.",
    'skip.link': 'Aller au contenu',
    'action.install': "Installer l'application",
    'theme.auto': 'Auto',
    'theme.light': 'Clair',
    'theme.dark': 'Sombre',
    'theme.aria.auto': 'Thème : suivre le système',
    'theme.aria.light': 'Thème : clair',
    'theme.aria.dark': 'Thème : sombre',
    'lang.label': 'FR',
    'lang.aria': "Langue : français. Passer à l'anglais",
    'inputs.heading': 'Vos montants mensuels',
    'inputs.income': 'Revenu mensuel',
    'inputs.incomeHint': 'Ce qui arrive sur votre compte chaque mois, après impôts.',
    'inputs.rent': 'Loyer mensuel',
    'inputs.rentHint': 'Le loyer, payé chaque mois de la projection.',
    'inputs.currencyNote': "Les montants sont dans votre devise — l'application ne convertit rien et n'enregistre rien ailleurs que sur cet appareil.",
    'summary.heading': 'Totaux projetés',
    'summary.heroLabel': (months) => `Solde net après ${months} mois`,
    'summary.totalIncome': 'Revenus cumulés',
    'summary.totalExpenses': 'Dépenses cumulées',
    'summary.monthlyNet': 'Gardé chaque mois',
    'summary.surplus': (amount) => `Vous gardez ${amount} par mois`,
    'summary.shortfall': (amount) => `Le loyer dépasse le revenu de ${amount} par mois`,
    'filter.label': 'Durée de la projection',
    'filter.readout': (months, horizon) => `${months} mois · ${horizon}`,
    'filter.presetsAria': 'Durées de projection prédéfinies',
    'filter.preset': (years) => (years === 1 ? '1 an' : `${years} ans`),
    'charts.heading': 'Cumul au fil du temps',
    'charts.notePrompt': 'Saisissez un revenu et un loyer mensuels pour projeter les mois à venir.',
    'charts.noteFilled': (horizon, income, expenses, net) =>
      `Sur ${horizon} : ${income} gagnés, ${expenses} payés en loyer, ${net} restants.`,
    'charts.scaleNote': "Les trois graphiques partagent la même échelle verticale : ils se lisent les uns par rapport aux autres. Le mois 0, c'est aujourd'hui — rien de gagné, rien de payé.",
    'charts.empty': 'Saisissez votre revenu et votre loyer mensuels ci-dessus.',
    'chart.income.title': 'Revenus cumulés',
    'chart.income.description': 'Tout ce qui a été gagné depuis le mois 0, additionné.',
    'chart.income.series': 'Revenus à ce jour',
    'chart.expenses.title': 'Dépenses cumulées',
    'chart.expenses.description': 'Chaque loyer payé depuis le mois 0, additionné.',
    'chart.expenses.series': 'Dépenses à ce jour',
    'chart.net.title': 'Solde net cumulé',
    'chart.net.description': "Ce qu'il reste une fois le loyer déduit du revenu.",
    'chart.net.series': 'Solde net à ce jour',
    'chart.showTable': 'Afficher le tableau',
    'chart.hideTable': 'Masquer le tableau',
    'chart.tableCaption': (title) => `${title} — mois par mois`,
    'chart.monthColumn': 'Mois',
    'chart.aria': (title, months, endValue) =>
      `${title}. Graphique linéaire sur ${months} mois, se terminant à ${endValue}. `
      + 'Le tableau sous ce graphique donne toutes les valeurs.',
    'month.start': 'Début',
    'month.nth': (month) => `Mois ${month}`,
    'horizon.years': (years) => (years === 1 ? '1 an' : `${years} ans`),
    'horizon.months': (months) => `${months} mois`,
    'footer.note': "Tout est calculé sur votre appareil et enregistré uniquement dans ce navigateur. Aucun compte, aucun réseau.",
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
