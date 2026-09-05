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
    'about.open': 'About',
    'about.heading': 'About Finapp',
    'about.close': 'Close',
    'about.version': 'Version',
    'about.branch': 'Branch',
    'about.commit': 'Built from',
    'about.date': 'Date',
    // Said plainly rather than left to be discovered: with no build step
    // there is nothing at deploy time to stamp a commit in, and a commit
    // cannot carry its own hash. Each release's own commit is beside it below.
    'about.note': 'The app is served as static files with no build step, so this names the commit the build sits on top of rather than its own. Each release below carries the commit it was merged as.',
    'about.changes': 'What changed',
    'about.reset': 'Start again',
    'about.resetNote': 'Replaces your plans with the three the app opens with. Your language and theme are left alone.',
    // "There is no undo" was true when it was written and undo made it false.
    // What replaced it is narrower rather than softer — a way back while this
    // tab is open, and none once it is closed — which is exactly why the
    // question and the grave colour on its answer both stay.
    'about.resetAsk': 'This replaces every plan and every figure you have entered, on this device. Undo can put them back while this tab is open, and not after.',
    'about.resetYes': 'Replace everything',
    'about.resetNo': 'Keep what I have',
    'about.unreleased': 'commit not recorded',
    'theme.auto': 'Auto',
    'theme.light': 'Light',
    'theme.dark': 'Dark',
    'theme.aria.auto': 'Auto — colour theme: follow system',
    'theme.aria.light': 'Light — colour theme: light',
    'theme.aria.dark': 'Dark — colour theme: dark',
    'lang.label': 'EN',
    'lang.aria': 'EN — language: English. Switch to French',

    /*
     * Undo, which appears in the bar only once there is something to take back.
     *
     * The button says one word, because the app bar has room for one and five
     * other buttons are already in it. Which move it would reverse is in its
     * accessible name instead — a reader looking at the page can see what just
     * happened to it, and a reader who cannot is exactly the one who needs the
     * button to say which of the five it is offering to undo.
     */
    'undo.label': 'Undo',
    'undo.aria.field': 'Undo removing a field',
    'undo.aria.strategy': 'Undo removing a plan',
    'undo.aria.milestone': 'Undo removing a target',
    'undo.aria.reset': 'Undo starting again',
    'undo.aria.shared': 'Undo opening a shared plan',
    // What came back, said once and briefly. The real answer to a press of Undo
    // is the page itself, changed; this is here for the reader whose eyes were
    // not on the part of it that changed — a removed target restores a row four
    // sections down from the button that restored it.
    'undo.said.field': 'The field is back, with everything that was in it.',
    'undo.said.strategy': 'The plan is back, with every field that was in it.',
    'undo.said.milestone': 'The target is back.',
    'undo.said.reset': 'Your plans are back, exactly as they were.',
    'undo.said.shared': 'Your own plans are back, and the shared one is gone.',

    'inputs.heading': 'What comes in and goes out',
    'inputs.hint': 'Name each amount, say whether it comes in or goes out, how often it lands, and how much. A loan works out its own repayments, an investment grows at the rate you give it, and something you own simply holds its value. Give an amount a rate and it climbs by that much every year.',
    'inputs.periodNote': 'Anything less frequent than monthly lands at the end of each period — a yearly amount at month 12, 24, and so on.',
    'inputs.currencyNote': 'Amounts are in your own currency — the app never converts or stores them anywhere but this device.',
    'inputs.notes': 'How this works',
    // The same phrase over every disclosure that explains rather than reports.
    // One key, because a reader who learns what the summary means in one
    // section should not have to learn it again in the next.
    'notes.how': 'How this works',
    'assumptions.heading': 'How money behaves',
    'assumptions.note': 'These apply to every plan at once, which is what keeps two plans worth comparing.',
    'inputs.fold': 'Fold the form away',
    'inputs.unfold': 'Bring the form back',

    'field.default.income': 'Income',
    'field.default.rent': 'Rent',
    'field.default.salary': 'Salary',
    'field.default.living': 'Everyday costs',
    'field.default.mortgage': 'Mortgage',
    'field.default.house': 'The house',
    'field.default.purchase': 'Buying the house',
    'field.default.propertyTax': 'Property tax',
    'field.default.fund': 'Index fund',
    'field.default.fundAfter': 'Index fund, after the house',
    'strategy.default.loan': 'Buy now, on a loan',
    'strategy.default.saveUp': 'Save up, buy cash',
    'strategy.default.sellFund': 'Save up, sell the fund',
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
    'field.ownedFrom': 'Month you come to own it',
    'field.to': 'Last month it lands',
    'field.fromWord': 'from month',
    'field.fromWordShort': 'from',
    'field.toWord': 'to month',
    'field.sell': 'Month the investment is cashed in',
    'field.sellWord': 'sold in month',
    'field.sellWordShort': 'sold',
    'field.toWordShort': 'to',
    'field.onceMonth': 'The month it happens',
    'field.onceWord': 'in month',
    'field.onceWordShort': 'month',
    'field.atMonth': 'a month',
    'field.atAria': (name) => `What sets this month for ${name}`,
    'field.atMet': (month) => `month ${month}`,
    'field.atNotYet': 'not yet',
    'milestone.name': 'Name for this target, so a field can wait on it',
    'milestone.namePlaceholder': 'Name it to wait on it',
    'milestone.unsettled': 'These targets move each other, so there is no month that is its own cause. Give one of them a figure that does not depend on the other, or set its month by hand.',
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
    'field.amountNamed': (what, name) => `${what}, for ${name}`,
    'field.income': 'In',
    'field.expense': 'Out',
    'field.open': (name) => `Settings for ${name}`,
    'field.close': (name) => `Hide the settings for ${name}`,
    // A rate is the one fragment of a shut row's sentence that carries a unit,
    // so each language owns its own spacing before the sign.
    'field.saidRate': (rate) => `${rate}% a year`,
    'field.untitled': 'this field',
    'field.add': 'Add a field',
    'field.duplicateNamed': (name) => `Duplicate ${name}`,
    'field.removeNamed': (name) => `Remove ${name}`,
    'field.copyOf': (name) => `${name} (copy)`,
    'fields.empty': 'No fields yet. Add one to start projecting.',

    'strategy.origin.default': 'One of the plans the app opens with',
    'strategy.origin.own': 'A plan you made',
    'strategy.origin.shared': 'Shared with you',
    'strategy.origin.shared-edited': 'Shared with you, and changed since',
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
    'sankey.sold': 'Cashed in',
    'sankey.unnamed': 'Unnamed',
    // A loan's repayment, as the parts it is made of. Named rather than
    // coloured: the diagram seats three tones and they mean in, out and left
    // over, so a fourth would have to displace one of those.
    'sankey.part.principal': (name) => `${name} · principal`,
    'sankey.part.fees': (name) => `${name} · fees`,
    'sankey.part.interest': (name) => `${name} · interest`,
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
    'compare.note': (name, metric, amount, months) =>
      `${name} comes out ahead on ${metric}: ${amount} after ${months} ${months === 1 ? 'month' : 'months'}.`,
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

    'rank.heading': 'What moves the needle',
    // "What follows" rather than "beside each name", because what follows is
    // sometimes one sentence saying nothing here moves this column at all.
    'rank.note': (metric, months) =>
      `Every amount in the plan was moved a tenth up and a tenth down on its own, with the rest of it left exactly where it is; what follows is how far that carries ${metric} at month ${months}.`,
    // A field can be in the plan and still be outside the horizon — the fund
    // that only starts once the mortgage ends is in every plan the app opens
    // with — and that it moves nothing yet is worth saying rather than showing
    // as a bar too short to see.
    'rank.nothing': 'moves nothing',
    // And where that is true of every one of them there is no order to show, so
    // the same fact is said once rather than on six lines that all say it.
    'rank.said.nothing': (metric) => `Nothing you have entered moves ${metric} over this horizon.`,
    'rank.caveat.horizon': 'This is what your plan is sensitive to over the length you are reading it at, not a general truth about money. Pull the projection out and the order changes: the three plans the app opens with swap theirs somewhere between twenty years and forty.',
    // The obvious caveat to write here would be that the parts do not sum to
    // the whole. They do — see `swingsOf` — and saying otherwise would excuse
    // the list from the thing it genuinely cannot do.
    'rank.caveat.parts': 'The swings do add up. Every amount enters the model on its own, so moving two of them moves the figure by both, to the cent — and that is exactly the limit of the list rather than a flaw in it: it will rank a mortgage and the house it bought one above the other without ever being able to say they were one decision. Profit is the exception, because the tax falls on the gain as a whole rather than on each part of it.',

    'milestone.heading': 'When does that happen?',
    // The distinction the whole feature rests on, said where a reader meets it:
    // the model is not conditional and this does not make it so. The projection
    // is run exactly as it always was and then read.
    'milestone.note': 'A target is a figure to watch for, not a rule the plan obeys: the projection runs as it always has and the app reads off the first month the plan you are looking at is there. Switch plans and every answer is worked out again.',
    // A target has no metric vocabulary of its own — these are the same eight
    // the comparison offers, named by `compare.metric.*`. Two spellings of
    // "Total" on one page would be one page too many.
    'milestone.add': 'Mark a target',
    'milestone.what': 'What to watch',
    'milestone.figure': 'The figure to reach',
    'milestone.figureNamed': (metric) => `The figure to reach on ${metric}`,
    'milestone.removeNamed': (metric) => `Remove the target on ${metric}`,
    // What a rule is, said once rather than on every card it appears on — and
    // what it is not, which is the part a reader would otherwise have to guess.
    'milestone.caveat': 'A rule marks a month and nothing else. It is drawn in the same place on every card, because a month is a month, and it says nothing about the curve it happens to cross. A total that climbs past its figure and falls back again is marked once, where it first got there — the cards show the rest.',
    'milestone.said.pending': 'Give this target a figure.',
    // Three answers, and the third is an answer: a target the plan never
    // reaches has to say so where it would have been marked, rather than
    // quietly falling off the end of the chart.
    'milestone.said.always': (value) => `True from month 0, at ${value}.`,
    'milestone.said.met': (month, value) => `First true at month ${month}, at ${value}.`,
    'milestone.said.never': (horizon, value) => `Not within ${horizon} — the projection ends at ${value}.`,

    /*
     * A target that is never met is where the question turns round: the
     * destination is known and the figure is not. So the ask lives on that
     * answer rather than on a control of its own, and it borrows the target's
     * metric and figure rather than asking for them a second time.
     */
    'goal.ask': 'What would it take?',
    'goal.askNamed': (metric) => `What would it take to meet the target on ${metric}?`,
    'goal.choose': 'The figure to work back from',
    'goal.chooseNamed': (metric) => `The figure to work back from, for the target on ${metric}`,
    // A field and one of its two figures, which is the whole of what can be
    // asked backwards about.
    'goal.candidate': (name, figure) => `${name} — ${figure}`,
    'goal.knob.amount': 'the amount',
    'goal.knob.annualRate': 'the rate',
    'goal.rate': (rate) => `${rate}% a year`,
    // "Or more", never "is": the figure is rounded away from the goal, so it
    // clears the target rather than landing exactly on it, and saying so is
    // what makes the rounding honest rather than sloppy.
    'goal.said.least': (name, figure, amount, month) =>
      `${name}: ${figure} would have to be ${amount} or more — the target is then met in month ${month}.`,
    'goal.said.most': (name, figure, amount, month) =>
      `${name}: ${figure} would have to be ${amount} or less — the target is then met in month ${month}.`,
    /*
     * Four ways to have no answer, and every one of them is a better thing to
     * read than a figure the search is not entitled to. They are told apart
     * because they send a reader to four different next moves.
     */
    'goal.refusal.unmoved': (name, figure) =>
      `${name}: ${figure} leaves this target in the same place at both ends of what the app will hold. It is not what decides this one.`,
    'goal.refusal.unreachable': (name, figure) =>
      `${name}: ${figure} does not get there, at any value the app will hold.`,
    'goal.refusal.reversal': (name, figure) =>
      `${name}: more of ${figure} helps and then stops helping, so there is no one figure to name. The app will not pick a crossing and call it the answer.`,
    'goal.refusal.unproven': (name, figure) =>
      `${name}: the value the search settled on for ${figure} does not reach the target once it is put back into the plan, so there is nothing to name.`,
    // What the ask can do and what it will not, said where the ask appears.
    'goal.caveat': 'Only two figures can be worked backwards: an amount and a rate. More of either carries the answer one way and keeps carrying it, which is what lets a search bracket it and halve its way in. The month an investment is cashed in is not like that — moving it changes both what the holding grew to and what the cash then bought — and neither is a loan’s term, so neither is offered. Whatever comes back is put into the plan and run again before it is shown, and where it does not reach the target the app says so rather than naming it. Nothing here is ever written into your plan.',

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
    // Outranks both of the above: an average is a figure nobody lives through,
    // and a month you are overdrawn in is one you do.
    'summary.runsDry': (month, amount) => `The money runs out in month ${month}, ${amount} short at its lowest`,

    'filter.label': 'Projection length',
    'filter.readout': (months, horizon) => `${months} ${plural(months, 'month', 'months')} · ${horizon}`,
    'filter.readoutShort': (months) => `${months} ${plural(months, 'month', 'months')}`,
    'filter.presetsAria': 'Preset projection lengths',
    'filter.moneyAria': 'Which money the figures are in',
    'filter.todaysMoney': 'In today’s money',
    'filter.inflation': 'Inflation a year, as a percentage',
    'filter.moneyNote': (rate) => `Every figure is in today’s money — what it would buy now, if prices rise ${rate}% a year.`,
    'filter.rangeAria': 'Whether to show a range around the returns',
    'filter.showRange': 'Show a range',
    'filter.spread': 'Returns, give or take, as a percentage',
    'filter.tax': 'Tax on gains, as a percentage',
    'filter.rangeNote': (points) => `The shaded band is where things land if returns come in ${points} points lower or higher than you set. Loan interest is left alone: that one was agreed, not guessed.`,
    'filter.preset': (years) => (years === 1 ? '1 yr' : `${years} yr`),

    'charts.heading': 'Cumulative over time',
    // The section says which of the two readings is on screen, because the
    // heading is a claim about what the cards show and it stops being true the
    // moment the reader asks for the other one.
    'charts.monthlyHeading': 'Month by month',
    'charts.view.total': 'Running total',
    'charts.view.monthly': 'Each month',
    'charts.viewAria': 'How to read the cards',
    'charts.notePrompt': 'Give a field an amount to project the months ahead.',
    'charts.noteFilled': (horizon, income, expenses, net) =>
      `Over ${horizon}: ${income} in, ${expenses} out, ${net} left over.`,
    'charts.scaleNote': 'The flow charts share one vertical scale, so they can be read against each other. Month 0 is today: nothing earned, nothing paid — though what you already own and already owe counts from the start. Money put into an investment counts as paid out; what it is worth is a balance, not a flow, so that card carries its own scale. The total sits back on the shared scale, so the gap between it and the net is everything the balance sheet adds.',
    'charts.monthlyNote': 'Every card is showing what moved during that month on its own, so they all share one vertical scale: read this way a balance is a change, which is the same kind of figure as a flow. Month 0 has no month before it, so nothing moved in it. And a plan comfortably ahead over the whole horizon can still have a month where the yearly bills and a one-off land together — this is the reading that shows it.',
    'charts.empty': 'Give a field an amount above.',

    'chart.income.title': 'Cumulative income',
    'chart.income.description': 'Everything earned since month 0, added up.',
    'chart.income.series': 'Income to date',
    'chart.income.monthly.title': 'Income each month',
    'chart.income.monthly.description': 'What came in during each month on its own.',
    'chart.income.monthly.series': 'Income that month',
    'chart.expenses.title': 'Cumulative expenses',
    'chart.expenses.description': 'Everything paid out since month 0, added up.',
    'chart.expenses.series': 'Expenses to date',
    'chart.expenses.monthly.title': 'Expenses each month',
    'chart.expenses.monthly.description': 'What went out during each month on its own — a yearly bill lands on one month, not on twelve.',
    'chart.expenses.monthly.series': 'Expenses that month',
    'chart.invested.title': 'Investment value',
    'chart.invested.description': 'What the money you invested is worth, growth included.',
    'chart.invested.series': 'Value to date',
    'chart.invested.monthly.title': 'Change in investment value',
    'chart.invested.monthly.description': 'What the investments gained or lost each month, the month’s contribution included.',
    'chart.invested.monthly.series': 'Change that month',
    'chart.contributed.series': 'Paid in',
    'chart.contributed.monthly.series': 'Paid in that month',
    'chart.net.title': 'Cumulative net',
    'chart.net.description': 'What is left once expenses come out of income.',
    'chart.net.series': 'Net to date',
    'chart.net.monthly.title': 'Net each month',
    'chart.net.monthly.description': 'What each month left over — below the line is a month where more went out than came in.',
    'chart.net.monthly.series': 'Net that month',
    'chart.worth.title': 'Total worth',
    'chart.worth.description': 'Cash kept, investments and what you own, less what you still owe.',
    'chart.worth.series': 'Total to date',
    'chart.worth.monthly.title': 'Change in total worth',
    'chart.worth.monthly.description': 'How much better or worse off each month left you.',
    'chart.worth.monthly.series': 'Change that month',
    'chart.bandLow': 'If lower',
    'chart.bandHigh': 'If higher',
    'chart.showTable': 'Show table',
    'chart.hideTable': 'Hide table',
    'chart.tableCaption': (title) => `${title} — every month`,
    // The title already says "each month" in this reading, so the caption says
    // what it is for instead of saying that twice.
    'chart.monthlyCaption': (title) => `${title} — every figure`,
    'chart.monthColumn': 'Month',
    'chart.aria': (title, months, endValue) =>
      `${title}. Line chart over ${months} ${plural(months, 'month', 'months')}, `
      + `ending at ${endValue}. Use the table below this chart for every value.`,
    'chart.reading': (month, value) => `${month}: ${value}`,
    // One reading names several series, so the separator between a series and
    // its figure is punctuation too — and punctuation that differs between
    // languages belongs here rather than hard-coded in the drawing.
    'chart.seriesReading': (label, value) => `${label}: ${value}`,

    'month.start': 'Start',
    'month.nth': (month) => `Month ${month}`,
    'horizon.years': (years) => `${years} yr`,
    'horizon.months': (months) => `${months} mo`,

    'footer.note': 'Everything is calculated on your device and saved only in this browser. No account, no network.',
    'update.ready': 'A new version is ready.',
    'update.reload': 'Reload',
    'update.check': 'Check for updates',
    'update.checking': 'Looking…',
    'update.current': 'You are running the newest version.',
    'update.coming': 'A new version is downloading. You will be offered a reload when it is ready.',
    'update.found': 'A new version is ready. Close this panel to reload it.',
    'update.unreachable': 'Could not reach the server. You may be offline.',

    'action.share': 'Share',
    'share.heading': 'Share this plan',
    'share.note': 'The whole plan is inside this link: every strategy, every figure, the horizon and the assumptions. It rides in the part of an address a browser never sends to a server, so it goes only where you paste it — and anyone who has it has the plan.',
    'share.link': 'A link carrying this plan',
    'share.copy': 'Copy link',
    'share.copied': 'Copied.',
    'share.copyYourself': 'Copy it from the box above.',
    'share.close': 'Close sharing',
    'share.received': 'A plan was shared with you',
    'share.receivedWhat': (plans, fields, horizon) =>
      `${plans} ${plural(plans, 'plan', 'plans')}, ${fields} ${plural(fields, 'field', 'fields')}, over ${horizon}.`,
    'share.receivedAsk': 'Your own plans, your language and your theme stay as they are. The horizon and the assumptions come from the shared plan, since every plan is read on one horizon.',
    'share.receivedRoom': 'They will be added beside your own.',
    'share.receivedSome': (fitting, sent, most) =>
      `${most} plans is the most the app can chart, so ${plural(fitting, `the first of the ${sent}`, `the first ${fitting} of ${sent}`)} will be added beside your own.`,
    'share.receivedNoRoom': (most) =>
      `You already have ${most} plans, which is the most the app can chart. Opening these means replacing yours — undo can put them back while this tab is open, and not after.`,
    'share.receivedYes': 'Add to my plans',
    'share.receivedReplace': 'Replace my plans',
    'share.receivedNo': 'Keep my own',
    'share.brokenHeading': 'That link did not carry a plan',
    'share.broken': 'It may have been cut short on its way to you, or written by a newer version of the app. Nothing on this device has changed.',
    'share.brokenClose': 'Close',
  },

  fr: {
    'html.lang': 'fr',
    'manifest.href': './manifest.fr.webmanifest',
    'doc.title': 'Finapp — estimez votre avenir financier',
    'doc.description': 'Un calculateur hors ligne qui projette les revenus, les dépenses et le solde net cumulés sur les mois à venir.',
    'skip.link': 'Aller au contenu',
    'action.install': 'Installer l’application',
    'about.open': 'À propos',
    'about.heading': 'À propos de Finapp',
    'about.close': 'Fermer',
    'about.version': 'Version',
    'about.branch': 'Branche',
    'about.commit': 'Construit depuis',
    'about.date': 'Date',
    'about.note': 'L’application est servie en fichiers statiques, sans étape de construction : ce commit est celui sur lequel la version repose, et non le sien. Chaque version ci-dessous porte le commit avec lequel elle a été fusionnée.',
    'about.changes': 'Ce qui a changé',
    'about.reset': 'Recommencer',
    'about.resetNote': 'Remplace vos plans par les trois plans d’origine. Votre langue et votre thème ne changent pas.',
    'about.resetAsk': 'Cela remplace tous vos plans et tous les montants saisis sur cet appareil. Annuler peut les rétablir tant que cet onglet reste ouvert, mais pas après.',
    'about.resetYes': 'Tout remplacer',
    'about.resetNo': 'Garder mes plans',
    'about.unreleased': 'commit non enregistré',
    'theme.auto': 'Auto',
    'theme.light': 'Clair',
    'theme.dark': 'Sombre',
    'theme.aria.auto': 'Auto — thème : suivre le système',
    'theme.aria.light': 'Clair — thème : clair',
    'theme.aria.dark': 'Sombre — thème : sombre',
    'lang.label': 'FR',
    'lang.aria': 'FR — langue : français. Passer à l’anglais',

    'undo.label': 'Annuler',
    'undo.aria.field': 'Annuler la suppression d’un poste',
    'undo.aria.strategy': 'Annuler la suppression d’un plan',
    'undo.aria.milestone': 'Annuler la suppression d’un objectif',
    // Named rather than described: the button it takes back is called
    // « Recommencer », and inventing a second word for the same move would
    // leave the app with two of them.
    'undo.aria.reset': 'Annuler «\u00a0Recommencer\u00a0»',
    'undo.aria.shared': 'Annuler l’ouverture d’un plan partagé',
    'undo.said.field': 'Le poste est de retour, avec tout ce qu’il contenait.',
    'undo.said.strategy': 'Le plan est de retour, avec tous les postes qu’il contenait.',
    'undo.said.milestone': 'L’objectif est de retour.',
    'undo.said.reset': 'Vos plans sont de retour, exactement comme ils étaient.',
    'undo.said.shared': 'Vos plans sont de retour, et le plan partagé a disparu.',

    'inputs.heading': 'Ce qui entre et ce qui sort',
    'inputs.hint': 'Nommez chaque montant, indiquez s’il entre ou s’il sort, à quelle fréquence il tombe, et combien. Un emprunt calcule ses mensualités, un placement croît au taux que vous indiquez, et un bien que vous possédez garde simplement sa valeur. Donnez un taux à un montant et il augmente d’autant chaque année.',
    'inputs.periodNote': 'Tout ce qui revient moins souvent que chaque mois tombe à la fin de chaque période — un montant annuel au mois 12, 24, et ainsi de suite.',
    'inputs.currencyNote': 'Les montants sont dans votre devise — l’application ne convertit rien et n’enregistre rien ailleurs que sur cet appareil.',
    'inputs.notes': 'Comment ça marche',
    'notes.how': 'Comment ça marche',
    'assumptions.heading': 'Le comportement de l’argent',
    'assumptions.note': 'Elles s’appliquent à tous les plans à la fois, et c’est ce qui rend deux plans comparables.',
    'inputs.fold': 'Replier le formulaire',
    'inputs.unfold': 'Rouvrir le formulaire',

    'field.default.income': 'Revenu',
    'field.default.rent': 'Loyer',
    'field.default.salary': 'Salaire',
    'field.default.living': 'Dépenses courantes',
    'field.default.mortgage': 'Prêt immobilier',
    'field.default.house': 'La maison',
    'field.default.purchase': 'Achat de la maison',
    'field.default.propertyTax': 'Taxe foncière',
    'field.default.fund': 'Fonds indiciel',
    'field.default.fundAfter': 'Fonds indiciel, après la maison',
    'strategy.default.loan': 'Acheter tout de suite, à crédit',
    'strategy.default.saveUp': 'Épargner, puis acheter comptant',
    'strategy.default.sellFund': 'Épargner, puis vendre le fonds',
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
    'field.ownedFrom': 'Mois où il devient vôtre',
    'field.to': 'Dernier mois où il tombe',
    'field.fromWord': 'du mois',
    'field.fromWordShort': 'du',
    'field.toWord': 'au mois',
    'field.sell': 'Mois où le placement est vendu',
    'field.sellWord': 'vendu au mois',
    'field.sellWordShort': 'vendu',
    'field.toWordShort': 'au',
    'field.onceMonth': 'Le mois où cela arrive',
    'field.onceWord': 'au mois',
    'field.onceWordShort': 'mois',
    'field.atMonth': 'un mois',
    'field.atAria': (name) => `Ce qui fixe ce mois pour ${name}`,
    'field.atMet': (month) => `mois ${month}`,
    'field.atNotYet': 'pas encore',
    'milestone.name': 'Nom de cet objectif, pour qu’un poste puisse l’attendre',
    'milestone.namePlaceholder': 'Nommez-le pour l’attendre',
    'milestone.unsettled': 'Ces objectifs se déplacent mutuellement\u00a0: aucun mois n’est sa propre cause. Donnez à l’un un montant qui ne dépend pas de l’autre, ou fixez son mois à la main.',
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
    'field.amountNamed': (what, name) => `${what}, pour ${name}`,
    'field.income': 'Entrée',
    'field.expense': 'Sortie',
    'field.open': (name) => `Réglages de ${name}`,
    'field.close': (name) => `Masquer les réglages de ${name}`,
    'field.saidRate': (rate) => `${rate}\u00a0% par an`,
    'field.untitled': 'ce champ',
    'field.add': 'Ajouter un champ',
    'field.duplicateNamed': (name) => `Dupliquer ${name}`,
    'field.removeNamed': (name) => `Supprimer ${name}`,
    'field.copyOf': (name) => `${name} (copie)`,
    'fields.empty': 'Aucun champ pour l’instant. Ajoutez-en un pour lancer la projection.',

    'strategy.origin.default': 'Un des plans proposés au départ',
    'strategy.origin.own': 'Un plan que vous avez créé',
    'strategy.origin.shared': 'Partagé avec vous',
    'strategy.origin.shared-edited': 'Partagé avec vous, puis modifié',
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
    'sankey.sold': 'Encaissé',
    'sankey.unnamed': 'Sans nom',
    'sankey.part.principal': (name) => `${name} · capital`,
    'sankey.part.fees': (name) => `${name} · frais`,
    'sankey.part.interest': (name) => `${name} · intérêts`,
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
    'compare.note': (name, metric, amount, months) =>
      `${name} arrive en tête sur ${metric} : ${amount} après ${months} mois.`,
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

    'rank.heading': 'Ce qui pèse vraiment',
    'rank.note': (metric, months) =>
      `Chaque montant du plan a été augmenté puis diminué d’un dixième, isolément, tout le reste restant en place\u00a0; ce qui suit est ce que cela déplace sur ${metric} au mois ${months}.`,
    'rank.nothing': 'ne change rien',
    'rank.said.nothing': (metric) => `Rien de ce que vous avez saisi ne déplace ${metric} sur cet horizon.`,
    'rank.caveat.horizon': 'C’est ce à quoi votre plan est sensible sur la durée que vous lisez, pas une vérité générale sur l’argent. Allongez la projection et l’ordre change\u00a0: les trois plans avec lesquels l’application démarre inversent le leur entre vingt et quarante ans.',
    'rank.caveat.parts': 'Les écarts s’additionnent bien. Chaque montant entre dans le modèle pour lui-même, si bien qu’en déplacer deux déplace le chiffre des deux, au centime près — et c’est là toute la limite de cette liste, non un défaut\u00a0: elle classera un emprunt et le logement qu’il a payé l’un au-dessus de l’autre sans jamais pouvoir dire qu’ils ne font qu’une seule décision. Le gain net fait exception, parce que l’impôt porte sur le gain d’ensemble et non sur chacune de ses parts.',

    'milestone.heading': 'Quand cela arrive-t-il\u00a0?',
    'milestone.note': 'Un objectif est un chiffre à surveiller, pas une règle que le plan applique\u00a0: la projection se déroule comme toujours et l’application y lit le premier mois où le plan que vous regardez y est. Changez de plan et chaque réponse est recalculée.',
    'milestone.add': 'Marquer un objectif',
    'milestone.what': 'Ce qu’il faut suivre',
    'milestone.figure': 'Le chiffre à atteindre',
    'milestone.figureNamed': (metric) => `Le chiffre à atteindre sur ${metric}`,
    'milestone.removeNamed': (metric) => `Supprimer l’objectif sur ${metric}`,
    'milestone.caveat': 'Un repère marque un mois, rien d’autre. Il est tracé au même endroit sur toutes les cartes, parce qu’un mois est un mois, et il ne dit rien de la courbe qu’il traverse. Un total qui dépasse son chiffre puis redescend est marqué une seule fois, là où il y est arrivé la première fois — les cartes montrent le reste.',
    'milestone.said.pending': 'Donnez un chiffre à cet objectif.',
    'milestone.said.always': (value) => `Vrai dès le mois 0, à ${value}.`,
    'milestone.said.met': (month, value) => `Vrai pour la première fois au mois ${month}, à ${value}.`,
    'milestone.said.never': (horizon, value) => `Pas avant ${horizon} — la projection se termine à ${value}.`,

    'goal.ask': 'Que faudrait-il\u00a0?',
    'goal.askNamed': (metric) => `Que faudrait-il pour atteindre l’objectif sur ${metric}\u00a0?`,
    'goal.choose': 'Le chiffre à faire varier',
    'goal.chooseNamed': (metric) => `Le chiffre à faire varier, pour l’objectif sur ${metric}`,
    'goal.candidate': (name, figure) => `${name} — ${figure}`,
    'goal.knob.amount': 'le montant',
    'goal.knob.annualRate': 'le taux',
    'goal.rate': (rate) => `${rate}\u00a0% par an`,
    'goal.said.least': (name, figure, amount, month) =>
      `${name}\u00a0: ${figure} devrait être de ${amount} ou plus — l’objectif est alors atteint au mois ${month}.`,
    'goal.said.most': (name, figure, amount, month) =>
      `${name}\u00a0: ${figure} devrait être de ${amount} ou moins — l’objectif est alors atteint au mois ${month}.`,
    'goal.refusal.unmoved': (name, figure) =>
      `${name}\u00a0: ${figure} laisse cet objectif au même endroit aux deux extrémités de ce que l’application accepte. Ce n’est pas lui qui décide de celui-ci.`,
    'goal.refusal.unreachable': (name, figure) =>
      `${name}\u00a0: ${figure} n’y arrive pas, quelle que soit la valeur que l’application accepte.`,
    'goal.refusal.reversal': (name, figure) =>
      `${name}\u00a0: augmenter ${figure} aide, puis cesse d’aider\u00a0; il n’y a donc pas de chiffre unique à donner. L’application ne choisira pas un passage pour en faire la réponse.`,
    'goal.refusal.unproven': (name, figure) =>
      `${name}\u00a0: la valeur trouvée pour ${figure} n’atteint pas l’objectif une fois replacée dans le plan\u00a0; il n’y a donc rien à annoncer.`,
    'goal.caveat': 'Deux chiffres seulement peuvent être calculés à rebours\u00a0: un montant et un taux. Augmenter l’un ou l’autre emmène la réponse dans un sens et continue de l’y emmener, ce qui permet à une recherche de l’encadrer puis de resserrer par moitiés. Le mois où un placement est vendu n’a pas cette propriété — le déplacer change à la fois ce que le placement a rapporté et ce que l’argent a permis d’acheter — ni la durée d’un emprunt\u00a0; ni l’un ni l’autre n’est donc proposé. Ce qui ressort est replacé dans le plan et reprojeté avant d’être affiché, et si l’objectif n’est pas atteint l’application le dit plutôt que d’annoncer un chiffre. Rien de tout cela n’est jamais écrit dans votre plan.',

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
    'summary.runsDry': (month, amount) => `L’argent vient à manquer au mois ${month}, ${amount} de découvert au plus bas`,

    'filter.label': 'Durée de la projection',
    'filter.readout': (months, horizon) => `${months} mois · ${horizon}`,
    'filter.readoutShort': (months) => `${months} mois`,
    'filter.presetsAria': 'Durées de projection prédéfinies',
    'filter.moneyAria': 'Dans quelle monnaie les chiffres sont exprimés',
    'filter.todaysMoney': 'En monnaie d’aujourd’hui',
    'filter.inflation': 'Inflation par an, en pourcentage',
    'filter.moneyNote': (rate) => `Tous les chiffres sont en monnaie d’aujourd’hui — ce qu’ils permettraient d’acheter maintenant, si les prix montent de ${rate} % par an.`,
    'filter.rangeAria': 'Afficher ou non une fourchette autour des rendements',
    'filter.showRange': 'Afficher une fourchette',
    'filter.spread': 'Rendements, à plus ou moins, en pourcentage',
    'filter.tax': 'Impôt sur les gains, en pourcentage',
    'filter.rangeNote': (points) => `La zone ombrée montre où l’on arrive si les rendements sont inférieurs ou supérieurs de ${points} points à ce que vous avez indiqué. Le taux d’un emprunt reste inchangé : celui-là est contractuel, pas supposé.`,
    'filter.preset': (years) => (years === 1 ? '1 an' : `${years} ans`),

    'charts.heading': 'Cumul au fil du temps',
    'charts.monthlyHeading': 'Mois par mois',
    'charts.view.total': 'Cumul',
    'charts.view.monthly': 'Chaque mois',
    'charts.viewAria': 'Comment lire les cartes',
    'charts.notePrompt': 'Saisissez un montant dans un champ pour projeter les mois à venir.',
    'charts.noteFilled': (horizon, income, expenses, net) =>
      `Sur ${horizon} : ${income} encaissés, ${expenses} dépensés, ${net} restants.`,
    'charts.scaleNote': 'Les graphiques de flux partagent la même échelle verticale : ils se lisent les uns par rapport aux autres. Le mois 0, c’est aujourd’hui — rien de gagné, rien de payé, même si ce que vous possédez et ce que vous devez comptent dès le départ. Les sommes investies comptent comme payées ; leur valeur est un solde, pas un flux, et cette carte a donc sa propre échelle. Le total revient sur l’échelle commune : l’écart entre lui et le solde net, c’est tout ce que le patrimoine apporte.',
    'charts.monthlyNote': 'Chaque carte montre ce qui a bougé pendant ce mois-là seulement, et toutes partagent donc la même échelle verticale\u00a0: lu ainsi, un solde est une variation, une grandeur de même nature qu’un flux. Le mois 0 n’a pas de mois avant lui\u00a0: rien n’y a bougé. Et un plan largement bénéficiaire sur tout l’horizon peut malgré tout connaître un mois où les factures annuelles et un achat ponctuel tombent ensemble — c’est cette lecture-là qui le montre.',
    'charts.empty': 'Saisissez un montant dans un champ ci-dessus.',

    'chart.income.title': 'Revenus cumulés',
    'chart.income.description': 'Tout ce qui a été gagné depuis le mois 0, additionné.',
    'chart.income.series': 'Revenus cumulés',
    'chart.income.monthly.title': 'Revenus de chaque mois',
    'chart.income.monthly.description': 'Ce qui est entré pendant chaque mois, pris isolément.',
    'chart.income.monthly.series': 'Revenus du mois',
    'chart.expenses.title': 'Dépenses cumulées',
    'chart.expenses.description': 'Tout ce qui a été payé depuis le mois 0, additionné.',
    'chart.expenses.series': 'Dépenses cumulées',
    'chart.expenses.monthly.title': 'Dépenses de chaque mois',
    'chart.expenses.monthly.description': 'Ce qui est sorti pendant chaque mois, pris isolément — une facture annuelle tombe sur un mois, pas sur douze.',
    'chart.expenses.monthly.series': 'Dépenses du mois',
    'chart.invested.title': 'Valeur des investissements',
    'chart.invested.description': 'Ce que valent les sommes investies, croissance comprise.',
    'chart.invested.series': 'Valeur à ce jour',
    'chart.invested.monthly.title': 'Variation de la valeur investie',
    'chart.invested.monthly.description': 'Ce que les placements ont gagné ou perdu chaque mois, versement du mois compris.',
    'chart.invested.monthly.series': 'Variation du mois',
    'chart.contributed.series': 'Versé',
    'chart.contributed.monthly.series': 'Versé ce mois-là',
    'chart.net.title': 'Solde net cumulé',
    'chart.net.description': 'Ce qu’il reste une fois les dépenses déduites des revenus.',
    'chart.net.series': 'Solde net cumulé',
    'chart.net.monthly.title': 'Solde net de chaque mois',
    'chart.net.monthly.description': 'Ce que chaque mois a laissé — sous la ligne, c’est un mois où il est sorti plus qu’il n’est entré.',
    'chart.net.monthly.series': 'Solde net du mois',
    'chart.worth.title': 'Patrimoine total',
    'chart.worth.description': 'L’argent conservé, les placements et vos biens, moins ce qui reste dû.',
    'chart.worth.series': 'Total à ce jour',
    'chart.worth.monthly.title': 'Variation du patrimoine',
    'chart.worth.monthly.description': 'De combien chaque mois vous a laissé plus riche, ou plus pauvre.',
    'chart.worth.monthly.series': 'Variation du mois',
    'chart.bandLow': 'Si plus bas',
    'chart.bandHigh': 'Si plus haut',
    'chart.showTable': 'Afficher le tableau',
    'chart.hideTable': 'Masquer le tableau',
    'chart.tableCaption': (title) => `${title} — mois par mois`,
    'chart.monthlyCaption': (title) => `${title} — tous les chiffres`,
    'chart.monthColumn': 'Mois',
    'chart.aria': (title, months, endValue) =>
      `${title}. Graphique linéaire sur ${months} mois, se terminant à ${endValue}. `
      + 'Le tableau sous ce graphique donne toutes les valeurs.',
    'chart.reading': (month, value) => `${month} : ${value}`,
    'chart.seriesReading': (label, value) => `${label} : ${value}`,

    'month.start': 'Début',
    'month.nth': (month) => `Mois ${month}`,
    'horizon.years': (years) => (years === 1 ? '1 an' : `${years} ans`),
    'horizon.months': (months) => `${months} mois`,

    'footer.note': 'Tout est calculé sur votre appareil et enregistré uniquement dans ce navigateur. Aucun compte, aucun réseau.',
    'update.ready': 'Une nouvelle version est prête.',
    'update.reload': 'Recharger',
    'update.check': 'Rechercher une mise à jour',
    'update.checking': 'Recherche\u00a0…',
    'update.current': 'Vous utilisez la version la plus récente.',
    'update.coming': 'Une nouvelle version se télécharge. Un rechargement vous sera proposé dès qu’elle sera prête.',
    'update.found': 'Une nouvelle version est prête. Fermez ce panneau pour la recharger.',
    'update.unreachable': 'Le serveur est injoignable. Vous êtes peut-être hors ligne.',

    'action.share': 'Partager',
    'share.heading': 'Partager ce plan',
    'share.note': 'Le plan entier tient dans ce lien\u00a0: chaque stratégie, chaque montant, l’horizon et les hypothèses. Il voyage dans la partie d’une adresse qu’un navigateur n’envoie jamais à un serveur, donc il ne va que là où vous le collez — et quiconque l’a, a le plan.',
    'share.link': 'Un lien qui porte ce plan',
    'share.copy': 'Copier le lien',
    'share.copied': 'Copié.',
    'share.copyYourself': 'Copiez-le depuis le champ ci-dessus.',
    'share.close': 'Fermer le partage',
    'share.received': 'Un plan vous a été partagé',
    'share.receivedWhat': (plans, fields, horizon) =>
      `${plans} ${plural(plans, 'plan', 'plans')}, ${fields} ${plural(fields, 'poste', 'postes')}, sur ${horizon}.`,
    'share.receivedAsk': 'Vos propres plans, votre langue et votre thème ne changent pas. L’horizon et les hypothèses viennent du plan partagé, puisque tous les plans se lisent sur un seul horizon.',
    'share.receivedRoom': 'Ils seront ajoutés à côté des vôtres.',
    'share.receivedSome': (fitting, sent, most) =>
      `L’application ne peut en représenter que ${most}, donc ${plural(fitting, `le premier des ${sent} sera ajouté`, `les ${fitting} premiers sur ${sent} seront ajoutés`)} à côté des vôtres.`,
    'share.receivedNoRoom': (most) =>
      `Vous avez déjà ${most} plans, le maximum que l’application peut représenter. Ouvrir ceux-ci remplacera les vôtres : annuler peut les rétablir tant que cet onglet reste ouvert, mais pas après.`,
    'share.receivedYes': 'Ajouter à mes plans',
    'share.receivedReplace': 'Remplacer mes plans',
    'share.receivedNo': 'Garder les miens',
    'share.brokenHeading': 'Ce lien ne portait pas de plan',
    'share.broken': 'Il a peut-être été tronqué en chemin, ou écrit par une version plus récente de l’application. Rien n’a changé sur cet appareil.',
    'share.brokenClose': 'Fermer',
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

/** True when `key` is a phrase the dictionary itself carries — not one it
 *  inherits. `in` and a bare index both walk the prototype chain, so a key of
 *  `hasOwnProperty` or `constructor` would resolve to a function on
 *  Object.prototype, and `t` would call it. A field's `labelKey` arrives from
 *  a share link, so that key is whatever somebody put in the link. */
const carries = (dictionary, key) => Object.prototype.hasOwnProperty.call(dictionary, key);

/** A lookup bound to one language, falling back to English then to the key. */
export function makeTranslator(language) {
  const dictionary = STRINGS[language] || STRINGS.en;
  return function t(key, ...params) {
    const entry = carries(dictionary, key) ? dictionary[key]
      : (carries(STRINGS.en, key) ? STRINGS.en[key] : undefined);
    if (entry === undefined) return key;
    return typeof entry === 'function' ? entry(...params) : entry;
  };
}

export { STRINGS };
