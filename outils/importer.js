#!/usr/bin/env node
'use strict';
/*
 * Importe un ou plusieurs fichiers JSON dans le registre.
 *
 *   node outils/importer.js nouveautes.json
 *   node outils/importer.js a.json b.json --remplacer --origine recherche
 *   node outils/importer.js france.json --veille france
 *
 * Format accepté : un tableau d'événements, ou un objet
 *   { "theme": "...", "evenements": [ ... ], "pistes": [ ... ] }
 * ou un fichier « Sauvegarde » complet, dont les sections dossiers, perso et syntheses
 * sont aussi reprises.
 * Sans --remplacer, une fiche, une piste ou un dossier dont l'identifiant existe déjà est
 * ignoré, et une synthèse annuelle existante est conservée.
 * Les annotations personnelles (étoiles, notes) existantes ne sont jamais écrasées :
 * seules les annotations absentes du registre sont ajoutées.
 * --veille <id> : pays suivi (un identifiant de « paysSuivis » dans data/meta.json) donné
 * aux événements et aux pistes du fichier qui n'en précisent pas; sans cette option, un
 * événement sans « veille » est rangé sous « canada ».
 * Le fichier doit être enregistré en UTF-8.
 */

const path = require('path');
const { Depot, lireUtf8 } = require('../lib/depot');
const schema = require('../lib/schema');

