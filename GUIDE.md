# Veille Monde — guide

Registre personnel, sur votre ordinateur, des événements rapportés publiquement qui
peuvent indiquer une ingérence, de l'espionnage, une opération clandestine ou une
anomalie liée à un pays suivi (aujourd'hui le Canada et la France). Les données sont
des fichiers dans le dossier `data/`; une copie publique en est publiée sur GitHub
Pages et mise à jour chaque jour (voir « Version publique »).

## Démarrer

Double-cliquez **Demarrer.bat**. Une fenêtre noire s'ouvre (le serveur local) et le
navigateur affiche `http://localhost:4826`. Laissez la fenêtre ouverte pendant que
vous travaillez; fermez-la pour arrêter.

Sans le serveur, vous pouvez ouvrir `index.html` directement : tout est consultable,
mais en **lecture seule** (les étoiles et les notes restent alors dans le navigateur).

Il faut Node.js (déjà installé sur ce poste). Aucune autre dépendance.

## Les onglets

| Onglet | À quoi il sert |
|---|---|
| Tableau de bord | Chiffres clés, événements par mois, activité par acteur, signaux les plus forts. Cliquer un graphique filtre le registre. |
| Chronologie | Les fiches, mois par mois. |
| Registre | Tableau triable, exportation CSV ou JSON de la sélection. |
| Carte | Un cercle par lieu (il faut Internet pour le fond de carte). |
| Dossiers | Les affaires qui relient plusieurs événements. |
| Acteurs | Ce que les sources attribuent à chaque État ou acteur. |
| Anomalies | Tout ce qui cloche, classé par niveau de suspicion. |
| Pistes | Ce qui reste à vérifier. |
| Synthèse | Lecture d'ensemble de l'année. |
| Méthode | Échelles, limites, journal des modifications. |

Les filtres du haut s'appliquent à tous les onglets, et l'adresse de la page les
retient : un marque-page enregistre donc une vue filtrée.

## Pays suivis

Le premier filtre, **Pays suivi**, limite tout le site à un pays : événements,
dossiers, acteurs, anomalies, carte, graphiques et pistes (une piste sans pays
précisé reste visible partout). « Tous les pays » réunit tout le registre, et chaque
fiche affiche alors son pays. Le dernier choix est retenu par le navigateur et sert
de vue par défaut à l'ouverture suivante; dans l'adresse, il s'écrit `v=france`,
`v=canada` ou `v=tous`.

Les pays suivis sont décrits dans `data/meta.json`, liste `paysSuivis` :

```json
{
  "id": "france",
  "nom": "France",
  "article": "en France",
  "regions": [{ "code": "IDF", "nom": "Île-de-France" }, { "code": "PAC", "nom": "Provence-Alpes-Côte d'Azur" }],
  "centre": [46.6, 2.4],
  "zoom": 5
}
```

`id` est l'identifiant inscrit dans les fiches (minuscules, sans accents), `article`
la tournure employée dans les textes (« au Canada », « en France »), `regions` les
codes acceptés dans le champ `province`, `centre` et `zoom` le cadrage de la carte.
**Pour suivre un autre pays, il suffit d'ajouter une entrée à cette liste** : aucune
modification du code n'est nécessaire.

## Version publique

Le dossier est un dépôt git relié à https://github.com/SamuelLachance/veille-monde.
Chaque poussée sur la branche `main` déclenche `.github/workflows/pages.yml`, qui
valide le registre, construit la page statique avec `node outils/publier.js` et la
publie sur https://samuellachance.github.io/veille-monde/ (« Version publique », en
consultation seulement).

- **Ce qui n'est jamais publié** : `data/perso.json` (vos étoiles, votre suivi, vos
  notes), `data/corbeille.json` et `data/sauvegardes/`, exclus par `.gitignore`.
  Sur le site public, les étoiles et les notes de chaque visiteur restent dans son
  navigateur.
