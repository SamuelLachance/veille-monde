#!/usr/bin/env node
'use strict';
/*
 * Serveur local de Veille Monde — aucune dépendance, écoute sur 127.0.0.1 seulement.
 *
 *   node serveur.js                 démarre sur http://localhost:4826
 *   node serveur.js --ouvrir        démarre et ouvre le navigateur
 *   node serveur.js --port 5000     autre port
 *   node serveur.js --donnees X     autre dossier de données (essais)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { Depot, jourLocal } = require('./lib/depot');

const args = process.argv.slice(2);
function option(nom, defaut) {
  const i = args.indexOf(`--${nom}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : defaut;
}

const PORT = Number(option('port', process.env.PORT || 4826));
const RACINE = __dirname;
const depot = new Depot(option('donnees', path.join(RACINE, 'data')));
const TAILLE_MAX = 8 * 1024 * 1024;
// Une « Sauvegarde » complète de plusieurs dizaines de milliers de fiches dépasse 100 Mo.
const TAILLE_MAX_IMPORT = 256 * 1024 * 1024;
// data.js (copie pour l'ouverture sans serveur) est régénéré au plus une fois par délai.
const DELAI_BUNDLE = 5000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8'
};

const CSP = [
  "default-src 'self'",
  "script-src 'self' https://unpkg.com",
  "style-src 'self' 'unsafe-inline' https://unpkg.com",
  "img-src 'self' data: https://tile.openstreetmap.org https://unpkg.com",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'"
].join('; ');

function entetes(type, extra = {}) {
  return {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
    // Aucun autre site ne peut inclure nos pages, scripts ou données dans les siennes.
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy': CSP,
    ...extra
  };
}

function json(res, code, corps) {
  res.writeHead(code, entetes(TYPES['.json']));
  res.end(JSON.stringify(corps));
}

function erreurHttp(code, message) {
  return Object.assign(new Error(message), { code });
}

/* Au-delà de la taille permise, le reste du corps est lu sans être conservé : couper la
 * connexion empêcherait la réponse 413 d'arriver au navigateur (« Failed to fetch »). */
function lireCorps(req, max = TAILLE_MAX) {
  return new Promise((resolve, reject) => {
    let taille = 0;
    let trop = false;
    let morceaux = [];
    req.on('data', (m) => {
      if (trop) return;
      taille += m.length;
      if (taille > max) {
        trop = true;
        morceaux = [];
        return;
      }
      morceaux.push(m);
    });
    req.on('end', () => {
      if (trop) return reject(erreurHttp(413, `données trop volumineuses (plus de ${Math.round(max / 1048576)} Mo)`));
      let brut;
      try {
        brut = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(morceaux));
      } catch {
        return reject(erreurHttp(400, 'texte non UTF-8'));
      }
      if (!brut.trim()) return resolve({});
      let valeur;
      try {
        valeur = JSON.parse(brut);
      } catch {
        return reject(erreurHttp(400, 'JSON invalide'));
      }
      if (valeur === null || typeof valeur !== 'object') return reject(erreurHttp(400, 'format inattendu : objet JSON attendu'));
      resolve(valeur);
    });
    req.on('error', reject);
  });
}

/* Seul un navigateur ouvert sur ce serveur peut modifier les données : on refuse les
 * requêtes dont l'hôte n'est pas local (rebinding DNS) et les écritures venant d'un
 * autre site (l'en-tête X-Veille impose une vérification CORS que nous n'accordons pas). */
function hoteLocal(req) {
  const hote = String(req.headers.host || '').toLowerCase();
  return [`localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`].includes(hote);
}

