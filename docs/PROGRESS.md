# PROGRESS — Suivi des marchés publics (PRMP, version locale)

> Mémoire du projet. À lire EN PREMIER à chaque reprise de conversation.
> Dernière mise à jour : 2026-10-04 (fin de Phase 2, en attente de validation)

## Phase courante

**Phase 2 — Domaine et base de données** (code terminé, EN ATTENTE de validation par l'utilisateur)

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
| 2   | Domaine et base de données (entités, schéma, migrations, dépôts)      | EN ATTENTE DE VALIDATION |
| 3   | Régions et authentification (mots de passe, base chiffrée, isolation) | À FAIRE                  |
| 4   | Plan de passation (PPM)                                               | À FAIRE                  |
| 5   | Procédures de passation et suivi des étapes                           | À FAIRE                  |
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

## Décisions en attente

- ADR-014 : modèle de domaine fondé sur le manuel SIGMP ; à confirmer avec la PRMP (modes, types de contrat, événements d'exécution, absence du type ASAPC et du TEF).
- ADR-004 : algorithme de dérivation de clé et format de la clé de récupération, à fixer en Phase 3.

## Prochaines actions

1. L'utilisateur met à jour son projet avec le zip de la Phase 2, puis lance : `npm install`, `npm test`, `npm run lint`, `npm run smoke:sqlite`, `npm run build`, `npm run dev`, et confirme les résultats.
2. Valider la Phase 2.
3. Démarrer la Phase 3 : registre des régions (base de configuration avec empreintes de mots de passe), dérivation de clé, clé de récupération, ouverture/changement de région, tests d'isolation, premiers cas d'utilisation et canaux IPC, écran de connexion.

## Points à reprendre dans les phases suivantes

- Phase 3 : le registre des régions (noms, empreintes de mots de passe) n'est pas dans les bases de régions ; décider où le stocker (fichier de configuration non chiffré contenant uniquement des empreintes Argon2id/scrypt, et le « sel » de dérivation de clé).
- Phase 5 et 7 : règles de succession (étapes, réceptions, clôture) à confirmer avant de les coder.
- Phase 8 : table des documents joints (migration 002) ; stockage des fichiers dans le dossier de la région.
- Phase 13 : déplacer `react` et `react-dom` en devDependencies ; installateur Windows depuis Linux (Wine, GitHub Actions ou machine Windows) ; tester sur un vrai poste Windows 10 ; resserrer `style-src`.

## Contraintes de travail (rappel du protocole)

- Une phase à la fois ; arrêt et validation de l'utilisateur à la fin de chaque phase.
- Une phase est TERMINÉE seulement si : code écrit, tests passés, documentation mise à jour, validation de l'utilisateur.
- Fichiers complets avec chemin exact ; aucune exigence inventée.
- Après toute modification de docs/ : relire le résultat (ne pas supposer qu'un remplacement automatique a fonctionné).