- **Mise à jour quotidienne** : une routine Claude Code dans le nuage (« Veille Monde —
  mise à jour quotidienne », gérée sur https://claude.ai/code/routines) tourne chaque
  matin à 6 h, cherche les événements nouveaux pour chaque pays suivi, fait relire
  chaque fiche contre ses sources, l'importe, puis pousse sur `main`.
- **Sur ce poste** : `Demarrer.bat` récupère d'abord ces mises à jour (`git pull`).
  Après une modification locale (ajout, importation), publiez-la :

```bash
git add -A && git commit -m "Mise à jour locale" && git pull --rebase && git push
```

## Tenir le registre à jour

### À la main

- **+ Ajouter** : nouvelle fiche. Les faits d'abord (titre, résumé, sources), l'analyse
  ensuite (ce qui cloche, autres explications, niveau de suspicion).
- **Modifier / Supprimer** : dans la fiche ouverte. Une fiche supprimée va dans
  `data/corbeille.json`.
- **Étoile, « Où j'en suis », notes** : votre suivi personnel, rangé dans
  `data/perso.json`. Les importations ne modifient jamais une annotation existante
  (seule la restauration d'une « Sauvegarde » ajoute celles qui manquent).
- **Pistes** : notez un signalement à recouper; « Convertir en événement » quand une
  source solide le confirme.
- **Nouveautés** : après une importation, le tableau de bord signale les fiches
  ajoutées depuis votre dernier pointage. « Les voir » les affiche; « Tout marquer
  comme vu » remet le compteur à zéro.

### Avec Claude

Ouvrez une session dans ce dossier et demandez par exemple :

> Mets à jour Veille Monde pour la France : cherche les événements depuis le
> 15 novembre 2026, produis un fichier d'importation au format du GUIDE et importe-le
> avec `--veille france`.

Le fichier attendu a cette forme :

```json
{
  "theme": "mise-a-jour-2026-12",
  "evenements": [ { "...": "voir le schéma ci-dessous" } ],
  "pistes": [ { "titre": "...", "description": "...", "pourquoi": "...", "url": "https://..." } ]
}
```

Puis :

```bash
node outils/valider.js nouveautes.json
```

```bash
node outils/importer.js nouveautes.json --origine recherche
```

`--veille <id>` (par exemple `--veille france`) donne ce pays suivi aux événements et
aux pistes du fichier qui ne précisent pas de champ `veille`; un identifiant absent de
`paysSuivis` est refusé. Sans cette option, un événement sans `veille` est rangé sous
`canada` (c'est le cas des fiches antérieures à ce champ).

Sans `--remplacer`, une fiche dont l'identifiant existe déjà est ignorée : on peut
relancer une importation sans créer de doublons. Avec `--remplacer`, les fiches
existantes sont mises à jour (utile quand une affaire évolue : verdict, démenti).
Une fiche mise à jour sans champ `veille` (ni `--veille`) garde son pays suivi.
Les pistes suivent la même règle; une piste mise à jour garde l'état que vous lui
avez donné (« Écartée », « Vérifiée »…) si le fichier ne précise pas de champ `etat`.

Le bouton **Importer** de la page fait la même chose à partir d'un fichier ou d'un
texte collé : le `theme` du fichier est donné aux pistes qui n'en ont pas, le mode
« Ajouter et mettre à jour » correspond à `--remplacer`, et la liste « Pays suivi des
fiches sans pays » correspond à `--veille`.

## Schéma d'un événement

| Champ | Contenu |
|---|---|
| `id` | `AAAA-MM-JJ-mots-cles`, unique, sans accents. Créé automatiquement s'il manque. |
| `date` | `AAAA-MM-JJ` : date de l'événement, sinon de sa révélation. |
| `date_precision` | `jour`, `mois` ou `annee`. |
| `titre` | Factuel, environ 110 caractères. |
| `resume` | 2 à 4 phrases de faits, avec attribution (« selon… »). |
| `details` | Chronologie, qui a dit quoi, état judiciaire, ce qui reste inconnu. |
| `veille` | Pays suivi dont relève la fiche : un `id` de `paysSuivis` (`canada`, `france`). `canada` s'il manque; une valeur inconnue est signalée et remplacée par `canada`. |
| `territoire` | `interieur` (sur le territoire du pays suivi), `etranger`, `cyber` ou `mixte`. Déduit du pays s'il manque. |
| `lieu`, `province`, `pays` | Lieu en clair; code de région ou de province **du pays suivi** (QC, ON… pour le Canada; IDF, PAC… pour la France) ou `null` (un code d'un autre pays est écarté avec un avertissement); pays où l'événement a eu lieu (par défaut, le pays suivi). |
| `lat`, `lon` | Coordonnées approximatives, ou `null`. |
| `categorie` | Une des catégories de `data/meta.json`. |
| `acteurs` | Acteurs présumés selon les sources; `["Inconnu"]` sans attribution. |
| `cibles` | Institutions, communautés, secteurs visés. |
| `statut` | `confirme`, `accusations`, `allegue-officiel`, `rapporte`, `non-verifie`, `dementi`. |
| `fiabilite` | `elevee`, `moyenne`, `faible`. |
| `suspicion` | 1 à 5 (voir l'onglet Méthode). |
| `anomalies` | Ce qui cloche — de l'analyse, une observation par élément. |
| `hypotheses` | Autres explications possibles, y compris les plus banales. |
| `dossier` | Identifiant du dossier qui relie l'affaire, ou `null`. |
| `tags` | Mots-clés. |
| `sources` | `[{ "titre", "media", "url", "date" }]` — au moins une adresse vérifiée. |
| `suivi` | État du dossier public : `a-surveiller`, `en-cours`, `clos`. |

Les catégories, statuts, libellés et pays suivis sont dans `data/meta.json` : on peut
en ajouter sans toucher au code. La catégorie `canadiens-etranger` garde cet
identifiant pour la compatibilité, mais s'affiche « Ressortissants à l'étranger » et
vaut pour tout pays suivi.

Les dossiers (`dossiers.json`) et les pistes (`pistes.json`) acceptent aussi un champ
`veille` facultatif; sans lui, ils sont visibles quel que soit le pays sélectionné.

## Règles de saisie

1. **Pas de fiche sans source.** Sans adresse vérifiable, c'est une piste.
2. **Une allégation reste une allégation.** Écrire « selon la GRC », « selon la
   DGSI », « selon tel média »; ne jamais présenter une accusation comme un fait établi.
3. **Séparer faits et analyse.** Les faits dans `resume` et `details`; les
   interrogations dans `anomalies`; toujours au moins une explication banale dans
   `hypotheses`.
4. **Noter l'évolution.** Quand une affaire change (verdict, démenti), créer une
   nouvelle fiche datée du développement et la rattacher au même `dossier`, ou mettre
   à jour le `statut` de la fiche d'origine.
5. **Personnes nommées.** S'en tenir à ce que les autorités ou les grands médias ont
   publié; la présomption d'innocence s'applique.

## Outils

Les commandes se lancent dans un terminal ouvert dans le dossier du site (`veille-canada`)
(dans l'Explorateur : clic droit dans le dossier, « Ouvrir dans le Terminal »).

```bash
node outils/valider.js
```

Vérifie tout le registre : schéma, doublons probables, dossiers manquants, pays suivis
inconnus (champ `veille` des fiches, dossiers et pistes); affiche aussi le nombre de
fiches par pays suivi.

```bash
node outils/verifier-liens.js
```

Teste que les adresses des sources répondent encore (nécessite Internet).

```bash
node outils/generer-bundle.js
```

Recrée `data/data.js` après une modification manuelle des fichiers JSON.

```bash
node outils/autotest.js
```

Vérifie que le serveur fonctionne (ajout, modification, notes, importation,
suppression, refus des écritures externes) sur un dossier temporaire, sans toucher
au registre. À lancer après toute modification du code.

## Où sont les données

```
data/
  meta.json               pays suivis, catégories, statuts, échelle de suspicion
  evenements/2026.json    un fichier par année
  dossiers.json           affaires
  pistes.json             pistes à vérifier
  perso.json              vos étoiles et vos notes
  syntheses/2026.md       synthèse annuelle (Markdown)
  journal.json            journal des modifications
  corbeille.json          fiches supprimées
  sauvegardes/            copie quotidienne avant modification (60 jours)
  data.js                 copie d'ensemble générée (lecture sans serveur)
```

**Sauvegarder** : copiez le dossier `data/`, ou cliquez « Sauvegarde » dans la page
pour télécharger tout le registre en un fichier JSON.

**Restaurer un fichier** : arrêtez le serveur, remplacez le fichier de `data/` par sa
copie de `data/sauvegardes/AAAA-MM-JJ/`, puis lancez `node outils/generer-bundle.js`.
Dans les sauvegardes, « `__` » remplace la barre oblique des sous-dossiers :

| Copie dans `sauvegardes/AAAA-MM-JJ/` | À remettre dans `data/` sous le nom |
|---|---|
| `evenements__2026.json` | `evenements/2026.json` |
| `syntheses__2026.md` | `syntheses/2026.md` |
| `pistes.json`, `dossiers.json`, `perso.json`, `journal.json` | même nom, directement dans `data/` |

**Restaurer une « Sauvegarde »** : importez le fichier téléchargé avec le bouton
**Importer** (ou `node outils/importer.js sauvegarde.json`). Sont repris :

- les événements et les pistes, selon le mode choisi (comme ci-dessus);
- les dossiers : ceux qui manquent sont créés; ceux qui existent ne sont remplacés
  qu'en mode « Ajouter et mettre à jour » (`--remplacer`);
- vos étoiles et notes : celles qui manquent sont ajoutées; une annotation déjà
  présente n'est jamais écrasée;
- les synthèses : une année est écrite seulement si elle n'existe pas encore, ou en
  mode « Ajouter et mettre à jour » (`--remplacer`).

Si la page refuse un fichier trop volumineux, importez-le avec
`node outils/importer.js`.

**Déplacer** : tout le dossier `veille-canada` est autonome; copiez-le où vous
voulez (Documents, clé USB, disque synchronisé) et relancez `Demarrer.bat`. Son nom
date de l'époque où le site ne suivait que le Canada : vous pouvez le renommer
librement (par exemple `veille-monde`), rien n'en dépend à l'intérieur; pensez
seulement à mettre à jour vos raccourcis vers `Demarrer.bat`.

**Exportations** : la « Sauvegarde » se télécharge sous le nom
`veille-monde-AAAA-MM-JJ.json`, l'export du registre sous `veille-monde-AAAA-MM-JJ.csv`.

## Dépannage

- **« Lecture seule »** : la page a été ouverte sans le serveur. Lancez `Demarrer.bat`.
- **Le port 4826 est pris** : `node serveur.js --port 5000 --ouvrir`.
- **La carte reste grise** : pas d'accès Internet; les cercles et la liste des lieux
  restent utilisables.
- **Une fiche n'apparaît pas** : vérifiez les filtres (la période par défaut est
  l'année la plus récente) puis `node outils/valider.js`.
