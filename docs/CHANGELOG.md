# CHANGELOG

## [Non publié]

### Phase 3 — correctif de performance (2026-10-06)

- Ouverture des bases quasi instantanée : clé transmise brute à SQLCipher, sans dérivation PBKDF2 (ADR-022). Suite de tests : environ 55 s -> 3 s ici ; les 4 dépassements de délai constatés sur le poste de l'utilisateur disparaissent.
- Tests : nouveau test de format de clé (vérifié par mutation) et refus d'une clé de longueur incorrecte ; délai de test porté à 30 s (filet pour postes lents).
- Incompatibilité : les bases créées avec le zip précédent de la Phase 3 ne s'ouvrent plus (aucune donnée réelle à ce stade).

### Phase 3 — Régions et authentification (2026-10-05)

- Domaine : modèle de région (3 au maximum, nom unique, règles de mot de passe, nom suggéré).
- Application : création de région, connexion, déconnexion, session unique (`RegionSession`), limiteur d'essais, liste des régions ; ports `RegionKeyService`, `RegionRegistry`, `RegionStorage`.
- Infrastructure : chiffrement par enveloppe (scrypt, HKDF, AES-256-GCM), clé de récupération en base 32, registre `regions.json` (écriture atomique), une base chiffrée par région.
- Interface : écrans Créer une région, Se connecter, Clé de récupération (avec impression), Région ouverte ; erreurs en français.
- IPC : résultats `ApiResult` pour toutes les commandes de régions ; entrées validées par Zod.
- Tests : 130 tests (dont isolation sur vrais fichiers chiffrés, écrans) et `npm run e2e` (17 vérifications sur la vraie application, sous Linux).
- Dépendances de développement : jsdom, @testing-library/react, @testing-library/dom, @testing-library/user-event.

### Phase 2 — Domaine et base de données (2026-10-04)

- Domaine : objets-valeur (`Ariary`, `IsoDate`), erreurs métier, entités PPM / procédure / candidat / contrat avec leurs règles de création, ports de dépôts.
- Infrastructure : ouverture de base chiffrée (`openDatabase`), migrateur versionné, migration 001 (schéma initial, 10 tables), 4 dépôts SQLite.
- Tests : 58 tests (domaine, base chiffrée, migrations, garde-fou schéma/domaine, dépôts). Contrôle par mutation sur 2 règles critiques.
- Outils : `npm run smoke:sqlite` (module SQLite sous Electron) ; ESLint étendu aux scripts .cjs/.mjs.
- Dépendance ajoutée : better-sqlite3-multiple-ciphers 13 (Node >= 22).
- Documentation : réécriture complète de DECISIONS, PROGRESS, ARCHITECTURE (des mises à jour de la Phase 1 ne s'étaient pas appliquées).

### Phase 1 — Initialisation (2026-10-03 / 2026-10-04)

- Projet Electron 44 + React 19 + TypeScript 5.9 (electron-vite 5, Vite 7).
- Alias @domain / @application / @infrastructure / @shared.
- ESLint (strictTypeChecked) avec règles d'architecture, Prettier, Vitest.
- Sécurité : contextIsolation, sandbox, CSP stricte, réseau sortant bloqué, navigation refusée.
- Canal IPC typé de démonstration `app:get-info`.
- Correction : script `postinstall` (`node node_modules/electron/install.js`) car Electron 44 ne télécharge plus son binaire.
- Correction : le preload ne charge plus zod (contrat IPC scindé en trois fichiers).

### Phase 0 — Cadrage (2026-10-03)

- Ajout de docs/PROGRESS.md, ARCHITECTURE.md, DECISIONS.md, CHANGELOG.md.
- Réponses de cadrage Q1 à Q5 consignées.
