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

## ADR-015 — Chiffrement « par enveloppe » : mot de passe et clé de récupération

- Statut : accepté et vérifié (2026-10-05)
- Contexte : une même base doit s'ouvrir avec le mot de passe OU avec la clé de récupération ; SQLCipher n'accepte qu'une clé à la fois.
- Choix : une clé de données aléatoire de 32 octets (DEK) chiffre la base ; la DEK est stockée deux fois, enveloppée en AES-256-GCM par une clé dérivée du mot de passe (scrypt N=2^17, r=8, p=1, recommandation OWASP) et par une clé dérivée de la clé de récupération (HKDF-SHA256). L'identifiant de région est lié à chaque enveloppe (données authentifiées) : une enveloppe copiée vers une autre région est refusée.
- Clé de récupération : 160 bits aléatoires, affichés en 8 groupes de 4 caractères base32 (alphabet sans I, L, O, U), montrés une seule fois et conservés nulle part.
- Conséquences : changer de mot de passe ne demande jamais de rechiffrer la base ; le registre `regions.json` ne contient que des clés enveloppées. Un mot de passe incorrect est distingué d'un fichier corrompu (échec d'authentification de l'enveloppe).
- Limite : sans mot de passe ni clé de récupération, les données sont définitivement illisibles (voulu).
- Limite actuelle : la clé de récupération sait ouvrir une base (testé), mais aucun écran ni cas d'utilisation ne permet encore de définir un nouveau mot de passe avec elle : prévu en Phase 12.

## ADR-016 — Régions créées par la PRMP, mot de passe unique par région

- Statut : accepté (2026-10-05)
- Choix : la PRMP crée ses régions (3 au maximum) en leur donnant un nom ; le renommage ultérieur est prévu en Phase 12 ; le nom doit être unique (sans tenir compte de la casse, des accents ni des espaces). Chaque région doit avoir un mot de passe différent des autres : la création vérifie que le mot de passe saisi n'ouvre aucune région existante.
- Conséquence assumée : cette vérification est un moyen d'essayer des mots de passe ; elle passe donc par le même limiteur d'essais que la connexion (ADR-017), sinon la création de région contournerait le blocage.
- Mot de passe : 10 caractères minimum, confirmation obligatoire, pas de règle de composition (peu utiles). Une phrase de passe est recommandée à l'écran.
- Nom proposé par défaut : « Région 1 », puis le premier nom « Région N » libre.

## ADR-017 — Limitation des essais de mot de passe

- Statut : accepté (2026-10-05)
- Choix : après 5 échecs consécutifs sur une région, blocage de 30 s, doublé à chaque échec supplémentaire, plafonné à 5 min ; remis à zéro après une connexion réussie. Le blocage s'applique même avec le bon mot de passe pendant la durée.
- Limites connues : compteur en mémoire, remis à zéro au redémarrage de l'application ; il protège contre quelqu'un qui devine devant le poste, pas contre une attaque sur un fichier copié (celle-ci est freinée par scrypt et la longueur minimale du mot de passe).
- Effet de bord accepté : créer les régions 2 et 3 compte comme un essai raté sur les régions existantes.

## ADR-018 — Contrat IPC : jamais d'exception, toujours un résultat

- Statut : accepté (2026-10-05)
- Contexte : une exception levée dans un handler Electron arrive à l'interface sous forme de message technique, sans code.
- Choix : chaque commande répond par `ApiResult` (`ok` + valeur, ou `ok: false` + code, message français et, si besoin, `retryAfterSeconds`). Les erreurs métier transmettent leur message ; les entrées invalides (validées par Zod) donnent « Requête invalide » ; toute autre erreur donne un message générique et le détail reste dans le journal du processus principal (aucun chemin, clé ou trace exposé).
- Une région n'a jamais de secret dans un DTO : `RegionSummaryDto` = identifiant + nom.

## ADR-019 — Une seule région ouverte, accès aux données par `RegionSession`

- Statut : accepté (2026-10-05)
- Choix : `RegionSession` détient l'unique région ouverte. Tout cas d'utilisation métier obtient ses dépôts par `requireWorkspace()` ; sans région ouverte : erreur `NO_ACTIVE_REGION`. Ouvrir une région ferme la précédente seulement si la connexion réussit ; un échec laisse la région courante intacte. La base est refermée à la sortie de l'application.
- Conséquence : il n'existe aucun chemin de code qui mélange deux régions ; l'isolation est testée sur de vrais fichiers chiffrés.

