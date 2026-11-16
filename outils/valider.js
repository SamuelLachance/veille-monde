#!/usr/bin/env node
'use strict';
/*
 * Vérifie la cohérence du registre : schéma de chaque fiche, identifiants en double,
 * fiches rangées dans la mauvaise année, dossiers inexistants, pays suivis inconnus
 * (champ « veille »), doublons probables.
 *
 *   node outils/valider.js            vérifie data/
 *   node outils/valider.js fichier    vérifie un fichier à importer, sans rien écrire
 */

const path = require('path');
const { Depot, lireUtf8 } = require('../lib/depot');
const schema = require('../lib/schema');

const args = process.argv.slice(2);
function option(nom, defaut) {
  const i = args.indexOf(`--${nom}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : defaut;
}
const depot = new Depot(option('donnees', path.join(__dirname, '..', 'data')));
const meta = depot.meta();
const paysConnus = schema.paysSuivis(meta).map((p) => p.id);
const fichier = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--donnees');

let erreurs = 0;
let avertissements = 0;
const err = (m) => {
  erreurs++;
  console.log(`✗ ${m}`);
};
const avert = (m) => {
  avertissements++;
  console.log(`! ${m}`);
};

function mots(titre) {
  return new Set(
    schema
      .sansAccents(titre)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((m) => m.length > 3)
  );
}
function ressemblance(a, b) {
  const A = mots(a);
  const B = mots(b);
  if (!A.size || !B.size) return 0;
  let communs = 0;
  for (const m of A) if (B.has(m)) communs++;
  return communs / Math.min(A.size, B.size);
}

/**
 * Vérifie une série de fiches. Les doublons d'identifiant sont cherchés sur l'identifiant
 * normalisé, celui que l'importation emploiera réellement (« Affaire-É » et « affaire e »
 * donnent tous deux « affaire-e »). Retourne les fiches normalisées.
 */
function verifier(evenements, etiquette, anneeAttendue) {
  const vus = new Map();
  const normalisees = [];
  for (const e of evenements) {
    const brut = e && typeof e === 'object' ? e : {};
    const r = schema.normaliserEvenement(brut, meta);
    const idN = r.evenement.id;
    const repere = `${etiquette} · ${brut.id || idN || brut.titre || '(sans identifiant)'}`;
    for (const m of r.erreurs) err(`${repere} : ${m}`);
    for (const m of r.avertissements) avert(`${repere} : ${m}`);
    if (idN && vus.has(idN)) err(`${repere} : identifiant en double (${idN})`);
    if (idN) vus.set(idN, brut);
    if (anneeAttendue && brut.date && Number(String(brut.date).slice(0, 4)) !== anneeAttendue) {
      err(`${repere} : daté de ${String(brut.date).slice(0, 4)} mais rangé dans ${anneeAttendue}.json`);
    }
    if (brut.id && idN !== brut.id) avert(`${repere} : identifiant non normalisé (attendu « ${idN} »)`);
    normalisees.push(r.evenement);
  }
  return normalisees;
}

let tous;
if (fichier) {
  let d;
  try {
    d = JSON.parse(lireUtf8(fichier));
  } catch (e) {
    console.log(`✗ ${fichier} : illisible (${e.message})`);
    process.exit(1);
  }
  const bruts = Array.isArray(d) ? d : d && Array.isArray(d.evenements) ? d.evenements : [];
  // Les doublons probables sont cherchés sur les fiches telles qu'elles seront importées
  // (identifiants et adresses de sources normalisés).
  tous = verifier(bruts, path.basename(fichier));
} else {
  tous = [];
  for (const annee of depot.annees()) {
    const evenements = depot.lireAnnee(annee);
    verifier(evenements, String(annee), annee);
    tous.push(...evenements);
  }
  const ids = new Map();
  for (const e of tous) {
    if (ids.has(e.id)) err(`${e.id} : présent dans plusieurs années`);
    ids.set(e.id, true);
  }
  const dossiers = new Set(depot.dossiers().map((d) => d.id));
  const orphelins = new Set(tous.map((e) => e.dossier).filter((d) => d && !dossiers.has(d)));
  for (const d of orphelins) avert(`dossier « ${d} » utilisé par des fiches mais absent de dossiers.json`);
  // Pays suivi des dossiers et des pistes : facultatif, mais doit exister dans meta.json.
  for (const d of depot.dossiers()) {
    if (d.veille != null && d.veille !== '' && !paysConnus.includes(d.veille)) avert(`dossier ${d.id} : pays suivi inconnu (« ${d.veille} »)`);
  }
  for (const p of depot.pistes()) {
    if (p.veille != null && p.veille !== '' && !paysConnus.includes(p.veille)) avert(`piste ${p.id} : pays suivi inconnu (« ${p.veille} »)`);
  }
}

// Répartition par pays suivi (une fiche sans « veille » compte pour le pays par défaut).
const parVeille = new Map();
for (const e of tous) {
  const brute = e && e.veille != null && e.veille !== '' ? String(e.veille) : null;
  const libelle = brute == null ? `${schema.veilleParDefaut(meta)} (implicite)` : paysConnus.includes(brute) ? brute : `${brute} (inconnu)`;
  parVeille.set(libelle, (parVeille.get(libelle) || 0) + 1);
}
if (parVeille.size) console.log(`\nPar pays suivi : ${[...parVeille].map(([v, n]) => `${v} ${n}`).join(', ')}`);

// Doublons probables : même source, ou même semaine et titres très proches.
const parUrl = new Map();
for (const e of tous) {
  for (const s of e.sources || []) {
    if (!parUrl.has(s.url)) parUrl.set(s.url, []);
    parUrl.get(s.url).push(e.id);
  }
}
const paires = new Set();
for (const [url, liste] of parUrl) {
  const uniques = [...new Set(liste)];
  if (uniques.length > 1) for (let i = 0; i < uniques.length; i++) for (let j = i + 1; j < uniques.length; j++) paires.add(`${uniques[i]} ↔ ${uniques[j]}  (même source : ${url})`);
}
const tries = tous.filter((e) => e.date && e.titre).sort((a, b) => (a.date < b.date ? -1 : 1));
for (let i = 0; i < tries.length; i++) {
  for (let j = i + 1; j < tries.length; j++) {
    const ecart = (new Date(tries[j].date) - new Date(tries[i].date)) / 86400000;
    if (ecart > 7) break;
    const r = ressemblance(tries[i].titre, tries[j].titre);
    if (r >= 0.6) paires.add(`${tries[i].id} ↔ ${tries[j].id}  (titres proches à ${Math.round(r * 100)} %)`);
  }
}
if (paires.size) {
  console.log(`\nDoublons possibles à examiner (${paires.size}) :`);
  for (const p of paires) console.log(`  ? ${p}`);
}

console.log(`\n${tous.length} fiche(s) vérifiée(s) : ${erreurs} erreur(s), ${avertissements} avertissement(s).`);
process.exit(erreurs ? 1 : 0);
