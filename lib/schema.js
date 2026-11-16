'use strict';
/*
 * Schéma des données de Veille Monde.
 * Partagé par le serveur local et les outils en ligne de commande : toute donnée
 * qui entre dans le registre (formulaire, importation, recherche) passe par ici.
 */

const VERSION_SCHEMA = 1;
// Provinces et territoires canadiens : repli quand meta.json ne décrit aucun pays suivi.
const PROVINCES = ['BC', 'AB', 'SK', 'MB', 'ON', 'QC', 'NB', 'NS', 'PE', 'NL', 'YT', 'NT', 'NU'];
const PRECISIONS = ['jour', 'mois', 'annee'];
// Pays suivi des fiches antérieures au champ « veille » (le registre ne suivait que le Canada).
const VEILLE_DEFAUT = 'canada';

function sansAccents(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Identifiant ASCII en minuscules, mots séparés par des tirets. */
function slug(s, max = 80) {
  return sansAccents(s == null ? '' : s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');
}

function texte(v, max) {
  if (v == null) return '';
  let s = String(v).replace(/\r\n?/g, '\n').trim();
  if (max && s.length > max) s = s.slice(0, max);
  return s;
}

function liste(v, maxElements = 40, maxLongueur = 800) {
  if (v == null || v === '') return [];
  const brut = Array.isArray(v) ? v : String(v).split(/\n/);
  const sortie = [];
  for (const x of brut) {
    const t = texte(x, maxLongueur);
    if (t && !sortie.includes(t)) sortie.push(t);
    if (sortie.length >= maxElements) break;
  }
  return sortie;
}

function ids(listeMeta) {
  return (listeMeta || []).map((x) => x.id);
}

/** Pays suivis décrits dans meta.json (« paysSuivis »); à défaut, le Canada seul. */
function paysSuivis(meta) {
  const liste = meta && Array.isArray(meta.paysSuivis) ? meta.paysSuivis.filter((p) => p && p.id) : [];
  if (liste.length) return liste;
  return [{ id: VEILLE_DEFAUT, nom: 'Canada', article: 'au Canada', regions: PROVINCES.map((code) => ({ code, nom: code })) }];
}

function paysSuivi(meta, id) {
  return paysSuivis(meta).find((p) => p.id === id) || null;
}

/** Identifiant du pays suivi par défaut : « canada » s'il est suivi, sinon le premier de la liste. */
function veilleParDefaut(meta) {
  const liste = paysSuivis(meta);
  return liste.some((p) => p.id === VEILLE_DEFAUT) ? VEILLE_DEFAUT : liste[0].id;
}

/**
 * Pays suivi d'un événement : absent → valeur par défaut (compatibilité avec les fiches
 * antérieures); inconnu → avertissement et valeur par défaut.
 */
function normaliserVeille(v, meta, avertissements) {
  const defaut = veilleParDefaut(meta);
  if (vide(v)) return defaut;
  const id = slug(v, 40);
  if (paysSuivi(meta, id)) return id;
  if (avertissements) avertissements.push(`pays suivi inconnu (« ${texte(v, 40)} »), remplacé par « ${defaut} »`);
  return defaut;
}

/** Pays suivi facultatif (dossiers, pistes) : absent ou inconnu → null. */
function veilleFacultative(v, meta) {
  if (vide(v)) return null;
  const id = slug(v, 40);
  return paysSuivi(meta, id) ? id : null;
}

/** Codes de région (province, région, territoire) d'un pays suivi. */
function codesRegions(meta, veille) {
  const p = paysSuivi(meta, veille);
  return p && Array.isArray(p.regions) ? p.regions.map((r) => String(r.code).toUpperCase()) : [];
}

/** Accepte AAAA-MM-JJ, AAAA-MM ou AAAA; retourne { date, precision } ou null. */
function normaliserDate(v) {
  const s = texte(v);
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    const [a, mo, j] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const d = new Date(Date.UTC(a, mo - 1, j));
    if (d.getUTCFullYear() !== a || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== j) return null;
    if (a < 1900 || a > 2200) return null;
    return { date: `${m[1]}-${m[2]}-${m[3]}`, precision: null };
  }
  // Même borne pour les formes courtes : une année hors plage serait rangée dans un
  // fichier (« 999.json », « 0.json ») que le dépôt ne relit jamais.
  m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
    if (Number(m[1]) < 1900 || Number(m[1]) > 2200) return null;
    return { date: `${m[1]}-${m[2]}-01`, precision: 'mois' };
  }
  m = /^(\d{4})$/.exec(s);
  if (m) {
    if (Number(m[1]) < 1900 || Number(m[1]) > 2200) return null;
    return { date: `${m[1]}-01-01`, precision: 'annee' };
  }
  return null;
}

