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
    'inputs.hint': 'Name each amount, say whether it comes in or goes out, how often it lands, and how much. A loan works out its own repayments, an investment grows at the rate you give it, and something you own simply holds its value. Give an amount a rate and it climbs by that much every year.',
    'inputs.periodNote': 'Anything less frequent than monthly lands at the end of each period — a yearly amount at month 12, 24, and so on.',
    'inputs.currencyNote': 'Amounts are in your own currency — the app never converts or stores them anywhere but this device.',

    'field.default.income': 'Income',
    'field.default.rent': 'Rent',
    'field.name': 'Field name',
    'field.namePlaceholder': 'Name this field',
    'field.direction': 'Income or expense',
    'field.kind': 'What this is',
    'field.kind.plain': 'Amount',
    'field.kind.once': 'One-off',
    'field.kind.loan': 'Loan',
    'field.kind.investment': 'Investment',
    'field.kind.asset': 'Something you own',
    'field.amount.plain': 'Amount each time',
    'field.amount.once': 'Amount, once',
    'field.amount.loan': 'Amount you need',
    'field.amount.investment': 'Amount invested each time',
    'field.amount.asset': 'What it is worth today',
    'field.rate.loan': 'Interest rate a year, as a percentage',
    'field.rate.investment': 'Return a year, as a percentage',
    'field.rate.plain': 'How much it climbs a year, as a percentage',
    'field.rate.asset': 'How much it gains a year, as a percentage',
    'field.rateUnit': '% a year',
    'field.rateUnitShort': '%',
    'field.fees': 'Fees the lender adds to the loan',
    'field.feesUnit': 'in fees',
    'field.feesUnitShort': 'fees',
    'field.termUnit': 'months',
    'field.termUnitShort': 'mo',
    'field.term': 'Number of monthly payments',
    'field.from': 'First month it lands',
    'field.to': 'Last month it lands',
    'field.fromWord': 'from month',
    'field.fromWordShort': 'from',
    'field.toWord': 'to month',
    'field.toWordShort': 'to',
    'field.onceMonth': 'The month it happens',
    'field.onceWord': 'in month',
    'field.onceWordShort': 'month',
    'field.growthSummary': (rate, amount, months) =>
      `Climbing ${rate}% a year · ${amount} a time by month ${months}`,
    // "of that is interest" read as though the interest came out of the amount
    // just typed. It is added to it, so the line says on top, and names the
    // total repaid — the figure that settles the question either way.
    'field.loanSummary': (payment, term, interest, total) =>
      `${payment} a month for ${term} ${term === 1 ? 'month' : 'months'} · ${interest} of interest on top, ${total} repaid in all`,
    // Only when there are fees: the sum that is actually lent is no longer
    // the one the reader typed, so it is the fact the line has to carry.
    'field.loanSummaryFees': (payment, term, borrowed, received, interest, total) =>
      `${payment} a month for ${term} ${term === 1 ? 'month' : 'months'} · ${borrowed} borrowed to receive ${received} · ${interest} of interest on top, ${total} repaid in all`,
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
    'strategy.jumpAria': 'Switch strategy',
    'strategy.onNamed': (name) => `${name}, the strategy you are on`,
    'strategy.removeNamed': (name) => `Remove ${name}`,
    'strategy.copyOf': (name) => `${name} (copy)`,

    'sankey.heading': 'Where the money goes',
    'sankey.note': 'Everything that comes in over the whole projection, pooled, and where it ends up. Only money that actually moves is here — what an investment grows to, or a flat gains, is on the cards above.',
    'sankey.title': 'In, pooled, and out',
    'sankey.description': 'Every ribbon is money moving. The widths add up to the same totals as the summary.',
    'sankey.pool': 'All of it',
    'sankey.kept': 'Kept',
    'sankey.unnamed': 'Unnamed',
    'sankey.other': (count) => `${count} smaller, pooled`,
    'sankey.shortfall': 'Made up from savings',
    'sankey.tone.income': 'Comes in',
    'sankey.tone.expense': 'Goes out',
    'sankey.tone.net': 'Left over',
    // Read out before a row's name, so which way the money went is never
    // carried by the swatch colour alone.
    'sankey.rowTone': (tone) => `${tone}: `,
    'sankey.nameColumn': 'Where',
    'sankey.flowColumn': 'Amount',
    'sankey.shareColumn': 'Share',
    'sankey.tableCaption': (months) => `Every flow over ${months} ${plural(months, 'month', 'months')}`,
    'sankey.tipValue': (amount, share) => `${amount} · ${share}%`,
    'sankey.share': (share) => `${share}%`,
    'sankey.aria': (total, sources, sinks) =>
      `Flow diagram: ${total} in total, from ${sources} ${plural(sources, 'source', 'sources')} to ${sinks} ${plural(sinks, 'destination', 'destinations')}. The table below has every figure.`,
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
    'compare.metric.profit': 'Profit',
    'compare.metric.worth': 'Total',
    'compare.metric.owned': 'Owned',
    'compare.metric.debt': 'Owed',
    'compare.strategyColumn': 'Strategy',
    'compare.deltaColumn': (metric) => `${metric} vs the first`,
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
    'summary.contributed': 'Paid into investments',
    'summary.invested': 'Investments are worth',
    'summary.profit': (rate) => `Net profit, after ${rate}% tax`,
    'summary.worth': (months) => `Total after ${months} ${plural(months, 'month', 'months')}`,
    'summary.owned': 'Things you own are worth',
    'summary.debt': 'You still owe',
    'field.syncNamed': (name) => `Sync ${name} across every strategy`,
    'field.unsyncNamed': (name) => `Stop syncing ${name} across strategies`,
    'field.syncTitle': 'Keep this the same in every strategy',
    'field.syncedTitle': 'The same in every strategy',
    'inputs.windowNote': 'Months are counted from today, which is month 0 — so “from month 6” is half a year out. Leave a box empty and the field runs for the whole projection. Anything less frequent than monthly counts its period from where it starts.',
    'inputs.syncHint': 'Comparing two plans only tells you something if they differ in one place. Use the link button to keep a field the same everywhere — your income does not change because you decided to invest.',
    'inputs.debtHint': 'A loan counts against what you are worth until it is repaid. If it bought something you still have — a flat, a car — add that as “Something you own”, or the total is only half the story.',
    'summary.surplus': (amount) => `You keep ${amount} a month on average`,
    'summary.shortfall': (amount) => `Expenses outrun income by ${amount} a month on average`,

    'filter.label': 'Projection length',
    'filter.readout': (months, horizon) => `${months} ${plural(months, 'month', 'months')} · ${horizon}`,
    'filter.readoutShort': (months) => `${months} ${plural(months, 'month', 'months')}`,
    'filter.presetsAria': 'Preset projection lengths',
    'filter.moneyAria': 'Which money the figures are in',
    'filter.todaysMoney': 'In today’s money',
    'filter.inflation': 'Inflation a year',
    'filter.moneyNote': (rate) => `Every figure is in today’s money — what it would buy now, if prices rise ${rate}% a year.`,
    'filter.rangeAria': 'Whether to show a range around the returns',
    'filter.showRange': 'Show a range',
    'filter.spread': 'Returns, give or take',
    'filter.tax': 'Tax on gains',
    'filter.rangeNote': (points) => `The shaded band is where things land if returns come in ${points} points lower or higher than you set. Loan interest is left alone: that one was agreed, not guessed.`,
    'filter.preset': (years) => (years === 1 ? '1 yr' : `${years} yr`),

    'charts.heading': 'Cumulative over time',
    'charts.notePrompt': 'Give a field an amount to project the months ahead.',
    'charts.noteFilled': (horizon, income, expenses, net) =>
      `Over ${horizon}: ${income} in, ${expenses} out, ${net} left over.`,
    'charts.scaleNote': 'The flow charts share one vertical scale, so they can be read against each other. Month 0 is today: nothing earned, nothing paid — though what you already own and already owe counts from the start. Money put into an investment counts as paid out; what it is worth is a balance, not a flow, so that card carries its own scale. The total sits back on the shared scale, so the gap between it and the net is everything the balance sheet adds.',
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
    'chart.contributed.series': 'Paid in',
    'chart.net.title': 'Cumulative net',
    'chart.net.description': 'What is left once expenses come out of income.',
    'chart.net.series': 'Net to date',
    'chart.worth.title': 'Total worth',
    'chart.worth.description': 'Cash kept, investments and what you own, less what you still owe.',
    'chart.worth.series': 'Total to date',
    'chart.bandLow': 'If lower',
    'chart.bandHigh': 'If higher',
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
    'inputs.hint': 'Nommez chaque montant, indiquez s’il entre ou s’il sort, à quelle fréquence il tombe, et combien. Un emprunt calcule ses mensualités, un placement croît au taux que vous indiquez, et un bien que vous possédez garde simplement sa valeur. Donnez un taux à un montant et il augmente d’autant chaque année.',
    'inputs.periodNote': 'Tout ce qui revient moins souvent que chaque mois tombe à la fin de chaque période — un montant annuel au mois 12, 24, et ainsi de suite.',
    'inputs.currencyNote': 'Les montants sont dans votre devise — l’application ne convertit rien et n’enregistre rien ailleurs que sur cet appareil.',

    'field.default.income': 'Revenu',
    'field.default.rent': 'Loyer',
    'field.name': 'Nom du champ',
    'field.namePlaceholder': 'Nommez ce champ',
    'field.direction': 'Revenu ou dépense',
    'field.kind': 'De quoi il s’agit',
    'field.kind.plain': 'Montant',
    'field.kind.once': 'Ponctuel',
    'field.kind.loan': 'Emprunt',
    'field.kind.investment': 'Placement',
    'field.kind.asset': 'Un bien que vous possédez',
    'field.amount.plain': 'Montant à chaque fois',
    'field.amount.once': 'Montant, une seule fois',
    'field.amount.loan': 'Montant dont vous avez besoin',
    'field.amount.investment': 'Montant investi à chaque fois',
    'field.amount.asset': 'Sa valeur aujourd’hui',
    'field.rate.loan': 'Taux d’intérêt annuel, en pourcentage',
    'field.rate.investment': 'Rendement annuel, en pourcentage',
    'field.rate.plain': 'De combien il augmente par an, en pourcentage',
    'field.rate.asset': 'Ce qu’il prend de valeur par an, en pourcentage',
    'field.rateUnit': '% par an',
    'field.rateUnitShort': '%',
    'field.fees': 'Frais que le prêteur ajoute au prêt',
    'field.feesUnit': 'de frais',
    'field.feesUnitShort': 'frais',
    'field.termUnit': 'mois',
    'field.termUnitShort': 'mois',
    'field.term': 'Nombre de mensualités',
    'field.from': 'Premier mois où il tombe',
    'field.to': 'Dernier mois où il tombe',
    'field.fromWord': 'du mois',
    'field.fromWordShort': 'du',
    'field.toWord': 'au mois',
    'field.toWordShort': 'au',
    'field.onceMonth': 'Le mois où cela arrive',
    'field.onceWord': 'au mois',
    'field.onceWordShort': 'mois',
    'field.growthSummary': (rate, amount, months) =>
      `+${rate} % par an · ${amount} à chaque fois au mois ${months}`,
    'field.loanSummary': (payment, term, interest, total) =>
      `${payment} par mois pendant ${term} mois · ${interest} d’intérêts en plus, ${total} remboursés en tout`,
    'field.loanSummaryFees': (payment, term, borrowed, received, interest, total) =>
      `${payment} par mois pendant ${term} mois · ${borrowed} empruntés pour recevoir ${received} · ${interest} d’intérêts en plus, ${total} remboursés en tout`,
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
    'strategy.jumpAria': 'Changer de stratégie',
    'strategy.onNamed': (name) => `${name}, la stratégie en cours`,
    'strategy.removeNamed': (name) => `Supprimer ${name}`,
    'strategy.copyOf': (name) => `${name} (copie)`,

    'sankey.heading': 'Où va l’argent',
    'sankey.note': 'Tout ce qui entre sur l’ensemble de la projection, mis en commun, et ce que cela devient. Seul l’argent qui bouge vraiment figure ici — ce que gagne un placement, ou un logement, est sur les cartes ci-dessus.',
    'sankey.title': 'Entrées, mise en commun, sorties',
    'sankey.description': 'Chaque ruban est de l’argent qui bouge. Les largeurs totalisent les mêmes montants que le récapitulatif.',
    'sankey.pool': 'Le tout',
    'sankey.kept': 'Conservé',
    'sankey.unnamed': 'Sans nom',
    'sankey.other': (count) => `${count} plus petits, regroupés`,
    'sankey.shortfall': 'Pris sur l’épargne',
    'sankey.tone.income': 'Entre',
    'sankey.tone.expense': 'Sort',
    'sankey.tone.net': 'Reste',
    'sankey.rowTone': (tone) => `${tone}\u00a0: `,
    'sankey.nameColumn': 'Où',
    'sankey.flowColumn': 'Montant',
    'sankey.shareColumn': 'Part',
    'sankey.tableCaption': (months) => `Tous les flux sur ${months} mois`,
    'sankey.tipValue': (amount, share) => `${amount} · ${share} %`,
    'sankey.share': (share) => `${share} %`,
    'sankey.aria': (total, sources, sinks) =>
      `Diagramme de flux : ${total} au total, de ${sources} ${sources === 1 ? 'source' : 'sources'} vers ${sinks} ${sinks === 1 ? 'destination' : 'destinations'}. Le tableau ci-dessous contient tous les chiffres.`,
    'compare.heading': 'Les stratégies côte à côte',
    'compare.note': (name, amount, months) =>
      `${name} arrive en tête : ${amount} après ${months} mois.`,
    'compare.chartTitle': (metric) => `${metric}, par stratégie`,
    'compare.chartDescription': 'Une ligne par stratégie, toutes sur la même échelle.',
    'compare.metricAria': 'Ce qu’il faut comparer',
    'compare.metric.net': 'Solde net',
    'compare.metric.income': 'Entrées',
    'compare.metric.expenses': 'Sorties',
    'compare.metric.invested': 'Placements',
    'compare.metric.profit': 'Gain net',
    'compare.metric.worth': 'Total',
    'compare.metric.owned': 'Possédé',
    'compare.metric.debt': 'Restant dû',
    'compare.strategyColumn': 'Stratégie',
    'compare.deltaColumn': (metric) => `${metric} — écart avec la première`,
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
    'summary.contributed': 'Versé sur les placements',
    'summary.invested': 'Valeur des investissements',
    'summary.profit': (rate) => `Gain net, après ${rate} % d’impôt`,
    'summary.worth': (months) => `Total après ${months} mois`,
    'summary.owned': 'Valeur de ce que vous possédez',
    'summary.debt': 'Il vous reste à rembourser',
    'field.syncNamed': (name) => `Synchroniser ${name} entre toutes les stratégies`,
    'field.unsyncNamed': (name) => `Ne plus synchroniser ${name} entre les stratégies`,
    'field.syncTitle': 'Garder ce champ identique dans chaque stratégie',
    'field.syncedTitle': 'Identique dans chaque stratégie',
    'inputs.windowNote': 'Les mois se comptent à partir d’aujourd’hui, qui est le mois 0 — « du mois 6 » tombe donc dans six mois. Laissez une case vide et le champ court sur toute la projection. Ce qui tombe moins souvent que chaque mois compte sa période depuis son début.',
    'inputs.syncHint': 'Comparer deux plans n’apprend quelque chose que s’ils diffèrent en un seul point. Le bouton en forme de maillon garde un champ identique partout — votre revenu ne change pas parce que vous avez décidé d’investir.',
    'inputs.debtHint': 'Un emprunt pèse sur ce que vous valez tant qu’il n’est pas remboursé. S’il a servi à acheter quelque chose que vous avez toujours — un logement, une voiture — ajoutez-le comme « Un bien que vous possédez », sinon le total ne dit que la moitié de l’histoire.',
    'summary.surplus': (amount) => `Vous gardez ${amount} par mois en moyenne`,
    'summary.shortfall': (amount) => `Les dépenses dépassent les revenus de ${amount} par mois en moyenne`,

    'filter.label': 'Durée de la projection',
    'filter.readout': (months, horizon) => `${months} mois · ${horizon}`,
    'filter.readoutShort': (months) => `${months} mois`,
    'filter.presetsAria': 'Durées de projection prédéfinies',
    'filter.moneyAria': 'Dans quelle monnaie les chiffres sont exprimés',
    'filter.todaysMoney': 'En monnaie d’aujourd’hui',
    'filter.inflation': 'Inflation par an',
    'filter.moneyNote': (rate) => `Tous les chiffres sont en monnaie d’aujourd’hui — ce qu’ils permettraient d’acheter maintenant, si les prix montent de ${rate} % par an.`,
    'filter.rangeAria': 'Afficher ou non une fourchette autour des rendements',
    'filter.showRange': 'Afficher une fourchette',
    'filter.spread': 'Rendements, à plus ou moins',
    'filter.tax': 'Impôt sur les gains',
    'filter.rangeNote': (points) => `La zone ombrée montre où l’on arrive si les rendements sont inférieurs ou supérieurs de ${points} points à ce que vous avez indiqué. Le taux d’un emprunt reste inchangé : celui-là est contractuel, pas supposé.`,
    'filter.preset': (years) => (years === 1 ? '1 an' : `${years} ans`),

    'charts.heading': 'Cumul au fil du temps',
    'charts.notePrompt': 'Saisissez un montant dans un champ pour projeter les mois à venir.',
    'charts.noteFilled': (horizon, income, expenses, net) =>
      `Sur ${horizon} : ${income} encaissés, ${expenses} dépensés, ${net} restants.`,
    'charts.scaleNote': 'Les graphiques de flux partagent la même échelle verticale : ils se lisent les uns par rapport aux autres. Le mois 0, c’est aujourd’hui — rien de gagné, rien de payé, même si ce que vous possédez et ce que vous devez comptent dès le départ. Les sommes investies comptent comme payées ; leur valeur est un solde, pas un flux, et cette carte a donc sa propre échelle. Le total revient sur l’échelle commune : l’écart entre lui et le solde net, c’est tout ce que le patrimoine apporte.',
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
    'chart.contributed.series': 'Versé',
    'chart.net.title': 'Solde net cumulé',
    'chart.net.description': 'Ce qu’il reste une fois les dépenses déduites des revenus.',
    'chart.net.series': 'Solde net cumulé',
    'chart.worth.title': 'Patrimoine total',
    'chart.worth.description': 'L’argent conservé, les placements et vos biens, moins ce qui reste dû.',
    'chart.worth.series': 'Total à ce jour',
    'chart.bandLow': 'Si plus bas',
    'chart.bandHigh': 'Si plus haut',
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
