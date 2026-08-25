/**
 * changelog.js — what changed, release by release, newest first.
 *
 * Each entry carries the commit the release was merged as, which — unlike the
 * running build's own hash — is knowable and exact, because it is history.
 * `version` is the cache generation the service worker served for it, so a
 * reader can match what the About panel says they are running against the line
 * that describes it.
 *
 * Both languages sit side by side rather than in `i18n.js`: a changelog grows
 * one entry per release and the two readings of an entry are written together,
 * so keeping them apart would only make them drift. A test holds both to the
 * same rules the dictionary is held to.
 */

export const RELEASES = Object.freeze([
  {
    // The release being written has no commit yet — it is created by the merge
    // that publishes it. It is filled in with the next change, which is the one
    // place the hash is finally knowable. Only the newest entry may lack one.
    version: 'v32', date: '2026-08-25',
    en: 'The About panel names the branch a build is published from, rather than the working branch it was written on.',
    fr: 'Le panneau À propos indique la branche de publication d’une version, et non la branche de travail.',
  },
  {
    version: 'v31', date: '2026-08-25', commit: 'f484508',
    en: 'An About panel: the version being served, the commit it was built from, and what every release changed.',
    fr: 'Un panneau À propos\u00a0: la version servie, le commit d’origine, et ce qu’a changé chaque version.',
  },
  {
    version: 'v30', date: '2026-08-25', commit: '6ea9643',
    en: 'A loan leaves the flow diagram as three strands — principal, fees and interest — instead of one.',
    fr: 'Un prêt quitte le diagramme de flux en trois rubans — capital, frais et intérêts — au lieu d’un seul.',
  },
  {
    version: 'v29', date: '2026-08-25', commit: '2208c76',
    en: 'The projection runs to fifty years instead of ten, and a loan is clear the month its last payment lands.',
    fr: 'La projection va jusqu’à cinquante ans au lieu de dix, et un prêt est soldé le mois de sa dernière mensualité.',
  },
  {
    version: 'v28', date: '2026-08-25', commit: '968f226',
    en: 'A loan’s row says the interest is added to what you asked for, and names the total repaid.',
    fr: 'La ligne d’un prêt indique que les intérêts s’ajoutent au montant demandé, et donne le total remboursé.',
  },
  {
    version: 'v27', date: '2026-08-25', commit: 'abaf9f6',
    en: 'A loan asks for the amount you need, with the lender’s fees entered beside it and lent along with it.',
    fr: 'Un prêt demande le montant dont vous avez besoin, les frais du prêteur se saisissant à côté et s’empruntant avec.',
  },
  {
    version: 'v26', date: '2026-08-25', commit: 'be1306f',
    en: 'The strategy switch pins itself to the top of the window once the one in the form scrolls away.',
    fr: 'Le sélecteur de stratégie se fixe en haut de la fenêtre dès que celui du formulaire disparaît.',
  },
  {
    version: 'v25', date: '2026-08-25', commit: '652c8e2',
    en: 'The flow table says which way the money went in words, and a reading can be dismissed on a phone.',
    fr: 'Le tableau des flux indique le sens de l’argent en toutes lettres, et une lecture se referme sur téléphone.',
  },
  {
    version: 'v23', date: '2026-08-25', commit: 'fa1bba6',
    en: 'The flow diagram draws both columns to one scale and gives every figure a single share.',
    fr: 'Le diagramme de flux dessine les deux colonnes à la même échelle et ne donne qu’une part à chaque montant.',
  },
  {
    version: 'v22', date: '2026-08-25', commit: '10cfbe6',
    en: 'A flow diagram: everything that comes in, pooled, and where it ends up.',
    fr: 'Un diagramme de flux : tout ce qui entre, mis en commun, et où cela finit.',
  },
  {
    version: 'v21', date: '2026-08-25', commit: 'eec203c',
    en: 'An amount can climb by a rate each year — a salary that rises, a rent indexed to prices.',
    fr: 'Un montant peut augmenter d’un taux par an — un salaire qui monte, un loyer indexé.',
  },
  {
    version: 'v20', date: '2026-08-25', commit: '59b9a32',
    en: 'Every field has a window — from month, to month — and a one-off has a month of its own.',
    fr: 'Chaque ligne a une fenêtre — du mois, au mois — et un achat unique a son propre mois.',
  },
  {
    version: 'v19', date: '2026-08-25', commit: '9785615',
    en: 'Strategies can share a field, so a comparison varies only what you meant to vary.',
    fr: 'Les stratégies peuvent partager une ligne, pour ne comparer que ce que vous vouliez faire varier.',
  },
  {
    version: 'v18', date: '2026-08-25', commit: 'b452ac7',
    en: 'What an investment paid in, what it became, and the net profit after tax.',
    fr: 'Ce qu’un placement a reçu, ce qu’il est devenu, et le gain net après impôt.',
  },
  {
    version: 'v17', date: '2026-08-25', commit: 'bc1ea82',
    en: 'A balance sheet behind the total, figures in today’s money, and a range instead of one line.',
    fr: 'Un bilan derrière le total, des montants en monnaie d’aujourd’hui, et une fourchette au lieu d’une courbe.',
  },
  {
    version: 'v16', date: '2026-08-24', commit: '548949e',
    en: 'The total: the cash kept plus what the investments are worth.',
    fr: 'Le total : l’argent conservé plus la valeur des placements.',
  },
  {
    version: 'v15', date: '2026-08-24', commit: '8dc0de8',
    en: 'Several strategies side by side, on one horizon and one scale.',
    fr: 'Plusieurs stratégies côte à côte, sur un même horizon et une même échelle.',
  },
  {
    version: 'v14', date: '2026-08-24', commit: '28413d5',
    en: 'Loans and investments as kinds of field, each with its own balance.',
    fr: 'Prêts et placements comme types de ligne, chacun avec son propre solde.',
  },
  {
    version: 'v13', date: '2026-08-24', commit: '106dccc',
    en: 'Each amount sets how often it lands, so a yearly bill is entered as itself.',
    fr: 'Chaque montant choisit sa fréquence, pour saisir une facture annuelle telle quelle.',
  },
  {
    version: 'v12', date: '2026-08-24', commit: '4105652',
    en: 'The first release: cumulative income, expenses and net, offline and in two languages.',
    fr: 'Première version : revenus, dépenses et net cumulés, hors ligne et en deux langues.',
  },
]);
