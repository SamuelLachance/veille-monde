#!/usr/bin/env node
'use strict';
/*
 * Vérifie que le serveur local fonctionne, sans toucher au registre : il démarre une
 * copie du serveur sur un dossier de données temporaire, exerce chaque opération
 * (ajout, modification, notes, importation, pays suivis, suppression, refus des
 * écritures externes), puis efface le dossier temporaire.
 *
 *   node outils/autotest.js
 */

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const RACINE = path.join(__dirname, '..');
const PORT = 4900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'veille-autotest-'));
fs.copyFileSync(path.join(RACINE, 'data', 'meta.json'), path.join(temp, 'meta.json'));

let reussis = 0;
let echecs = 0;
function verifier(nom, condition, detail) {
  if (condition) {
    reussis++;
    console.log(`  ✓ ${nom}`);
  } else {
    echecs++;
    console.log(`  ✗ ${nom}${detail ? ' — ' + detail : ''}`);
  }
}

async function appel(methode, chemin, corps, entetes) {
  const r = await fetch(BASE + chemin, {
    method: methode,
    headers: { 'Content-Type': 'application/json', 'X-Veille': '1', ...(entetes || {}) },
    body: corps === undefined ? undefined : JSON.stringify(corps)
  });
  let donnees = null;
  try {
    donnees = await r.json();
  } catch {
    /* réponse non JSON */
  }
  return { code: r.status, donnees };
}

