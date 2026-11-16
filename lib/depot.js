'use strict';
/*
 * Dépôt de données : tout est stocké en fichiers JSON lisibles dans data/.
 *   meta.json              taxonomies (pays suivis, catégories, statuts, échelle de suspicion)
 *   evenements/AAAA.json   un fichier par année, pour que le registre grossisse sans ralentir
 *   dossiers.json          fils conducteurs regroupant plusieurs événements
 *   pistes.json            pistes à vérifier
 *   perso.json             annotations personnelles (suivi, notes), séparées de la recherche
 *   syntheses/AAAA.md      synthèse annuelle
 *   journal.json           journal des modifications
 *   corbeille.json         événements supprimés (récupérables)
 *   sauvegardes/           copie quotidienne de chaque fichier avant sa première modification
 *   data.js                copie d'ensemble générée, pour ouvrir index.html sans serveur
 */

const fs = require('fs');
const path = require('path');
const schema = require('./schema');

const JOURS_DE_SAUVEGARDE = 60;
const TAILLE_JOURNAL = 2000;

function jourLocal(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Lit un fichier texte en UTF-8 strict : un fichier enregistré en ANSI (Windows-1252)
 * est refusé au lieu d'être lu avec des « \uFFFD » à la place des accents. Le BOM est retiré.
 */
function lireUtf8(f) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(f));
  } catch (err) {
    if (err instanceof TypeError) throw new Error(`${f} : fichier non UTF-8 (réenregistrez-le en UTF-8)`);
    throw err;
  }
}

