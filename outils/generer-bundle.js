#!/usr/bin/env node
'use strict';
/*
 * Régénère data/data.js, la copie d'ensemble lue par index.html quand la page est
 * ouverte directement (sans serveur). À lancer après une modification manuelle des
 * fichiers JSON; le serveur et l'outil d'importation le font déjà eux-mêmes.
 */

const path = require('path');
const { Depot } = require('../lib/depot');

const i = process.argv.indexOf('--donnees');
const depot = new Depot(i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : path.join(__dirname, '..', 'data'));
depot.genererBundle();
console.log(`data.js régénéré : ${depot.tousEvenements().length} événement(s), ${depot.annees().length} année(s).`);
