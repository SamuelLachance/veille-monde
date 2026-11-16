#!/usr/bin/env node
'use strict';
/*
 * Construit la version publique (statique) de Veille Monde dans un dossier, par défaut
 * `_site/`, pour GitHub Pages. La copie publiée ne contient jamais les annotations
 * personnelles (data/perso.json) : elle reprend le registre, les dossiers, les pistes,
 * les synthèses et le journal, et marque la page comme « Version publique ».
 *
 *   node outils/publier.js [dossier-de-sortie]
 */

const fs = require('fs');
const path = require('path');
const { Depot } = require('../lib/depot');

const racine = path.join(__dirname, '..');
const sortie = path.resolve(process.argv[2] || path.join(racine, '_site'));

const depot = new Depot(path.join(racine, 'data'));
const instantane = depot.instantane();
instantane.perso = {};
instantane.public = true;

fs.rmSync(sortie, { recursive: true, force: true });
fs.mkdirSync(path.join(sortie, 'data'), { recursive: true });
fs.copyFileSync(path.join(racine, 'index.html'), path.join(sortie, 'index.html'));
fs.cpSync(path.join(racine, 'assets'), path.join(sortie, 'assets'), { recursive: true });
fs.writeFileSync(
  path.join(sortie, 'data', 'data.js'),
  '/* Fichier généré automatiquement — version publique, sans annotations personnelles. */\n' +
    'window.VEILLE_DONNEES = ' +
    JSON.stringify(instantane) +
    ';\n'
);
fs.writeFileSync(path.join(sortie, '.nojekyll'), '');

console.log(
  `Version publique construite dans ${path.relative(racine, sortie) || sortie} : ` +
    `${instantane.evenements.length} événement(s), ${instantane.dossiers.length} dossier(s).`
);