function comparerEvenements(a, b) {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

class Depot {
  constructor(dossier) {
    this.dossier = path.resolve(dossier);
    this.cache = new Map();
    for (const d of ['evenements', 'syntheses', 'sauvegardes']) {
      fs.mkdirSync(path.join(this.dossier, d), { recursive: true });
    }
  }

  chemin(...p) {
    return path.join(this.dossier, ...p);
  }

  /* ---------- lecture et écriture de bas niveau ---------- */

  lire(relatif, defaut) {
    const f = this.chemin(relatif);
    let st;
    try {
      st = fs.statSync(f);
    } catch {
      return structuredClone(defaut);
    }
    const c = this.cache.get(f);
    if (c && c.mtimeMs === st.mtimeMs && c.size === st.size) return structuredClone(c.valeur);
    const valeur = JSON.parse(lireUtf8(f));
    this.cache.set(f, { mtimeMs: st.mtimeMs, size: st.size, valeur });
    return structuredClone(valeur);
  }

  ecrireTexte(relatif, contenu, sauvegarder = true) {
    const f = this.chemin(relatif);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    if (sauvegarder) this.sauvegarder(relatif);
    const tmp = `${f}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, contenu, 'utf8');
    try {
      fs.renameSync(tmp, f);
    } catch {
      // Sous Windows, un antivirus ou un éditeur peut verrouiller brièvement la cible.
      fs.writeFileSync(f, contenu, 'utf8');
      fs.rmSync(tmp, { force: true });
    }
    this.cache.delete(f);
  }

  ecrire(relatif, valeur) {
    this.ecrireTexte(relatif, JSON.stringify(valeur, null, 2) + '\n');
  }

  /** Conserve l'état du fichier tel qu'il était au début de la journée. */
  sauvegarder(relatif) {
    const f = this.chemin(relatif);
    if (!fs.existsSync(f)) return;
    const cible = this.chemin('sauvegardes', jourLocal(), relatif.replace(/[\\/]/g, '__'));
    if (fs.existsSync(cible)) return;
    fs.mkdirSync(path.dirname(cible), { recursive: true });
    fs.copyFileSync(f, cible);
    this.elaguerSauvegardes();
  }

  elaguerSauvegardes() {
    const racine = this.chemin('sauvegardes');
    const jours = fs
      .readdirSync(racine, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name))
      .map((d) => d.name)
      .sort();
    for (const j of jours.slice(0, Math.max(0, jours.length - JOURS_DE_SAUVEGARDE))) {
      fs.rmSync(path.join(racine, j), { recursive: true, force: true });
    }
  }

  /* ---------- taxonomies ---------- */

  meta() {
    const m = this.lire('meta.json', null);
    if (!m) throw new Error(`meta.json introuvable dans ${this.dossier}`);
    return m;
  }

  /* ---------- événements ---------- */

  annees() {
    return fs
      .readdirSync(this.chemin('evenements'))
      .map((f) => /^(\d{4})\.json$/.exec(f))
      .filter(Boolean)
      .map((m) => Number(m[1]))
      .sort((a, b) => a - b);
  }

  lireAnnee(annee) {
    const d = this.lire(`evenements/${annee}.json`, { evenements: [] });
    return Array.isArray(d) ? d : d.evenements || [];
  }

  ecrireAnnee(annee, evenements) {
    evenements.sort(comparerEvenements);
    this.ecrire(`evenements/${annee}.json`, { schema: schema.VERSION_SCHEMA, annee: Number(annee), evenements });
  }

  tousEvenements() {
    return this.annees().flatMap((a) => this.lireAnnee(a));
  }

  trouver(id) {
    for (const annee of this.annees()) {
      const evenements = this.lireAnnee(annee);
      const index = evenements.findIndex((e) => e.id === id);
      if (index >= 0) return { annee, evenements, index, evenement: evenements[index] };
    }
    return null;
  }

  /**
   * Ajoute ou met à jour une série d'événements en une seule passe par année.
   * mode « ajouter » : un identifiant déjà présent est ignoré.
   * mode « remplacer » : un identifiant déjà présent est mis à jour.
   */
  importer(bruts, { origine = 'import', mode = 'ajouter' } = {}) {
    const meta = this.meta();
    const rapport = { ajoutes: [], mis_a_jour: [], ignores: [], erreurs: [], avertissements: [] };
    const parAnnee = new Map();
    const emplacement = new Map();
    for (const annee of this.annees()) {
      const evenements = this.lireAnnee(annee);
      parAnnee.set(annee, evenements);
      for (const e of evenements) emplacement.set(e.id, annee);
    }
    const touchees = new Set();
    const recoivent = new Set();

    (Array.isArray(bruts) ? bruts : []).forEach((brut, i) => {
      let { evenement, erreurs, avertissements } = schema.normaliserEvenement(brut, meta, { origine });
      const repere = evenement.id || `élément n° ${i + 1}`;
      if (erreurs.length) {
        rapport.erreurs.push({ id: repere, erreurs });
        return;
      }
      const ancienneAnnee = emplacement.get(evenement.id);
      const anciens = ancienneAnnee != null ? parAnnee.get(ancienneAnnee) : null;
      const k = anciens ? anciens.findIndex((e) => e.id === evenement.id) : -1;
      // Mise à jour sans champ « veille » : la fiche garde son pays suivi (comme les pistes),
      // au lieu d'être rangée sous le pays par défaut et de perdre sa région.
      if (k >= 0 && mode === 'remplacer' && schema.vide(brut.veille) && anciens[k].veille && anciens[k].veille !== evenement.veille) {
        ({ evenement, erreurs, avertissements } = schema.normaliserEvenement({ ...brut, veille: anciens[k].veille }, meta, { origine }));
      }
      if (avertissements.length) rapport.avertissements.push({ id: repere, avertissements });
      const annee = Number(evenement.date.slice(0, 4));
      if (ancienneAnnee != null) {
        if (mode !== 'remplacer') {
          rapport.ignores.push(evenement.id);
          return;
        }
        evenement.cree = anciens[k].cree || evenement.cree;
        if (!brut.origine && anciens[k].origine) evenement.origine = anciens[k].origine;
        anciens.splice(k, 1);
        touchees.add(ancienneAnnee);
        rapport.mis_a_jour.push(evenement.id);
      } else {
        rapport.ajoutes.push(evenement.id);
      }
      if (!parAnnee.has(annee)) parAnnee.set(annee, []);
      parAnnee.get(annee).push(evenement);
      emplacement.set(evenement.id, annee);
      touchees.add(annee);
      recoivent.add(annee);
    });

    // Les années qui reçoivent des fiches sont écrites d'abord : si une écriture échoue,
    // une fiche déplacée existe au pire en double (signalé par valider.js), jamais nulle part.
    for (const annee of recoivent) this.ecrireAnnee(annee, parAnnee.get(annee));
    for (const annee of touchees) if (!recoivent.has(annee)) this.ecrireAnnee(annee, parAnnee.get(annee));
    return rapport;
  }

  creerEvenement(brut, origine = 'manuel') {
    const meta = this.meta();
    const { evenement, erreurs, avertissements } = schema.normaliserEvenement(brut, meta, { origine });
    if (erreurs.length) return { erreurs };
    // Un identifiant déjà pris reçoit un suffixe plutôt que d'écraser l'existant.
    const base = evenement.id;
    let n = 2;
    while (this.trouver(evenement.id)) evenement.id = `${base}-${n++}`;
    const annee = Number(evenement.date.slice(0, 4));
    const evenements = this.lireAnnee(annee);
    evenements.push(evenement);
    this.ecrireAnnee(annee, evenements);
    return { evenement, avertissements };
  }

  modifierEvenement(id, brut) {
    const actuel = this.trouver(id);
    if (!actuel) return { introuvable: true };
    const meta = this.meta();
    const fusion = { ...actuel.evenement, ...brut, id, cree: actuel.evenement.cree, origine: actuel.evenement.origine };
    const { evenement, erreurs, avertissements } = schema.normaliserEvenement(fusion, meta, { controleEncodage: brut });
    if (erreurs.length) return { erreurs };
    const annee = Number(evenement.date.slice(0, 4));
    actuel.evenements.splice(actuel.index, 1);
    if (annee === actuel.annee) {
      actuel.evenements.push(evenement);
      this.ecrireAnnee(annee, actuel.evenements);
    } else {
      // Nouvelle année écrite d'abord : un échec laisse au pire un doublon, jamais une perte.
      const cible = this.lireAnnee(annee);
      cible.push(evenement);
      this.ecrireAnnee(annee, cible);
      this.ecrireAnnee(actuel.annee, actuel.evenements);
    }
    return { evenement, avertissements };
  }

  supprimerEvenement(id) {
    const actuel = this.trouver(id);
    if (!actuel) return false;
    const corbeille = this.lire('corbeille.json', { schema: schema.VERSION_SCHEMA, evenements: [] });
    corbeille.evenements.push({ ...actuel.evenement, supprime: new Date().toISOString() });
    this.ecrire('corbeille.json', corbeille);
    actuel.evenements.splice(actuel.index, 1);
    this.ecrireAnnee(actuel.annee, actuel.evenements);
    return true;
  }

  /* ---------- annotations personnelles ---------- */

  perso() {
    return this.lire('perso.json', { schema: schema.VERSION_SCHEMA, annotations: {} }).annotations || {};
  }

  annoter(id, correctif) {
    const d = this.lire('perso.json', { schema: schema.VERSION_SCHEMA, annotations: {} });
    d.annotations = d.annotations || {};
    const a = { ...(d.annotations[id] || {}) };
    if ('suivi' in correctif) a.suivi = Boolean(correctif.suivi);
    if ('notes' in correctif) a.notes = schema.texte(correctif.notes, 20000);
    if ('etat' in correctif) a.etat = schema.slug(correctif.etat, 30) || null;
    a.maj = new Date().toISOString();
    if (!a.suivi && !a.notes && !a.etat) delete d.annotations[id];
    else d.annotations[id] = a;
    this.ecrire('perso.json', d);
    return d.annotations[id] || null;
  }

  /**
   * Restauration d'une sauvegarde : ajoute les annotations absentes localement.
   * Une annotation locale existante n'est jamais écrasée.
   * Accepte { id: annotation } ou { annotations: { id: annotation } }.
   */
  importerPerso(brut) {
    const rapport = { ajoutees: [], ignorees: [], erreurs: [] };
    const source = brut && typeof brut === 'object' && !Array.isArray(brut) ? (brut.annotations && typeof brut.annotations === 'object' ? brut.annotations : brut) : null;
    if (!source || Array.isArray(source)) return rapport;
    const d = this.lire('perso.json', { schema: schema.VERSION_SCHEMA, annotations: {} });
    d.annotations = d.annotations || {};
    for (const [cle, x] of Object.entries(source)) {
      const id = schema.slug(cle, 90);
      if (!id || !x || typeof x !== 'object' || Array.isArray(x)) {
        rapport.erreurs.push({ id: schema.texte(cle, 90) || '(sans identifiant)', erreurs: ['annotation invalide'] });
        continue;
      }
      if (schema.malEncode(x)) {
        rapport.erreurs.push({ id, erreurs: [schema.ERREUR_ENCODAGE] });
        continue;
      }
      if (d.annotations[id]) {
        rapport.ignorees.push(id);
        continue;
      }
      const a = {};
      if (x.suivi) a.suivi = true;
      const notes = schema.texte(x.notes, 20000);
      if (notes) a.notes = notes;
      const etat = schema.slug(x.etat, 30);
      if (etat) a.etat = etat;
      if (!a.suivi && !a.notes && !a.etat) continue;
      a.maj = schema.texte(x.maj, 40) || new Date().toISOString();
      d.annotations[id] = a;
      rapport.ajoutees.push(id);
    }
    if (rapport.ajoutees.length) this.ecrire('perso.json', d);
    return rapport;
  }

  /* ---------- pistes ---------- */

  pistes() {
    return this.lire('pistes.json', { schema: schema.VERSION_SCHEMA, pistes: [] }).pistes || [];
  }

  enregistrerPistes(brutes, { remplacer = false } = {}) {
    const meta = this.meta();
    const pistes = this.pistes();
    const rapport = { ajoutees: [], mises_a_jour: [], ignorees: [], erreurs: [] };
    for (const brut of Array.isArray(brutes) ? brutes : []) {
      const { piste, erreurs } = schema.normaliserPiste(brut, meta);
      if (erreurs.length) {
        rapport.erreurs.push({ id: piste.id, erreurs });
        continue;
      }
      const k = pistes.findIndex((p) => p.id === piste.id);
      if (k >= 0) {
        if (!remplacer) {
          rapport.ignorees.push(piste.id);
          continue;
        }
        piste.cree = pistes[k].cree || piste.cree;
        // Le tri fait par l'utilisateur est conservé si la mise à jour ne précise pas d'état.
        if (!brut || brut.etat == null || brut.etat === '') piste.etat = pistes[k].etat;
        // De même pour le pays suivi.
        if ((!brut || brut.veille == null || brut.veille === '') && pistes[k].veille) piste.veille = pistes[k].veille;
        pistes[k] = piste;
        rapport.mises_a_jour.push(piste.id);
      } else {
        pistes.push(piste);
        rapport.ajoutees.push(piste.id);
      }
    }
    this.ecrire('pistes.json', { schema: schema.VERSION_SCHEMA, pistes });
    return rapport;
  }

  modifierPiste(id, correctif) {
    const pistes = this.pistes();
    const k = pistes.findIndex((p) => p.id === id);
    if (k < 0) return { introuvable: true };
    const { piste, erreurs } = schema.normaliserPiste({ ...pistes[k], ...correctif, id }, this.meta(), { controleEncodage: correctif });
    if (erreurs.length) return { erreurs };
    piste.cree = pistes[k].cree || piste.cree;
    pistes[k] = piste;
    this.ecrire('pistes.json', { schema: schema.VERSION_SCHEMA, pistes });
    return { piste };
  }

  supprimerPiste(id) {
    const pistes = this.pistes();
    const reste = pistes.filter((p) => p.id !== id);
    if (reste.length === pistes.length) return false;
    this.ecrire('pistes.json', { schema: schema.VERSION_SCHEMA, pistes: reste });
    return true;
  }

  /* ---------- dossiers ---------- */

  dossiers() {
    return this.lire('dossiers.json', { schema: schema.VERSION_SCHEMA, dossiers: [] }).dossiers || [];
  }

  /**
   * Crée ou modifie un dossier. Avec { creation: true }, un identifiant déjà pris est
   * refusé au lieu d'écraser le dossier existant. Une modification garde les champs
   * non transmis (par exemple « etat »).
   */
  enregistrerDossier(brut, { creation = false } = {}) {
    const meta = this.meta();
    let { dossier, erreurs } = schema.normaliserDossier(brut, meta);
    if (erreurs.length) return { erreurs };
    const dossiers = this.dossiers();
    const k = dossiers.findIndex((d) => d.id === dossier.id);
    if (k >= 0) {
      if (creation) return { erreurs: [`un dossier porte déjà cet identifiant (« ${dossier.id} »)`], existe: true };
      ({ dossier, erreurs } = schema.normaliserDossier({ ...dossiers[k], ...brut, id: dossier.id }, meta));
      if (erreurs.length) return { erreurs };
      dossiers[k] = dossier;
    } else {
      dossiers.push(dossier);
    }
    dossiers.sort((a, b) => a.titre.localeCompare(b.titre, 'fr'));
    this.ecrire('dossiers.json', { schema: schema.VERSION_SCHEMA, dossiers });
    return { dossier };
  }

  /**
   * Restauration d'une sauvegarde : crée les dossiers manquants; un dossier existant
   * n'est remplacé qu'avec { remplacer: true }. Une seule écriture de dossiers.json.
   */
  importerDossiers(bruts, { remplacer = false } = {}) {
    const rapport = { ajoutes: [], mis_a_jour: [], ignores: [], erreurs: [] };
    const meta = this.meta();
    const dossiers = this.dossiers();
    (Array.isArray(bruts) ? bruts : []).forEach((brut, i) => {
      const { dossier, erreurs } = schema.normaliserDossier(brut, meta);
      if (schema.malEncode(brut)) erreurs.push(schema.ERREUR_ENCODAGE);
      if (erreurs.length) {
        rapport.erreurs.push({ id: dossier.id || `dossier n° ${i + 1}`, erreurs });
        return;
      }
      const k = dossiers.findIndex((d) => d.id === dossier.id);
      if (k >= 0) {
        if (!remplacer) {
          rapport.ignores.push(dossier.id);
          return;
        }
        dossiers[k] = dossier;
        rapport.mis_a_jour.push(dossier.id);
      } else {
        dossiers.push(dossier);
        rapport.ajoutes.push(dossier.id);
      }
    });
    if (rapport.ajoutes.length || rapport.mis_a_jour.length) {
      dossiers.sort((a, b) => a.titre.localeCompare(b.titre, 'fr'));
      this.ecrire('dossiers.json', { schema: schema.VERSION_SCHEMA, dossiers });
    }
    return rapport;
  }

  supprimerDossier(id) {
    const dossiers = this.dossiers();
    const reste = dossiers.filter((d) => d.id !== id);
    if (reste.length === dossiers.length) return false;
    this.ecrire('dossiers.json', { schema: schema.VERSION_SCHEMA, dossiers: reste });
    return true;
  }

  /* ---------- synthèses ---------- */

  syntheses() {
    const sortie = {};
    for (const f of fs.readdirSync(this.chemin('syntheses'))) {
      const m = /^(\d{4})\.md$/.exec(f);
      if (m) sortie[m[1]] = lireUtf8(this.chemin('syntheses', f));
    }
    return sortie;
  }

  enregistrerSynthese(annee, markdown) {
    if (!/^\d{4}$/.test(String(annee))) return false;
    this.ecrireTexte(`syntheses/${annee}.md`, schema.texte(markdown, 400000) + '\n');
    return true;
  }

  /**
   * Restauration d'une sauvegarde ({ "2026": "markdown", ... }) : une année n'est écrite
   * que si sa synthèse est absente (ou vide), ou avec { remplacer: true }.
   */
  importerSyntheses(brut, { remplacer = false } = {}) {
    const rapport = { ajoutees: [], remplacees: [], ignorees: [], erreurs: [] };
    if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return rapport;
    for (const [annee, markdown] of Object.entries(brut)) {
      if (!/^\d{4}$/.test(annee) || typeof markdown !== 'string') {
        rapport.erreurs.push({ id: schema.texte(annee, 20), erreurs: ['année ou texte invalide'] });
        continue;
      }
      if (schema.malEncode(markdown)) {
        rapport.erreurs.push({ id: annee, erreurs: [schema.ERREUR_ENCODAGE] });
        continue;
      }
      const f = this.chemin('syntheses', `${annee}.md`);
      let presente = false;
      try {
        presente = Boolean(lireUtf8(f).trim());
      } catch {
        presente = fs.existsSync(f);
      }
      if (presente && !remplacer) {
        rapport.ignorees.push(annee);
        continue;
      }
      this.enregistrerSynthese(annee, markdown);
      (presente ? rapport.remplacees : rapport.ajoutees).push(annee);
    }
    return rapport;
  }

  /* ---------- journal ---------- */

  journal() {
    return this.lire('journal.json', { schema: schema.VERSION_SCHEMA, entrees: [] }).entrees || [];
  }

  journaliser(type, message) {
    const entrees = this.journal();
    entrees.push({ date: new Date().toISOString(), type, message: schema.texte(message, 500) });
    this.ecrire('journal.json', {
      schema: schema.VERSION_SCHEMA,
      entrees: entrees.slice(-TAILLE_JOURNAL)
    });
  }

  /* ---------- vue d'ensemble ---------- */

  instantane() {
    const evenements = this.tousEvenements();
    return {
      schema: schema.VERSION_SCHEMA,
      genere: new Date().toISOString(),
      meta: this.meta(),
      annees: this.annees(),
      evenements,
      dossiers: this.dossiers(),
      pistes: this.pistes(),
      perso: this.perso(),
      syntheses: this.syntheses(),
      journal: this.journal().slice(-300)
    };
  }

  /** Régénère data.js, la copie lue par index.html quand il est ouvert sans serveur. */
  genererBundle() {
    const contenu =
      '/* Fichier généré automatiquement — ne pas modifier à la main. */\n' +
      'window.VEILLE_DONNEES = ' +
      JSON.stringify(this.instantane()) +
      ';\n';
    this.ecrireTexte('data.js', contenu, false);
  }
}

module.exports = { Depot, jourLocal, lireUtf8 };
