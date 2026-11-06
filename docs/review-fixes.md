# Corrections de la revue du 6 novembre 2026

Base : `c6b1c27f57e158668238484eaef0302a448c58aa` de `main`.
Travail sur `dev`, génération de cache `v66`.

## Défauts corrigés

| # | Défaut | Correction et vérification |
| --- | --- | --- |
| 1 | Modifier un poste partagé d’un modèle ajoutait un doublon dans les autres stratégies. | Les modèles construisent leurs postes communs une seule fois et conservent leurs identifiants. La migration relie les anciens postes identiques sans modifier les montants enregistrés. Test de modification et de suppression sur les deux modèles. |
| 2 | Quitter le nom d’un objectif effaçait son montant. | La validation ne normalise que les propriétés réellement présentes dans la commande. Test de conservation du montant et contrôle dans le navigateur. |
| 3 | Le partage perdait les noms et identifiants des objectifs, cassant les dates conditionnelles. | Le format v2 transporte les objectifs et encode les références par indice. Des identifiants neufs sont attribués à la réception. Test d’égalité des projections avant/après partage avec début, fin et vente conditionnels. |
| 4 | Le solveur ignorait un achat absent du scénario central mais déclenché par sa réponse. | Chaque essai repart des postes d’origine et résout ses propres dates. Les plans conditionnels donnent un exemple vérifié, sans promettre une borne générale. Le cas reproduit donne 292/mois et un solde de 2 004 après l’achat de 1 500. |
| 5 | Un changement provenant d’un autre onglet pouvait être ignoré puis écrasé. | Les changements différés sont relus après la saisie. Les écritures sont sérialisées par Web Locks et comparent la révision attendue. Une version périmée produit un conflit visible et conserve son brouillon. Test de concurrence et contrôle sur deux onglets. |
| 6 | Un échec entre les écritures du projet et de la liste pouvait perdre un projet. | Une seule écriture atomique contient tout l’espace de travail ; les anciennes clés sont des copies de compatibilité. L’identifiant du projet actif est conservé à la lecture. Tests avec échec injecté à chacune des trois écritures. |
| 7 | Supprimer un objectif ou ajouter un plan partagé pouvait laisser des références orphelines. | La suppression d’un objectif utilisé est bloquée et expliquée. L’ajout d’un partage fusionne et réattribue les objectifs ; les références manquantes d’un ancien stockage restent visibles pour être réparées. Tests des dépendances et de la limite de six objectifs. |
| 8 | La fourchette de rendement omettait les opérations déclenchées seulement dans un scénario alternatif. | Chaque scénario commence par les postes d’origine. Test où la hausse du rendement déclenche une dépense absente du scénario central. |
| 9 | `3,125` saisi comme taux était interprété comme 3 125 %. | Les taux utilisent une lecture décimale distincte des séparateurs de milliers des montants. Tests des virgules et des taux à trois décimales. |
| 10 | Les libellés de taux masquaient les valeurs négatives et tronquaient les virgules. | Le formatage utilise le même lecteur de taux que le modèle et conserve le signe. Tests français et anglais ; contrôle de `3,125 %` dans le formulaire. |
| 11 | Une location de 48 mois comptait un premier loyer et 48 loyers ordinaires. | Les loyers ordinaires commencent au mois 2 : un premier loyer, puis 47 loyers. Les totaux attendus du modèle ont été corrigés. |
| 12 | Un taux de prêt positif proche de zéro pouvait donner une mensualité infinie. | L’annuité utilise `log1p` et `expm1`, avec une limite finie au voisinage de zéro. Tests à zéro et sur plusieurs taux positifs très faibles. |

## Organisation du code

- `numbers.js` : lecture des entrées et limites numériques communes.
- `state.js` : état initial, migrations et forme d’un instantané.
- `store.js` : sauvegarde atomique, conflits et brouillons récupérables.
- `scenarios.js` : postes d’origine, résolution des dates, puis projection.
- `plan-operations.js` : dépendances des objectifs et fusion d’un partage.
- `field-labels.js` : descriptions de postes, sans mutation de l’état.
- `app.js` : composition des vues et traitement des commandes.

Le README et le guide de contribution décrivent ces responsabilités, le contrat
de stockage et les conventions financières. La CI utilise des permissions en
lecture et des versions d’actions fixées par identifiant de commit.

## Précautions de migration et limites explicites

Les anciens liens v1 sans référence conditionnelle restent lisibles. Les liens
v1 qui ont perdu les identifiants nécessaires sont refusés : il n’existe pas
de reconstruction fiable de leurs objectifs. Un nouveau lien doit être produit
depuis le plan d’origine.

La réparation des identifiants des anciens modèles ne supprime pas des lignes
déjà enregistrées et ne choisit pas entre deux montants différents. Des doublons
historiques doivent être vérifiés par leur propriétaire avant suppression.

Une sauvegarde locale peut être exportée depuis À propos. Les brouillons sont
écrits avant l’attente d’une sauvegarde ; deux documents ont des clés distinctes,
même lorsque le navigateur duplique leur `sessionStorage`. Si le stockage ou
Web Locks sont indisponibles, l’application signale la limitation et permet
l’export. Effacer les données du navigateur efface aussi ces brouillons.

Le modèle reste déterministe. Les intervalles de rendement ne sont pas des
probabilités. La trésorerie et le patrimoine restent avant impôt sur les
placements ; seul le gain net applique le taux saisi. Cette convention est
désormais indiquée dans l’interface.

## Validation

`npm test` couvre les calculs existants, les régressions de la revue, les échecs
de stockage et le cache hors ligne. Les contrôles manuels dans le navigateur
portent sur le changement de projet, les postes partagés, le renommage d’un
objectif, les taux décimaux, les conflits entre onglets, l’export, le chargement
de la version enregistrée et le solveur avec achat conditionnel.

Le service worker précache tous les modules d’une génération. Des tests
vérifient qu’un échec de lecture ou d’écriture du cache ne masque pas une
réponse réseau valide et qu’une génération déjà en cache fonctionne hors ligne.
