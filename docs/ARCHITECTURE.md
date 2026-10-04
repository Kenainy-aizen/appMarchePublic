# ARCHITECTURE

> Document vivant, complété à chaque phase. État : fin de Phase 2.

## 1. Principes

- Architecture propre / hexagonale : presentation -> application -> domain <- infrastructure.
- Le domaine est en TypeScript pur, sans dépendance à Electron, React ni SQLite.
- Le contexte « région courante » vivra uniquement dans le processus principal Electron (Phase 3).

## 2. Structure réelle

    src/shared/ipc-channels.ts   constantes des canaux IPC (aucune dépendance)
    src/shared/ipc-schemas.ts    schémas Zod (main uniquement)
    src/shared/api.ts            types DTO + interface PrmpApi (window.api)

    src/domain/
      shared/                    ariary, iso-date, errors, text (validations), ports (IdGenerator, Clock)
      ppm.ts                     Ppm, PpmLine, Beneficiary + règles (dates, totaux, mise à jour)
      procedure.ts               Procedure, ProcedureStep, Bid, modes (DAO, AOR, DCP, AMI, APQ)
      candidate.ts               Candidate
      contract.ts                Contract, ContractEvent, montant actuel (avenants)
      repositories.ts            ports : PpmRepository, ProcedureRepository, CandidateRepository, ContractRepository
      app-info.ts                (squelette Phase 1)

    src/application/             get-app-info.ts (squelette ; les vrais cas d'utilisation arrivent dès la Phase 3)

    src/infrastructure/
      sqlite/database.ts         openDatabase(path, { key? }) : chiffrement SQLCipher, contrôle de la clé
      sqlite/migrator.ts         migrate(db) : user_version, transactions, refus d'une base trop récente
      sqlite/migrations/         001-initial-schema.ts (immuable)
      sqlite/repositories/       ppm, procedure, candidate, contract (implémentations SQLite)
      sqlite/errors.ts           DatabaseAccessError, DatabaseTooNewError, DataIntegrityError
      sqlite/row-mapping.ts      aides de lecture (JSON, identifiants)
      electron-app-info-provider.ts   (squelette Phase 1)

    src/main/                    index.ts (composition root), window.ts, security.ts, ipc/register-handlers.ts
    src/preload/index.ts         contextBridge -> window.api (importe uniquement electron)
    src/renderer/                React (aucune logique métier)
    tests/                       domain/, application/, infrastructure/
    scripts/                     smoke-sqlite.mjs (+ .cjs) : module SQLite sous Electron

Alias : @domain, @application, @infrastructure, @shared (tsconfig, electron-vite, Vitest).

## 3. Flux de données

React -> (appel typé) preload -> IPC -> handler main (validation Zod) -> cas d'utilisation
-> interface de dépôt (domaine) -> dépôt SQLite de la région active -> base chiffrée.

## 4. Modèle de données d'une région (migration 001)

| Table                | Rôle                                         | Liens principaux                                              |
| -------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| ppm                  | Entête du plan (année, numéro, mises à jour) | unique (année, numéro)                                        |
| ppm_line             | Lignes du plan (nature, objet, dates, mode)  | ppm (CASCADE)                                                 |
| ppm_line_beneficiary | Services bénéficiaires et montants           | ppm_line (CASCADE)                                            |
| candidate            | Candidats / titulaires                       | —                                                             |
| procedure            | Procédures de passation                      | ppm_line (SET NULL) ; référence unique                        |
| procedure_step       | 5 étapes par procédure                       | procedure (CASCADE) ; clé (procédure, étape)                  |
| bid                  | Offres des candidats                         | procedure (CASCADE), candidate (RESTRICT) ; une seule retenue |
| contract             | Marchés, conventions, achats directs         | procedure et candidate (RESTRICT), ppm_line (SET NULL)        |
| contract_event       | Ordres de service, réceptions, avenants...   | contract (CASCADE)                                            |

Aucune colonne « région » : chaque région a son propre fichier (ADR-003). Montants : entiers (Ar). Dates : texte AAAA-MM-JJ.

## 5. Cloisonnement par région

- Un fichier SQLite par région, chiffré avec une clé dérivée du mot de passe de la région (Phase 3).
- `openDatabase` détecte une clé fausse ou absente (`DatabaseAccessError`) ; testé.
- React ne manipulera jamais chemin de fichier, clé ni connexion.
- Les tests d'isolation entre régions seront écrits en Phase 3.

## 6. Règles d'architecture (vérifiées par `npm run lint`)

- domain : aucune dépendance vers application, infrastructure, main, renderer, electron, react.
- application : aucune dépendance vers infrastructure, main, renderer, electron, react.
- preload : ni zod, ni domain/application/infrastructure.
- renderer : uniquement @shared (types) et window.api.

## 7. Procédures de travail

Ajouter une commande IPC : un canal (`ipc-channels.ts`), un schéma (`ipc-schemas.ts`), un type et une méthode dans `PrmpApi` (`api.ts`), un cas d'utilisation, un handler dans `register-handlers.ts`, l'appel dans le preload.

Faire évoluer le schéma : ne JAMAIS modifier une migration existante. Créer `migrations/00N-nom.ts`, l'ajouter à `MIGRATIONS` dans `migrator.ts`, adapter les dépôts et les tests (le test de cohérence schéma/domaine signale les valeurs d'énumération oubliées).

## 8. Sécurité Electron

contextIsolation activé, nodeIntegration désactivé, sandbox, CSP stricte, IPC validé par Zod, aucun accès réseau sortant.
