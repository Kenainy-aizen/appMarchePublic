# ARCHITECTURE

> Document vivant, complété à chaque phase. État : fin de Phase 3.

## 1. Principes

- Architecture propre / hexagonale : presentation -> application -> domain <- infrastructure.
- Le domaine est en TypeScript pur, sans dépendance à Electron, React ni SQLite.
- Le contexte « région courante » vit uniquement dans le processus principal Electron (`RegionSession`, voir section 9).

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

    src/application/             ports, session de région, limiteur d'essais, cas d'utilisation des régions (voir section 9)

    src/infrastructure/
      sqlite/database.ts         openDatabase(path, { key? }) : chiffrement SQLCipher, contrôle de la clé
      sqlite/migrator.ts         migrate(db) : user_version, transactions, refus d'une base trop récente
      sqlite/migrations/         001-initial-schema.ts (immuable)
      sqlite/repositories/       ppm, procedure, candidate, contract (implémentations SQLite)
      sqlite/errors.ts           DatabaseAccessError, DatabaseTooNewError, DataIntegrityError
      sqlite/row-mapping.ts      aides de lecture (JSON, identifiants)
      electron-app-info-provider.ts   (squelette Phase 1)

    src/main/                    index.ts (composition root), window.ts, security.ts, ipc/register-handlers.ts, ipc/safe-handler.ts
    src/preload/index.ts         contextBridge -> window.api (importe uniquement electron)
    src/renderer/                React (aucune logique métier)
    tests/                       domain/, application/, infrastructure/, integration/, renderer/
    scripts/                     smoke-sqlite.mjs (+ .cjs) : module SQLite sous Electron ; e2e-electron.mjs : application complète

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

- Un fichier SQLite par région, chiffré avec une clé de données aléatoire, elle-même protégée par le mot de passe de la région et par la clé de récupération (chiffrement « par enveloppe », ADR-015). La clé de données est transmise brute à SQLCipher (ADR-022).
- `openDatabase` détecte une clé fausse ou absente (`DatabaseAccessError`) ; testé.
- React ne manipule jamais chemin de fichier, clé ni connexion.
- Les tests d'isolation entre régions existent (`tests/integration/`, vrais fichiers chiffrés) ainsi qu'un test de bout en bout (`npm run e2e`).

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

## 9. Phase 3 — Régions et authentification

### Fichiers

    src/domain/region.ts                       MAX_REGIONS (3), RegionSummary, validation du nom et du mot de passe, nom suggéré
    src/application/ports.ts                   RegionKeyService, RegionRegistry, RegionStorage, RegionWorkspace, RegionSecrets
    src/application/region-session.ts          RegionSession : l'UNIQUE région ouverte ; requireWorkspace()
    src/application/login-throttle.ts          LoginThrottle (ADR-017)
    src/application/regions/                   create-region, open-region, list-regions, close-and-get-session
    src/infrastructure/crypto/                 scrypt-key-service.ts (enveloppe de clés), base32.ts
    src/infrastructure/json-region-registry.ts registre `regions.json`
    src/infrastructure/sqlite/region-storage.ts  une base chiffrée par région
    src/infrastructure/system-ports.ts         SystemClock, UuidGenerator
    src/main/ipc/safe-handler.ts               runSafely : toute issue devient un ApiResult
    src/renderer/src/screens/                  CreateRegionScreen, LoginScreen, RecoveryKeyScreen, HomeScreen
    tests/integration/                         isolation entre régions sur de vrais fichiers chiffrés
    tests/renderer/                            parcours des écrans (jsdom)
    scripts/e2e-electron.mjs                   test de bout en bout de la vraie application

### Dossier de données (Windows : `%APPDATA%\prmp-suivi-marches`, ou `PRMP_DATA_DIR`)

    regions.json            registre : noms, dates, clés enveloppées (aucun secret exploitable seul)
    regions/<id>.sqlite     une base chiffrée par région (<id> = identifiant aléatoire)

### Canaux IPC de la Phase 3

| Canal            | Entrée                          | Résultat (`ApiResult`)                        |
| ---------------- | ------------------------------- | --------------------------------------------- |
| regions:overview | —                               | régions, `canCreate`, `suggestedName`         |
| regions:create   | nom, mot de passe, confirmation | région + clé de récupération (une seule fois) |
| session:open     | `regionId`, mot de passe        | région ouverte                                |
| session:close    | —                               | null                                          |
| session:get      | —                               | région ouverte ou null                        |

