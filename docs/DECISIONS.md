# DECISIONS (ADR)

Une entrée par décision technique : contexte, choix, alternatives, conséquences.

## ADR-001 — Electron + React + SQLite chiffré

- Statut : accepté (2026-10-03)
- Contexte : une seule utilisatrice, un seul poste Windows, aucune installation préalable possible.
- Choix : Electron + React + TypeScript (Vite), SQLite via better-sqlite3-multiple-ciphers, packaging electron-builder.
- Alternatives : C# WPF + SQLCipher ; Django + React.
- Conséquences : installateur d'environ 100 Mo ; cloisonnement fort par chiffrement.

## ADR-002 — Architecture propre / hexagonale

- Statut : accepté (2026-10-03)
- Choix : couches domain, application, infrastructure, presentation ; dépendances vers l'intérieur, contrôlées par ESLint.
- Conséquences : cas d'utilisation testables sans UI ni base ; règles métier isolées.

## ADR-003 — Une base de données par région

- Statut : accepté (2026-10-03)
- Choix : un fichier SQLite chiffré par région. Le schéma ne contient donc aucune colonne « région ».
- Conséquences : isolation physique ; sauvegarde par copie de fichiers ; migrations appliquées à chaque ouverture.

## ADR-004 — Mots de passe et clés

- Statut : orientation acceptée (Q3) ; détails à fixer en Phase 3
- Orientation : Argon2id (ou scrypt) pour dériver la clé de chiffrement depuis le mot de passe ; clé de récupération générée à la création de chaque région, à imprimer et conserver.
- Risque : mot de passe oublié sans clé de récupération = données de la région illisibles.
- La base accepte déjà une clé de 32 octets (`openDatabase(path, { key })`) ; la dérivation reste à écrire en Phase 3.

## ADR-005 — electron-vite comme outil de build

- Statut : accepté (2026-10-03)
- Choix : electron-vite 5 avec Vite 7 (electron-vite 5 n'accepte pas encore Vite 8), @vitejs/plugin-react 5, Vitest 3, TypeScript 5.9, ESLint 9.
- Alternatives : Vite + scripts Electron manuels ; Electron Forge.
- Conséquences : structure main / preload / renderer native ; versions épinglées en plages majeures compatibles.

## ADR-006 — Contrat IPC en trois fichiers

- Statut : accepté (2026-10-03)
- Contexte : le preload est sandboxé et ne peut charger que `electron` ; importer `zod` dans le preload provoquait un `require("zod")` fatal à l'exécution (détecté au build).
- Choix : `ipc-channels.ts` (constantes, sans dépendance), `ipc-schemas.ts` (Zod, main seulement), `api.ts` (types seuls). Règle ESLint interdisant zod et le domaine dans le preload.
- Conséquences : toute nouvelle commande IPC ajoute un canal, un schéma et un type, et reste validée côté main.

## ADR-007 — Sécurité du squelette

- Statut : accepté (2026-10-03)
- Choix : contextIsolation, sandbox, nodeIntegration désactivé ; navigation et nouvelles fenêtres refusées ; tout accès réseau http(s)/ws(s) annulé (sauf serveur Vite en développement) ; CSP stricte dans index.html (assouplie uniquement en `npm run dev`).
- Limite connue : `style-src 'unsafe-inline'` conservé pour React ; à resserrer si possible en Phase 13.

## ADR-008 — Dépendances de développement

- Statut : accepté (2026-10-03)
- Constat : `npm audit` signale 2 vulnérabilités modérées dans Vitest 3 (@vitest/mocker, redirection de mock). Elles n'affectent que l'environnement de développement, pas l'application livrée.
- Décision : rester sur Vitest 3 (compatible Vite 7) ; réévaluer quand electron-vite supportera Vite 8.

## ADR-009 — Téléchargement du binaire Electron

- Statut : accepté (2026-10-04)
- Constat : depuis Electron 44, le paquet n'a plus de script `postinstall` ; `npm install` ne télécharge pas le binaire (erreur `Electron uninstall`, observée chez l'utilisateur). Le lien `.bin/install-electron` est absent chez lui (`npx install-electron` échoue).
- Choix : `"postinstall": "node node_modules/electron/install.js"` ; même commande en secours manuel.

## ADR-010 — Module SQLite : better-sqlite3-multiple-ciphers 13 (binaires précompilés N-API)

