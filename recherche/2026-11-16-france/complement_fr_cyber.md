# Opérations cyber visant la France en 2026 (dimension étatique / sécurité nationale)

Budget : 18/18 WebSearch utilisés. JSON : complement_fr_cyber.json (18 événements, 8 pistes, validé avec node).

## Intrusions étatiques et attributions officielles (ANSSI / gouvernement)

### Takeaway
Deux attributions publiques majeures en 2026 : le FSB russe (Turla, 13 juillet) pour de l'espionnage contre les Armées, le Quai d'Orsay, la justice et un institut de recherche de défense, et le CGRI iranien (9 novembre) pour le sabotage des chambres froides d'environ 700 supermarchés (11-12 octobre), premier sabotage cyber d'ampleur sur le sol français selon le Quai d'Orsay.

### Cited Findings
- 13/07/2026 : la France attribue au 16e Centre du FSB (unité 61240, mode opératoire Turla) des intrusions : messageries du ministère des Armées (dès 2017), réseau du MEAE à l'ambassade de Moscou (2018), serveur d'une entité de la justice (2019), institut de recherche de défense (février 2025, exfiltration importante) ; l'UE sanctionne 9 individus et 4 entités le même jour — [France Diplomatie](https://www.diplomatie.gouv.fr/fr/presse-et-ressources/decouvrir-et-informer/actualites/attribution-a-la-russie-d-activites-cyber-malveillantes-a-des-fins-d-espionnage-en-france) ; [CERT-FR CTI-004](https://cert.cyber.gouv.fr/cti/CERTFR-2026-CTI-004/) ; [Solutions Numériques](https://www.solutions-numeriques.com/cyberespionnage-la-france-accuse-officiellement-le-fsb-russe-dune-campagne-vieille-de-quinze-ans/) (Kazuar, point d'eau, liaisons satellitaires).
- Nuit du 11 au 12/10/2026 : contrôleurs de froid (Danfoss notamment) d'environ 700 sites reprogrammés en dégivrage haute température ; au moins 15 départs de feu ; pertes estimées à des dizaines de millions d'euros ; même mode opératoire sur de petites installations hydroélectriques Schneider — [IT-Connect](https://www.it-connect.fr/frigos-supermarches-france-impute-iran-cgri-shahid-kaveh/) ; [BleepingComputer](https://bleepingcomputer.com/news/security/france-blames-iranian-hackers-for-supermarket-attacks-that-sparked-fires) ; [IT-Connect 12/10](https://www.it-connect.fr/cyberattaque-supermarches-froid-danfoss/).
- 21/10/2026 : Vincent Strubel (ANSSI) au Sénat : défauts de sécurisation élémentaires, mots de passe faibles, écarte les failles Claroty ; Public Sénat date l'attaque du 12-13 octobre (divergence) — [Public Sénat](https://www.publicsenat.fr/actualites/politique/des-defauts-de-securisation-elementaire-et-des-mots-de-passe-faibles-ont-permis-la-cyberattaque-contre-les-frigos-de-supermarches).
- 09/11/2026 : le C4 (ANSSI, COMCYBER, DGA, DGSE, DGSI) attribue l'attaque à Shahid Kaveh (CGRI-CEC, alias CyberAv3ngers) et d'autres à Shahid Shoostari/Emennet Pasargad (Charlie Hebdo 2023, bornes d'affichage JO 2024) ; ambassadeur convoqué ; nouvelles sanctions UE proposées ; l'UE avait sanctionné Emennet Pasargad en mars 2026 — [CERT-FR CTI-009](https://cert.cyber.gouv.fr/cti/CERTFR-2026-CTI-009/) ; [France Diplomatie](https://www.diplomatie.gouv.fr/fr/presse-et-ressources/decouvrir-et-informer/actualites/declaration-d-attribution-a-l-iran-de-cyberattaques-visant-la-france).
- Juges d'instruction saisis le 9/11, mandats d'arrêt internationaux demandés contre le chef de l'unité et ses adjoints — [Noovo/AFP](https://www.noovo.info/nouvelles/international/article/cyberattaques-visant-des-frigos-connectes-en-france-des-juges-saisis-dune-enquete-liran-soupconne/).
- 10/11 : Barrot : la France « ne s'interdit rien », refuse de commenter un lien iranien avec les attaques EFS, Arkéa et DGFiP — [Sud Radio](https://www.sudradio.fr/societe/cyberattaque-contre-des-frigos-la-france-ne-sinterdit-rien-dans-la-riposte-contre-liran-avertit-son-chef-de-la-diplomatie).
- 1-2/11 : chambres froides de trois sites de l'EFS modifiées via le prestataire Coolworld ; aucun produit perdu selon l'EFS ; non attribué — [Techniques de l'Ingénieur/AFP](https://www.techniques-ingenieur.fr/actualite/breves-afp/des-chambres-froides-de-letablissement-francais-du-sang-victimes-dune-cyberattaque-dun-prestataire-165616/) ; [IT-Connect](https://www.it-connect.fr/cyberattaque-efs-coolworld-congelateurs-plasma/).
- 2/11 : seconde vague contre des frigos de magasins en Belgique, Suède, Irlande, Luxembourg, Pays-Bas, Estonie (France non citée) — [Le Monde Informatique](https://www.lemondeinformatique.fr/actualites/lire-les-frigos-des-supermarches-europeens-victimes-d-une-nouvelle-vague-de-cyberattaques-100899.html).
- 4/11 : Crédit Mutuel Arkéa confirme une cyberattaque ; ~118 M€ selon ZachXBT/Le Télégramme, ordre de grandeur validé ; passage par un prestataire ; aucune attribution — [LMI](https://www.lemondeinformatique.fr/actualites/lire-credit-mutual-arkea-victime-d-un-piratage-de-118-meteuro-100910.html) ; [DH/AFP](https://www.dhnet.be/dernieres-depeches/2026/11/05/credit-mutuel-arkea-les-questions-en-suspens-apres-la-cyberattaque-67MPJWJ2UZBBHIKE46XTENGMGQ/) ; [IT-Connect](https://www.it-connect.fr/cyberattaque-credit-mutuel-arkea-fortuneo-133-millions/).
- L'article IT-Connect « 12 cyberattaques APT28 » date d'avril 2025 (hors périmètre) — [IT-Connect](https://www.it-connect.fr/la-france-attribue-12-cyberattaques-a-des-pirates-russes-du-groupe-apt28/).

### Inferences
- 2026 marque un passage de l'espionnage au sabotage à effets physiques contre la France ; la séquence EFS / Arkéa / seconde vague européenne n'est ni attribuée ni exclue.
- La rapidité de l'attribution iranienne (moins d'un mois) suggère une volonté de dissuasion.

### Gaps
- Aucune source sur une réaction iranienne officielle.
- Aucune attribution trouvée visant la Chine en 2026 contre une entité française nommée (seul le Panorama mentionne génériquement Russie et Chine) ; rien sur Salt Typhoon en France.
- Le cyber.gouv.fr était inaccessible (pages vides) ; CERT-FR consulté à la place.

## Campagnes hacktivistes (DDoS, défigurations)

### Takeaway
NoName057(16) reste l'acteur principal : DDoS contre La Poste (22-26/12/2025 puis 1/1/2026, enquête DGSI) et alerte M-CERT du 14/10/2026 sur les ports de Marseille et La Rochelle. Aucune vague hacktiviste documentée autour des municipales ; rien sur des groupes pro-algériens contre la France en 2026.

### Cited Findings
- 1/1/2026 : DDoS de plusieurs milliards de requêtes/s sur La Poste et La Banque Postale, enquête DGSI + gendarmerie — [Siècle Digital](https://siecledigital.fr/2026/01/05/cyberattaques-a-repetition-la-poste-sous-pression-des-2026/) ; [The Record](https://therecord.media/pro-russia-hackers-claim-attack-la-poste).
- 14/10/2026 : alerte M-CERT ; cibles listées par NoName057(16) : GPM Marseille, Port Atlantique La Rochelle, Marfret, CMN, Genavir ; aucune perturbation confirmée — [Journal du Coin](https://journalducoin.com/technologies/noname057-ddosia-hackers-prorusses-payes-en-crypto/).
- NoName057(16) : 1 530 opérations revendiquées fin octobre 2025 - mi-mars 2026 (Vot Tak) — [The Moscow Times](https://www.themoscowtimes.com/2026/07/22/pro-russian-hacker-group-gamifies-cyberattacks-on-europe-with-crypto-rewards-investigation).
- COMCYBER-MI (rapport 2026 sur 2025) : 1 347 revendications (+27 %), 60 % hacktivistes, DDoS 53 %, SCADA 2,1 %, logique de représailles — [Next](https://next.ink/236316/vols-de-donnees-les-pirates-ciblent-la-france-ou-le-font-croire-pour-se-venger/).
- Hacktivistes pro-iraniens après les frappes du 28/02/2026 : Sophos ne cite aucune revendication visant la France — [Sophos](https://www.sophos.com/fr-fr/blog/hacktivist-campaigns-increase-as-united-states-iran-and-israel-conflict-intensifies).

### Inferences
- La part SCADA du rapport COMCYBER-MI préfigurait les sabotages d'octobre.

### Gaps
- Pas de bilan officiel des attaques hacktivistes pendant les municipales ; aucune source fiable sur des groupes pro-algériens visant la France en 2026.

## Fuites de données et rançongiciels dans les services publics

### Takeaway
Année record de fuites dans l'État (OFII, HubEE, Urssaf, ANTS 11,7 M comptes, Éducation nationale x3, DGFiP, Metabase), presque toutes par comptes compromis/infostealers ; aucune n'est officiellement liée à un État. Le gouvernement a lancé l'opération REACTIV (1/9/2026) : 99 violations signalées à l'ANSSI au 30/9, 67 confirmées.

### Cited Findings
- Janvier : OFII (~2 M lignes), HubEE (70 000 dossiers), Urssaf (12 M salariés) ; intrusion de décembre 2025 au ministère de l'Intérieur (pirate de 22 ans arrêté) — [Localtis](https://www.banquedesterritoires.fr/fuite-de-donnees-personnelles-la-serie-noire-continue-pour-letat).
- 22/01 : CNIL sanctionne France Travail (5 M€ selon la presse) — [France Travail](https://www.francetravail.org/accueil/communiques/2026/france-travail-prend-acte-de-la-sanction-de-la-cnil-et-rappelle-que-la-cybersecurite-et-la-protection-des-donnees-sont-des-enjeu.html?type=article).
- 15/04 : ANTS, jusqu'à 11,7 M comptes ; mineur de 15 ans en garde à vue le 25/04, information judiciaire le 29/04 — [Acteurs publics](https://acteurspublics.fr/articles/11-7-millions-de-comptes-concernes-par-la-fuite-de-donnees-a-lants/) ; [Next](https://next.ink/brief_article/fuite-de-lants-un-ado-de-15-ans-en-garde-a-vue-ce-nest-pas-un-prodige-cest-un-signal/).
- 25/07 : Éducation nationale (3e incident de l'année après Compas en mars, 243 000 agents) ; contradiction ministère / Maire-info sur les élèves — [LMI](https://www.lemondeinformatique.fr/actualites/lire-le-ministere-de-l-education-nationale-cible-par-une-attaque-100733.html) ; [Maire-info](https://www.maire-info.com/imprimer2.php?param=31026).
- 12-13/08 : DGFiP, revendication ZeroBytes ; l'ANSSI dément la thèse de l'attaque sophistiquée — [IT-Connect](https://www.it-connect.fr/rapport-anssi-cyberattaque-dgfip/).
- REACTIV et vague Metabase (France VAE, Qualicharge, labo ANSSI, DINUM) — [CERT-FR CTI-010](https://cert.cyber.gouv.fr/cti/CERTFR-2026-CTI-010/) ; [IT-Connect](https://www.it-connect.fr/anssi-dinum-fuite-donnees-metabase/).

### Inferences
- Le profil dominant est celui de jeunes pirates opportunistes ; l'hypothèse étatique ne repose que sur le refus de Barrot de commenter (DGFiP).

### Gaps
- Aucun rançongiciel hospitalier 2026 précis trouvé ; aucune fuite CAF 2026 vérifiée (un démenti CAF évoqué en passant n'a pas été vérifié).

## Logiciels espions (Pegasus, Paragon, Predator)

### Takeaway
Seul développement documenté : l'enquête Forbidden Stories du 16/07/2026 sur sept ministres (dont Lecornu et Parly) porteurs de traces de Pegasus liées au Maroc, s'appuyant sur des marqueurs de l'ANSSI et une note DGSE d'avril 2022 ; le Maroc dément. Rien de confirmé pour Paragon ou Predator en France.

### Cited Findings
- [Forbidden Stories](https://forbiddenstories.org/while-france-was-considering-buying-pegasus-morocco-was-spying-on-its-ministers/) ; [Next](https://next.ink/brief-article/pegasus-de-nouveaux-details-sur-lutilisation-du-logiciel-par-le-maroc-contre-la-france/) ; [Solutions Numériques](https://www.solutions-numeriques.com/pegasus-de-nouvelles-preuves-visent-le-maroc-entre-temoignage-inedit-et-note-confidentielle-de-la-dgse/).
- Paragon : faille WhatsApp corrigée, aucune cible française confirmée — [IT-Connect](https://www.it-connect.fr/une-faille-zero-click-sur-whatsapp-a-ete-exploitee-par-un-spyware-de-paragon/).

### Gaps
- Auditions de dirigeants de NSO en France (février 2026) et saisine d'Eurojust : vues seulement dans un résumé de recherche, non vérifiées (classées en piste).

## Publications ANSSI, VIGINUM, COMCYBER

### Takeaway
CERT-FR : 10 rapports CTI en 2026 (IA générative 4/2, Panorama 11/3, Turla 13/7, REACTIV 30/9 et 12/11, santé 2/10, violations applicatives 20/10, CGRI 9/11). VIGINUM : quatre ingérences numériques pendant les municipales, dont Storm-1516 (GRU 29155).

### Cited Findings
- Liste CTI 2026 — [CERT-FR](https://cert.cyber.gouv.fr/cti/) ; Panorama — [CTI-002](https://cert.cyber.gouv.fr/cti/CERTFR-2026-CTI-002/).
- VIGINUM municipales — [Localtis](https://www.banquedesterritoires.fr/entre-les-deux-tours-viginum-identifie-une-ingerence-ciblant-specifiquement-lfi) ; [Next 15/06](https://next.ink/242089/elections-municipales-2026-des-ingerences-numeriques-pro-russes-anti-lfi-et-putaclics/).
- Stratégie nationale de cybersécurité (29/01) — [Siècle Digital](https://siecledigital.fr/2026/01/29/letat-francais-muscle-sa-cybersecurite-pour-les-elections-municipales/).

### Gaps
- Rapport « Rokh Solis » et date exacte (11 juin) du rapport public VIGINUM non vérifiés sur sgdsn.gouv.fr ; aucune publication COMCYBER (Armées) propre trouvée.
