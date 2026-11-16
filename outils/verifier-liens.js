#!/usr/bin/env node
'use strict';
/*
 * Vérifie que les adresses des sources répondent encore.
 *
 *   node outils/verifier-liens.js              tout le registre
 *   node outils/verifier-liens.js fichier.json un fichier à importer
 *   node outils/verifier-liens.js --json       sortie JSON (pour traitement)
 *
 * Un site qui refuse les robots (403, 429) n'est pas forcément un lien mort :
 * ces cas sont signalés « à vérifier à la main ».
 */

const fs = require('fs');
const path = require('path');
const { Depot } = require('../lib/depot');

const args = process.argv.slice(2);
const enJson = args.includes('--json');
const fichier = args.find((a) => !a.startsWith('--'));
const SIMULTANES = 8;
const DELAI_MS = 20000;
const AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

let evenements;
if (fichier) {
  const d = JSON.parse(fs.readFileSync(fichier, 'utf8').replace(/^﻿/, ''));
  evenements = Array.isArray(d) ? d : d.evenements || [];
} else {
  evenements = new Depot(path.join(__dirname, '..', 'data')).tousEvenements();
}

const parUrl = new Map();
for (const e of evenements) {
  for (const s of e.sources || []) {
    if (!s || !s.url) continue;
    if (!parUrl.has(s.url)) parUrl.set(s.url, []);
    parUrl.get(s.url).push(e.id);
  }
}

async function tester(url) {
  for (const methode of ['HEAD', 'GET']) {
    try {
      const r = await fetch(url, {
        method: methode,
        redirect: 'follow',
        headers: { 'User-Agent': AGENT, Accept: 'text/html,application/pdf;q=0.9,*/*;q=0.8', 'Accept-Language': 'fr-CA,fr;q=0.9,en;q=0.8' },
        signal: AbortSignal.timeout(DELAI_MS)
      });
      if (r.body) r.body.cancel().catch(() => {});
      if (r.ok) return { etat: 'ok', code: r.status };
      if (methode === 'HEAD') continue; // beaucoup de sites refusent HEAD
      if ([401, 403, 406, 429, 451, 503].includes(r.status)) return { etat: 'bloque', code: r.status };
      return { etat: 'mort', code: r.status };
    } catch (err) {
      if (methode === 'GET') return { etat: 'erreur', code: err.name === 'TimeoutError' ? 'délai dépassé' : (err.cause && err.cause.code) || err.message };
    }
  }
  return { etat: 'erreur', code: 'inconnu' };
}

(async () => {
  const urls = [...parUrl.keys()];
  const resultats = [];
  let prochain = 0;
  async function ouvrier() {
    while (prochain < urls.length) {
      const url = urls[prochain++];
      const r = await tester(url);
      resultats.push({ url, ...r, fiches: parUrl.get(url) });
      if (!enJson) process.stderr.write(`\r${resultats.length}/${urls.length} adresses vérifiées`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(SIMULTANES, urls.length) }, ouvrier));
  if (!enJson) process.stderr.write('\n');

  if (enJson) {
    console.log(JSON.stringify(resultats, null, 2));
    return;
  }
  const groupe = (etat) => resultats.filter((r) => r.etat === etat);
  console.log(`${groupe('ok').length} adresses répondent.`);
  for (const [etat, titre] of [
    ['mort', 'Liens morts'],
    ['erreur', 'Erreurs de connexion'],
    ['bloque', 'Accès refusé aux robots — à vérifier à la main']
  ]) {
    const liste = groupe(etat);
    if (!liste.length) continue;
    console.log(`\n${titre} (${liste.length}) :`);
    for (const r of liste) console.log(`  [${r.code}] ${r.url}\n        fiches : ${r.fiches.join(', ')}`);
  }
})();