async function attendreServeur() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${BASE}/api/etat`);
      if (r.ok) return true;
    } catch {
      /* pas encore prêt */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

(async () => {
  const serveur = spawn(process.execPath, [path.join(RACINE, 'serveur.js'), '--port', String(PORT), '--donnees', temp], { stdio: 'ignore' });
  try {
    verifier('le serveur démarre', await attendreServeur());

    const page = await fetch(BASE + '/');
    verifier('la page d’accueil est servie', page.ok && (await page.text()).includes('Veille Monde'));
    verifier('les fichiers hors du site sont refusés', (await fetch(BASE + '/serveur.js')).status === 404);
    verifier('la remontée de dossier est refusée', (await fetch(BASE + '/assets/..%2Fserveur.js')).status === 404);
    verifier('les données personnelles ne sont pas servies', (await fetch(BASE + '/assets/..%2Fdata%2Fmeta.json')).status === 404);
    verifier('la copie data.js n’est pas servie', (await fetch(BASE + '/data/data.js')).status === 404);
    verifier('l’inclusion par un autre site est interdite', page.headers.get('cross-origin-resource-policy') === 'same-origin');

    const fiche = {
      date: '2026-01-02',
      titre: 'Fiche de vérification',
      categorie: 'inexplique',
      statut: 'Rapporté',
      suspicion: 9,
      acteurs: ['Inconnu'],
      sources: [{ titre: 'Source', url: 'https://example.org/a' }, { url: 'javascript:alert(1)' }]
    };
    const ajout = await appel('POST', '/api/evenements', fiche);
    const id = ajout.donnees && ajout.donnees.evenement && ajout.donnees.evenement.id;
    verifier('ajout d’une fiche', ajout.code === 201 && Boolean(id));
    verifier('les valeurs sont normalisées', ajout.donnees.evenement.statut === 'rapporte' && ajout.donnees.evenement.suspicion === 5);
    verifier('une adresse dangereuse est écartée', ajout.donnees.evenement.sources.length === 1);
    verifier('une fiche sans pays suivi est rangée sous « canada »', ajout.donnees.evenement.veille === 'canada');

    // Pays suivis : la région est validée selon le pays de la fiche.
    const ficheFrance = { date: '2026-03-04', titre: 'Fiche France', categorie: 'espionnage', veille: 'france', province: 'IDF', lieu: 'Paris', sources: [{ url: 'https://example.org/fr' }] };
    const france = await appel('POST', '/api/evenements', ficheFrance);
    const evF = france.donnees && france.donnees.evenement;
    verifier(
      'fiche « france » en Île-de-France acceptée',
      france.code === 201 && evF.veille === 'france' && evF.province === 'IDF' && evF.pays === 'France' && evF.territoire === 'interieur',
      JSON.stringify(evF && { veille: evF.veille, province: evF.province, pays: evF.pays, territoire: evF.territoire })
    );
    const quebecEnFrance = await appel('POST', '/api/evenements', { ...ficheFrance, titre: 'Province QC sous France', province: 'QC' });
    const evQ = quebecEnFrance.donnees && quebecEnFrance.donnees.evenement;
    verifier(
      'province « QC » sous « france » : écartée avec un avertissement',
      quebecEnFrance.code === 201 && evQ.veille === 'france' && evQ.province === null && quebecEnFrance.donnees.avertissements.some((m) => m.includes('QC')),
      JSON.stringify(quebecEnFrance.donnees)
    );
    const inconnu = await appel('POST', '/api/evenements', { ...ficheFrance, titre: 'Pays inconnu', veille: 'atlantide', province: 'ON' });
    verifier(
      'pays suivi inconnu : avertissement et repli sur « canada »',
      inconnu.code === 201 && inconnu.donnees.evenement.veille === 'canada' && inconnu.donnees.evenement.province === 'ON' && inconnu.donnees.avertissements.some((m) => m.includes('atlantide'))
    );
    const dossierFr = await appel('POST', '/api/dossiers', { titre: 'Affaire française', veille: 'france' });
    verifier('un dossier garde son pays suivi', dossierFr.code === 200 && dossierFr.donnees.dossier.veille === 'france');
    const pisteFr = await appel('POST', '/api/import', { pistes: [{ titre: 'Piste française', veille: 'france' }, { titre: 'Piste sans pays' }] });
    const pistesApres = (await appel('GET', '/api/donnees')).donnees.pistes;
    verifier(
      'une piste garde son pays suivi (facultatif)',
      pisteFr.code === 200 && pistesApres.find((p) => p.titre === 'Piste française').veille === 'france' && pistesApres.find((p) => p.titre === 'Piste sans pays').veille === null
    );
    // outils/importer.js --veille : pays donné aux fiches qui n'en précisent pas.
    const fichierImport = path.join(temp, 'import-france.json');
    fs.writeFileSync(fichierImport, JSON.stringify({ evenements: [{ date: '2026-05-06', titre: 'Import France', categorie: 'cyber', province: 'PAC', sources: [{ url: 'https://example.org/pac' }] }] }));
    const cli = spawnSync(process.execPath, [path.join(RACINE, 'outils', 'importer.js'), fichierImport, '--veille', 'france', '--donnees', temp], { encoding: 'utf8' });
    const importee = (await appel('GET', '/api/donnees')).donnees.evenements.find((e) => e.titre === 'Import France');
    verifier('importer.js --veille france', cli.status === 0 && importee && importee.veille === 'france' && importee.province === 'PAC', cli.stdout + cli.stderr);
    const cliInconnu = spawnSync(process.execPath, [path.join(RACINE, 'outils', 'importer.js'), fichierImport, '--veille', 'atlantide', '--donnees', temp], { encoding: 'utf8' });
    verifier('importer.js refuse un pays suivi inconnu', cliInconnu.status === 2);
    // Mise à jour par importation sans champ « veille » : la fiche garde son pays et sa région.
    const majFrance = await appel('POST', '/api/import', { mode: 'remplacer', evenements: [{ id: evF.id, date: evF.date, titre: 'Fiche France mise à jour', categorie: 'espionnage', province: 'IDF', sources: [{ url: 'https://example.org/fr' }] }] });
    const evMaj = (await appel('GET', '/api/donnees')).donnees.evenements.find((e) => e.id === evF.id);
    verifier(
      'une fiche mise à jour sans « veille » garde son pays suivi',
      majFrance.code === 200 && evMaj && evMaj.veille === 'france' && evMaj.province === 'IDF' && evMaj.titre === 'Fiche France mise à jour',
      JSON.stringify(evMaj && { veille: evMaj.veille, province: evMaj.province })
    );

    const exportFr = await fetch(BASE + '/api/export');
    verifier('la sauvegarde s’appelle veille-monde-AAAA-MM-JJ.json', /veille-monde-\d{4}-\d{2}-\d{2}\.json/.test(exportFr.headers.get('content-disposition') || ''));
    await exportFr.arrayBuffer();

    const invalide = await appel('POST', '/api/evenements', { date: 'hier', titre: '', categorie: 'x' });
    verifier('une fiche invalide est refusée', invalide.code === 400 && invalide.donnees.erreurs.length >= 2);

    const modif = await appel('PUT', '/api/evenements/' + encodeURIComponent(id), { titre: 'Fiche modifiée', date: '2025-12-31' });
    verifier('modification et changement d’année', modif.code === 200 && modif.donnees.evenement.date === '2025-12-31');
    verifier('la fiche a changé de fichier annuel', fs.existsSync(path.join(temp, 'evenements', '2025.json')));

    const note = await appel('PUT', '/api/perso/' + encodeURIComponent(id), { suivi: true, notes: 'note' });
    verifier('étoile et notes enregistrées à part', note.code === 200 && note.donnees.annotation.suivi === true && fs.existsSync(path.join(temp, 'perso.json')));

    const imp = await appel('POST', '/api/import', { evenements: [{ id, date: '2026-02-02', titre: 'Doublon', categorie: 'cyber' }, { date: '2026-02-03', titre: 'Nouvelle', categorie: 'cyber' }] });
    verifier('importation : doublon ignoré, nouveauté ajoutée', imp.code === 200 && imp.donnees.rapport.ignores.length === 1 && imp.donnees.rapport.ajoutes.length === 1);

    const sansEntete = await fetch(BASE + '/api/evenements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    verifier('écriture sans en-tête refusée', sansEntete.status === 403);
    const autreOrigine = await appel('POST', '/api/evenements', fiche, { Origin: 'https://example.com' });
    verifier('écriture depuis un autre site refusée', autreOrigine.code === 403);
    // fetch() n'autorise pas à changer l'en-tête Host : on passe par le module http.
    const codeAutreHote = await new Promise((resolve) => {
      const requete = http.request({ host: '127.0.0.1', port: PORT, path: '/api/etat', headers: { Host: 'exemple.test' } }, (r) => {
        r.resume();
        resolve(r.statusCode);
      });
      requete.on('error', () => resolve(0));
      requete.end();
    });
    verifier('hôte non local refusé', codeAutreHote === 403, `code ${codeAutreHote}`);

    // « GET // » faisait tomber le serveur (exception dans new URL).
    const codeDoubleBarre = await new Promise((resolve) => {
      const requete = http.request({ host: '127.0.0.1', port: PORT, path: '//', headers: { Host: `localhost:${PORT}` } }, (r) => {
        r.resume();
        resolve(r.statusCode);
      });
      requete.on('error', () => resolve(0));
      requete.end();
    });
    verifier('« GET // » répond 400 sans arrêter le serveur', codeDoubleBarre === 400 && (await fetch(BASE + '/api/etat')).ok, `code ${codeDoubleBarre}`);

    // Un corps trop volumineux reçoit une vraie réponse 413, pas une coupure de connexion.
    let code413 = 0;
    try {
      code413 = (await appel('POST', '/api/evenements', { titre: 'x'.repeat(9 * 1024 * 1024) })).code;
    } catch (e) {
      code413 = `coupure (${e.message})`;
    }
    verifier('corps trop volumineux : la réponse 413 parvient au client', code413 === 413, `code ${code413}`);
    verifier('le serveur répond encore après un 413', (await fetch(BASE + '/api/etat')).ok);
    verifier('un corps JSON « null » est refusé proprement', (await appel('POST', '/api/import', null)).code === 400);

    // « Nouveau dossier » ne doit pas écraser un dossier existant de même identifiant.
    const d1 = await appel('POST', '/api/dossiers', { titre: 'Ingérence chinoise', resume: 'Résumé original', questions: ['Q1'] });
    const d2 = await appel('POST', '/api/dossiers', { titre: 'Ingérence : chinoise !', resume: '', questions: [] });
    const apresDoublon = (await appel('GET', '/api/donnees')).donnees.dossiers.find((d) => d.id === 'ingerence-chinoise');
    verifier('création de dossier', d1.code === 200 && d1.donnees.dossier.id === 'ingerence-chinoise');
    verifier('un dossier existant n’est pas écrasé par une création', d2.code === 409 && apresDoublon && apresDoublon.resume === 'Résumé original');
    const d3 = await appel('PUT', '/api/dossiers/ingerence-chinoise', { titre: 'Ingérence chinoise', resume: 'Résumé modifié' });
    verifier('modification de dossier : les champs non transmis sont gardés', d3.code === 200 && d3.donnees.dossier.resume === 'Résumé modifié' && d3.donnees.dossier.questions[0] === 'Q1');

    // Restauration d'une sauvegarde : dossiers, annotations et synthèses sont repris.
    const sauvegarde = (await appel('GET', '/api/export')).donnees;
    const restauration = await appel('POST', '/api/import', {
      ...sauvegarde,
      dossiers: [...sauvegarde.dossiers, { id: 'dossier-restaure', titre: 'Dossier restauré' }],
      perso: { ...sauvegarde.perso, [id]: { suivi: false, notes: 'ne doit pas écraser' }, 'fiche-restauree': { suivi: true } },
      syntheses: { 2026: '# Synthèse restaurée' },
      pistes: [{ titre: 'Piste restaurée' }],
      theme: 'Essai'
    });
    const apres = (await appel('GET', '/api/donnees')).donnees;
    verifier(
      'restauration : dossiers, annotations et synthèses repris',
      restauration.code === 200 &&
        restauration.donnees.dossiers.ajoutes.includes('dossier-restaure') &&
        restauration.donnees.perso.ajoutees.includes('fiche-restauree') &&
        restauration.donnees.syntheses.ajoutees.includes('2026') &&
        apres.syntheses['2026'].includes('Synthèse restaurée'),
      JSON.stringify(restauration.donnees && { d: restauration.donnees.dossiers, p: restauration.donnees.perso, s: restauration.donnees.syntheses })
    );
    verifier('restauration : une annotation locale n’est jamais écrasée', apres.perso[id] && apres.perso[id].notes === 'note');
    const piste = apres.pistes.find((p) => p.titre === 'Piste restaurée');
    verifier('importation : le thème du fichier est donné aux pistes', piste && piste.theme === 'Essai');
    await appel('PUT', '/api/pistes/' + encodeURIComponent(piste.id), { etat: 'ecartee' });
    const majPiste = await appel('POST', '/api/import', { mode: 'remplacer', pistes: [{ titre: 'Piste restaurée', description: 'maj' }] });
    const pisteApres = (await appel('GET', '/api/donnees')).donnees.pistes.find((p) => p.id === piste.id);
    verifier(
      'importation « remplacer » : piste mise à jour, tri de l’utilisateur conservé',
      majPiste.donnees.pistes.mises_a_jour.length === 1 && pisteApres.description === 'maj' && pisteApres.etat === 'ecartee'
    );
    const synthese2 = await appel('POST', '/api/import', { syntheses: { 2026: '# Autre' } });
    verifier('importation : une synthèse existante est conservée sans « remplacer »', synthese2.donnees.syntheses.ignorees.includes('2026'));

    const suppression = await appel('DELETE', '/api/evenements/' + encodeURIComponent(id));
    const etat = await appel('GET', '/api/donnees');
    verifier('suppression vers la corbeille', suppression.code === 200 && !etat.donnees.evenements.some((e) => e.id === id) && fs.existsSync(path.join(temp, 'corbeille.json')));
    verifier('copie d’ensemble régénérée', fs.existsSync(path.join(temp, 'data.js')));
    verifier('journal tenu', etat.donnees.journal.length >= 4);
  } catch (err) {
    echecs++;
    console.log(`  ✗ erreur inattendue — ${err.message}`);
  } finally {
    serveur.kill();
    await new Promise((r) => setTimeout(r, 200));
    fs.rmSync(temp, { recursive: true, force: true });
  }
  console.log(`\n${reussis} vérification(s) réussie(s), ${echecs} échec(s).`);
  process.exit(echecs ? 1 : 0);
})();
