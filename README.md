# Suivi des marchés publics — PRMP (version locale)

Application de bureau Windows pour le suivi des marchés publics d'une PRMP (3 régions, un mot de passe par région).
Pile : Electron + React + TypeScript (Vite) + SQLite chiffré (à partir de la Phase 2).

> Avant toute chose, lire `docs/PROGRESS.md` (état du projet).

## Prérequis (poste de développement)

- Windows 10 64 bits ou plus récent, ou Linux (développement uniquement)
- Node.js 22 ou plus récent (exigé par le module SQLite) et npm
- Connexion internet à l'installation (téléchargement du binaire Electron)

## Commandes

    npm install        # installe les dépendances ; le script postinstall télécharge le binaire Electron
    node node_modules/electron/install.js  # à lancer à la main si le binaire Electron manque (erreur « Electron uninstall »)
    npm run dev        # lance l'application en mode développement
    npm run typecheck  # vérification des types
    npm run lint       # règles de qualité et d'architecture
    npm test           # tests unitaires et d'intégration (domaine, base SQLite chiffrée, migrations, dépôts)
    npm run smoke:sqlite  # vérifie que le module SQLite chiffré fonctionne dans le moteur d'Electron
    npm run build      # typecheck + compilation de production (dossier out/)
    npm run preview    # lance la version compilée

## Structure

Voir `docs/ARCHITECTURE.md`.

## Travailler avec git

Le projet est livré phase par phase. Voir `docs/GIT_WORKFLOW.md` pour intégrer chaque livraison dans votre dépôt.