## ADR-020 — Stratégie de tests de l'interface et de bout en bout

- Statut : accepté (2026-10-05)
- Choix : tests des écrans avec jsdom + Testing Library (parcours création, clé de récupération, connexion, déconnexion) ; test de bout en bout `npm run e2e` qui lance la vraie application compilée, la pilote par le protocole de débogage de Chromium, avec un dossier de données jetable (variable `PRMP_DATA_DIR`). Sous Linux sans écran, il utilise `xvfb-run`.
- Limite : exécuté sous Linux ; à rejouer sur Windows 10 avant livraison.

## Réponses aux questions de cadrage (Phase 0)

- Q1 : poste cible Windows 10, 64 bits.
- Q2 : régions nommées « Région 1 », « Région 2 », « Région 3 » par défaut, renommables plus tard.
- Q3 : mots de passe définis à la première ouverture ; une clé de récupération est générée à la création de chaque région (à imprimer et conserver). Mot de passe oublié sans clé = données illisibles.
- Q4 : champs métier calqués sur le SIGMP, en version simplifiée.
- Q5 : montants en Ariary (Ar) ; exercice budgétaire = année civile.

## ADR-021 — Dossier de données au nom fixe

- Statut : accepté (2026-10-05)
- Contexte : le dossier `userData` d'Electron est dérivé du nom du produit. Un renommage du produit (ou le passage à electron-builder en Phase 13) aurait déplacé le dossier : l'application aurait semblé démarrer « à vide », les régions existantes devenant introuvables.
- Choix : le dossier est `<appData>/prmp-suivi-marches` (constante `DATA_FOLDER_NAME`), indépendant du nom affiché. `PRMP_DATA_DIR` reste disponible pour les tests.
- Conséquences : sous Windows, `%APPDATA%\prmp-suivi-marches`. Ne jamais modifier cette constante sans migration des données.

## ADR-022 — Clé de la base transmise « brute » (sans dérivation PBKDF2)

- Statut : accepté (2026-10-06)
- Constat : sur le poste de l'utilisateur, 4 tests d'intégration dépassaient le délai de 5 s et les tests de base chiffrée prenaient 14 s (1,2 s sur ma machine). Mesure : chaque ouverture d'une base coûtait 160 à 465 ms ici (donc plusieurs secondes sur un poste lent), car `db.key(Buffer)` traite la clé comme une phrase de passe et lui applique la dérivation de SQLCipher (PBKDF2, 256 000 itérations).
- Choix : la clé de données est transmise au format « clé brute » de SQLCipher, `PRAGMA key = "x'<64 caractères hexadécimaux>'"` : aucune dérivation, ouverture quasi instantanée (0 à 1 ms mesuré).
- Pourquoi c'est sûr : cette clé est déjà aléatoire sur 256 bits (ce n'est pas un mot de passe) ; une dérivation lente n'apporte rien. La résistance aux devinettes de mot de passe est assurée par scrypt, qui protège la clé de données (ADR-015). Chiffrement de la base inchangé (AES-256, sel propre à chaque fichier). Le fichier ne contient pas de texte lisible et une mauvaise clé est refusée (testé).
- Contrepartie : la représentation hexadécimale de la clé passe par une chaîne JavaScript, qui ne peut pas être effacée de la mémoire comme un Buffer. Acceptable : SQLCipher garde de toute façon la clé en mémoire tant que la base est ouverte.
- Incompatibilité : une base créée avec le zip précédent de la Phase 3 n'est PAS lisible avec cette version. Il n'existe pas encore de données réelles : supprimer le dossier de données de développement (voir README) et recréer les régions.
- Garde-fou : un test ouvre le fichier avec la clé brute (et échoue si quelqu'un revient au mode phrase de passe, vérifié par mutation) ; un test refuse une clé qui ne fait pas 32 octets.
- Ne JAMAIS passer à `openDatabase` un mot de passe saisi par l'utilisateur.
- Coût restant : le déverrouillage par mot de passe (scrypt, N = 2^17, environ 0,45 s ici) coûte plus cher sur un poste lent (jusqu'à plusieurs secondes). Réglable plus tard sans perdre de données car les paramètres sont stockés par région ; à décider après mesure sur le poste de la PRMP.
