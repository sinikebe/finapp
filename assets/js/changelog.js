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
    version: 'v65', date: '2026-09-11',
    en: 'A new device now opens with three projects rather than one: the worked example you always landed on, and behind it both templates, already built and named. They are loaded rather than merely offered because the line that offered them sits inside a sheet, behind a control that is easy to miss — and a template nobody finds is a template that is not there. Pressing a name is now the whole of it. A device with anything on it keeps exactly what it had: the templates are never added to a shelf somebody has already arranged. Starting again returns you to the same three, and taking that back removes them again along with restoring your own.',
    fr: 'Un nouvel appareil s’ouvre désormais sur trois projets et non un seul : l’exemple travaillé sur lequel on a toujours atterri, et derrière lui les deux modèles, déjà construits et nommés. Ils sont chargés plutôt que simplement proposés, car la ligne qui les proposait se trouve dans une feuille, derrière une commande facile à manquer — et un modèle que personne ne trouve est un modèle qui n’existe pas. Il suffit maintenant d’appuyer sur un nom. Un appareil qui porte déjà quelque chose garde exactement ce qu’il avait : les modèles ne sont jamais ajoutés à une liste que quelqu’un a déjà organisée. Tout recommencer ramène aux mêmes trois projets, et annuler cette action les retire de nouveau en même temps qu’elle rétablit les vôtres.',
  },
  {
    version: 'v64', date: '2026-09-11', commit: '38c16b5',
    en: 'Two small corrections, both on a phone. The button that removes a project was 34 pixels wide under a thumb where the rest of the app promises 44 — it was the right height, so nothing on screen or in the stylesheet admitted it was wrong. And a dialog now gives back the same padding a panel does on a screen under 380 pixels wide, which on the narrowest phone is a whole line back in the first template\'s description in French. The note for the previous release also said both templates now fit without scrolling. They do not — the sheet still scrolls, and a third template will not fit there either — so it now says what actually changed: both buttons stand inside the sheet, and the line above them says how many there are.',
    fr: 'Deux petites corrections, au téléphone toutes les deux. Le bouton qui supprime un projet faisait 34 pixels de large sous le pouce, là où le reste de l’application en promet 44 ; il avait la bonne hauteur, si bien que rien à l’écran ni dans la feuille de style ne le signalait. Et une boîte de dialogue rend désormais la même marge intérieure qu’un panneau sur un écran de moins de 380 pixels, ce qui, sur le téléphone le plus étroit, rend une ligne entière à la description du premier modèle. La note de la version précédente affirmait aussi que les deux modèles tenaient désormais sans défiler. C’est faux — la feuille défile toujours, et un troisième modèle n’y tiendra pas davantage — elle dit maintenant ce qui a réellement changé : les deux boutons tiennent dans la feuille, et la ligne au-dessus dit combien il y en a.',
  },
  {
    version: 'v63', date: '2026-09-11', commit: '8fde104',
    en: 'A second template: the same car over four years, paid for four ways — outright, on a loan, on a lease with an option to buy, and on a long lease. It carries the three costs that get left out of the comparison people actually make: the registration, which only the two that buy it pay; the servicing, which a long lease bundles into its monthly and a lease with an option leaves to you; and the bill for handing a leased car back, which is commonly a thousand euros and is nobody’s headline figure. Read on a published French comparison of a 25,000 € car, the two lease totals come out at 18,360 and 19,300 exactly. Buying beats leasing over four years, and — the part worth seeing — the lease with an option costs more than the long one, because it pays for its own servicing. With two templates to choose between, the sheet that offers them says how many there are and says once — above both, rather than at the end of each — that their figures are examples. On the narrowest phone the second one had been below the fold with nothing on screen admitting it; both buttons now stand inside the sheet’s visible box, in both languages. The sheet itself still scrolls — two notes of that length do not fit on a 320px phone and a third will not either — but what a reader sees is a list of two rather than an offer of one.',
    fr: 'Un deuxième modèle : la même voiture sur quatre ans, payée de quatre façons — comptant, à crédit, en LOA et en LLD. Il porte les trois postes qui manquent à la comparaison qu’on fait vraiment : la carte grise, que seuls les deux qui l’achètent paient ; l’entretien, que la LLD intègre à son loyer et que la LOA laisse à votre charge ; et les frais de restitution, souvent mille euros, qui ne figurent sur aucune publicité. Rapportés à une comparaison française publiée pour une voiture à 25 000 €, les deux totaux de location tombent à 18 360 et 19 300 exactement. Acheter revient moins cher que louer sur quatre ans et — c’est ce qui mérite d’être vu — la LOA coûte plus que la LLD, parce qu’elle paie son propre entretien. Avec deux modèles à choisir, la feuille qui les propose dit combien il y en a, et dit une seule fois — au-dessus des deux plutôt qu’à la fin de chacun — que leurs chiffres sont des exemples. Sur le téléphone le plus étroit, le second passait sous la ligne de flottaison sans que rien ne le signale ; les deux boutons tiennent désormais dans la partie visible de la feuille, dans les deux langues. La feuille, elle, défile toujours — deux notices de cette longueur ne tiennent pas sur un écran de 320 px, et un troisième modèle n’y tiendra pas davantage — mais ce qu’on voit est une liste de deux et non une proposition unique.',
  },
  {
    version: 'v62', date: '2026-09-11', commit: '2c132a9',
    en: 'Everything on the page is now set in one of nine sizes and spaced by one of eleven distances, where before there were thirteen sizes — six of them half a pixel from another — and distances picked one rule at a time. Nothing grew: every size that moved moved down, by half a pixel or one, so the page reads a little tighter and a good deal more of a piece. A 390px phone now fits the summary tile labels on one line where one of them used to wrap, which is 20 pixels of screen back. Section headings lose the pixel that separated them from the writing underneath and keep the weight that was doing the work anyway, and the panels give back two pixels of padding all round. None of it changes what a figure says, what fits on a screen, or where the layout changes shape: measured at ten widths in both languages, every card count and column width is exactly where it was, and the page came out between 23 and 112 pixels shorter.',
    fr: 'Tout ce qui est sur la page est désormais composé dans l’une de neuf tailles et espacé par l’une de onze distances, là où il y avait treize tailles — six d’entre elles à un demi-pixel d’une autre — et des distances choisies règle par règle. Rien n’a grossi : chaque taille qui a bougé a baissé, d’un demi-pixel ou d’un pixel, si bien que la page se lit un peu plus serrée et bien plus d’un seul tenant. Un téléphone de 390 px range maintenant les intitulés des tuiles de synthèse sur une seule ligne, là où l’un d’eux passait à la ligne : vingt pixels d’écran rendus. Les titres de section perdent le pixel qui les séparait du texte en dessous et gardent la graisse qui faisait déjà le travail, et les panneaux rendent deux pixels de marge intérieure sur tout le pourtour. Rien de tout cela ne change ce que dit un chiffre, ce qui tient à l’écran, ni l’endroit où la mise en page change de forme : mesuré à dix largeurs dans les deux langues, chaque nombre de cartes et chaque largeur de colonne est là où elle était, et la page est ressortie de 23 à 112 pixels plus courte.',
  },
  {
    version: 'v61', date: '2026-09-11', commit: 'a6a842f',
    en: 'A project can now start with its figures already in it. “Start another project” still gives you a blank one in a single press; underneath it there is now a template, and the template is the housing question with both sides of it in the same comparison: buy the flat and live in it, or buy the same flat, let it out and rent somewhere smaller yourself. Three of its four plans let it out and differ only in the tax regime, so the sheet answers two questions at once. It arrives with the rows people forget — the notary, the works a poor energy rating forces, the furniture, the fortnight a year empty, the agent, the guarantee, the insurance a landlord needs and the one an occupier needs — and with the row that makes the sum honest at all: the rent a landlord pays to live somewhere else. Every figure is a round example, said to be one before you press, and there to be typed over.',
    fr: 'Un projet peut désormais arriver avec ses chiffres déjà dedans. « Démarrer un autre projet » donne toujours un projet vierge en une pression ; en dessous se trouve maintenant un modèle, et ce modèle est la question du logement avec ses deux faces dans la même comparaison : acheter et y habiter, ou acheter le même bien, le louer et se loger plus petit ailleurs. Trois de ses quatre plans louent et ne diffèrent que par le régime fiscal, si bien que la feuille répond à deux questions à la fois. Il arrive avec les postes qu’on oublie : le notaire, les travaux qu’impose une mauvaise étiquette énergie, l’ameublement, les quinze jours de vacance par an, la gestion, la garantie, l’assurance du bailleur et celle de l’occupant ; et avec le poste sans lequel le calcul est faux : le loyer que le bailleur paie pour se loger ailleurs. Chaque chiffre est un exemple arrondi, annoncé comme tel avant qu’on appuie, et fait pour être remplacé.',
  },
  {
    version: 'v60', date: '2026-09-09', commit: '2d74cd9',
    en: 'Plans now belong to a project, and a comparison only ever holds one project’s plans. Comparing how to buy a home against whether to lease a car compared nothing, and there was no way to keep both on the device without putting them on the same axes. A project carries its own plans, its own horizon and its own targets, because a five-year car decision and a twenty-five-year mortgage cannot be read over one length and a housing deposit means nothing to a car; how money behaves — inflation, tax, the range, today’s money — stays shared, because that is a belief about the world rather than about the question. The form’s heading is the project and opens the list; a link carries the project you are looking at and can be opened as one of its own. Undo knows which project each step belongs to, so changing subject hides the way back rather than throwing it away, and taking a removal back never reverts work done in another project. Everything already on the device becomes one project, exactly as it was.',
    fr: 'Les plans appartiennent désormais à un projet, et une comparaison ne réunit jamais que les plans d’un seul. Comparer comment acheter un logement à la question de louer une voiture ne comparait rien, et rien ne permettait de garder les deux sur l’appareil sans les mettre sur les mêmes axes. Un projet porte ses plans, son horizon et ses objectifs, car une voiture à cinq ans et un crédit à vingt-cinq ne se lisent pas sur la même durée et un apport immobilier ne veut rien dire pour une voiture ; le comportement de l’argent — inflation, impôt, fourchette, monnaie d’aujourd’hui — reste commun, car c’est une conviction sur le monde et non sur la question. Le titre du formulaire est le projet et ouvre la liste ; un lien emporte le projet affiché et peut s’ouvrir comme un projet à part. L’annulation sait à quel projet appartient chaque étape : changer de sujet masque le retour en arrière au lieu de le supprimer, et annuler une suppression ne défait jamais le travail fait dans un autre projet. Tout ce qui était déjà sur l’appareil devient un projet, tel quel.',
  },
  {
    // The release being written has no commit yet — it is created by the merge
    // that publishes it. It is filled in with the next change, which is the one
    // place the hash is finally knowable. Only the newest entry may lack one.
    version: 'v59', date: '2026-09-07', commit: '37c7aef',
    en: 'The list of what moves the needle is worked out differently, and it was both slow and — on a plan with targets — wrong. It told you underneath that the swings add up to the cent, and that stopped being true the moment a swing was allowed to move a target’s month and drag everything waiting on it: measured on a plan renting until a deposit is saved, two swings came out 360 apart from the pair taken together. They are now measured on the plan as it stands, its months already settled, and they add up again. That is also thirteen times less arithmetic, and what is left is taken a few fields at a time instead of all at once — a large plan used to freeze the tab for the best part of a minute before it drew anything at all, and now it draws in under two seconds and works the ranking out behind the page.',
    fr: 'La liste de ce qui pèse le plus est calculée autrement\u00a0: elle était lente et, sur un plan avec objectifs, fausse. Elle affirmait en dessous que les écarts s’additionnent au centime près, ce qui cessait d’être vrai dès qu’un écart pouvait déplacer le mois d’un objectif et entraîner tout ce qui l’attend\u00a0: sur un plan où l’on loue jusqu’à constituer un apport, deux écarts tombaient à 360 du couple pris ensemble. Ils se mesurent désormais sur le plan tel qu’il est, ses mois déjà fixés, et ils s’additionnent de nouveau. C’est aussi treize fois moins de calcul, et le reste se fait par petits groupes de postes plutôt qu’en une seule fois\u00a0: un grand plan figeait l’onglet près d’une minute avant même de rien afficher, il s’affiche maintenant en moins de deux secondes et calcule le classement derrière la page.',
  },
  {
    version: 'v58', date: '2026-09-05', commit: '2331783',
    en: 'Three things the layout got wrong on the widest screens, all measured. With the comparison docked, five flow cards were forced onto one line at 276 pixels from 3,370 wide — under the 320 the app sets itself, every end label dropped — because that rule was worked out for a rail the tier before had already widened; they now go five across only where 320 is really there. On a laptop-height window with the money assumptions open, the fields could sit entirely under their own sticky head, out of reach; the assumptions now take under half the column and scroll past that. And folding a single plan’s form left a 48-pixel band above the app bar for a plan switcher that only exists with two plans. Nine comments and two documents that named a number or a file the code no longer matched are corrected.',
    fr: 'Trois erreurs de la mise en page sur les écrans les plus larges, toutes mesurées. Comparaison amarrée, cinq cartes de flux étaient forcées sur une ligne à 276 pixels dès 3\u202f370 de large — sous le plancher de 320 que l’application se fixe, toutes les étiquettes de fin perdues — parce que cette règle avait été calculée pour un rail que le palier précédent avait déjà élargi\u00a0; elles ne passent à cinq que là où 320 existe vraiment. Sur une fenêtre à hauteur d’ordinateur portable avec les hypothèses ouvertes, les postes pouvaient se retrouver entièrement sous leur propre en-tête fixe, hors d’atteinte\u00a0; les hypothèses prennent désormais moins de la moitié de la colonne et défilent au-delà. Et replier le formulaire d’un plan unique laissait une bande de 48 pixels au-dessus de la barre, pour un sélecteur de plan qui n’existe qu’à deux plans. Neuf commentaires et deux documents qui citaient un nombre ou un fichier que le code ne suivait plus sont corrigés.',
  },
  {
    version: 'v57', date: '2026-09-05', commit: 'bd8091d',
    en: 'A share link could name a field after a function the app’s dictionary inherits rather than holds, and opening it threw during the render — after the plan had already been saved, so the app threw again on every start with no rows and buttons that did nothing. A link could also give a field any paragraph of the app’s own copy as its name. Both doors are closed: a phrase is looked up only on the dictionary itself, and a name that arrives from a link is admitted only when it is one of the default names.',
    fr: 'Un lien de partage pouvait nommer un poste d’après une fonction que le dictionnaire de l’application hérite au lieu de la posséder, et l’ouvrir levait une erreur pendant le rendu — après que le plan avait déjà été enregistré, si bien que l’application échouait à chaque démarrage, sans aucune ligne et avec des boutons inertes. Un lien pouvait aussi donner à un poste n’importe quel paragraphe des textes de l’application en guise de nom. Les deux portes sont fermées\u00a0: une phrase n’est cherchée que dans le dictionnaire lui-même, et un nom venu d’un lien n’est admis que s’il s’agit d’un des noms par défaut.',
  },
  {
    version: 'v56', date: '2026-09-05', commit: '2ea7f8f',
    en: 'The summary used to answer "can I afford this?" with an average, and an average cannot show a trough. A plan could end 56,000 ahead, report a comfortable 1,555 a month kept, and still be 20,000 overdrawn at month twenty — with nothing on the page saying so. Now, if the money ever runs out, the summary says the month it does and how far under it goes, in place of the average. What you keep on average is still there, on its own tile. Plans that never go overdrawn read exactly as they did.',
    fr: 'Le résumé répondait à «\u00a0puis-je me le permettre\u00a0?\u00a0» par une moyenne, et une moyenne ne montre pas un creux. Un plan pouvait finir avec 56\u202f000 d’avance, annoncer 1\u202f555 gardés par mois, et rester à découvert de 20\u202f000 au vingtième mois — sans que rien ne le dise. Désormais, si l’argent vient à manquer, le résumé indique le mois où cela arrive et l’ampleur du découvert, à la place de la moyenne. Ce que vous gardez en moyenne reste affiché, sur sa propre tuile. Les plans qui ne sont jamais à découvert se lisent comme avant.',
  },
  {
    version: 'v55', date: '2026-09-04', commit: 'a82fcd7',
    en: 'The app used to stop at 1,400 pixels. On a wide monitor that was a quarter of the screen with the rest left empty, and the page was exactly as long at 5,120 pixels as at 1,440 — the width bought nothing. Now the comparison and the ranking dock to the right of the readings on a screen with room for them, the flow cards go four across instead of two, and the form itself finally comes out of the narrow layout it had been wearing on every screen ever since it was docked. A 5,120-pixel screen shows the whole plan in half the scrolling. Nothing below 1,440 has moved by a pixel.',
    fr: 'L’application s’arrêtait à 1\u202f400 pixels. Sur un écran large, cela faisait un quart de la surface et le reste vide, et la page était aussi longue en 5\u202f120 qu’en 1\u202f440\u00a0: la largeur n’apportait rien. Désormais la comparaison et le classement viennent s’amarrer à droite des résultats dès qu’il y a la place, les cartes de flux se rangent par quatre au lieu de deux, et le formulaire quitte enfin la mise en page étroite qu’il portait sur tous les écrans depuis qu’il est en colonne. Un écran de 5\u202f120 pixels montre tout le plan avec moitié moins de défilement. Rien en dessous de 1\u202f440 n’a bougé d’un pixel.',
  },
  {
    version: 'v54', date: '2026-09-03', commit: '6792b18',
    en: 'The settings that say how money behaves — today’s money, inflation, a range on returns, tax on gains — move out of the middle of the page into a panel of their own beside the form. They sit apart from it on purpose: they apply to every plan at once, which is what makes two plans worth comparing. They arrive folded, because each already has an answer, and the line above the charts says so the moment one of them does not. The paragraphs that explain a section rather than report anything now wait behind “How this works”, where the form’s own notes already were.',
    fr: 'Les réglages qui disent comment se comporte l’argent — monnaie d’aujourd’hui, inflation, fourchette sur les rendements, impôt sur les gains — quittent le milieu de la page pour un panneau à eux, à côté du formulaire. Ils en sont séparés à dessein : ils s’appliquent à tous les plans à la fois, et c’est ce qui rend deux plans comparables. Ils arrivent repliés, car chacun a déjà sa réponse, et la ligne au-dessus des graphiques le signale dès qu’un seul n’en a plus. Les paragraphes qui expliquent une section au lieu d’en rendre compte attendent désormais derrière « Comment ça marche », là où les notes du formulaire se trouvaient déjà.',
  },
  {
    version: 'v53', date: '2026-08-31', commit: 'b921e9c',
    en: 'The form that fills in a plan now sits beside the readings rather than above them, on a screen wide enough to hold both — a column on the left that folds away to a gutter when you want the whole width for the charts. A field is a name, an amount, and one line that says the rest: what kind it is, which way it goes, how often it lands, for how long, at what rate, and the months it runs between. The boxes stay folded until you open the row. The page is about a fifth shorter on a desktop and on a phone alike, and changing plan is still in reach with the form folded away.',
    fr: 'Le formulaire qui remplit un plan se place désormais à côté des résultats plutôt qu’au-dessus, sur un écran assez large pour les deux\u00a0: une colonne à gauche qui se replie en gouttière quand vous voulez toute la largeur pour les graphiques. Un poste, c’est un nom, un montant, et une ligne qui dit le reste\u00a0: sa nature, son sens, sa fréquence, sa durée, son taux, et les mois entre lesquels il court. Les cases restent repliées jusqu’à ce que vous ouvriez la ligne. La page est environ un cinquième plus courte, sur ordinateur comme au téléphone, et changer de plan reste à portée une fois le formulaire replié.',
  },
  {
    version: 'v52', date: '2026-08-31', commit: '61c85e7',
    en: 'Give a target a name and a field can wait on it — start in the month it is met, end there, or be sold there. "Buy it once the savings are there" is now something the plan says rather than a month you worked out yourself. Each target is read off the plan as it would run without the things waiting for it, so a purchase does not chase the savings it spends; a target nothing can ever meet leaves its field out and says so; and two targets that move each other are reported rather than guessed at.',
    fr: 'Nommez un objectif et un poste peut l’attendre\u00a0: commencer le mois où il est atteint, s’y arrêter, ou y être vendu. «\u00a0Acheter quand j’aurai de côté\u00a0» se dit désormais dans le plan au lieu d’être un mois que vous aviez calculé vous-même. Chaque objectif se lit sur le plan tel qu’il se déroulerait sans ce qui l’attend, si bien qu’un achat ne court pas après l’épargne qu’il dépense\u00a0; un objectif hors d’atteinte laisse son poste de côté et le dit\u00a0; et deux objectifs qui se déplacent mutuellement sont signalés plutôt que devinés.',
  },
  {
    version: 'v51', date: '2026-08-31', commit: '8b073f0',
    en: 'A target asked what it would take could answer one whole unit too high: twelve months of 1,000 is 12,000, and the app said 1,001. It now steps back onto the figure you can actually type and checks that one, so an answer that lands exactly on a whole figure is that figure. And an answer read out once is no longer read out again on every letter typed afterwards.',
    fr: 'Un objectif interrogé sur ce qu’il faudrait pouvait répondre une unité trop haut\u00a0: douze mois à 1\u202f000 font 12\u202f000, et l’application répondait 1\u202f001. Elle revient désormais sur le montant que vous pouvez réellement saisir et le vérifie, de sorte qu’une réponse tombant juste sur un montant entier est ce montant. Et une réponse déjà lue n’est plus relue à chaque lettre tapée ensuite.',
  },
  {
    version: 'v50', date: '2026-08-31', commit: '0c01b37',
    en: 'Five ways to ask more of a plan. The flow cards read a month at a time as well as cumulatively, so a month that costs more than it earns is visible instead of buried in a running total. A ranked list says which of your figures actually decide where the plan lands. A target says the month it is met and is marked on the cards; one that is never met can ask what it would take, and the answer is checked by running the plan again with it before it is shown. And Undo takes back a removed field, a removed plan, a removed target, Start again, or a shared plan opened over your own — for as long as the tab stays open.',
    fr: 'Cinq façons d’en demander plus à un plan. Les cartes de flux se lisent mois par mois autant qu’en cumulé, si bien qu’un mois qui coûte plus qu’il ne rapporte se voit au lieu de se perdre dans un total. Une liste classée dit lesquels de vos montants décident vraiment où le plan aboutit. Un objectif indique le mois où il est atteint et se marque sur les cartes\u00a0; celui qui ne l’est jamais peut demander ce qu’il faudrait, et la réponse est vérifiée en rejouant le plan avec elle avant d’être affichée. Enfin, Annuler rend un poste supprimé, un plan supprimé, un objectif supprimé, un Recommencer, ou un plan partagé ouvert par-dessus les vôtres — tant que l’onglet reste ouvert.',
  },
  {
    version: 'v49', date: '2026-08-29', commit: 'c151610',
    en: 'A shared plan is added beside your own now, rather than over them — comparing it against what you already have is the reason to open one. And every tab says where its plan came from: the worked example, one you made, one shared with you, and one shared with you that you have since changed.',
    fr: 'Un plan partagé s’ajoute désormais à côté des vôtres au lieu de les remplacer : le comparer à ce que vous avez déjà est la raison même de l’ouvrir. Et chaque onglet dit d’où vient son plan : l’exemple d’origine, un plan que vous avez créé, un plan partagé avec vous, et un plan partagé que vous avez modifié depuis.',
  },
  {
    version: 'v48', date: '2026-08-29', commit: 'ff67ddf',
    en: 'Share a plan by handing somebody a link. The whole configuration — every strategy, every figure, the horizon and the assumptions — rides inside the address, in the part a browser never sends to a server, so it goes only where you paste it. Opening one asks first, and leaves your language and theme alone.',
    fr: 'Partagez un plan en donnant un lien. La configuration entière — chaque stratégie, chaque montant, l’horizon et les hypothèses — voyage dans l’adresse, dans la partie qu’un navigateur n’envoie jamais à un serveur\u00a0: elle ne va donc que là où vous la collez. En ouvrir un demande confirmation, et ne touche ni à votre langue ni à votre thème.',
  },
  {
    version: 'v47', date: '2026-08-27', commit: '5a2212f',
    en: 'A pass over the app on a phone: every control is thumb-sized, the plans scroll sideways instead of stacking, a wide table keeps its names in view while the figures scroll, and nothing runs off the edge of a small screen.',
    fr: 'Une passe sur l’application au téléphone\u00a0: chaque commande est à la taille du pouce, les plans défilent latéralement au lieu de s’empiler, un tableau large garde ses noms en vue pendant que les chiffres défilent, et plus rien ne déborde d’un petit écran.',
  },
  {
    version: 'v46', date: '2026-08-27', commit: '9946d5f',
    en: 'French typography reaches the last three places it did not: the keyboard reading of the comparison chart, the installed app’s French description, and the French line of the README.',
    fr: 'La typographie française atteint les trois derniers endroits qui lui échappaient\u00a0: la lecture au clavier du graphique de comparaison, la description française de l’application installée, et la ligne française du README.',
  },
  {
    version: 'v45', date: '2026-08-27', commit: '905f9a1',
    en: 'A loan at 0% no longer advertises negative interest, an investment left at its blank rate gets the same range as one you typed a nought into, and a sale set before the purchase is straightened rather than quietly moving nothing.',
    fr: 'Un emprunt à 0\u00a0% n’affiche plus d’intérêts négatifs, un placement laissé à son taux vide obtient la même fourchette que celui où vous avez saisi un zéro, et une vente placée avant l’achat est redressée au lieu de ne rien faire en silence.',
  },
  {
    version: 'v44', date: '2026-08-27', commit: '5744407',
    en: 'Switching or removing a strategy, and backing out of Start again, leave the keyboard where you are rather than at the top of the page.',
    fr: 'Changer ou supprimer une stratégie, et renoncer à Recommencer, laissent le clavier là où vous êtes plutôt qu’en haut de la page.',
  },
  {
    version: 'v43', date: '2026-08-27', commit: 'cdd0118',
    en: 'The panels say where you are and what they mean: the comparison names the quantity it judged on and marks the plan on screen, a click inside the About panel keeps it open, the small print is readable, and a rate you type is the rate the arithmetic uses.',
    fr: 'Les panneaux disent où vous êtes et ce qu’ils veulent dire\u00a0: la comparaison nomme la grandeur qu’elle a jugée et marque le plan affiché, un clic dans le panneau À propos ne le ferme plus, les petits caractères sont lisibles, et un taux saisi est bien celui qu’utilise le calcul.',
  },
  {
    version: 'v42', date: '2026-08-27', commit: '411f8a1',
    en: 'The field list says what it means: each amount box announces what it is for that kind of field, a month box shows the month the projection will use, and the note under a climbing amount quotes a figure the field actually reaches.',
    fr: 'La liste des champs dit ce qu’elle veut dire\u00a0: chaque montant s’annonce selon le type de champ, une case de mois affiche le mois que la projection utilisera, et la note sous un montant qui augmente cite un chiffre que le champ atteint vraiment.',
  },
  {
    version: 'v41', date: '2026-08-27', commit: '6de0d39',
    en: 'Figures are read the way you write them: 12,50 typed in French is twelve and a half, not twelve hundred and fifty, and 1,234 is still one thousand.',
    fr: 'Les montants sont lus tels que vous les écrivez\u00a0: 12,50 vaut douze et demi, et non mille deux cent cinquante, et 1,234 reste bien mille.',
  },
  {
    version: 'v40', date: '2026-08-27', commit: '2318e53',
    en: 'A card whose table you opened stays open through an edit and through a change of language; an investment that never starts no longer draws an empty card; and the range columns line up with the figures they name.',
    fr: 'Une carte dont vous avez ouvert le tableau le garde ouvert malgré une modification ou un changement de langue\u00a0; un placement qui ne démarre jamais ne dessine plus de carte vide\u00a0; et les colonnes de la fourchette s’alignent sur les chiffres qu’elles nomment.',
  },
  {
    version: 'v39', date: '2026-08-27', commit: '20b39f8',
    en: 'The flow diagram no longer credits a salary with money that came from selling a holding: what a sale brought in is its own strand, named Cashed in.',
    fr: 'Le diagramme de flux ne crédite plus un salaire de l’argent venu de la vente d’un placement\u00a0: ce qu’une vente a rapporté forme son propre flux, nommé Encaissé.',
  },
  {
    version: 'v38', date: '2026-08-26', commit: 'e945397',
    en: 'Documentation put back in step with the code, and the About panel can no longer leak into the page on a browser without dialog support.',
    fr: 'La documentation remise en accord avec le code, et le panneau À propos ne peut plus apparaître dans la page sur un navigateur sans prise en charge de dialog.',
  },
  {
    version: 'v37', date: '2026-08-26', commit: '3f5c178',
    en: 'A Check for updates button in the About panel, an hourly look whenever you open the app, and a Reload button that works in every open tab rather than only the one that clicked it.',
    fr: 'Un bouton Rechercher une mise à jour dans le panneau À propos, une vérification horaire à chaque ouverture, et un bouton Recharger qui fonctionne dans tous les onglets ouverts, et non dans le seul qui l’a cliqué.',
  },
  {
    version: 'v36', date: '2026-08-26', commit: '4aec87f',
    en: 'Syncing a field nobody has named no longer writes over an unrelated blank row in the other plans: it finds the copy of itself that adding a strategy made, or it is added.',
    fr: 'Synchroniser un champ sans nom n’écrase plus une ligne vierge sans rapport dans les autres plans\u00a0: il retrouve la copie de lui-même qu’a créée l’ajout d’une stratégie, ou vient s’ajouter.',
  },
  {
    version: 'v35', date: '2026-08-26', commit: 'c837fbb',
    en: 'Start again: a button in the About panel that puts back the three plans the app opens with, once you have confirmed it.',
    fr: 'Recommencer\u00a0: un bouton du panneau À propos qui rétablit les trois plans d’origine, après confirmation.',
  },
  {
    version: 'v34', date: '2026-08-26', commit: '6016219',
    en: 'Housing money goes back into the fund once the house is paid for, in every plan — over forty years the renters overtake the borrower.',
    fr: 'L’argent du logement retourne au fonds une fois la maison payée, dans chaque plan\u00a0: sur quarante ans, les locataires dépassent l’emprunteur.',
  },
  {
    version: 'v33', date: '2026-08-26', commit: '35e29fc',
    en: 'The app opens on one question asked three ways — how to buy a house — and a thing you own can be acquired, an investment cashed in.',
    fr: 'L’application s’ouvre sur une question posée de trois façons — comment acheter une maison — et un bien s’acquiert, un placement se vend.',
  },
  {
    version: 'v32', date: '2026-08-26', commit: '5901a7b',
    en: 'The About panel names the branch a build is published from, rather than the working branch it was written on.',
    fr: 'Le panneau À propos indique la branche de publication d’une version, et non la branche de travail.',
  },
  {
    version: 'v31', date: '2026-08-26', commit: 'f484508',
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