const args = process.argv.slice(2);
function option(nom, defaut) {
  const i = args.indexOf(`--${nom}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : defaut;
}
const avecValeur = new Set(['--origine', '--donnees', '--veille']);
const fichiers = args.filter((a, i) => !a.startsWith('--') && !avecValeur.has(args[i - 1]));
const remplacer = args.includes('--remplacer');
const origine = option('origine', 'import');
const depot = new Depot(option('donnees', path.join(__dirname, '..', 'data')));
const veilleBrute = option('veille', null);

if (!fichiers.length) {
  console.error('Usage : node outils/importer.js <fichier.json> [...] [--remplacer] [--origine nom] [--veille pays]');
  process.exit(2);
}

let veille = null;
if (args.includes('--veille')) {
  const connus = schema.paysSuivis(depot.meta()).map((p) => p.id);
  veille = schema.slug(veilleBrute || '', 40);
  if (!connus.includes(veille)) {
    console.error(`--veille : pays suivi inconnu (« ${veilleBrute || ''} »). Valeurs possibles : ${connus.join(', ')}.`);
    process.exit(2);
  }
}
/** Donne le pays suivi de --veille à un élément qui n'en précise pas. */
function avecVeille(x) {
  if (!veille || !x || typeof x !== 'object' || Array.isArray(x)) return x;
  return x.veille == null || x.veille === '' ? { ...x, veille } : x;
}

let totalAjoutes = 0;
let totalMaj = 0;
let totalIgnores = 0;
let totalErreurs = 0;

for (const fichier of fichiers) {
  let donnees;
  try {
    donnees = JSON.parse(lireUtf8(fichier));
    if (donnees === null || typeof donnees !== 'object') throw new Error('format inattendu : objet ou tableau JSON attendu');
  } catch (err) {
    console.error(`✗ ${fichier} : illisible (${err.message})`);
    totalErreurs++;
    continue;
  }
  const evenements = (Array.isArray(donnees) ? donnees : Array.isArray(donnees.evenements) ? donnees.evenements : []).map(avecVeille);
  const rapport = depot.importer(evenements, { origine, mode: remplacer ? 'remplacer' : 'ajouter' });
  console.log(
    `${path.basename(fichier)} : ${rapport.ajoutes.length} ajouté(s), ${rapport.mis_a_jour.length} mis à jour, ` +
      `${rapport.ignores.length} ignoré(s), ${rapport.erreurs.length} en erreur`
  );
  for (const e of rapport.erreurs) console.log(`  ✗ ${e.id} : ${e.erreurs.join(' ; ')}`);
  for (const a of rapport.avertissements) console.log(`  ! ${a.id} : ${a.avertissements.join(' ; ')}`);
  if (rapport.ignores.length) console.log(`  déjà présents : ${rapport.ignores.join(', ')}`);

  if (!Array.isArray(donnees) && Array.isArray(donnees.pistes) && donnees.pistes.length) {
    const pistes = donnees.pistes.map((p) => avecVeille(p && typeof p === 'object' && !Array.isArray(p) ? { theme: donnees.theme || '', ...p } : p));
    const rp = depot.enregistrerPistes(pistes, { remplacer });
    console.log(`  pistes : ${rp.ajoutees.length} ajoutée(s), ${rp.mises_a_jour.length} mise(s) à jour, ${rp.ignorees.length} déjà présente(s), ${rp.erreurs.length} en erreur`);
    for (const e of rp.erreurs) console.log(`  ✗ piste ${e.id || '(sans titre)'} : ${e.erreurs.join(' ; ')}`);
    totalErreurs += rp.erreurs.length;
  }

  // Sections d'un fichier « Sauvegarde » complet.
  const estObjet = (v) => v && typeof v === 'object' && !Array.isArray(v);
  if (!Array.isArray(donnees) && Array.isArray(donnees.dossiers)) {
    const rd = depot.importerDossiers(donnees.dossiers, { remplacer });
    console.log(`  dossiers : ${rd.ajoutes.length} ajouté(s), ${rd.mis_a_jour.length} mis à jour, ${rd.ignores.length} déjà présent(s), ${rd.erreurs.length} en erreur`);
    for (const e of rd.erreurs) console.log(`  ✗ dossier ${e.id} : ${e.erreurs.join(' ; ')}`);
    totalErreurs += rd.erreurs.length;
  }
  if (!Array.isArray(donnees) && estObjet(donnees.perso)) {
    const ra = depot.importerPerso(donnees.perso);
    console.log(`  annotations personnelles : ${ra.ajoutees.length} ajoutée(s), ${ra.ignorees.length} déjà présente(s) (conservée(s)), ${ra.erreurs.length} en erreur`);
    for (const e of ra.erreurs) console.log(`  ✗ annotation ${e.id} : ${e.erreurs.join(' ; ')}`);
    totalErreurs += ra.erreurs.length;
  }
  if (!Array.isArray(donnees) && estObjet(donnees.syntheses)) {
    const rs = depot.importerSyntheses(donnees.syntheses, { remplacer });
    console.log(`  synthèses : ${rs.ajoutees.length} ajoutée(s), ${rs.remplacees.length} remplacée(s), ${rs.ignorees.length} déjà présente(s), ${rs.erreurs.length} en erreur`);
    for (const e of rs.erreurs) console.log(`  ✗ synthèse ${e.id} : ${e.erreurs.join(' ; ')}`);
    totalErreurs += rs.erreurs.length;
  }
  totalAjoutes += rapport.ajoutes.length;
  totalMaj += rapport.mis_a_jour.length;
  totalIgnores += rapport.ignores.length;
  totalErreurs += rapport.erreurs.length;
}

// Les écritures sont faites : un échec du journal ou de data.js n'est qu'un avertissement.
try {
  depot.journaliser('import', `Importation en lot : ${totalAjoutes} ajouté(s), ${totalMaj} mis à jour, ${totalIgnores} ignoré(s), ${totalErreurs} erreur(s)`);
} catch (err) {
  console.error(`! journal non mis à jour : ${err.message}`);
}
try {
  depot.genererBundle();
} catch (err) {
  console.error(`! data.js non régénéré (${err.message}) : lancez node outils/generer-bundle.js`);
}
console.log(`\nTotal : ${totalAjoutes} ajouté(s), ${totalMaj} mis à jour, ${totalIgnores} ignoré(s), ${totalErreurs} erreur(s).`);
console.log(`Registre : ${depot.tousEvenements().length} événement(s).`);
process.exit(totalErreurs ? 1 : 0);
