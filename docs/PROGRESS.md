# PROGRESS — Suivi des marchés publics (PRMP, version locale)

> Mémoire du projet. À lire EN PREMIER à chaque reprise de conversation.
> Dernière mise à jour : 2026-10-15 (Phase 5 livrée, en attente de validation)

## Phase courante

**Phase 5 — Procédures de passation et suivi des étapes** (code terminé, EN ATTENTE de validation par l'utilisateur)

## Contexte en bref

Application de bureau Windows 10 (64 bits), locale, pour la PRMP du ministère de l'Environnement à Fianarantsoa.
Un seul utilisateur (la PRMP), 3 régions, un mot de passe par région, cloisonnement strict des données.
Pile : Electron + React + TypeScript (Vite) + SQLite chiffré (better-sqlite3-multiple-ciphers), un fichier par région.
Développement sous Linux ; cible Windows 10.

## Statut des phases

| #   | Phase                                                                 | Statut                   |
| --- | --------------------------------------------------------------------- | ------------------------ |
| 0   | Cadrage et documentation initiale                                     | TERMINÉ                  |
| 1   | Initialisation du projet (Electron + React + TS, lint, tests)         | TERMINÉ                  |
| 2   | Domaine et base de données (entités, schéma, migrations, dépôts)      | TERMINÉ                  |
| 3   | Régions et authentification (mots de passe, base chiffrée, isolation) | TERMINÉ                  |
| 4   | Plan de passation (PPM)                                               | TERMINÉ                  |
| 4b  | Nom de la PRMP au premier lancement + refonte de l'interface          | TERMINÉ                  |
| 5   | Procédures de passation et suivi des étapes                           | EN ATTENTE DE VALIDATION |
| 6   | Candidats / soumissionnaires                                          | À FAIRE                  |
| 7   | Contrats et exécution (OS, réceptions, avenants, clôture)             | À FAIRE                  |
| 8   | Documents joints                                                      | À FAIRE                  |
| 9   | Alertes d'échéances                                                   | À FAIRE                  |
| 10  | Tableau de bord                                                       | À FAIRE                  |
| 11  | États imprimables (PDF / Excel)                                       | À FAIRE                  |
| 12  | Gestion des mots de passe des régions, sauvegarde et restauration     | À FAIRE                  |
| 13  | Durcissement sécurité, tests de bout en bout, installateur Windows    | À FAIRE                  |
| 14  | Guide utilisateur final et recette                                    | À FAIRE                  |

## Journal

- 2026-10-03 — Phase 0 : création de docs/, questions Q1 à Q5 posées, réponses consignées dans DECISIONS.md. Terminée.
- 2026-10-03 — Phase 1 : squelette Electron + React + TS (electron-vite), alias, ESLint avec règles d'architecture, Prettier, Vitest, CSP, sécurité Electron, canal IPC typé de démonstration.
- 2026-10-03 — Phase 1 : défaut corrigé au build : le preload sandboxé chargeait zod. Contrat IPC scindé en 3 fichiers (ADR-006).
- 2026-10-04 — Phase 1 : chez l'utilisateur, `npm run dev` échouait (« Electron uninstall ») : Electron 44 ne télécharge plus son binaire. Correctif `postinstall` (ADR-009) ; `npx install-electron` n'existait pas chez lui. Après `npm install`, la fenêtre s'ouvre (confirmé par l'utilisateur). Phase 1 terminée.
- 2026-10-04 — Documentation : plusieurs mises à jour de docs/ faites pendant la Phase 1 ne s'étaient pas appliquées (Prettier avait reformaté les fichiers avant mes remplacements automatiques) : DECISIONS.md ne contenait ni les ADR-005 à 009 ni les réponses Q1 à Q5, et le tableau des phases était périmé. Les quatre fichiers ont été réécrits en entier et vérifiés.
- 2026-10-04 — Phase 2 : domaine (Ariary, IsoDate, PPM, procédure, candidat, contrat, ports de dépôts), infrastructure SQLite (ouverture chiffrée, migrateur, migration 001, 4 dépôts), 58 tests. Module SQLite vérifié sous Node 22 (tests) et sous Electron 44 (`npm run smoke:sqlite`) : binaires N-API précompilés, pas de recompilation (ADR-010). Contrôle par mutation : 2 régressions volontaires détectées (une première version du test d'offre retenue ne détectait pas la seconde ; test renforcé).
- 2026-10-04 — Phase 2 : vérifié sous Linux : typecheck, lint, format, 58 tests, build de production, smoke SQLite sous Electron. NON vérifié : exécution sur Windows 10.

- 2026-10-04 — Intégration git : ajout de `.gitattributes` (fins de ligne LF, développement Linux et cible Windows) et de `docs/GIT_WORKFLOW.md` (une branche par phase, synchronisation des zips avec suppression des fichiers retirés, étiquette par phase).

- 2026-10-05 — Phase 2 considérée terminée (l'utilisateur a demandé de continuer). Choix de livraison : zip complet à chaque phase, pas de `.patch`.
- 2026-10-05 — Phase 3 : implémentation des régions et de l'authentification (voir ADR-015 à 020) : modèle de région, chiffrement par enveloppe, registre `regions.json`, une base chiffrée par région, session unique, limiteur d'essais, écrans (création, clé de récupération, connexion, région ouverte), IPC sous forme d'`ApiResult`.
- 2026-10-05 — Phase 3 : INCIDENT de reprise. À la reprise de session, le dossier contenait déjà une implémentation complète de la Phase 3 écrite la veille (avec tests et script de bout en bout), dont je n'avais plus le détail ; j'ai écrit par erreur une seconde implémentation en parallèle, qui a écrasé `src/domain/region.ts` et trois cas d'utilisation (`create-region`, `list-regions`, `open-region`). Réparation : mes doublons supprimés ; les pièces écrasées reconstruites à partir des tests existants (qui servent de spécification) et d'une copie de sauvegarde de `create-region.ts`. Contrôle : les 130 tests, dont ceux de la veille (isolation sur vrais fichiers chiffrés, écrans), et le test de bout en bout passent. Leçon : à chaque reprise, lister l'état réel du dossier (`git status`, dates des fichiers) AVANT d'écrire.
- 2026-10-05 — Phase 3 : vérifié sous Linux : typecheck, lint, format, 130 tests, build, smoke SQLite sous Electron, `npm run e2e` (17/17 sur la vraie application sous écran virtuel). NON vérifié : exécution sur Windows 10.
- 2026-10-05 — Phase 3 : relecture avant livraison : le dossier de données dépendait du nom du produit (risque de « perdre » les régions lors d'un renommage) ; nom fixé `prmp-suivi-marches` (ADR-021). Sections 1, 2 et 5 d'ARCHITECTURE.md encore rédigées « avant la Phase 3 » : corrigées et relues. Un premier script de correction avait échoué en silence à mi-parcours (chaîne introuvable) : toutes les modifications ont été revérifiées une par une par `grep`.
- 2026-10-06 — Phase 3 : retour de l'utilisateur après `npm test` : 4 tests d'intégration en dépassement de délai (5 s) ; tests de base chiffrée à 14 s chez lui. Cause mesurée : chaque ouverture de base payait la dérivation PBKDF2 de SQLCipher (clé traitée comme phrase de passe) ; son poste est environ 10 fois plus lent que le mien. Correctif : clé brute (ADR-022), délai de test 30 s, test de non-régression vérifié par mutation. Rejoué ici : 132 tests (3 s), smoke SQLite sous Electron, e2e 17/17. Non revérifié sur Windows.
- 2026-10-09 — Phase 3 validée par l'utilisateur (tests à 100 % chez lui après le correctif ADR-022).
- 2026-10-09 — Phase 4 : domaine (remplacer/retirer une ligne), 7 cas d'utilisation, 7 canaux IPC, module d'interface (liste, détail, formulaire de ligne), formatage des montants et dates. Vérifié sous Linux : types, lint, 209 tests, build, e2e 40/40 (clics réels dans la vraie application). Contrôle par mutation : 5 régressions volontaires toutes détectées. Non vérifié : exécution sur Windows 10 et ressenti à l'écran de l'utilisateur.
- 2026-10-09 — Phase 4 : au cours du travail, deux scripts de correction ont échoué en silence (chaîne introuvable, fichier non écrit) ; chaque modification de documentation est donc relue par `grep` après coup.
- 2026-10-14 — Phase 4 validée par l'utilisateur (tous les tests passent, l'application démarre). Demandes nouvelles : champ « nom de la PRMP » au premier lancement ; interface plus professionnelle. Phase 4b ajoutée au plan (hors des phases 0 à 14 initiales).
- 2026-10-14 — Phase 4b : nom de la PRMP (domaine, fichier `settings.json`, cas d'utilisation, canal IPC, écran de configuration, Paramètres, bandeau) ; interface refaite (ADR-026) avec captures d'écran de l'application réelle relues une à une. Défauts trouvés sur les captures et corrigés : tableau du plan qui débordait (actions coupées), libellé du menu sur deux lignes, clé de récupération coupée au milieu d'un groupe, champs de mot de passe désalignés, bouton de création hors de l'écran. Vérifié sous Linux : types, lint, 234 tests, build, e2e 53/53, 4 mutations détectées. Non vérifié : Windows 10 (rendu de la police et de l'échelle d'affichage).
- 2026-10-14 — Note : dans le test de bout en bout lancé sans le dossier du projet, la « version » affichée est celle d'Electron (44.5.1) ; avec `npm run dev` ou l'installateur, c'est celle de package.json (0.1.0).
- 2026-10-15 — Phase 4b validée par l'utilisateur (« on continue »).
- 2026-10-15 — Phase 5 : règles de succession des étapes posées comme hypothèses (ADR-027), faute de précision dans le manuel SIGMP : à faire confirmer par la PRMP. Domaine, 9 cas d'utilisation, 9 canaux IPC, module d'interface (liste, formulaire préremplissable par une ligne du plan, détail avec étapes). Vérifié sous Linux : types, lint, 307 tests, build, e2e 78/78 (parcours entier par de vrais clics), 8 mutations toutes détectées. Défauts trouvés sur les captures et corrigés : lignes d'étapes trop hautes, pastille « Validée le … » coupée sur deux lignes. Non vérifié : Windows 10.

## Décisions en attente

- ADR-027 : règles de succession des étapes d'une procédure (ordre, validation, réouverture, verrouillage, mode, référence unique, suppression) ; à confirmer avec la PRMP, c'est la question la plus importante avant la Phase 6.
- ADR-025 : « nom de la PRMP » = institution ou personne responsable ? (champ libre : les deux conviennent) ; à confirmer.
- ADR-023 : comportement du plan de passation (mise à jour volontaire, entête figé, suppression interdite si utilisé, champs de la ligne) ; à confirmer avec la PRMP.
- ADR-014 : modèle de domaine fondé sur le manuel SIGMP ; à confirmer avec la PRMP (modes, types de contrat, événements d'exécution, absence du type ASAPC et du TEF).
- Politique de mot de passe (ADR-016) : 10 caractères minimum, sans règle de composition ; à confirmer avec la PRMP.

## Prochaines actions

1. L'utilisateur intègre le zip de la Phase 5 (voir docs/GIT_WORKFLOW.md), puis lance : `npm install`, `npm test`, `npm run lint`, `npm run build`, `npm run dev`, et confirme. Essai à faire à la main : ouvrir une région, créer un plan avec une ligne, aller dans « Procédures », créer une procédure en choisissant la ligne du plan (l'objet, le mode et le montant se préremplissent), saisir la date réelle de la publication, la valider, essayer de valider l'étape suivante avant sa date, rouvrir la publication, modifier l'en-tête, changer de région et vérifier que la procédure n'y est pas.
2. Faire confirmer par la PRMP les règles de succession des étapes (ADR-027) et le comportement du plan (ADR-023).
3. Valider la Phase 5.
4. Démarrer la Phase 6 : candidats et soumissionnaires (créer un candidat ; déposer l'offre d'un candidat pour une procédure ; désigner l'offre retenue). Question à poser avant de coder : l'attribution d'une procédure exige-t-elle une offre retenue ? Tous les cas d'utilisation passent par `RegionSession.requireWorkspace()`.

## Points à reprendre dans les phases suivantes

- Phase 6 : l'étape « Attribution » d'une procédure devra exiger une offre retenue (une seule par procédure, contrainte déjà présente en base) ; la table des offres existe, il reste les cas d'utilisation et l'interface.
- Phase 9 : les alertes d'échéances s'appuieront sur les dates prévues des étapes (déjà saisissables) et sur les dates prévisionnelles des lignes du plan.
- Accueil : afficher le nombre de procédures en cours (non fait en Phase 5, pour garder la phase ciblée).
- Phase 12 : permettre de DÉFINIR un nouveau mot de passe avec la clé de récupération (écran « Mot de passe oublié » + cas d'utilisation) ; changer le mot de passe (ancien requis) ; RÉGÉNÉRER la clé de récupération région ouverte ; renommer une région ; sauvegarde et restauration : la sauvegarde doit inclure `regions.json` ET les fichiers `regions/*.sqlite` (sans le registre, les bases sont inutilisables).
- Phase 3 (limite connue) : la clé de récupération n'est affichée qu'une fois ; si l'utilisateur ferme l'application avant de l'avoir notée, elle est perdue (régénération prévue en Phase 12).
- Phase 5 et 7 : règles de succession (étapes, réceptions, clôture) à confirmer avant de les coder.
- Phase 8 : table des documents joints (migration 002) ; stockage des fichiers dans le dossier de la région.
- Phase 13 : déplacer `react` et `react-dom` en devDependencies ; installateur Windows depuis Linux (Wine, GitHub Actions ou machine Windows) ; rejouer `npm run e2e` et le smoke SQLite sur un vrai poste Windows 10 ; resserrer `style-src` ; vérifier l'expéditeur des messages IPC.

## Contraintes de travail (rappel du protocole)

- Une phase à la fois ; arrêt et validation de l'utilisateur à la fin de chaque phase.
- Une phase est TERMINÉE seulement si : code écrit, tests passés, documentation mise à jour, validation de l'utilisateur.
- Fichiers complets avec chemin exact ; aucune exigence inventée.
- Après toute modification de docs/ : relire le résultat (ne pas supposer qu'un remplacement automatique a fonctionné).
