/* Veille Monde — cœur de l'application : données, filtres, navigation,
 * tableau de bord, chronologie et registre. */
(function () {
  'use strict';
  const V = window.Veille;
  const { h } = V;

  const VUES = [
    { id: 'tableau', nom: 'Tableau de bord' },
    { id: 'chronologie', nom: 'Chronologie' },
    { id: 'registre', nom: 'Registre' },
    { id: 'carte', nom: 'Carte' },
    { id: 'dossiers', nom: 'Dossiers' },
    { id: 'acteurs', nom: 'Acteurs' },
    { id: 'anomalies', nom: 'Anomalies' },
    { id: 'pistes', nom: 'Pistes' },
    { id: 'synthese', nom: 'Synthèse' },
    { id: 'methode', nom: 'Méthode' }
  ];
  const VUES_SANS_FILTRES = new Set(['pistes', 'synthese', 'methode']);
  const PAR_PAGE = 50;
  const PAR_LOT = 60;
  const MOIS_MAX = 36;

  const etat = (V.etat = {
    serveur: false,
    d: null,
    parId: new Map(),
    filtres: null,
    periodeParDefaut: 'tout',
    vue: 'tableau',
    ouvert: null,
    tri: { cle: 'date', sens: -1 },
    page: 1,
    ordre: 'desc',
    persoLocale: V.memoire.lire('perso', {}),
    vuJusqua: V.memoire.lire('vu', null),
    controles: {},
    rendus: {}
  });

  /* ---------- Données ---------- */

  function chargerCopieLocale() {
    return new Promise((resolve, reject) => {
      if (window.VEILLE_DONNEES) return resolve(window.VEILLE_DONNEES);
      const script = document.createElement('script');
      script.src = 'data/data.js';
      script.onload = () => (window.VEILLE_DONNEES ? resolve(window.VEILLE_DONNEES) : reject(new Error('data.js est vide')));
      script.onerror = () => reject(new Error('data/data.js est introuvable'));
      document.head.appendChild(script);
    });
  }

  async function charger() {
    let donnees = null;
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      try {
        const reponse = await fetch('/api/donnees', { cache: 'no-store' });
        if (reponse.ok) {
          donnees = await reponse.json();
          etat.serveur = true;
        }
      } catch {
        /* pas de serveur local : on se rabat sur la copie embarquée */
      }
    }
    if (!donnees) {
      donnees = await chargerCopieLocale();
      etat.serveur = false;
    }
    installer(donnees);
  }

  function installer(donnees) {
    donnees.evenements = donnees.evenements || [];
    donnees.dossiers = donnees.dossiers || [];
    donnees.pistes = donnees.pistes || [];
    donnees.perso = donnees.perso || {};
    donnees.syntheses = donnees.syntheses || {};
    donnees.journal = donnees.journal || [];
    etat.d = donnees;
    etat.public = !!donnees.public;
    etat.parId = new Map();
    const veilleDefaut = V.veilleDefaut();
    for (const e of donnees.evenements) {
      // Fiche antérieure au champ « veille » : rangée sous le pays par défaut, comme le fait le serveur.
      e.veille = e.veille || veilleDefaut;
      e.acteurs = e.acteurs || [];
      e.cibles = e.cibles || [];
      e.anomalies = e.anomalies || [];
      e.hypotheses = e.hypotheses || [];
      e.tags = e.tags || [];
      e.sources = e.sources || [];
      e._txt = V.simplifier(
        [e.titre, e.resume, e.details, e.lieu, e.pays, e.dossier, ...e.acteurs, ...e.cibles, ...e.tags, ...e.anomalies, ...e.hypotheses].join(' ')
      );
      etat.parId.set(e.id, e);
    }
    // Premier passage : tout est considéré comme déjà vu; les ajouts ultérieurs ressortiront comme nouveautés.
    if (!etat.vuJusqua) {
      etat.vuJusqua = donnees.evenements.reduce((m, e) => (e.cree > m ? e.cree : m), '') || new Date().toISOString();
      V.memoire.ecrire('vu', etat.vuJusqua);
    }
    const annees = [...new Set(donnees.evenements.map((e) => e.date.slice(0, 4)))].sort();
    etat.annees = annees;
    etat.periodeParDefaut = annees.length ? `a:${annees[annees.length - 1]}` : 'tout';
  }

  V.recharger = async function () {
    await charger();
    construireEntete();
    construireFiltres();
    appliquerHash();
    rendre();
  };

  /* ---------- Pays suivis (data/meta.json, « paysSuivis ») ---------- */

  V.paysSuivis = function () {
    const liste = etat.d && Array.isArray(etat.d.meta.paysSuivis) ? etat.d.meta.paysSuivis.filter((p) => p && p.id) : [];
    return liste.length ? liste : [{ id: 'canada', nom: 'Canada', article: 'au Canada', regions: [], centre: [56, -96], zoom: 3 }];
  };
  V.paysSuivi = function (id) {
    return V.paysSuivis().find((p) => p.id === id) || null;
  };
  /** Pays des fiches qui n'en précisent pas : « canada » s'il est suivi, sinon le premier. */
  V.veilleDefaut = function () {
    const liste = V.paysSuivis();
    return liste.some((p) => p.id === 'canada') ? 'canada' : liste[0].id;
  };
  V.nomPays = function (id) {
    const p = V.paysSuivi(id);
    return p ? p.nom : id || '';
  };
  /** « au Canada », « en France »… */
  V.articlePays = function (id) {
    const p = V.paysSuivi(id);
    return p ? p.article || `pour ${p.nom}` : '';
  };
  V.nomRegion = function (veille, code) {
    const p = V.paysSuivi(veille);
    const r = p && (p.regions || []).find((x) => x.code === code);
    return r ? r.nom : code || '';
  };
  /** Pays retenu par défaut à l'ouverture (dernier choix de la liste « Pays suivi »); '' = tous. */
  function veilleMemorisee() {
    const v = V.memoire.lire('paysSuivi', '');
    return v && V.paysSuivi(v) ? v : '';
  }
  /** Événements du pays suivi sélectionné (tous si « Tous les pays »), sans les autres filtres. */
  V.evenementsPays = function () {
    const v = etat.filtres && etat.filtres.veille;
    return v ? etat.d.evenements.filter((e) => e.veille === v) : etat.d.evenements;
  };
  /** Dossier ou piste visible pour le pays sélectionné : même pays, ou aucun pays précisé. */
  V.duPays = function (x) {
    const v = etat.filtres && etat.filtres.veille;
    return !v || !x || !x.veille || x.veille === v;
  };

  V.nom = function (type, id) {
    const x = (etat.d.meta[type] || []).find((o) => o.id === id);
    return x ? x.nom : id || '';
  };
  V.description = function (type, id) {
    const x = (etat.d.meta[type] || []).find((o) => o.id === id);
    return x ? x.description || '' : '';
  };
  V.niveau = function (n) {
    return (etat.d.meta.echelleSuspicion || []).find((x) => x.niveau === n) || { niveau: n, nom: '', description: '' };
  };
  V.dossier = function (id) {
    return etat.d.dossiers.find((d) => d.id === id) || null;
  };
  V.titreDossier = function (id) {
    const d = V.dossier(id);
    return d ? d.titre : id;
  };

  /* ---------- Nouveautés depuis le dernier pointage ---------- */

  V.estNouveau = function (e) {
    return Boolean(e.cree && etat.vuJusqua && e.cree > etat.vuJusqua);
  };

  V.marquerVu = function () {
    etat.vuJusqua = new Date().toISOString();
    V.memoire.ecrire('vu', etat.vuJusqua);
    if (etat.filtres.nouveaux) V.definirFiltres({ nouveaux: false });
    else rendre();
  };

  /* ---------- Annotations personnelles ---------- */

  V.perso = function (id) {
    return etat.serveur ? etat.d.perso[id] || {} : { ...(etat.d.perso[id] || {}), ...(etat.persoLocale[id] || {}) };
  };

  // Numéro de la dernière demande par fiche : une réponse plus ancienne n'écrase pas une saisie plus récente.
  const versionsPerso = new Map();

  V.annoter = async function (id, correctif) {
    if (etat.serveur) {
      // Mise à jour immédiate de la copie en mémoire : une fiche rouverte avant la réponse montre déjà la saisie.
      const avant = etat.d.perso[id];
      const version = (versionsPerso.get(id) || 0) + 1;
      versionsPerso.set(id, version);
      etat.d.perso[id] = { ...(avant || {}), ...correctif };
      try {
        const r = await V.api('PUT', 'perso/' + encodeURIComponent(id), correctif);
        if (versionsPerso.get(id) !== version) return;
        if (r.annotation) etat.d.perso[id] = r.annotation;
        else delete etat.d.perso[id];
      } catch (err) {
        if (versionsPerso.get(id) === version) {
          if (avant) etat.d.perso[id] = avant;
          else delete etat.d.perso[id];
        }
        throw err;
      }
    } else {
      // Seuls les champs changés ici sont gardés : les valeurs du registre restent visibles pour le reste.
      etat.persoLocale[id] = { ...(etat.persoLocale[id] || {}), ...correctif };
      V.memoire.ecrire('perso', etat.persoLocale);
    }
  };

  /* ---------- Filtres ---------- */

  function filtresParDefaut() {
    return {
      veille: veilleMemorisee(),
      periode: etat.periodeParDefaut,
      du: '',
      au: '',
      territoire: '',
      categorie: '',
      acteur: '',
      statut: '',
      smin: 1,
      q: '',
      suivis: false,
      nouveaux: false,
      dossier: ''
    };
  }

  const CLES_HASH = { veille: 'v', periode: 'p', du: 'du', au: 'au', territoire: 'ter', categorie: 'cat', acteur: 'act', statut: 'st', smin: 's', q: 'q', suivis: 'sv', nouveaux: 'n', dossier: 'dos' };

  function bornes(f) {
    if (f.periode.startsWith('a:')) return [`${f.periode.slice(2)}-01-01`, `${f.periode.slice(2)}-12-31`];
    if (f.periode.startsWith('j:')) return [V.decalerJours(V.aujourdhui(), -Number(f.periode.slice(2))), ''];
    if (f.periode === 'perso') return [f.du || '', f.au || ''];
    return ['', ''];
  }

  V.filtrer = function (sauf) {
    const f = { ...etat.filtres, ...(sauf || {}) };
    const [du, au] = bornes(f);
    const mots = V.simplifier(f.q).split(/\s+/).filter(Boolean);
    return etat.d.evenements.filter((e) => {
      if (f.veille && e.veille !== f.veille) return false;
      if (du && e.date < du) return false;
      if (au && e.date > au) return false;
      if (f.territoire && e.territoire !== f.territoire) return false;
      if (f.categorie && e.categorie !== f.categorie) return false;
      if (f.acteur && !e.acteurs.includes(f.acteur)) return false;
      if (f.statut && e.statut !== f.statut) return false;
      if (e.suspicion < f.smin) return false;
      if (f.dossier && e.dossier !== f.dossier) return false;
      if (f.suivis && !V.perso(e.id).suivi) return false;
      if (f.nouveaux && !V.estNouveau(e)) return false;
      if (mots.length && !mots.every((mot) => e._txt.includes(mot))) return false;
      return true;
    });
  };

  V.definirFiltres = function (correctif, vue) {
    const veilleAvant = etat.filtres.veille;
    Object.assign(etat.filtres, correctif);
    if (etat.filtres.periode !== 'perso') {
      etat.filtres.du = '';
      etat.filtres.au = '';
    }
    // Le dernier pays choisi devient celui de l'ouverture suivante.
    if (etat.filtres.veille !== veilleAvant) V.memoire.ecrire('paysSuivi', etat.filtres.veille || '');
    etat.page = 1;
    etat.chrono = null;
    if (vue) etat.vue = vue;
    synchroniserControles();
    ecrireHash(Boolean(vue));
    rendre();
    if (vue) window.scrollTo({ top: 0 });
  };

  function compter(liste, cle) {
    const m = new Map();
    for (const e of liste) {
      const valeurs = Array.isArray(e[cle]) ? e[cle] : [e[cle]];
      for (const v of valeurs) if (v != null && v !== '') m.set(v, (m.get(v) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'fr'));
  }
  V.compter = compter;

  function option(valeur, nom) {
    return h('option', { value: valeur }, nom);
  }

  function champ(etiquette, controle, classe) {
    return h('label', { class: 'champ' + (classe ? ' ' + classe : '') }, h('span', null, etiquette), controle);
  }

  /** Options « Pays suivi » : Tous les pays, puis chaque pays de meta.paysSuivis. */
  V.optionsPays = function (libelleTous) {
    return [option('', libelleTous || 'Tous les pays'), V.paysSuivis().map((p) => option(p.id, p.nom))];
  };

  /** Liste « Pays suivi » autonome (onglets sans la rangée de filtres, comme Pistes). */
  V.selectPays = function (cle) {
    return h(
      'select',
      { class: 'bouton', 'aria-label': 'Pays suivi', 'data-cle': cle || 'pays-suivi', value: etat.filtres.veille || '', onchange: (ev) => V.definirFiltres({ veille: ev.target.value }) },
      V.optionsPays()
    );
  };

  /* Acteurs présents dans le pays sélectionné; l'acteur filtré reste dans la liste même s'il n'y figure pas. */
  function remplirActeurs() {
    const c = etat.controles;
    if (!c.acteur) return;
    const acteurs = compter(V.evenementsPays(), 'acteurs');
    const f = etat.filtres;
    V.vider(c.acteur).appendChild(option('', 'Tous'));
    if (f.acteur && !acteurs.some(([nom]) => nom === f.acteur)) c.acteur.appendChild(option(f.acteur, `${f.acteur} (0)`));
    for (const [nom, n] of acteurs) c.acteur.appendChild(option(nom, `${nom} (${n})`));
    c.acteur.value = f.acteur || '';
  }

  function construireFiltres() {
    const meta = etat.d.meta;
    const c = (etat.controles = {});
    const sur = (cle, lire) => (ev) => V.definirFiltres({ [cle]: lire ? lire(ev.target) : ev.target.value });

    c.veille = h('select', { onchange: sur('veille') }, V.optionsPays());
    c.periode = h(
      'select',
      { onchange: sur('periode') },
      option('tout', 'Toutes les dates'),
      etat.annees
        .slice()
        .reverse()
        .map((a) => option(`a:${a}`, `Année ${a}`)),
      option('j:30', '30 derniers jours'),
      option('j:90', '90 derniers jours'),
      option('perso', 'Dates précises…')
    );
    c.du = h('input', { type: 'date', onchange: sur('du') });
    c.au = h('input', { type: 'date', onchange: sur('au') });
    c.champDu = champ('Du', c.du, 'etroit');
    c.champAu = champ('Au', c.au, 'etroit');
    c.territoire = h('select', { onchange: sur('territoire') }, option('', 'Partout'), meta.territoires.map((t) => option(t.id, t.nom)));
    c.categorie = h('select', { onchange: sur('categorie') }, option('', 'Toutes'), meta.categories.map((t) => option(t.id, t.nom)));
    c.acteur = h('select', { onchange: sur('acteur') });
    if (etat.filtres) remplirActeurs();
    c.statut = h('select', { onchange: sur('statut') }, option('', 'Tous'), meta.statuts.map((t) => option(t.id, t.nom)));
    c.smin = h(
      'select',
      { onchange: sur('smin', (t) => Number(t.value)) },
      meta.echelleSuspicion.map((n) => option(n.niveau, n.niveau === 1 ? 'Tous les niveaux' : `${n.niveau} et plus — ${n.nom}`))
    );
    c.q = h('input', {
      type: 'search',
      placeholder: 'Mot-clé, lieu, nom…',
      oninput: V.delai((ev) => V.definirFiltres({ q: ev.target.value }), 180)
    });
    c.suivis = h('input', { type: 'checkbox', onchange: sur('suivis', (t) => t.checked) });
    c.resume = h('div', { class: 'filtres-bas', 'aria-live': 'polite' });

    const zone = document.getElementById('filtres');
    V.vider(zone).appendChild(
      h(
        'div',
        { class: 'cadre' },
        h(
          'div',
          { class: 'filtres-rangee' },
          champ('Pays suivi', c.veille),
          champ('Période', c.periode),
          c.champDu,
          c.champAu,
          champ('Territoire', c.territoire),
          champ('Catégorie', c.categorie),
          champ('Acteur présumé', c.acteur),
          champ('Statut', c.statut),
          champ('Suspicion', c.smin),
          champ('Recherche', c.q, 'large'),
          h('label', { class: 'case' }, c.suivis, 'Mes suivis')
        ),
        c.resume
      )
    );
  }

  function synchroniserControles() {
    const c = etat.controles;
    const f = etat.filtres;
    if (!c.periode) return;
    c.veille.value = f.veille;
    if (c.veille.value !== f.veille) {
      f.veille = '';
      c.veille.value = '';
    }
    remplirActeurs();
    c.periode.value = f.periode;
    if (c.periode.value !== f.periode) {
      f.periode = 'tout';
      c.periode.value = 'tout';
    }
    c.du.value = f.du;
    c.au.value = f.au;
    c.champDu.hidden = c.champAu.hidden = f.periode !== 'perso';
    c.territoire.value = f.territoire;
    c.categorie.value = f.categorie;
    c.acteur.value = f.acteur;
    c.statut.value = f.statut;
    c.smin.value = String(f.smin);
    if (document.activeElement !== c.q) c.q.value = f.q;
    c.suivis.checked = f.suivis;
  }

  function nomPeriode(f) {
    if (f.periode.startsWith('a:')) return `Année ${f.periode.slice(2)}`;
    if (f.periode.startsWith('j:')) return `${f.periode.slice(2)} derniers jours`;
    if (f.periode === 'perso') {
      if (f.du && f.au) return `Du ${V.dateCourte(f.du)} au ${V.dateCourte(f.au)}`;
      if (f.du) return `Depuis le ${V.dateCourte(f.du)}`;
      if (f.au) return `Jusqu'au ${V.dateCourte(f.au)}`;
      return 'Dates précises';
    }
    return 'Toutes les dates';
  }

  function majResumeFiltres(liste) {
    const c = etat.controles;
    if (!c.resume) return;
    const f = etat.filtres;
    const d = filtresParDefaut();
    const actifs = [];
    const ajouter = (texte, remise) =>
      actifs.push(
        h(
          'span',
          { class: 'filtre-actif' },
          texte,
          h('button', { type: 'button', 'aria-label': `Retirer le filtre ${texte}`, onclick: () => V.definirFiltres(remise) }, '×')
        )
      );
    if (f.veille) ajouter(`Pays suivi : ${V.nomPays(f.veille)}`, { veille: '' });
    if (f.periode !== d.periode || f.du || f.au) ajouter(nomPeriode(f), { periode: d.periode, du: '', au: '' });
    if (f.territoire) ajouter(V.nom('territoires', f.territoire), { territoire: '' });
    if (f.categorie) ajouter(V.nom('categories', f.categorie), { categorie: '' });
    if (f.acteur) ajouter(f.acteur, { acteur: '' });
    if (f.statut) ajouter(V.nom('statuts', f.statut), { statut: '' });
    if (f.smin > 1) ajouter(`Suspicion ${f.smin} et plus`, { smin: 1 });
    if (f.dossier) ajouter(`Dossier : ${V.titreDossier(f.dossier)}`, { dossier: '' });
    if (f.q) ajouter(`« ${f.q} »`, { q: '' });
    if (f.suivis) ajouter('Mes suivis', { suivis: false });
    if (f.nouveaux) ajouter('Nouveautés', { nouveaux: false });

    V.vider(c.resume);
    c.resume.appendChild(
      h(
        'span',
        null,
        h('strong', null, V.nombre(liste.length)),
        ` événement${liste.length > 1 ? 's' : ''} sur ${V.nombre(V.evenementsPays().length)} au registre`
      )
    );
    actifs.forEach((a) => c.resume.appendChild(a));
    // Le pays suivi n'est pas remis à zéro : c'est le cadre de travail, pas un filtre d'appoint.
    const filtresHorsPays = actifs.length - (f.veille ? 1 : 0);
    if (filtresHorsPays > 1) {
      c.resume.appendChild(h('button', { class: 'bouton discret', type: 'button', onclick: () => V.definirFiltres({ ...filtresParDefaut(), veille: f.veille }) }, 'Tout réinitialiser'));
    }
  }

  /* ---------- Navigation (adresse = vue + filtres + fiche ouverte) ---------- */

  function requeteFiltres(extra) {
    const p = new URLSearchParams();
    const f = etat.filtres;
    const d = filtresParDefaut();
    for (const [cle, court] of Object.entries(CLES_HASH)) {
      // Le pays suivi est toujours écrit (« tous » pour tous les pays) : un signet ne dépend pas du dernier choix mémorisé.
      if (cle === 'veille') {
        p.set(court, f.veille || 'tous');
        continue;
      }
      // La période est toujours écrite : un signet garde l'année affichée même quand une année plus récente apparaît.
      if (cle === 'periode' || (f[cle] !== d[cle] && f[cle] !== '' && f[cle] !== false)) p.set(court, f[cle] === true ? '1' : String(f[cle]));
    }
    for (const [k, v] of Object.entries(extra || {})) if (v) p.set(k, v);
    const s = p.toString();
    return s ? '?' + s : '';
  }

  V.lien = function (vue, extra) {
    return `#/${vue}${requeteFiltres(extra)}`;
  };

  /* Renvoie true si une nouvelle entrée a été ajoutée à l'historique. */
  function ecrireHash(empiler) {
    const cible = V.lien(etat.vue, { e: etat.ouvert });
    if (location.hash === cible) return false;
    try {
      history[empiler ? 'pushState' : 'replaceState'](null, '', cible);
    } catch {
      location.hash = cible;
      empiler = true;
    }
    etat.hashApplique = location.hash;
    return Boolean(empiler);
  }

  function appliquerHash() {
    const brut = location.hash.replace(/^#\/?/, '');
    const [chemin, requete = ''] = brut.split('?');
    etat.vue = VUES.some((v) => v.id === chemin) ? chemin : 'tableau';
    const p = new URLSearchParams(requete);
    const f = filtresParDefaut();
    for (const [cle, court] of Object.entries(CLES_HASH)) {
      if (!p.has(court)) continue;
      const v = p.get(court);
      if (cle === 'veille') f.veille = v !== 'tous' && V.paysSuivi(v) ? v : '';
      else if (cle === 'smin') f.smin = Math.min(5, Math.max(1, Number(v) || 1));
      else if (cle === 'suivis' || cle === 'nouveaux') f[cle] = v === '1';
      else f[cle] = v;
    }
    etat.filtres = f;
    etat.ouvert = p.get('e') && etat.parId.has(p.get('e')) ? p.get('e') : null;
    etat.hashApplique = location.hash;
    synchroniserControles();
    // Une fiche supprimée ou inconnue ne doit pas rester dans l'adresse.
    if (p.get('e') && !etat.ouvert) ecrireHash(false);
  }

  /* Un clic sur un lien déclenche à la fois « popstate » et « hashchange » : on ne rend qu'une fois. */
  function surNavigation() {
    if (location.hash === etat.hashApplique) return;
    // Lien d'évitement « Aller au contenu » : ce n'est pas une vue.
    if (location.hash === '#contenu') return;
    const vueAvant = etat.vue;
    const lienAvant = V.lien(etat.vue);
    appliquerHash();
    // Seule la fiche ouverte a changé (ex. Précédent après l'ouverture d'une fiche) : la vue reste telle quelle.
    if (V.lien(etat.vue) === lienAvant) {
      if (V.synchroniserTiroir) V.synchroniserTiroir();
      return;
    }
    rendre();
    if (etat.vue !== vueAvant) window.scrollTo({ top: 0 });
  }

  V.allerA = function (vue) {
    etat.vue = vue;
    etat.page = 1;
    etat.chrono = null;
    ecrireHash(true);
    rendre();
    window.scrollTo({ top: 0 });
  };

  /* ---------- Rendu ---------- */

  /* Les onglets sont mis à jour sur place : le focus et le défilement horizontal de la bande sont conservés. */
  function majOnglets() {
    const nav = document.getElementById('onglets');
    const comptes = { pistes: etat.d.pistes.filter((p) => p.etat === 'a-verifier' && V.duPays(p)).length };
    let cadre = nav.querySelector('.cadre');
    if (!cadre || cadre.children.length !== VUES.length) {
      cadre = h(
        'div',
        { class: 'cadre' },
        VUES.map((v) => h('a', { 'data-cle': 'onglet-' + v.id }, v.nom))
      );
      V.vider(nav).appendChild(cadre);
    }
    let actif = null;
    VUES.forEach((v, i) => {
      const a = cadre.children[i];
      a.setAttribute('href', V.lien(v.id));
      if (v.id === etat.vue) {
        a.setAttribute('aria-current', 'page');
        actif = a;
      } else a.removeAttribute('aria-current');
      let compte = a.querySelector('.compte');
      if (comptes[v.id]) {
        if (!compte) compte = a.appendChild(h('span', { class: 'compte' }));
        compte.textContent = String(comptes[v.id]);
      } else if (compte) compte.remove();
    });
    // Écran étroit : quand la vue change, on amène l'onglet actif dans la bande, sans faire défiler la page.
    if (actif && etat.ongletVisible !== etat.vue) {
      etat.ongletVisible = etat.vue;
      const rc = cadre.getBoundingClientRect();
      const ra = actif.getBoundingClientRect();
      if (ra.left < rc.left) cadre.scrollLeft -= rc.left - ra.left + 8;
      else if (ra.right > rc.right) cadre.scrollLeft += ra.right - rc.right + 8;
    }
  }

  /* Clé « data-cle » du contrôle qui a le focus dans la vue ou les onglets ('' si aucune), ou null. */
  function cleDuFocus(zones) {
    const actif = document.activeElement;
    if (!actif || actif === document.body || !zones.some((z) => z.contains(actif))) return null;
    const porteur = actif.closest('[data-cle]');
    return porteur ? porteur.getAttribute('data-cle') : '';
  }

  /* Après reconstruction, rend le focus au contrôle de même clé (ou à un voisin actif, ou à la zone principale). */
  function rendreFocus(cle, zones, main) {
    if (cle === null) return;
    const actif = document.activeElement;
    if (actif && actif !== document.body && actif.isConnected) return;
    let cible = null;
    if (cle) {
      for (const z of zones) {
        cible = [...z.querySelectorAll('[data-cle]')].find((el) => el.getAttribute('data-cle') === cle) || null;
        if (cible) break;
      }
    }
    if (cible && cible.disabled) cible = cible.parentElement && cible.parentElement.querySelector('button:not([disabled])');
    if (!cible) {
      main.tabIndex = -1;
      cible = main;
    }
    cible.focus({ preventScroll: true });
  }

  function rendre() {
    if (!etat.d) return;
    const main = document.getElementById('contenu');
    const zonesFocus = [main, document.getElementById('onglets')];
    const cleFocus = cleDuFocus(zonesFocus);
    const liste = V.filtrer();
    etat.liste = liste;
    majOnglets();
    document.getElementById('filtres').hidden = VUES_SANS_FILTRES.has(etat.vue);
    majResumeFiltres(liste);
    V.traces = [];
    V.infobulle.cacher();
    V.vider(main);
    const rendu = etat.rendus[etat.vue] || etat.rendus.tableau;
    main.appendChild(h('div', { class: 'cadre' }, paysSansFiche() ? videPays() : rendu(liste)));
    document.title = `${VUES.find((v) => v.id === etat.vue).nom} — ${etat.d.meta.titre || 'Veille Monde'}`;
    if (V.synchroniserTiroir) V.synchroniserTiroir();
    rendreFocus(cleFocus, zonesFocus, main);
  }
  V.rendre = rendre;

  function titreVue(titre, texte, actions) {
    return h(
      'div',
      { class: 'titre-vue' },
      h('div', null, h('h2', null, titre), texte ? h('p', null, texte) : null),
      actions ? h('div', { class: 'actions' }, actions) : null
    );
  }
  V.titreVue = titreVue;

  function vide(titre, texte) {
    return h('div', { class: 'vide' }, h('p', null, titre), texte ? h('p', null, texte) : null);
  }
  V.vide = vide;

  /* Pays suivi sélectionné sans aucune fiche (par exemple la France au départ) : les vues
   * filtrées expliquent comment en ajouter. Un dossier déjà créé pour ce pays reste visible. */
  function paysSansFiche() {
    const v = etat.filtres.veille;
    if (!v || VUES_SANS_FILTRES.has(etat.vue) || V.evenementsPays().length) return false;
    if (etat.vue === 'dossiers' && etat.d.dossiers.some((d) => d.veille === v)) return false;
    return true;
  }

  function videPays() {
    const p = V.paysSuivi(etat.filtres.veille) || { id: etat.filtres.veille, nom: etat.filtres.veille };
    const commande = `node outils/importer.js fichier.json --veille ${p.id}`;
    return h(
      'div',
      null,
      titreVue(VUES.find((v) => v.id === etat.vue).nom),
      h(
        'div',
        { class: 'vide' },
        h('p', null, `Aucun événement n’est encore consigné pour le pays suivi « ${p.nom} ».`),
        h(
          'p',
          null,
          etat.serveur
            ? `Ajoutez une fiche avec « + Ajouter » (le champ « Pays suivi » est déjà réglé sur ${p.nom}), ou importez un fichier JSON avec le bouton « Importer » en choisissant ${p.nom} pour les fiches sans pays. En ligne de commande : `
            : etat.public
              ? `Les fiches de ce pays apparaîtront ici après une prochaine mise à jour. Pour en ajouter localement : `
              : `Lancez Demarrer.bat pour ajouter des fiches (champ « Pays suivi » : ${p.nom}) ou importer un fichier JSON. En ligne de commande : `,
          h('code', null, commande),
          `. Dans un fichier d’importation, chaque événement peut aussi porter "veille": "${p.id}".`
        ),
        h(
          'p',
          null,
          h('button', { class: 'bouton', type: 'button', 'data-cle': 'pays-tous', onclick: () => V.definirFiltres({ veille: '' }) }, 'Afficher tous les pays'),
          ' ',
          etat.serveur ? h('button', { class: 'bouton principal', type: 'button', 'data-cle': 'pays-ajouter', onclick: () => V.ouvrirFormulaire() }, '+ Ajouter une fiche') : null
        )
      )
    );
  }

  /* ---------- Éléments d'événement ---------- */

  V.puces = function (e, options) {
    const o = options || {};
    return h(
      'div',
      { class: 'puces' },
      // Avec « Tous les pays », chaque fiche dit de quel pays suivi elle relève.
      etat.filtres && !etat.filtres.veille ? h('span', { class: 'puce pays', title: 'Pays suivi' }, V.nomPays(e.veille)) : null,
      h('span', { class: 'puce categorie', title: V.description('categories', e.categorie) }, V.nom('categories', e.categorie)),
      h('span', { class: `puce statut-${e.statut}`, title: V.description('statuts', e.statut) }, V.nom('statuts', e.statut)),
      V.estNouveau(e) ? h('span', { class: 'puce nouveau', title: 'Ajouté depuis votre dernier pointage' }, 'Nouveau') : null,
      h('span', { class: 'puce' }, V.nom('territoires', e.territoire)),
      o.acteurs === false ? null : e.acteurs.map((a) => h('span', { class: 'puce acteur' }, a))
    );
  };

  V.boutonSuivi = function (e) {
    const suivi = Boolean(V.perso(e.id).suivi);
    const bouton = h(
      'button',
      {
        class: 'etoile',
        type: 'button',
        'data-cle': 'suivi-' + e.id,
        'aria-pressed': String(suivi),
        'aria-label': suivi ? 'Retirer de mes suivis' : 'Ajouter à mes suivis',
        title: suivi ? 'Retirer de mes suivis' : 'Ajouter à mes suivis',
        async onclick(ev) {
          ev.stopPropagation();
          const nouveau = bouton.getAttribute('aria-pressed') !== 'true';
          try {
            await V.annoter(e.id, { suivi: nouveau });
            const libelle = nouveau ? 'Retirer de mes suivis' : 'Ajouter à mes suivis';
            bouton.setAttribute('aria-pressed', String(nouveau));
            bouton.setAttribute('aria-label', libelle);
            bouton.title = libelle;
            bouton.textContent = nouveau ? '★' : '☆';
            if (etat.filtres.suivis || etat.vue === 'tableau') rendre();
          } catch (err) {
            V.avis(`Suivi non enregistré : ${err.message}`, true);
          }
        }
      },
      suivi ? '★' : '☆'
    );
    return bouton;
  };

  V.lieu = function (e) {
    // Le pays n'est ajouté que s'il diffère du pays suivi de la fiche (une fiche « France » à Paris : « Paris »).
    return [e.lieu, e.pays && e.pays !== V.nomPays(e.veille) && !(e.lieu || '').includes(e.pays) ? e.pays : null].filter(Boolean).join(', ');
  };

  V.carteEvenement = function (e) {
    const article = h(
      'article',
      {
        class: 'evenement',
        onclick(ev) {
          if (ev.target.closest('a, button')) return;
          V.ouvrirEvenement(e.id);
        }
      },
      h('div', { class: 'date' }, V.dateCourte(e.date, e.date_precision), h('small', null, V.lieu(e))),
      h(
        'div',
        null,
        h(
          'h4',
          null,
          h(
            'a',
            {
              href: V.lien(etat.vue, { e: e.id }),
              onclick(ev) {
                ev.preventDefault();
                V.ouvrirEvenement(e.id);
              }
            },
            e.titre
          )
        ),
        h('p', { class: 'resume' }, e.resume),
        V.puces(e),
        h(
          'div',
          { class: 'pied' },
          e.anomalies.length ? h('span', null, V.pluriel(e.anomalies.length, 'anomalie relevée', 'anomalies relevées')) : null,
          h('span', null, V.pluriel(e.sources.length, 'source')),
          e.dossier ? h('span', null, `Dossier : ${V.titreDossier(e.dossier)}`) : null
        )
      ),
      h('div', { class: 'cote' }, V.jaugeSuspicion(e.suspicion, V.niveau(e.suspicion).nom), V.boutonSuivi(e))
    );
    return article;
  };

  function lienEvenement(e) {
    return h(
      'a',
      {
        href: V.lien(etat.vue, { e: e.id }),
        onclick(ev) {
          ev.preventDefault();
          V.ouvrirEvenement(e.id);
        }
      },
      e.titre
    );
  }
  V.lienEvenement = lienEvenement;

  function listeCompacte(evenements, vide_) {
    if (!evenements.length) return h('p', { style: { color: 'var(--encre-2)', fontSize: '13.5px' } }, vide_ || 'Rien à afficher.');
    return h(
      'ul',
      { class: 'liste-compacte' },
      evenements.map((e) =>
        h(
          'li',
          null,
          h('span', { class: 'quand' }, V.dateCourte(e.date, e.date_precision)),
          h('span', null, lienEvenement(e), h('span', { class: 'sous' }, `${V.nom('categories', e.categorie)} · ${e.acteurs.join(', ')}`)),
          V.jaugeSuspicion(e.suspicion, V.niveau(e.suspicion).nom)
        )
      )
    );
  }

  /* ---------- Tableau de bord ---------- */

  function periodesDe(liste) {
    const f = etat.filtres;
    let debut;
    let fin;
    if (f.periode.startsWith('a:')) {
      debut = `${f.periode.slice(2)}-01`;
      fin = `${f.periode.slice(2)}-12`;
    } else {
      if (!liste.length) return [];
      // La liste est déjà bornée par « au » : la fenêtre se termine au mois du dernier événement.
      const dates = liste.map((e) => e.date).sort();
      const [du] = bornes(f);
      debut = (du || dates[0]).slice(0, 7);
      fin = dates[dates.length - 1].slice(0, 7);
    }
    const [a0, m0] = debut.split('-').map(Number);
    const [af, mf] = fin.split('-').map(Number);
    const n = Math.max(1, (af - a0) * 12 + (mf - m0) + 1);
    etat.periodesTronquees = n > MOIS_MAX;
    // On remonte depuis le mois de fin : ce sont bien les derniers mois de la période.
    const periodes = [];
    for (let i = Math.min(n, MOIS_MAX) - 1; i >= 0; i--) {
      const rang = af * 12 + (mf - 1) - i;
      periodes.push(`${Math.floor(rang / 12)}-${String((rang % 12) + 1).padStart(2, '0')}`);
    }
    return periodes;
  }
  V.periodesDe = periodesDe;

  function filtrerMois(cle) {
    const [a, m] = cle.split('-').map(Number);
    const dernier = new Date(a, m, 0).getDate();
    return { periode: 'perso', du: `${cle}-01`, au: `${cle}-${String(dernier).padStart(2, '0')}` };
  }

  function rendreTableau(liste) {
    const total = liste.length;
    if (!etat.d.evenements.length) {
      return vide('Le registre est vide.', 'Ajoutez un premier événement avec le bouton « Ajouter », ou importez un fichier.');
    }
    const parTerritoire = new Map(compter(liste, 'territoire'));
    const eleves = liste.filter((e) => e.suspicion >= 4);
    const suivis = liste.filter((e) => V.perso(e.id).suivi);
    const nbSources = liste.reduce((s, e) => s + e.sources.length, 0);

    const tuiles = h(
      'div',
      { class: 'grille kpi' },
      V.tuile({ etiquette: 'Événements', valeur: V.nombre(total), detail: V.pluriel(nbSources, 'source citée', 'sources citées'), surClic: () => V.allerA('chronologie') }),
      V.tuile({
        etiquette: 'Sur le territoire',
        valeur: V.nombre(parTerritoire.get('interieur') || 0),
        detail: etat.filtres.veille ? V.articlePays(etat.filtres.veille) : 'de chaque pays suivi',
        surClic: () => V.definirFiltres({ territoire: 'interieur' }, 'chronologie')
      }),
      V.tuile({
        etiquette: "À l'étranger",
        valeur: V.nombre(parTerritoire.get('etranger') || 0),
        detail: 'ressortissants et intérêts à l’étranger',
        surClic: () => V.definirFiltres({ territoire: 'etranger' }, 'chronologie')
      }),
      V.tuile({
        etiquette: 'Cyberespace',
        // Le nombre affiché est celui que le clic filtre (territoire « cyber » seulement).
        valeur: V.nombre(parTerritoire.get('cyber') || 0),
        detail: parTerritoire.get('mixte')
          ? `+ ${V.pluriel(parTerritoire.get('mixte'), 'fiche mixte', 'fiches mixtes')}, non comptée${parTerritoire.get('mixte') > 1 ? 's' : ''}`
          : 'intrusions et influence en ligne',
        surClic: () => V.definirFiltres({ territoire: 'cyber' }, 'chronologie')
      }),
      V.tuile({
        etiquette: 'Suspicion élevée',
        valeur: V.nombre(eleves.length),
        detail: 'niveaux 4 et 5',
        surClic: () => V.definirFiltres({ smin: 4 }, 'chronologie')
      }),
      V.tuile({
        etiquette: 'Mes suivis',
        valeur: V.nombre(suivis.length),
        detail: suivis.length ? 'marqués d’une étoile' : 'cliquez ☆ pour suivre',
        surClic: () => V.definirFiltres({ suivis: true }, 'chronologie')
      })
    );

    const nouveautes = V.evenementsPays().filter(V.estNouveau).length;
    const bandeauNouveautes = nouveautes
      ? h(
          'div',
          { class: 'avertissement nouveautes' },
          h('span', null, h('strong', null, V.pluriel(nouveautes, 'fiche ajoutée', 'fiches ajoutées')), ` depuis votre dernier pointage (${V.dateCourte(V.jourLocal(etat.vuJusqua))}).`),
          h('button', { class: 'bouton', type: 'button', onclick: () => V.definirFiltres({ ...filtresParDefaut(), veille: etat.filtres.veille, periode: 'tout', nouveaux: true }, 'chronologie') }, 'Les voir'),
          h('button', { class: 'bouton discret', type: 'button', onclick: V.marquerVu }, 'Tout marquer comme vu')
        )
      : null;

    if (!total) return h('div', null, bandeauNouveautes, tuiles, vide('Aucun événement ne correspond aux filtres.', 'Élargissez la période ou retirez un filtre.'));

    const periodes = periodesDe(liste);
    const indice = new Map(periodes.map((p, i) => [p, i]));
    const hauts = periodes.map(() => 0);
    const autres = periodes.map(() => 0);
    for (const e of liste) {
      const i = indice.get(e.date.slice(0, 7));
      if (i == null) continue;
      if (e.suspicion >= 4) hauts[i]++;
      else autres[i]++;
    }
    const seriesMois = [
      { nom: 'Suspicion élevée (4 et 5)', couleur: 'var(--accent)', valeurs: hauts },
      { nom: 'Autres événements', couleur: 'var(--attenue)', valeurs: autres }
    ];
    const carteMois = V.carteGraphique({
      titre: 'Événements par mois',
      sousTitre:
        'La part en couleur regroupe les allégations officielles, les accusations et les opérations confirmées.' +
        (etat.periodesTronquees ? ` Affichage limité aux ${MOIS_MAX} derniers mois de la période.` : ''),
      legende: V.legende(seriesMois),
      corps: V.colonnesParPeriode({ periodes, series: seriesMois, surClic: (p) => V.definirFiltres(filtrerMois(p)) }),
      donneesTableau: {
        colonnes: ['Mois', 'Suspicion élevée', 'Autres', 'Total'],
        lignes: periodes.map((p, i) => [V.nomPeriode(p), hauts[i], autres[i], hauts[i] + autres[i]])
      }
    });

    const acteurs = compter(liste, 'acteurs');
    const acteursTete = acteurs.slice(0, 8);
    const rangees = acteursTete.map(([nom]) => ({
      cle: nom,
      nom,
      valeurs: periodes.map((p) => liste.filter((e) => e.date.slice(0, 7) === p && e.acteurs.includes(nom)).length)
    }));
    const colonnesMois = periodes.map((p) => ({ cle: p, nom: V.nomPeriode(p), court: V.MOIS[Number(p.slice(5)) - 1].slice(0, 1).toUpperCase() }));
    const th = V.thermique({
      rangees,
      colonnes: colonnesMois,
      surClic: (acteur, p) => V.definirFiltres({ acteur, ...filtrerMois(p) }, 'chronologie')
    });
    const carteThermique = V.carteGraphique({
      titre: 'Activité par acteur présumé',
      sousTitre: 'Qui apparaît quand. Un événement peut compter pour plusieurs acteurs.',
      legende: th.legende,
      corps: th.corps,
      donneesTableau: {
        colonnes: ['Acteur', ...colonnesMois.map((c) => `${V.MOIS_COURTS[Number(c.cle.slice(5)) - 1]} ${c.cle.slice(0, 4)}`)],
        lignes: rangees.map((r) => [r.nom, ...r.valeurs])
      }
    });

    const carteActeurs = V.carteGraphique({
      titre: 'Acteurs présumés',
      sousTitre: 'Selon les sources citées; « Inconnu » = aucune attribution.',
      corps: V.barres({ donnees: acteurs.map(([nom, n]) => ({ cle: nom, nom, valeur: n })), surClic: (acteur) => V.definirFiltres({ acteur }) }),
      donneesTableau: { colonnes: ['Acteur', 'Événements'], lignes: acteurs }
    });

    const categories = compter(liste, 'categorie');
    const carteCategories = V.carteGraphique({
      titre: 'Catégories',
      corps: V.barres({
        donnees: categories.map(([id, n]) => ({ cle: id, nom: V.nom('categories', id), valeur: n })),
        limite: 13,
        surClic: (categorie) => V.definirFiltres({ categorie })
      }),
      donneesTableau: { colonnes: ['Catégorie', 'Événements'], lignes: categories.map(([id, n]) => [V.nom('categories', id), n]) }
    });

    const parStatut = new Map(compter(liste, 'statut'));
    const statuts = etat.d.meta.statuts.map((st) => ({ cle: st.id, nom: st.nom, valeur: parStatut.get(st.id) || 0 }));
    const carteStatuts = V.carteGraphique({
      titre: 'Statut de vérification',
      sousTitre: 'Du plus solide au plus fragile.',
      corps: V.barres({ donnees: statuts, surClic: (statut) => V.definirFiltres({ statut }) }),
      donneesTableau: { colonnes: ['Statut', 'Événements'], lignes: statuts.map((x) => [x.nom, x.valeur]) }
    });

    const forts = liste
      .slice()
      .sort((a, b) => b.suspicion - a.suspicion || (a.date < b.date ? 1 : -1))
      .slice(0, 8);
    const recents = liste
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, 8);

    const dossiers = compter(liste.filter((e) => e.dossier), 'dossier').slice(0, 8);
    const carteDossiers = h(
      'section',
      { class: 'carte' },
      h('header', null, h('div', null, h('h3', null, 'Dossiers les plus fournis'), h('p', null, 'Fils conducteurs regroupant plusieurs événements.'))),
      dossiers.length
        ? h(
            'ul',
            { class: 'liste-compacte' },
            dossiers.map(([id, n]) => {
              const evs = liste.filter((e) => e.dossier === id);
              const max = Math.max(...evs.map((e) => e.suspicion));
              return h(
                'li',
                null,
                h('span', { class: 'quand' }, V.pluriel(n, 'év.', 'év.')),
                h(
                  'span',
                  null,
                  h(
                    'a',
                    {
                      href: V.lien('chronologie'),
                      onclick(ev) {
                        ev.preventDefault();
                        V.definirFiltres({ dossier: id }, 'chronologie');
                      }
                    },
                    V.titreDossier(id)
                  )
                ),
                V.jaugeSuspicion(max, 'niveau le plus élevé du dossier')
              );
            })
          )
        : h('p', { style: { color: 'var(--encre-2)', fontSize: '13.5px' } }, 'Aucun dossier dans cette sélection.')
    );

    return h(
      'div',
      null,
      h('div', { class: 'avertissement' }, etat.d.meta.avertissement),
      bandeauNouveautes,
      tuiles,
      h('div', { class: 'grille deux' }, carteMois, carteThermique),
      h('div', { class: 'grille trois bloc' }, carteActeurs, carteCategories, carteStatuts),
      h(
        'div',
        { class: 'grille trois bloc' },
        h('section', { class: 'carte' }, h('header', null, h('div', null, h('h3', null, 'Signaux les plus forts'), h('p', null, 'Suspicion la plus élevée, du plus récent au plus ancien.'))), listeCompacte(forts)),
        h('section', { class: 'carte' }, h('header', null, h('div', null, h('h3', null, 'Événements les plus récents'), h('p', null, 'Selon la date de l’événement.'))), listeCompacte(recents)),
        carteDossiers
      )
    );
  }

  /* ---------- Chronologie ---------- */

  function enteteDossier() {
    const id = etat.filtres.dossier;
    if (!id) return null;
    const d = V.dossier(id);
    if (!d) return null;
    return h(
      'section',
      { class: 'carte', style: { marginBottom: '14px' } },
      h('header', null, h('div', null, h('h3', null, `Dossier : ${d.titre}`))),
      d.resume ? h('div', { class: 'prose', style: { fontSize: '14px' } }, V.markdown(d.resume)) : null,
      d.questions && d.questions.length
        ? h('div', { class: 'prose', style: { fontSize: '14px' } }, h('h4', null, 'Questions ouvertes'), h('ul', null, d.questions.map((q) => h('li', null, q))))
        : null
    );
  }

  function rendreChronologie(liste) {
    const tri = liste.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
    if (etat.ordre === 'desc') tri.reverse();
    const zone = h('div');
    let rendu = 0;
    let moisCourant = null;
    let sentinelle = null;
    // Nombre de fiches déjà affichées, gardé d'un rendu à l'autre tant que les filtres et l'ordre ne changent pas.
    const cleChrono = `${requeteFiltres()}|${etat.ordre}`;
    if (!etat.chrono || etat.chrono.cle !== cleChrono) etat.chrono = { cle: cleChrono, n: 0 };
    const memoire = etat.chrono;

    function suite() {
      const taille = rendu === 0 ? Math.max(PAR_LOT, memoire.n) : PAR_LOT;
      const lot = tri.slice(rendu, rendu + taille);
      for (const e of lot) {
        const mois = e.date.slice(0, 7);
        if (mois !== moisCourant) {
          moisCourant = mois;
          const n = tri.filter((x) => x.date.slice(0, 7) === mois).length;
          zone.appendChild(h('h3', { class: 'mois-titre' }, V.nomPeriode(mois), h('span', null, V.pluriel(n, 'événement'))));
        }
        zone.appendChild(V.carteEvenement(e));
      }
      rendu += lot.length;
      memoire.n = rendu;
      if (sentinelle) sentinelle.remove();
      if (rendu < tri.length) {
        sentinelle = h(
          'div',
          { style: { textAlign: 'center', padding: '12px' } },
          h('button', { class: 'bouton', type: 'button', 'data-cle': 'chrono-suite', onclick: suite }, `Afficher la suite (${V.pluriel(tri.length - rendu, 'restant')})`)
        );
        zone.appendChild(sentinelle);
        if ('IntersectionObserver' in window) {
          const obs = new IntersectionObserver((entrees) => {
            if (entrees.some((x) => x.isIntersecting)) {
              obs.disconnect();
              suite();
            }
          });
          obs.observe(sentinelle);
        }
      }
    }
    if (tri.length) suite();
    else zone.appendChild(vide('Aucun événement ne correspond aux filtres.', 'Élargissez la période ou retirez un filtre.'));

    return h(
      'div',
      null,
      titreVue('Chronologie', 'Chaque fiche sépare les faits rapportés de l’analyse. Cliquez pour le détail, les sources et vos notes.', [
        h(
          'button',
          {
            class: 'bouton',
            type: 'button',
            'data-cle': 'chrono-ordre',
            onclick() {
              etat.ordre = etat.ordre === 'desc' ? 'asc' : 'desc';
              etat.chrono = null;
              rendre();
            }
          },
          etat.ordre === 'desc' ? 'Ordre : du plus récent' : 'Ordre : du plus ancien'
        )
      ]),
      enteteDossier(),
      zone
    );
  }

  /* ---------- Registre ---------- */

  const COLONNES = [
    { cle: 'date', nom: 'Date', tri: (e) => e.date },
    { cle: 'titre', nom: 'Événement', tri: (e) => V.simplifier(e.titre) },
    { cle: 'categorie', nom: 'Catégorie', tri: (e) => V.nom('categories', e.categorie) },
    { cle: 'acteurs', nom: 'Acteurs présumés', tri: (e) => e.acteurs.join(', ') },
    { cle: 'statut', nom: 'Statut', tri: (e) => etat.d.meta.statuts.findIndex((x) => x.id === e.statut) },
    { cle: 'suspicion', nom: 'Suspicion', tri: (e) => e.suspicion },
    { cle: 'sources', nom: 'Sources', tri: (e) => e.sources.length }
  ];

  V.exporterCSV = function (liste) {
    const lignes = [
      ['id', 'date', 'titre', 'categorie', 'acteurs', 'pays_suivi', 'territoire', 'lieu', 'region', 'pays', 'statut', 'fiabilite', 'suspicion', 'dossier', 'resume', 'anomalies', 'sources', 'suivi_perso', 'notes_perso']
    ];
    for (const e of liste) {
      const p = V.perso(e.id);
      lignes.push([
        e.id,
        e.date,
        e.titre,
        V.nom('categories', e.categorie),
        e.acteurs.join(' | '),
        V.nomPays(e.veille),
        V.nom('territoires', e.territoire),
        e.lieu,
        e.province ? V.nomRegion(e.veille, e.province) : '',
        e.pays,
        V.nom('statuts', e.statut),
        V.nom('fiabilites', e.fiabilite),
        e.suspicion,
        e.dossier || '',
        e.resume,
        e.anomalies.join(' | '),
        e.sources.map((s) => s.url).join(' | '),
        p.suivi ? 'oui' : '',
        p.notes || ''
      ]);
    }
    V.telecharger(`veille-monde-${V.aujourdhui()}.csv`, V.versCSV(lignes), 'text/csv;charset=utf-8');
  };

  function rendreRegistre(liste) {
    const col = COLONNES.find((c) => c.cle === etat.tri.cle) || COLONNES[0];
    const tri = liste.slice().sort((a, b) => {
      const x = col.tri(a);
      const y = col.tri(b);
      return (x < y ? -1 : x > y ? 1 : a.date < b.date ? -1 : 1) * etat.tri.sens;
    });
    const pages = Math.max(1, Math.ceil(tri.length / PAR_PAGE));
    etat.page = Math.min(etat.page, pages);
    const tranche = tri.slice((etat.page - 1) * PAR_PAGE, etat.page * PAR_PAGE);

    const tete = h(
      'tr',
      null,
      COLONNES.map((c) =>
        h(
          'th',
          { scope: 'col', 'aria-sort': etat.tri.cle === c.cle ? (etat.tri.sens > 0 ? 'ascending' : 'descending') : null },
          h(
            'button',
            {
              type: 'button',
              'data-cle': 'tri-' + c.cle,
              onclick() {
                etat.tri = { cle: c.cle, sens: etat.tri.cle === c.cle ? -etat.tri.sens : c.cle === 'date' || c.cle === 'suspicion' ? -1 : 1 };
                rendre();
              }
            },
            c.nom,
            etat.tri.cle === c.cle ? (etat.tri.sens > 0 ? ' ▲' : ' ▼') : ''
          )
        )
      ),
      h('th', { scope: 'col' }, 'Suivi')
    );

    const corps = tranche.map((e) =>
      h(
        'tr',
        {
          onclick(ev) {
            if (ev.target.closest('a, button')) return;
            V.ouvrirEvenement(e.id);
          }
        },
        h('td', { class: 'nowrap' }, V.dateCourte(e.date, e.date_precision)),
        h('td', { class: 'titre-cellule' }, V.lienEvenement(e), h('div', { style: { color: 'var(--encre-3)', fontSize: '12px', fontWeight: 400 } }, V.lieu(e))),
        h('td', null, V.nom('categories', e.categorie)),
        h('td', null, e.acteurs.join(', ')),
        h('td', null, V.nom('statuts', e.statut)),
        h('td', { class: 'nowrap' }, V.jaugeSuspicion(e.suspicion, V.niveau(e.suspicion).nom)),
        h('td', { class: 'nowrap' }, String(e.sources.length)),
        h('td', null, V.boutonSuivi(e))
      )
    );

    const pagination =
      pages > 1
        ? h(
            'div',
            { class: 'pagination' },
            h('button', { class: 'bouton', type: 'button', 'data-cle': 'page-precedente', disabled: etat.page <= 1, onclick: () => ((etat.page -= 1), rendre()) }, 'Précédent'),
            h('span', null, `Page ${etat.page} sur ${pages}`),
            h('button', { class: 'bouton', type: 'button', 'data-cle': 'page-suivante', disabled: etat.page >= pages, onclick: () => ((etat.page += 1), rendre()) }, 'Suivant')
          )
        : null;

    return h(
      'div',
      null,
      titreVue('Registre', 'Toutes les fiches en tableau. Cliquez un en-tête pour trier, une ligne pour ouvrir la fiche.', [
        h('button', { class: 'bouton', type: 'button', onclick: () => V.exporterCSV(tri) }, 'Exporter en CSV'),
        h(
          'button',
          {
            class: 'bouton',
            type: 'button',
            onclick: () =>
              V.telecharger(
                `veille-monde-selection-${V.aujourdhui()}.json`,
                JSON.stringify({ evenements: tri.map(({ _txt, ...e }) => e) }, null, 2),
                'application/json'
              )
          },
          'Exporter en JSON'
        )
      ]),
      tri.length
        ? h('div', { class: 'enveloppe-registre' }, h('table', { class: 'registre' }, h('thead', null, tete), h('tbody', null, corps)))
        : vide('Aucun événement ne correspond aux filtres.'),
      pagination
    );
  }

  etat.rendus.tableau = rendreTableau;
  etat.rendus.chronologie = rendreChronologie;
  etat.rendus.registre = rendreRegistre;

  /* ---------- Thème ---------- */

  function appliquerTheme(theme) {
    if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
  }
  V.themeSombre = function () {
    const t = document.documentElement.getAttribute('data-theme');
    if (t) return t === 'dark';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  };

  function construireEntete() {
    const meta = etat.d.meta;
    const noms = { auto: 'Thème : auto', light: 'Thème : clair', dark: 'Thème : sombre' };
    let theme = V.memoire.lire('theme', 'auto');
    const boutonTheme = h(
      'button',
      {
        class: 'bouton discret',
        type: 'button',
        onclick() {
          theme = theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto';
          V.memoire.ecrire('theme', theme);
          appliquerTheme(theme);
          boutonTheme.textContent = noms[theme];
          if (etat.vue === 'carte') rendre();
        }
      },
      noms[theme]
    );
    const maj = etat.d.evenements.reduce((m, e) => (e.maj > m ? e.maj : m), '');
    const zone = document.getElementById('entete');
    V.vider(zone).appendChild(
      h(
        'div',
        { class: 'cadre' },
        h(
          'div',
          { class: 'marque' },
          V.s(
            'svg',
            { width: 34, height: 34, viewBox: '0 0 34 34', 'aria-hidden': 'true' },
            V.s('circle', { cx: 17, cy: 17, r: 15, fill: 'none', stroke: 'var(--axe)', 'stroke-width': 1.5 }),
            V.s('circle', { cx: 17, cy: 17, r: 8.5, fill: 'none', stroke: 'var(--axe)', 'stroke-width': 1.5 }),
            V.s('path', { d: 'M17 17 L28.5 8.5', stroke: 'var(--accent)', 'stroke-width': 2, 'stroke-linecap': 'round' }),
            V.s('circle', { cx: 17, cy: 17, r: 2.5, fill: 'var(--accent)' }),
            V.s('circle', { cx: 23.5, cy: 21.5, r: 2, fill: 'var(--serie-2)' })
          ),
          h('div', null, h('h1', null, meta.titre), h('p', null, meta.sousTitre))
        ),
        h(
          'div',
          { class: 'entete-actions' },
          h(
            'span',
            {
              class: 'etat-mode' + (etat.serveur ? ' serveur' : ''),
              title: etat.serveur
                ? 'Le serveur local est actif : vos ajouts et vos notes sont enregistrés dans les fichiers du dossier data.'
                : etat.public
                  ? 'Version publique en consultation seulement, régénérée automatiquement chaque jour. Vos étoiles et vos notes restent dans ce navigateur.'
                  : 'Page ouverte sans le serveur local : consultation seulement. Lancez Demarrer.bat pour ajouter ou modifier.'
            },
            h('span', { class: 'point' }),
            etat.serveur ? 'Édition active' : etat.public ? 'Version publique' : 'Lecture seule'
          ),
          maj ? h('span', { class: 'etat-mode', title: 'Date de la dernière modification d’une fiche' }, `Mis à jour le ${V.dateCourte(V.jourLocal(maj))}`) : null,
          boutonTheme,
          etat.serveur ? h('button', { class: 'bouton', type: 'button', onclick: () => V.ouvrirImportation() }, 'Importer') : null,
          etat.serveur ? h('a', { class: 'bouton', href: '/api/export' }, 'Sauvegarde') : null,
          etat.serveur ? h('button', { class: 'bouton principal', type: 'button', onclick: () => V.ouvrirFormulaire() }, '+ Ajouter') : null
        )
      )
    );
  }
  V.construireEntete = construireEntete;

  /* ---------- Démarrage ---------- */

  V.demarrer = async function () {
    appliquerTheme(V.memoire.lire('theme', 'auto'));
    const main = document.getElementById('contenu');
    try {
      await charger();
    } catch (err) {
      V.vider(main).appendChild(
        h(
          'div',
          { class: 'cadre' },
          vide(
            'Impossible de charger les données.',
            `${err.message}. Lancez Demarrer.bat, ou exécutez « node outils/generer-bundle.js » pour recréer la copie locale.`
          )
        )
      );
      return;
    }
    etat.filtres = filtresParDefaut();
    construireEntete();
    construireFiltres();
    appliquerHash();
    rendre();
    window.addEventListener('hashchange', surNavigation);
    window.addEventListener('popstate', surNavigation);
  };

  V.ecrireHash = ecrireHash;
  V.filtresParDefaut = filtresParDefaut;
})();