- Statut : accepté et vérifié (2026-10-04)
- Constat : la version 13 est en N-API et embarque des binaires précompilés (dont win32-x64). Aucune recompilation pour Electron, aucun outil de compilation requis.
- Vérifications faites : tests Vitest sous Node 22 ; `npm run smoke:sqlite` sous Electron 44 (Node 24) : chargement, chiffrement, mauvaise clé refusée. Reste à refaire sur Windows 10 (binaire win32-x64).
- Contraintes : Node >= 22 (engines du module). Le paquet n'expose pas ses types dans `exports` : alias `paths` dans tsconfig.base.json vers son `index.d.ts`.
- Chiffrement : `PRAGMA cipher='sqlcipher'` puis `db.key(Buffer)`. Une clé absente ou fausse échoue à la lecture de contrôle (`DatabaseAccessError`).

## ADR-011 — Ports de dépôt synchrones

- Statut : accepté (2026-10-04)
- Choix : les interfaces de `domain/repositories.ts` sont synchrones, comme better-sqlite3.
- Alternative : ports asynchrones (Promise) pour pouvoir changer de moteur.
- Conséquences : code plus simple, transactions naturelles. Changer pour un moteur asynchrone obligerait à revoir les cas d'utilisation (non prévu : base locale mono-utilisateur).

## ADR-012 — Migrations versionnées et immuables

- Statut : accepté (2026-10-04)
- Choix : `PRAGMA user_version` suit la version ; chaque migration s'exécute dans une transaction (échec = annulation complète) ; une base plus récente que l'application est refusée (`DatabaseTooNewError`). Une migration publiée n'est jamais modifiée : toute évolution = nouveau fichier `00N-...ts` ajouté à `MIGRATIONS`.
- Garde-fou : les listes de valeurs des `CHECK` sont écrites en dur dans la migration 001 ; un test vérifie qu'elles acceptent exactement les valeurs actuelles du domaine (détecte la dérive si on ajoute une valeur sans migration).

## ADR-013 — Persistance par agrégat, avec upsert (jamais « supprimer puis recréer »)

- Statut : accepté (2026-10-04)
- Contexte : des procédures et contrats référencent les lignes de PPM ; supprimer/recréer une ligne casserait ces liens (clé étrangère `SET NULL`) ou violerait `RESTRICT`.
- Choix : `save()` met à jour sur place (`INSERT ... ON CONFLICT DO UPDATE`) et ne supprime que les éléments retirés. Pour les offres, le statut « retenue » est remis à zéro avant l'écriture (index unique partiel : une seule offre retenue par procédure).
- Vérifié par mutation : deux régressions volontaires (suppression de toutes les lignes ; oubli de la remise à zéro) sont détectées par les tests.

## ADR-014 — Modèle de domaine de la Phase 2 (hypothèses à confirmer avec la PRMP)

- Statut : proposé, à confirmer
- Choix : montants en Ariary entiers (`Ariary`) ; dates en texte AAAA-MM-JJ (`IsoDate`) ; identifiants fournis par l'application (`IdGenerator`, `Clock` : ports prêts pour la Phase 4).
- Valeurs fixes tirées du manuel SIGMP : natures (travaux, fournitures, services, prestations intellectuelles) ; modes DAO, AOR, DCP, AMI, APQ ; contrats MARCHE, CONVENTION, ACHAT_DIRECT ; événements : ordre de service (démarrage, arrêt, reprise), réception provisoire/définitive, avenant, clôture.
- Simplifications : le type ASAPC du SIGMP, le TEF et le retrait de contrat ne sont pas modélisés ; l'impression n'est pas modélisée.
- Règles de succession (ordre des étapes, réception définitive après provisoire, clôture en dernier) volontairement reportées aux Phases 5 et 7, après confirmation.
- Pas de table de référentiels : les listes de valeurs sont des constantes du code.

## Réponses aux questions de cadrage (Phase 0)

- Q1 : poste cible Windows 10, 64 bits.
- Q2 : régions nommées « Région 1 », « Région 2 », « Région 3 » par défaut, renommables plus tard.
- Q3 : mots de passe définis à la première ouverture ; une clé de récupération est générée à la création de chaque région (à imprimer et conserver). Mot de passe oublié sans clé = données illisibles.
- Q4 : champs métier calqués sur le SIGMP, en version simplifiée.
- Q5 : montants en Ariary (Ar) ; exercice budgétaire = année civile.
