# Intégrer les livraisons dans git

Chaque phase est livrée sous forme d'un zip contenant le projet complet (sans `node_modules` ni `out`).
Le principe : on remplace le contenu du dépôt par celui du zip, puis git montre exactement ce qui a changé.

## Une seule fois : premier commit

    cd prmp-suivi-marches
    git init -b main
    git add .
    git status          # vérifier qu'il n'y a ni node_modules, ni out, ni fichier .sqlite
    git commit -m "chore: état initial (phases 0 à 2)"
    git tag phase-2

Si le dépôt existe déjà, validez d'abord vos modifications locales (`git status` doit être propre).

## À chaque nouvelle phase

1. Créer une branche de travail :

       git switch -c phase-3

2. Décompresser le zip dans un dossier temporaire, puis remplacer le contenu du projet **en supprimant les anciens fichiers** (sauf `.git`, `node_modules` et `out`) :

       unzip -q ../prmp-suivi-marches-phase3.zip -d /tmp/livraison
       find . -mindepth 1 -maxdepth 1 ! -name .git ! -name node_modules ! -name out -exec rm -rf {} +
       cp -a /tmp/livraison/prmp-suivi-marches/. .

   La suppression est volontaire : un fichier retiré ou renommé dans la livraison (ex. `src/shared/ipc.ts` en Phase 1) doit aussi disparaître de votre dépôt. Git ne perd rien : tout l'historique reste dans `.git`, et `git diff` montre précisément ce qui a été supprimé, ajouté ou modifié.

   Variante avec `rsync` (si installé) : `rsync -a --delete --exclude .git --exclude node_modules --exclude out /tmp/livraison/prmp-suivi-marches/ ./`

3. Relire ce qui a changé avant de valider :

       git status
       git diff --stat
       git diff            # en détail

   Si vous aviez modifié vous-même un fichier, il apparaît ici : c'est le moment de décider quoi garder.

4. Réinstaller et vérifier :

       npm install
       npm run lint && npm test && npm run build

5. Valider, puis fusionner une fois la phase validée :

       git add -A
       git commit -m "feat: phase 3 — régions et authentification"
       git switch main
       git merge --no-ff phase-3
       git tag phase-3

## Messages de commit conseillés (Conventional Commits)

- `feat:` nouvelle fonctionnalité · `fix:` correction · `docs:` documentation
- `test:` tests · `refactor:` sans changement de comportement · `chore:` outillage

## À ne jamais versionner

- `node_modules/`, `out/`, `dist/` (déjà dans `.gitignore`)
- Les bases de données (`*.sqlite`) et les clés de récupération : ce sont les données réelles de la PRMP
- Des mots de passe ou clés dans le code ou les fichiers de configuration

## Fins de ligne

`.gitattributes` force les fins de ligne LF : le même fichier reste identique entre Linux (développement) et Windows (poste cible). Ne le supprimez pas.

## Variante : recevoir un correctif plutôt qu'un zip

Pour les phases suivantes, vous pouvez demander un fichier `.patch` (la différence avec la phase précédente) :

    git switch -c phase-4
    git apply --check ../phase-4.patch    # vérifie qu'il s'applique proprement
    git apply ../phase-4.patch
    git add -A && git commit -m "feat: phase 4 — plan de passation"

Le correctif ne s'applique que si votre dépôt est dans l'état exact de la phase précédente.
