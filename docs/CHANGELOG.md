# CHANGELOG

## [Non publié]

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