function ecritureAutorisee(req) {
  if (req.headers['x-veille'] !== '1') return false;
  const origine = req.headers.origin;
  if (!origine) return true;
  return [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`, `http://[::1]:${PORT}`].includes(origine);
}

/* Régénération de data.js différée et regroupée : une étoile ou un enregistrement
 * automatique des notes ne réécrit plus tout le registre. Le minuteur n'est pas relancé
 * par les écritures suivantes, pour que la copie n'ait jamais plus de DELAI_BUNDLE de retard. */
let minuteurBundle = null;
function genererBundleMaintenant() {
  clearTimeout(minuteurBundle);
  minuteurBundle = null;
  try {
    depot.genererBundle();
  } catch (err) {
    console.error('Impossible de générer data.js :', err.message);
  }
}
function bundlePlusTard() {
  if (!minuteurBundle) minuteurBundle = setTimeout(genererBundleMaintenant, DELAI_BUNDLE);
}

/* L'écriture principale a déjà réussi : un échec du journal ou de data.js ne doit pas
 * produire une réponse 500 (le nouvel essai créerait un doublon). */
function apresEcriture(type, message) {
  try {
    depot.journaliser(type, message);
  } catch (err) {
    console.error('Journal non mis à jour :', err.message);
  }
  bundlePlusTard();
}

/* ---------- API ---------- */

async function api(req, res, url) {
  let segments;
  try {
    segments = url.pathname.split('/').filter(Boolean).slice(1).map(decodeURIComponent);
  } catch {
    return json(res, 400, { erreur: 'adresse mal formée' });
  }
  const [ressource, cle] = segments;
  const methode = req.method;

  if (methode !== 'GET' && !ecritureAutorisee(req)) return json(res, 403, { erreur: 'écriture refusée' });

  if (methode === 'GET' && ressource === 'etat') {
    return json(res, 200, { ok: true, mode: 'serveur', annees: depot.annees(), dossier: depot.dossier });
  }
  if (methode === 'GET' && ressource === 'donnees') return json(res, 200, depot.instantane());
  if (methode === 'GET' && ressource === 'export') {
    const nom = `veille-monde-${jourLocal()}.json`;
    res.writeHead(200, entetes(TYPES['.json'], { 'Content-Disposition': `attachment; filename="${nom}"` }));
    return res.end(JSON.stringify(depot.instantane(), null, 2));
  }

  if (ressource === 'evenements') {
    if (methode === 'POST' && !cle) {
      const r = depot.creerEvenement(await lireCorps(req));
      if (r.erreurs) return json(res, 400, { erreurs: r.erreurs });
      apresEcriture('ajout', `Événement ajouté : ${r.evenement.titre}`);
      return json(res, 201, r);
    }
    if (methode === 'PUT' && cle) {
      const r = depot.modifierEvenement(cle, await lireCorps(req));
      if (r.introuvable) return json(res, 404, { erreur: 'événement introuvable' });
      if (r.erreurs) return json(res, 400, { erreurs: r.erreurs });
      apresEcriture('modification', `Événement modifié : ${r.evenement.titre}`);
      return json(res, 200, r);
    }
    if (methode === 'DELETE' && cle) {
      const trouve = depot.trouver(cle);
      if (!trouve) return json(res, 404, { erreur: 'événement introuvable' });
      depot.supprimerEvenement(cle);
      apresEcriture('suppression', `Événement mis à la corbeille : ${trouve.evenement.titre}`);
      return json(res, 200, { ok: true });
    }
  }

  if (ressource === 'perso' && methode === 'PUT' && cle) {
    const annotation = depot.annoter(cle, await lireCorps(req));
    bundlePlusTard();
    return json(res, 200, { annotation });
  }

  if (ressource === 'pistes') {
    if (methode === 'POST' && !cle) {
      const r = depot.enregistrerPistes([await lireCorps(req)]);
      if (r.erreurs.length) return json(res, 400, { erreurs: r.erreurs[0].erreurs });
      if (r.ignorees.length) return json(res, 409, { erreurs: ['une piste porte déjà ce titre'] });
      apresEcriture('piste', 'Piste ajoutée');
      return json(res, 201, { ok: true, id: r.ajoutees[0] });
    }
    if (methode === 'PUT' && cle) {
      const r = depot.modifierPiste(cle, await lireCorps(req));
      if (r.introuvable) return json(res, 404, { erreur: 'piste introuvable' });
      if (r.erreurs) return json(res, 400, { erreurs: r.erreurs });
      apresEcriture('piste', `Piste modifiée : ${r.piste.titre}`);
      return json(res, 200, r);
    }
    if (methode === 'DELETE' && cle) {
      if (!depot.supprimerPiste(cle)) return json(res, 404, { erreur: 'piste introuvable' });
      apresEcriture('piste', 'Piste supprimée');
      return json(res, 200, { ok: true });
    }
  }

  if (ressource === 'dossiers') {
    if ((methode === 'POST' && !cle) || (methode === 'PUT' && cle)) {
      const corps = await lireCorps(req);
      // POST crée : un identifiant déjà pris est refusé au lieu d'écraser le dossier existant.
      const r = depot.enregistrerDossier(cle ? { ...corps, id: cle } : corps, { creation: !cle });
      if (r.erreurs) return json(res, r.existe ? 409 : 400, { erreurs: r.erreurs });
      apresEcriture('dossier', `Dossier enregistré : ${r.dossier.titre}`);
      return json(res, 200, r);
    }
    if (methode === 'DELETE' && cle) {
      if (!depot.supprimerDossier(cle)) return json(res, 404, { erreur: 'dossier introuvable' });
      apresEcriture('dossier', 'Dossier supprimé');
      return json(res, 200, { ok: true });
    }
  }

  if (ressource === 'syntheses' && methode === 'PUT' && cle) {
    const corps = await lireCorps(req);
    if (!depot.enregistrerSynthese(cle, corps.markdown)) return json(res, 400, { erreurs: ['année invalide'] });
    apresEcriture('synthese', `Synthèse ${cle} modifiée`);
    return json(res, 200, { ok: true });
  }

  /* Importation, y compris la restauration d'une « Sauvegarde » (GET /api/export).
   * Corps : un tableau d'événements, ou { evenements, pistes, dossiers, perso, syntheses,
   * theme, mode }. Mode « remplacer » : les fiches, pistes et dossiers existants sont mis à
   * jour, et les synthèses existantes remplacées. Les annotations personnelles locales ne
   * sont jamais écrasées : seules les annotations absentes sont ajoutées.
   * Réponse : { rapport, pistes, dossiers, perso, syntheses }, null pour une section absente;
   *   pistes    { ajoutees, mises_a_jour, ignorees, erreurs }
   *   dossiers  { ajoutes, mis_a_jour, ignores, erreurs }
   *   perso     { ajoutees, ignorees, erreurs }
   *   syntheses { ajoutees, remplacees, ignorees, erreurs }
   * (chaque erreur : { id, erreurs: [messages] }). */
  if (ressource === 'import' && methode === 'POST') {
    const corps = await lireCorps(req, TAILLE_MAX_IMPORT);
    const objet = Array.isArray(corps) ? {} : corps;
    const evenements = Array.isArray(corps) ? corps : corps.evenements;
    const mode = objet.mode === 'remplacer' ? 'remplacer' : 'ajouter';
    const remplacer = mode === 'remplacer';
    const estObjet = (v) => v && typeof v === 'object' && !Array.isArray(v);
    const rapport = depot.importer(Array.isArray(evenements) ? evenements : [], { origine: 'import', mode });
    const pistes = Array.isArray(objet.pistes)
      ? depot.enregistrerPistes(objet.pistes.map((p) => (estObjet(p) ? { theme: objet.theme || '', ...p } : p)), { remplacer })
      : null;
    const dossiers = Array.isArray(objet.dossiers) ? depot.importerDossiers(objet.dossiers, { remplacer }) : null;
    const perso = estObjet(objet.perso) ? depot.importerPerso(objet.perso) : null;
    const syntheses = estObjet(objet.syntheses) ? depot.importerSyntheses(objet.syntheses, { remplacer }) : null;
    let message =
      `Importation : ${rapport.ajoutes.length} ajouté(s), ${rapport.mis_a_jour.length} mis à jour, ` +
      `${rapport.ignores.length} ignoré(s), ${rapport.erreurs.length} erreur(s)`;
    if (pistes) message += `; pistes : ${pistes.ajoutees.length} ajoutée(s), ${pistes.mises_a_jour.length} mise(s) à jour`;
    if (dossiers) message += `; dossiers : ${dossiers.ajoutes.length} ajouté(s), ${dossiers.mis_a_jour.length} mis à jour`;
    if (perso) message += `; annotations : ${perso.ajoutees.length} ajoutée(s)`;
    if (syntheses) message += `; synthèses : ${syntheses.ajoutees.length + syntheses.remplacees.length} écrite(s)`;
    apresEcriture('import', message);
    return json(res, 200, { rapport, pistes, dossiers, perso, syntheses });
  }

  return json(res, 404, { erreur: 'ressource inconnue' });
}

/* ---------- fichiers statiques ---------- */

function statique(req, res, url) {
  let chemin;
  try {
    chemin = decodeURIComponent(url.pathname);
  } catch {
    chemin = '\0';
  }
  if (chemin === '/') chemin = '/index.html';
  // La liste d'autorisation s'applique au chemin une fois résolu : « /assets/../data/perso.json »
  // ne doit pas donner accès aux données ni au code du serveur. La copie data/data.js n'est
  // pas servie non plus : un script inclus par un autre site pourrait la lire. Elle ne sert
  // qu'à l'ouverture directe d'index.html, sans serveur.
  const fichier = path.normalize(path.join(RACINE, chemin));
  const relatif = path.relative(RACINE, fichier).split(path.sep).join('/');
  const autorise = !chemin.includes('\0') && (relatif === 'index.html' || /^assets\/[^/]+$/.test(relatif));
  if (!autorise) {
    res.writeHead(404, entetes('text/plain; charset=utf-8'));
    return res.end('Introuvable');
  }
  fs.readFile(fichier, (err, contenu) => {
    if (err) {
      res.writeHead(404, entetes('text/plain; charset=utf-8'));
      return res.end('Introuvable');
    }
    res.writeHead(200, entetes(TYPES[path.extname(fichier).toLowerCase()] || 'application/octet-stream'));
    res.end(contenu);
  });
}

/* ---------- démarrage ---------- */

const serveur = http.createServer((req, res) => {
  if (!hoteLocal(req)) {
    res.writeHead(403, entetes('text/plain; charset=utf-8'));
    return res.end('Hôte refusé');
  }
  let url;
  try {
    url = new URL(req.url, `http://localhost:${PORT}`);
  } catch {
    // « GET // » et autres adresses que URL refuse : réponse 400, le serveur continue.
    res.writeHead(400, entetes('text/plain; charset=utf-8'));
    return res.end('Adresse mal formée');
  }
  if (url.pathname.startsWith('/api/')) {
    api(req, res, url).catch((err) => {
      const code = err.code === 413 || err.code === 400 ? err.code : 500;
      if (code === 500) console.error(err);
      if (!res.headersSent) json(res, code, { erreur: err.message });
    });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, entetes('text/plain; charset=utf-8'));
    return res.end('Méthode non permise');
  }
  statique(req, res, url);
});