### Flux d'ouverture d'une région

mot de passe -> scrypt -> clé qui déchiffre l'enveloppe -> clé de données (DEK) -> ouverture SQLCipher -> migrations -> dépôts exposés par `RegionSession`. La DEK est effacée de la mémoire dès l'ouverture (best effort).

### Garanties vérifiées par des tests

- Chaque région ne voit que ses propres données ; le mot de passe d'une région n'ouvre pas une autre région ; la clé d'une région ne déchiffre pas le fichier d'une autre.
- Après déconnexion, plus aucun accès aux données (base fermée, `NO_ACTIVE_REGION`).
- Aucune donnée ni aucun secret lisible dans les fichiers du dossier de données.
- Fichier de données manquant, endommagé ou plus récent que l'application : messages clairs, sans rien exposer.
- Échec de création : aucune entrée de registre et fichier de données nettoyé.

## 10. Phase 4 — Plan de passation (PPM)

### Fichiers

    src/domain/ppm.ts                          + parseProcurementNature, findPpmLine, replacePpmLine, removePpmLine
    src/domain/procedure.ts                    + parseProcedureMethod
    src/application/ppm/                       list-ppms, get-ppm, create-ppm, save-ppm-line, remove-ppm-line,
                                               record-ppm-update, delete-ppm ; views.ts (vues pour l'interface) ;
                                               ppm-access.ts (plan introuvable, ligne utilisée)
    src/shared/ppm-options.ts                  codes et libellés français (interface ET validation)
    src/shared/ipc-schemas.ts                  schémas Zod des commandes PPM
    src/main/ipc/register-ppm-handlers.ts      handlers (retours annotés : contrôle de compatibilité avec les DTO)
    src/renderer/src/format.ts                 montants (« 1 500 000 Ar »), dates (JJ/MM/AAAA), lecture des saisies
    src/renderer/src/screens/ppm/              PpmModule, PpmListScreen, PpmDetailScreen, PpmLineForm
    tests/application/ppm.test.ts              cas d'utilisation (dépôts en mémoire)
    tests/integration/ppm-real-database.test.ts  sur de vraies bases chiffrées
    tests/renderer/ppm-*.test.tsx, format.test.ts  écrans et formatage

### Canaux IPC de la Phase 4 (tous exigent une région ouverte, sinon `NO_ACTIVE_REGION`)

| Canal             | Entrée                                   | Résultat                       |
| ----------------- | ---------------------------------------- | ------------------------------ |
| ppm:list          | —                                        | résumés (plus récent d'abord)  |
| ppm:get           | `ppmId`                                  | plan avec lignes et totaux     |
| ppm:create        | année, date d'élaboration ou null        | plan créé (numéro automatique) |
| ppm:save-line     | plan, `lineId` (null = nouvelle), champs | plan mis à jour                |
| ppm:remove-line   | `ppmId`, `lineId`                        | plan mis à jour                |
| ppm:record-update | `ppmId`                                  | plan mis à jour                |
| ppm:delete        | `ppmId`                                  | null                           |

### Où vit chaque règle

- Domaine : champs obligatoires, valeurs permises, ordre des dates, montants entiers, unicité des lignes, totaux.
- Application : plan introuvable, interdiction de supprimer ce qui est utilisé, date du jour.
- Frontière IPC (Zod) : types et tailles maximales seulement.
- Interface : aucune règle métier ; elle découpe les saisies (comptes, montants) et affiche les messages reçus.

### Garanties vérifiées par des tests

- Sans région ouverte, aucune commande du plan ne fonctionne ; le plan d'une région est introuvable depuis une autre, même avec son identifiant.
- Un plan survit à un redémarrage ; la numérotation continue ; modifier une ligne ne détache pas la procédure qui s'y rattache.
- Contrôle par mutation : 5 régressions volontaires (suppression non vérifiée, ordre des lignes, modification devenant création, mise à jour non enregistrée, suppression sans confirmation) sont toutes détectées.
- Test de bout en bout : parcours piloté par de vrais clics dans la vraie application (création, ligne, total en direct, mise à jour), puis contrôles d'API, d'isolation et de chiffrement des données saisies.

## 11. Phase 4b — Nom de la PRMP et refonte de l'interface

### Nom de la PRMP

    src/domain/organization.ts                           parseOrganizationName (obligatoire, 120 caractères, espaces nettoyés)
    src/application/ports.ts                             port OrganizationSettings (getName, saveName)
    src/application/organization/save-organization.ts    cas d'utilisation (aucune région requise)
    src/application/regions/list-regions.ts              la vue d'ensemble contient `organizationName`
    src/infrastructure/json-organization-settings.ts     fichier `settings.json` (sans secret), illisible = ignoré
    src/infrastructure/atomic-write.ts                   écriture atomique partagée avec le registre des régions
    canal IPC organization:save                          entrée { name } -> { name }

### Interface

    src/renderer/src/styles/        tokens.css, base.css, components.css, layout.css (+ impression de la clé)
    src/renderer/src/ui/            Icon (+ FlagMark), Alert, PageHeader, EmptyState
    src/renderer/src/layouts/       AuthLayout (panneau + formulaire), AppShell (menu, bandeau, page)
    src/renderer/src/screens/       SetupScreen (premier lancement), LoginScreen, CreateRegionScreen, RecoveryKeyScreen,
                                    WorkspaceScreen, HomeSection, SettingsScreen, ppm/*
    docs/captures/                  captures d'écran de l'application réelle (générées par `npm run e2e`)

### Parcours

- Aucune région : `SetupScreen` (nom de la PRMP + première région) -> clé de récupération (étape 3) -> connexion.
- Régions existantes : `LoginScreen` ; « Créer une région » ouvre `CreateRegionScreen` (le nom de la PRMP est déjà connu).
- Région ouverte : `WorkspaceScreen` (Accueil, Plan de passation, Paramètres ; Procédures et Contrats « Bientôt »).
- Au démarrage, l'interface lit toujours la vue d'ensemble (pour le nom de la PRMP), même si une session est déjà ouverte.

### Vérifications

- 234 tests (domaine, cas d'utilisation, fichiers réels, interface) ; contrôle par mutation de 4 règles du nom de la PRMP.
- Test de bout en bout : 53 vérifications dont la première utilisation entière pilotée par de vrais clics (nom, région, clé, connexion), la police embarquée, `settings.json` sans secret.

## 12. Phase 5 — Procédures de passation

### Fichiers

    src/domain/procedure.ts                      + procedureProgress, setStepDates, validateStep, reopenStep,
                                                   updateProcedureDetails, STEP_LABELS, parseStepKind
    src/application/procedures/                  list-procedures (+ lignes du plan), get-procedure, create-procedure,
                                                 update-procedure, step-use-cases (dates, valider, rouvrir),
                                                 delete-procedure ; views.ts ; procedure-access.ts
    src/shared/procedure-options.ts              étapes, statuts et libellés français (un test les compare au domaine)
    src/main/ipc/register-procedure-handlers.ts  9 canaux
    src/renderer/src/screens/procedures/         ProcedureModule, ProcedureListScreen, ProcedureForm, ProcedureDetailScreen
    src/renderer/src/ui/ProgressBadge.tsx        cases d'avancement + « n sur 5 — statut »
    tests/application/procedures.test.ts, tests/integration/procedure-real-database.test.ts, tests/renderer/procedure-screens.test.tsx

### Canaux IPC (tous exigent une région ouverte, sinon `NO_ACTIVE_REGION`)

| Canal                     | Entrée                                                 | Résultat                             |
| ------------------------- | ------------------------------------------------------ | ------------------------------------ |
| ppm:list-lines            | —                                                      | lignes de plan à plat (rattachement) |
| procedure:list            | —                                                      | résumés                              |
| procedure:get             | `procedureId`                                          | détail + étapes                      |
| procedure:create          | référence, objet, mode, ligne du plan ou null, montant | détail                               |
| procedure:update          | idem + `procedureId`                                   | détail                               |
| procedure:save-step-dates | `procedureId`, étape, date prévue, date réelle         | détail                               |
| procedure:validate-step   | `procedureId`, étape                                   | détail                               |
| procedure:reopen-step     | `procedureId`, étape                                   | détail                               |
| procedure:delete          | `procedureId`                                          | null                                 |

### Où vit chaque règle

- Domaine : toutes les règles de succession des étapes (ADR-027), verrouillage du mode, avancement dérivé.
- Application : procédure ou ligne du plan introuvable, référence unique, suppression interdite si un contrat est lié, date du jour.
- Frontière IPC (Zod) : types, tailles, étape dans la liste connue.
- Interface : aucune règle ; elle désactive « Valider » et « Rouvrir » quand l'action est impossible (confort), le domaine restant l'autorité.

### Garanties vérifiées par des tests

- Contrôle par mutation : 8 régressions volontaires (validation hors ordre, sans date réelle, réouverture interdite, dates verrouillées, mode verrouillé, référence en double, bouton « Valider » trop permissif, suppression d'une procédure liée à un contrat) sont toutes détectées.
- Une procédure et son avancement survivent à un redémarrage ; une procédure d'une région est introuvable depuis une autre ; la ligne du plan rattachée ne peut plus être supprimée.
- Test de bout en bout : 78 vérifications, dont le parcours entier de la procédure par de vrais clics (création préremplie par la ligne du plan, refus sans date, dates, validation, réouverture).

## 13. Phase 6 — Candidats et offres

### Fichiers

    src/domain/procedure.ts                      + bidsLocked, findBid, updateBidAmount, removeBid, setAwardedBid ;
                                                   addBid verrouillé ; validateStep exige une offre retenue pour l'attribution
    src/domain/candidate.ts                      + normalizeNif
    src/application/candidates/                  candidate-use-cases (liste, création, modification, suppression)
    src/application/procedures/bid-use-cases.ts  ajouter, modifier, retirer une offre ; désigner l'offre retenue
    src/application/procedures/views.ts          vues avec noms des candidats, offres, verrou, attributaire
    src/main/ipc/register-candidate-handlers.ts  8 canaux
    src/renderer/src/screens/candidates/         CandidateModule, CandidateListScreen, CandidateForm
    src/renderer/src/screens/procedures/BidsPanel.tsx   offres d'une procédure
    tests/application/candidates-and-bids.test.ts, tests/domain/bids.test.ts,
    tests/integration/candidate-bid-real-database.test.ts, tests/renderer/candidate-and-bids.test.tsx

### Canaux IPC (tous exigent une région ouverte, sinon `NO_ACTIVE_REGION`)

| Canal                | Entrée                                       | Résultat                  |
| -------------------- | -------------------------------------------- | ------------------------- |
| candidate:list       | —                                            | candidats (+ nb d'offres) |
| candidate:create     | nom, NIF, STAT, adresse, téléphone, courriel | candidat                  |
| candidate:update     | idem + `candidateId`                         | candidat                  |
| candidate:delete     | `candidateId`                                | null                      |
| procedure:add-bid    | `procedureId`, `candidateId`, montant        | détail de la procédure    |
| procedure:update-bid | `procedureId`, `bidId`, montant              | détail                    |
| procedure:remove-bid | `procedureId`, `bidId`                       | détail                    |
| procedure:set-award  | `procedureId`, `bidId` ou null               | détail                    |

### Où vit chaque règle

- Domaine : une seule offre retenue, verrou après l'attribution, attribution exigeant une offre retenue, offre par candidat unique.
- Application : candidat introuvable, NIF unique, suppression d'un candidat utilisé, noms des candidats dans les vues.
- Interface : masque les candidats ayant déjà une offre, désactive les actions quand les offres sont verrouillées (confort ; le domaine reste l'autorité).

### Garanties vérifiées par des tests

- Contrôle par mutation : 8 régressions volontaires (attribution sans offre retenue, verrou ignoré, plusieurs offres retenues, NIF en double, suppression d'un candidat ayant une offre, offre d'un candidat inconnu, verrou ignoré par l'interface, candidat déjà en offre proposé) sont toutes détectées.
- Offres et offre retenue survivent à un redémarrage ; changer l'offre retenue fonctionne en base dans les deux sens ; candidats et offres d'une région sont invisibles depuis une autre.
- Test de bout en bout : 106 vérifications, dont le parcours entier par de vrais clics (créer deux candidats, refus d'un NIF en double, saisir deux offres, refus de l'attribution sans offre retenue, retenir une offre, valider, verrou, réouverture) et l'absence de tout nom ou NIF lisible dans les fichiers chiffrés.