/** Valeur absente ou sans signification numérique (null, "", " ", booléen, tableau). */
function vide(v) {
  return v == null || typeof v === 'boolean' || Array.isArray(v) || (typeof v === 'string' && !v.trim());
}

/** Vrai si la donnée contient le caractère de remplacement U+FFFD (fichier mal décodé). */
function malEncode(v) {
  if (v == null) return false;
  try {
    return JSON.stringify(v).includes('\uFFFD');
  } catch {
    return false;
  }
}
const ERREUR_ENCODAGE = 'texte mal encodé (caractère « \uFFFD ») : réenregistrez le fichier en UTF-8';

function urlValide(u) {
  const s = texte(u, 2000);
  if (!s) return null;
  try {
    const url = new URL(s);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}

function nombre(v, min, max) {
  if (vide(v)) return null;
  // Virgule décimale acceptée (« 45,5 »), comme on l'écrit en français.
  const n = Number(typeof v === 'string' ? v.trim().replace(/^(-?\d+),(\d+)$/, '$1.$2') : v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function normaliserSources(v, avertissements) {
  const sortie = [];
  if (!Array.isArray(v)) return sortie;
  for (const s of v) {
    if (!s) continue;
    const brut = typeof s === 'string' ? { url: s } : s;
    const url = urlValide(brut.url);
    if (!url) {
      if (brut.url) avertissements.push(`source ignorée, adresse invalide : ${texte(brut.url, 120)}`);
      continue;
    }
    if (sortie.some((x) => x.url === url)) continue;
    const d = brut.date ? normaliserDate(brut.date) : null;
    sortie.push({
      titre: texte(brut.titre, 300) || url,
      media: texte(brut.media, 120),
      url,
      date: d ? d.date : null
    });
    if (sortie.length >= 12) break;
  }
  return sortie;
}

/**
 * Valide et normalise un événement.
 * Retourne { evenement, erreurs, avertissements }; l'événement n'est utilisable
 * que si « erreurs » est vide.
 */
function normaliserEvenement(brut, meta, options = {}) {
  const erreurs = [];
  const avertissements = [];
  const b = brut && typeof brut === 'object' ? brut : {};
  const maintenant = new Date().toISOString();
  // options.controleEncodage : la partie réellement fournie (une modification ne contrôle
  // que les champs transmis, pas la fiche existante avec laquelle elle est fusionnée).
  if (malEncode('controleEncodage' in options ? options.controleEncodage : b)) erreurs.push(ERREUR_ENCODAGE);

  const d = normaliserDate(b.date);
  if (!d) erreurs.push('date invalide (format attendu : AAAA-MM-JJ)');
  const titre = texte(b.titre, 220);
  if (!titre) erreurs.push('titre manquant');

  const precisionBrute = slug(b.date_precision);
  const fin = b.date_fin ? normaliserDate(b.date_fin) : null;

  const categorie = slug(b.categorie);
  if (!ids(meta.categories).includes(categorie)) {
    erreurs.push(`catégorie inconnue : « ${texte(b.categorie, 60)} »`);
  }

  let statut = slug(b.statut);
  if (!ids(meta.statuts).includes(statut)) {
    avertissements.push(`statut inconnu (« ${texte(b.statut, 40)} »), remplacé par « non-verifie »`);
    statut = 'non-verifie';
  }

  const veille = normaliserVeille(b.veille, meta, avertissements);
  const paysDeVeille = paysSuivi(meta, veille);
  const nomVeille = (paysDeVeille && paysDeVeille.nom) || veille;
  const pays = texte(b.pays, 80) || nomVeille;
  let territoire = slug(b.territoire);
  if (!ids(meta.territoires).includes(territoire)) {
    territoire = sansAccents(pays).toLowerCase() === sansAccents(nomVeille).toLowerCase() ? 'interieur' : 'etranger';
    avertissements.push(`territoire déduit du pays : « ${territoire} »`);
  }

  let fiabilite = slug(b.fiabilite);
  if (!ids(meta.fiabilites).includes(fiabilite)) {
    if (!vide(b.fiabilite)) avertissements.push(`fiabilité inconnue (« ${texte(b.fiabilite, 40)} »), remplacée par « moyenne »`);
    fiabilite = 'moyenne';
  }

  let suivi = slug(b.suivi);
  if (!ids(meta.suivis).includes(suivi)) {
    if (!vide(b.suivi)) avertissements.push(`suivi inconnu (« ${texte(b.suivi, 40)} »), remplacé par « a-surveiller »`);
    suivi = 'a-surveiller';
  }

  let suspicion = vide(b.suspicion) ? NaN : Math.round(Number(b.suspicion));
  if (!Number.isFinite(suspicion)) {
    if (vide(b.suspicion)) avertissements.push('niveau de suspicion manquant, fixé à 2');
    else avertissements.push(`niveau de suspicion invalide (« ${texte(b.suspicion, 20)} »), fixé à 2`);
    suspicion = 2;
  }
  suspicion = Math.min(5, Math.max(1, suspicion));

  // La région est un code du pays suivi par la fiche (QC, ON… pour le Canada; IDF, PAC… pour la France).
  const codeRegion = texte(b.province, 20).toUpperCase();
  const province = codeRegion && codesRegions(meta, veille).includes(codeRegion) ? codeRegion : null;
  if (codeRegion && !province) avertissements.push(`région ou province « ${texte(b.province, 20)} » inconnue pour ${nomVeille}, ignorée`);
  let lat = nombre(b.lat, -90, 90);
  let lon = nombre(b.lon, -180, 180);
  if (lat == null || lon == null) {
    if (!vide(b.lat) || !vide(b.lon)) {
      avertissements.push(`coordonnées invalides ou incomplètes ignorées (lat « ${texte(b.lat, 30)} », lon « ${texte(b.lon, 30)} »)`);
    }
    lat = null;
    lon = null;
  }

  const acteurs = liste(b.acteurs, 12, 80);
  const sources = normaliserSources(b.sources, avertissements);
  if (!sources.length) avertissements.push('aucune source valide');

  const date = d ? d.date : '';
  const evenement = {
    id: slug(b.id, 90) || `${date}-${slug(titre, 56)}`,
    date,
    date_precision: PRECISIONS.includes(precisionBrute) ? precisionBrute : (d && d.precision) || 'jour',
    date_fin: fin ? fin.date : null,
    titre,
    resume: texte(b.resume, 3000),
    details: texte(b.details, 15000),
    veille,
    territoire,
    lieu: texte(b.lieu, 160),
    province,
    pays,
    lat,
    lon,
    categorie,
    acteurs: acteurs.length ? acteurs : ['Inconnu'],
    cibles: liste(b.cibles, 20, 200),
    statut,
    fiabilite,
    suspicion,
    anomalies: liste(b.anomalies, 12, 1200),
    hypotheses: liste(b.hypotheses, 12, 1200),
    dossier: slug(b.dossier, 60) || null,
    tags: liste(b.tags, 16, 60),
    sources,
    suivi,
    origine: texte(options.origine || b.origine, 40) || 'manuel',
    cree: texte(b.cree, 40) || maintenant,
    maj: maintenant
  };
  if (!evenement.id) erreurs.push('identifiant impossible à produire');
  return { evenement, erreurs, avertissements };
}

function normaliserPiste(brut, meta, options = {}) {
  const b = brut && typeof brut === 'object' ? brut : {};
  const erreurs = [];
  const maintenant = new Date().toISOString();
  if (malEncode('controleEncodage' in options ? options.controleEncodage : b)) erreurs.push(ERREUR_ENCODAGE);
  const titre = texte(b.titre, 220);
  if (!titre) erreurs.push('titre manquant');
  let etat = slug(b.etat);
  if (!ids(meta.etatsPiste).includes(etat)) etat = 'a-verifier';
  const piste = {
    id: slug(b.id, 90) || `piste-${slug(titre, 60)}`,
    titre,
    description: texte(b.description, 4000),
    pourquoi: texte(b.pourquoi, 2000),
    url: urlValide(b.url),
    theme: texte(b.theme, 60),
    veille: veilleFacultative(b.veille, meta),
    etat,
    cree: texte(b.cree, 40) || maintenant,
    maj: maintenant
  };
  return { piste, erreurs };
}

/** meta : facultatif; sans lui, « veille » est seulement mis en forme (identifiant ASCII). */
function normaliserDossier(brut, meta) {
  const b = brut && typeof brut === 'object' ? brut : {};
  const erreurs = [];
  const titre = texte(b.titre, 160);
  if (!titre) erreurs.push('titre manquant');
  const id = slug(b.id, 60) || slug(titre, 60);
  if (!id) erreurs.push('identifiant manquant');
  const etat = ['actif', 'dormant', 'clos'].includes(slug(b.etat)) ? slug(b.etat) : 'actif';
  return {
    dossier: {
      id,
      titre,
      resume: texte(b.resume, 6000),
      questions: liste(b.questions, 12, 600),
      veille: meta ? veilleFacultative(b.veille, meta) : slug(b.veille, 40) || null,
      etat,
      maj: new Date().toISOString()
    },
    erreurs
  };
}

module.exports = {
  VERSION_SCHEMA,
  PROVINCES,
  VEILLE_DEFAUT,
  paysSuivis,
  paysSuivi,
  veilleParDefaut,
  normaliserVeille,
  veilleFacultative,
  codesRegions,
  sansAccents,
  slug,
  texte,
  liste,
  normaliserDate,
  vide,
  malEncode,
  ERREUR_ENCODAGE,
  urlValide,
  normaliserEvenement,
  normaliserPiste,
  normaliserDossier
};