function ouvrirNavigateur() {
  const adresse = `http://localhost:${PORT}`;
  const commande =
    process.platform === 'win32' ? `start "" "${adresse}"` : process.platform === 'darwin' ? `open "${adresse}"` : `xdg-open "${adresse}"`;
  exec(commande, () => {});
}

serveur.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Le port ${PORT} est déjà utilisé : Veille Monde tourne probablement déjà.`);
    if (args.includes('--ouvrir')) ouvrirNavigateur();
    setTimeout(() => process.exit(0), 500);
    return;
  }
  console.error(err);
  process.exit(1);
});

// Une erreur imprévue est consignée sans arrêter le serveur (les enregistrements suivants
// échoueraient sinon jusqu'au relancement de Demarrer.bat).
process.on('uncaughtException', (err) => console.error('Erreur imprévue :', err));
process.on('unhandledRejection', (err) => console.error('Erreur imprévue :', err));

// À l'arrêt (Ctrl+C, fermeture de la fenêtre), data.js en attente est régénéré.
process.on('exit', () => {
  if (minuteurBundle) genererBundleMaintenant();
});
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  try {
    process.on(signal, () => process.exit(0));
  } catch {
    /* signal inconnu sur cette plateforme */
  }
}

serveur.listen(PORT, '127.0.0.1', () => {
  genererBundleMaintenant();
  console.log(`Veille Monde — http://localhost:${PORT}`);
  console.log(`Données : ${depot.dossier}`);
  console.log('Laissez cette fenêtre ouverte; Ctrl+C pour arrêter.');
  if (args.includes('--ouvrir')) ouvrirNavigateur();
});
