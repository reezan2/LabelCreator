# Générateur d'étiquettes Ventilairsec

Version compatible **GitHub Pages**.

## Mise en ligne rapide

1. Crée un dépôt GitHub.
2. Dépose tous les fichiers de ce dossier à la racine du dépôt.
3. Va dans **Settings > Pages**.
4. Dans **Build and deployment**, choisis :
   - **Source** : Deploy from a branch
   - **Branch** : `main` / `/root`
5. Sauvegarde.
6. Attends quelques secondes puis ouvre l'URL GitHub Pages fournie.

## Structure attendue du fichier Excel

### Feuille 1 - Produits
Colonnes conseillées :

- `Label Format`
- `Brand`
- `SKU`
- `Product`
- `Gencode - number`
- `Designation FR`
- `Designation EN`
- `Designation ES`
- `Designation IT`
- `Designation PT`

### Feuille 2 - Contenu
Colonnes conseillées :

- `Parent SKU`
- `SKU`
- `Designation`
- `Quantity`

Le lien se fait avec :

- `Parent SKU = SKU du produit principal`

## Logos

Place les logos PNG dans le dossier `assets/`.

Exemples :

- `assets/VMI.png`
- `assets/Neoventil.png`
- `assets/VA.png`

Le nom du fichier doit correspondre exactement à la valeur de la colonne `Brand`.

## Téléchargement

Sur GitHub Pages, les téléchargements PDF et ZIP sont plus fiables qu'en `file://`.

Après génération :
- le téléchargement est lancé automatiquement
- un bloc avec les boutons **Télécharger** et **Ouvrir** reste affiché sous les boutons principaux

## Conseils pour les traductions

Le plus simple est de conserver une colonne par langue :

- `Designation FR`
- `Designation EN`
- `Designation ES`
- `Designation IT`
- `Designation PT`

Tu peux ensuite cocher dans l'interface les langues à afficher sur l'étiquette.

## Note sur les codes-barres

Si `Gencode - number` contient un **EAN-13 valide**, le code-barres est généré en **EAN13**.  
Sinon, l'application bascule en **CODE128** pour éviter de produire un faux EAN-13.
