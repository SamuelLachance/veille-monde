/* Veille Monde — vues secondaires : carte, dossiers, acteurs, anomalies,
 * pistes, synthèse et méthode. */
(function () {
  'use strict';
  const V = window.Veille;
  const { h } = V;
  const etat = V.etat;

  /* ---------- Carte géographique (Leaflet, chargé à la demande) ---------- */

  let promesseLeaflet = null;
  function chargerLeaflet() {
    if (window.L) return Promise.resolve();
    if (promesseLeaflet) return promesseLeaflet;
    promesseLeaflet = new Promise((resolve, reject) => {
      const css = h('link', {
        rel: 'stylesheet',
        href: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
        integrity: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=',
        crossorigin: 'anonymous'
      });
      const js = h('script', {
        src: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
        integrity: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=',
        crossorigin: 'anonymous'
      });
      js.onload = () => resolve();
      js.onerror = () => {
        promesseLeaflet = null;
        css.remove();
        js.remove();
        reject(new Error('bibliothèque de cartes inaccessible'));
      };
      document.head.append(css, js);
    });
    return promesseLeaflet;
  }

  // Écart (en degrés) sous lequel deux événements sont réunis dans le même cercle.
  const ECART_LIEU = 0.15;

  function regrouperLieux(liste) {
    // Rattachement au premier groupe proche plutôt qu'à une case arrondie : un arrondi
    // coupait une même ville en deux cercles (43,65 → 43,6 mais 43,654 → 43,7).
    const sortie = [];
    for (const e of liste) {
      if (e.lat == null || e.lon == null) continue;
      let groupe = sortie.find((g) => Math.abs(g.lat - e.lat) < ECART_LIEU && Math.abs(g.lon - e.lon) < ECART_LIEU);
      if (!groupe) {
        groupe = { cle: 'l' + sortie.length, lat: e.lat, lon: e.lon, evenements: [] };
        sortie.push(groupe);
      }
      groupe.evenements.push(e);
    }
    for (const l of sortie) {
      l.evenements.sort((a, b) => (a.date < b.date ? 1 : -1));
      l.max = Math.max(...l.evenements.map((e) => e.suspicion));
      const noms = V.compter(l.evenements, 'lieu');
      l.nom = (noms[0] && noms[0][0]) || l.evenements[0].pays || 'Lieu';
    }
    return sortie.sort((a, b) => b.evenements.length - a.evenements.length || b.max - a.max);
  }

  function contenuLieu(lieu) {
    return h(
      'div',
      null,
      h('strong', null, lieu.nom),
      h('div', { style: { color: 'var(--encre-3)', fontSize: '12px', marginBottom: '6px' } }, V.pluriel(lieu.evenements.length, 'événement')),
      // Liste complète : elle défile, et elle n'est construite qu'à l'ouverture de la fenêtre.
      h(
        'ul',
        { style: { margin: 0, paddingLeft: '16px', maxHeight: '220px', overflow: 'auto' } },
        lieu.evenements.map((e) => h('li', { style: { marginBottom: '4px' } }, V.lienEvenement(e), ` (${V.dateCourte(e.date, e.date_precision)})`))
      )
    );
  }

  function rendreCarte(liste) {
    const lieux = regrouperLieux(liste);
    const sansLieu = liste.filter((e) => e.lat == null || e.lon == null).length;
    const zoneCarte = h('div', { id: 'carte-geo', role: 'application', 'aria-label': 'Carte des événements' });
    const noteFond = h('p', { style: { color: 'var(--encre-3)', fontSize: '13px', marginTop: '10px' }, 'aria-live': 'polite' });
    const marqueurs = new Map();

    if (etat.carteLeaflet) {
      try {
        etat.carteLeaflet.remove();
      } catch {
        /* déjà détruite */
      }
      etat.carteLeaflet = null;
    }

    const listeLieux = h(
      'ul',
      { class: 'liste-compacte' },
      lieux.map((l) => {
        const cellule = h('span');
        let deplie = null;
        cellule.appendChild(
          h(
            'a',
            {
              href: '#',
              onclick(ev) {
                ev.preventDefault();
                const m = marqueurs.get(l.cle);
                if (m && etat.carteLeaflet) {
                  etat.carteLeaflet.setView([l.lat, l.lon], Math.max(etat.carteLeaflet.getZoom(), 5));
                  m.openPopup();
                } else if (l.evenements.length === 1) {
                  V.ouvrirEvenement(l.evenements[0].id);
                } else {
                  // Sans carte (hors ligne ou en cours de chargement) : les événements du lieu sous l'entrée.
                  if (deplie) {
                    deplie.remove();
                    deplie = null;
                  } else {
                    deplie = h('div', { style: { marginTop: '6px' } }, contenuLieu(l));
                    cellule.appendChild(deplie);
                  }
                  ev.currentTarget.setAttribute('aria-expanded', String(Boolean(deplie)));
                }
              }
            },
            l.nom
          )
        );
        return h('li', null, h('span', { class: 'quand' }, String(l.evenements.length)), cellule, V.jaugeSuspicion(l.max, 'niveau le plus élevé à cet endroit'));
      })
    );

    requestAnimationFrame(() => {
      if (!zoneCarte.isConnected) return;
      chargerLeaflet()
        .then(() => {
          if (!zoneCarte.isConnected) return;
          const L = window.L;
          const carte = L.map(zoneCarte, { worldCopyJump: true, minZoom: 2, zoomControl: false });
          etat.carteLeaflet = carte;
          // Libellés de Leaflet en français (ses valeurs par défaut sont en anglais).
          L.control.zoom({ zoomInTitle: 'Zoom avant', zoomOutTitle: 'Zoom arrière' }).addTo(carte);
          carte.attributionControl.setPrefix(
            '<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer" title="Bibliothèque JavaScript de cartes interactives">Leaflet</a>'
          );
          carte.on('popupopen', (ev) => {
            const fenetre = ev.popup.getElement();
            const fermer = fenetre && fenetre.querySelector('.leaflet-popup-close-button');
            if (fermer) {
              fermer.setAttribute('aria-label', 'Fermer');
              fermer.title = 'Fermer';
            }
          });
          zoneCarte.classList.toggle('sombre', V.themeSombre());
          const fond = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; contributeurs <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
            maxZoom: 12,
            referrerPolicy: 'origin',
            className: 'fond-carte'
          }).addTo(carte);
          fond.once('tileerror', () => {
            noteFond.textContent = 'Le fond de carte ne se charge pas (hors ligne, ou page ouverte sans le serveur local) : les cercles restent placés aux bonnes coordonnées.';
          });
          const points = [];
          // Du plus fourni au moins fourni : les petits cercles, ajoutés en dernier, restent au-dessus et cliquables.
          for (const l of lieux) {
            const m = L.circleMarker([l.lat, l.lon], {
              radius: Math.min(22, 6 + 3 * Math.sqrt(l.evenements.length)),
              className: `marqueur s${l.max}`,
              weight: 2
            }).addTo(carte);
            m.bindPopup(() => contenuLieu(l), { maxWidth: 320 });
            // Un nœud, pas une chaîne : Leaflet insérerait une chaîne comme du HTML.
            m.bindTooltip(h('span', null, `${l.nom} — ${l.evenements.length}`), { direction: 'top' });
            marqueurs.set(l.cle, m);
            points.push([l.lat, l.lon]);
          }
          // Cadrage initial : sur le pays suivi sélectionné (centre et zoom de meta.json), sinon sur
          // l'ensemble des lieux; les événements à l'étranger restent à un zoom arrière.
          const pays = etat.filtres.veille ? V.paysSuivi(etat.filtres.veille) : null;
          const centre = pays && Array.isArray(pays.centre) && pays.centre.length === 2 ? pays.centre.map(Number) : null;
          if (centre && centre.every(Number.isFinite)) carte.setView(centre, Number(pays.zoom) || 4);
          else if (points.length) carte.fitBounds(L.latLngBounds(points).pad(0.12), { maxZoom: 6 });
          else carte.setView([30, 0], 2);
        })
        .catch((err) => {
          if (!zoneCarte.isConnected) return;
          zoneCarte.removeAttribute('role');
          V.vider(zoneCarte).appendChild(
            h(
              'div',
              { style: { padding: '28px', color: 'var(--encre-2)' } },
              h('p', null, `Fond de carte indisponible (${err.message}).`),
              h('p', { style: { fontSize: '13.5px', marginTop: '6px' } }, 'La carte a besoin d’Internet pour charger le fond et la bibliothèque d’affichage. La liste des lieux reste utilisable.')
            )
          );
        });
    });

    return h(
      'div',
      null,
      V.titreVue(
        'Carte',
        'Un cercle par lieu : sa taille suit le nombre d’événements, sa teinte le niveau de suspicion le plus élevé. Les coordonnées sont approximatives (ville ou région).'
      ),
      h(
        'div',
        { class: 'legende' },
        [1, 2, 3, 4, 5].map((n) => h('span', null, h('i', { style: { background: `var(--ord-${n})`, borderRadius: '50%' } }), `${n} — ${V.niveau(n).nom}`))
      ),
      h(
        'div',
        { class: 'carte-disposition' },
        zoneCarte,
        h(
          'section',
          { class: 'carte liste-lieux' },
          h('header', null, h('div', null, h('h3', null, 'Lieux'), h('p', null, `${V.pluriel(lieux.length, 'lieu', 'lieux')}, ${V.pluriel(liste.length - sansLieu, 'événement situé', 'événements situés')}`))),
          lieux.length ? listeLieux : h('p', { style: { color: 'var(--encre-2)' } }, 'Aucun événement localisé dans cette sélection.')
        )
      ),
      sansLieu
        ? h(
            'p',
            { style: { color: 'var(--encre-3)', fontSize: '13px', marginTop: '10px' } },
            `${V.pluriel(sansLieu, 'événement')} sans lieu précis (cyberespace, portée nationale) ${sansLieu > 1 ? 'ne figurent' : 'ne figure'} pas sur la carte.`
          )
        : null,
      noteFond
    );
  }

  /* ---------- Dossiers ---------- */

  function texteBrut(markdown, max) {
    const t = String(markdown || '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`>#]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
  }

  function rendreDossiers(liste) {
    const groupes = new Map();
    for (const e of liste) {
      if (!e.dossier) continue;
      if (!groupes.has(e.dossier)) groupes.set(e.dossier, []);
      groupes.get(e.dossier).push(e);
    }
    // Taille réelle de chaque dossier, sur tout le registre du pays suivi : le classement ne dépend pas des autres filtres.
    const totaux = new Map();
    for (const e of V.evenementsPays()) if (e.dossier) totaux.set(e.dossier, (totaux.get(e.dossier) || 0) + 1);
    const fiches = [...groupes.entries()]
      .map(([id, evs]) => {
        const dates = evs.map((e) => e.date).sort();
        return { id, evs, total: totaux.get(id) || evs.length, debut: dates[0], fin: dates[dates.length - 1], max: Math.max(...evs.map((e) => e.suspicion)), d: V.dossier(id) };
      })
      .sort((a, b) => b.evs.length - a.evs.length || b.total - a.total || (a.fin < b.fin ? 1 : -1));
    const sansDossier = liste.filter((e) => !e.dossier).length;
    // Un dossier d'un seul événement est une affaire à suivre : liste compacte, pour ne pas noyer les autres.
    const principaux = fiches.filter((f) => f.total > 1);
    const isoles = fiches.filter((f) => f.total === 1);
    // Dossiers créés mais qu'aucun événement ne porte encore : sinon introuvables dans l'onglet.
    // Avec un pays sélectionné : ceux de ce pays ou sans pays précisé (pas ceux d'un autre pays, qui ont leurs fiches ailleurs).
    const ailleurs = new Set(etat.d.evenements.filter((e) => e.dossier && !V.duPays(e)).map((e) => e.dossier));
    const sansEvenement = etat.d.dossiers.filter((d) => !totaux.has(d.id) && V.duPays(d) && !ailleurs.has(d.id)).sort((a, b) => String(a.titre).localeCompare(String(b.titre), 'fr'));
    const compteFiche = (f) =>
      f.total > f.evs.length
        ? [h('b', null, V.nombre(f.evs.length)), ` dans la sélection sur ${V.nombre(f.total)}`]
        : [h('b', null, V.nombre(f.evs.length)), ` événement${f.evs.length > 1 ? 's' : ''}`];

    return h(
      'div',
      null,
      V.titreVue(
        'Dossiers',
        'Un dossier relie les événements d’une même affaire pour suivre son évolution dans le temps.',
        etat.serveur ? [h('button', { class: 'bouton', type: 'button', 'data-cle': 'dossier-nouveau', onclick: () => V.ouvrirDossier() }, 'Nouveau dossier')] : null
      ),
      principaux.length
        ? h(
            'div',
            { class: 'grille trois' },
            principaux.map((f) =>
              h(
                'section',
                { class: 'carte fiche' },
                h('h3', null, f.d ? f.d.titre : f.id),
                f.d && f.d.resume ? h('p', null, texteBrut(f.d.resume, 300)) : null,
                h(
                  'div',
                  { class: 'faits' },
                  h('span', null, compteFiche(f)),
                  h('span', null, f.debut === f.fin ? V.dateCourte(f.debut) : `${V.dateCourte(f.debut)} → ${V.dateCourte(f.fin)}`),
                  f.d && f.d.questions && f.d.questions.length ? h('span', null, V.pluriel(f.d.questions.length, 'question ouverte', 'questions ouvertes')) : null
                ),
                h('div', { class: 'puces' }, V.compter(f.evs, 'acteurs').slice(0, 5).map(([a]) => h('span', { class: 'puce acteur' }, a))),
                h(
                  'div',
                  { class: 'bas' },
                  V.jaugeSuspicion(f.max, 'niveau le plus élevé du dossier'),
                  h('span', { style: { flex: 1 } }),
                  etat.serveur
                    ? h('button', { class: 'bouton discret', type: 'button', 'data-cle': 'dossier-modifier-' + f.id, onclick: () => V.ouvrirDossier(f.d || { id: f.id, titre: f.id }) }, 'Modifier')
                    : null,
                  h('button', { class: 'bouton', type: 'button', 'data-cle': 'dossier-ouvrir-' + f.id, onclick: () => V.definirFiltres({ dossier: f.id }, 'chronologie') }, 'Ouvrir')
                )
              )
            )
          )
        : fiches.length
          ? null
          : V.vide('Aucun dossier dans cette sélection.', 'Un dossier apparaît dès qu’un événement porte son identifiant.'),
      isoles.length
        ? h(
            'section',
            { class: 'carte bloc' },
            h('header', null, h('div', null, h('h3', null, 'Affaires à un seul événement'), h('p', null, 'Elles deviendront des dossiers à part entière au prochain développement.'))),
            h(
              'ul',
              { class: 'liste-compacte' },
              isoles.map((f) =>
                h(
                  'li',
                  null,
                  h('span', { class: 'quand' }, V.dateCourte(f.debut)),
                  h('span', null, V.lienEvenement(f.evs[0]), h('span', { class: 'sous' }, `Dossier : ${f.d ? f.d.titre : f.id}`)),
                  V.jaugeSuspicion(f.max, V.niveau(f.max).nom)
                )
              )
            )
          )
        : null,
      sansEvenement.length
        ? h(
            'section',
            { class: 'carte bloc' },
            h(
              'header',
              null,
              h('div', null, h('h3', null, 'Dossiers sans événement'), h('p', null, 'Aucune fiche du registre ne porte encore leur identifiant (champ « Dossier » du formulaire d’événement).'))
            ),
            h(
              'ul',
              { class: 'liste-compacte' },
              sansEvenement.map((d) =>
                h(
                  'li',
                  null,
                  h('span', { class: 'quand' }, '0'),
                  h('span', null, d.titre || d.id, h('span', { class: 'sous' }, `Identifiant : ${d.id}`)),
                  etat.serveur
                    ? h('button', { class: 'bouton discret', type: 'button', 'data-cle': 'dossier-modifier-' + d.id, onclick: () => V.ouvrirDossier(d) }, 'Modifier')
                    : h('span')
                )
              )
            )
          )
        : null,
      sansDossier
        ? h(
            'p',
            { style: { color: 'var(--encre-3)', fontSize: '13px', marginTop: '12px' } },
            `${V.pluriel(sansDossier, 'événement')} de la sélection ${sansDossier > 1 ? 'ne sont rattachés' : 'n’est rattaché'} à aucun dossier.`
          )
        : null
    );
  }

  /* ---------- Acteurs ---------- */

  function rendreActeurs(liste) {
    const periodes = V.periodesDe(liste);
    const acteurs = V.compter(liste, 'acteurs');
    return h(
      'div',
      null,
      V.titreVue(
        'Acteurs présumés',
        'Les acteurs sont ceux que nomment les sources; une attribution reste une allégation tant qu’elle n’est pas confirmée. Un événement peut en compter plusieurs.'
      ),
      acteurs.length
        ? h(
            'div',
            { class: 'grille trois' },
            acteurs.map(([nom, n]) => {
              const evs = liste.filter((e) => e.acteurs.includes(nom));
              const eleves = evs.filter((e) => e.suspicion >= 4).length;
              const confirmes = evs.filter((e) => e.statut === 'confirme').length;
              const categories = V.compter(evs, 'categorie').slice(0, 3);
              const parMois = periodes.map((p) => evs.filter((e) => e.date.slice(0, 7) === p).length);
              return h(
                'section',
                { class: 'carte fiche' },
                h('h3', null, nom),
                h(
                  'div',
                  { class: 'faits' },
                  h('span', null, h('b', null, String(n)), ` événement${n > 1 ? 's' : ''}`),
                  h('span', null, h('b', null, String(eleves)), ' à suspicion élevée'),
                  h('span', null, h('b', null, String(confirmes)), ` confirmé${confirmes > 1 ? 's' : ''}`)
                ),
                periodes.length > 1 ? V.miniColonnes(parMois, periodes.map(V.nomPeriode)) : null,
                h('p', null, 'Surtout : ' + categories.map(([id, k]) => `${V.nom('categories', id)} (${k})`).join(', ')),
                h(
                  'div',
                  { class: 'bas' },
                  h('span', { style: { flex: 1 } }),
                  h('button', { class: 'bouton', type: 'button', onclick: () => V.definirFiltres({ acteur: nom }, 'chronologie') }, 'Voir les événements')
                )
              );
            })
          )
        : V.vide('Aucun événement ne correspond aux filtres.')
    );
  }

  /* ---------- Anomalies ---------- */

  function rendreAnomalies(liste) {
    const avec = liste
      .filter((e) => e.anomalies.length)
      .sort((a, b) => b.suspicion - a.suspicion || b.anomalies.length - a.anomalies.length || (a.date < b.date ? 1 : -1));
    const total = avec.reduce((s, e) => s + e.anomalies.length, 0);
    const zone = h('div');
    let rendu = 0;
    let bouton = null;

    function suite() {
      for (const e of avec.slice(rendu, rendu + 40)) {
        zone.appendChild(
          h(
            'article',
            { class: 'anomalie' },
            h('header', null, h('div', null, h('h4', null, V.lienEvenement(e)), h('div', { class: 'meta' }, `${V.formaterDate(e.date, e.date_precision)} · ${V.nom('categories', e.categorie)} · ${e.acteurs.join(', ')} · ${V.nom('statuts', e.statut)}`)), V.jaugeSuspicion(e.suspicion, V.niveau(e.suspicion).nom)),
            h('ul', null, e.anomalies.map((a) => h('li', null, a))),
            e.hypotheses.length
              ? h('details', null, h('summary', null, `Autres explications possibles (${e.hypotheses.length})`), h('ul', null, e.hypotheses.map((x) => h('li', null, x))))
              : null
          )
        );
      }
      rendu = Math.min(avec.length, rendu + 40);
      if (bouton) bouton.remove();
      if (rendu < avec.length) {
        bouton = h('div', { style: { textAlign: 'center', padding: '10px' } }, h('button', { class: 'bouton', type: 'button', onclick: suite }, `Afficher la suite (${V.pluriel(avec.length - rendu, 'restant')})`));
        zone.appendChild(bouton);
      }
    }
    if (avec.length) suite();

    return h(
      'div',
      null,
      V.titreVue(
        'Anomalies et incohérences',
        `${V.pluriel(total, 'observation')} sur ${V.pluriel(avec.length, 'événement')} : versions officielles qui se contredisent, coïncidences de calendrier, zones d’ombre, attributions douteuses.`
      ),
      h(
        'div',
        { class: 'avertissement' },
        'Ces observations sont de l’analyse, pas des faits. Chaque fiche propose aussi des explications ordinaires; une anomalie signale une question à creuser, pas une conclusion.'
      ),
      avec.length ? zone : V.vide('Aucune anomalie relevée dans cette sélection.')
    );
  }

  /* ---------- Pistes ---------- */

  function nomTheme(theme) {
    const t = String(theme || '').replace(/_/g, ' ').trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Sans thème';
  }

  function rendrePistes() {
    // Pays sélectionné : ses pistes et celles qui ne précisent aucun pays.
    const toutes = etat.d.pistes.filter(V.duPays).sort((a, b) => (a.cree < b.cree ? 1 : a.cree > b.cree ? -1 : a.titre.localeCompare(b.titre, 'fr')));
    const themes = V.compter(toutes.map((p) => ({ theme: p.theme || '' })), 'theme');
    const sansTheme = toutes.filter((p) => !p.theme).length;
    if (etat.themePiste && etat.themePiste !== '—' && !themes.some(([t]) => t === etat.themePiste)) etat.themePiste = '';
    const etats = etat.d.meta.etatsPiste;

    function filtrerPistes() {
      const mots = V.simplifier(etat.qPiste || '').split(/\s+/).filter(Boolean);
      return toutes.filter((p) => {
        if (etat.themePiste === '—' ? p.theme : etat.themePiste && p.theme !== etat.themePiste) return false;
        if (!mots.length) return true;
        const texte = V.simplifier([p.titre, p.description, p.pourquoi].join(' '));
        return mots.every((m) => texte.includes(m));
      });
    }

    // Le tri et la recherche ne remplacent que la liste des pistes : le formulaire « Nouvelle piste »
    // garde sa saisie et le champ actif garde le focus.
    const zoneBlocs = h('div');
    function remplirBlocs() {
      const pistes = filtrerPistes();
      const blocs = etats
        .map((x) => ({ x, items: pistes.filter((p) => p.etat === x.id) }))
        .filter((b) => b.items.length)
        .map((b) => h('div', null, h('h3', { class: 'mois-titre', style: { position: 'static', textTransform: 'none' } }, b.x.nom, h('span', null, String(b.items.length))), b.items.map(carte)));
      V.vider(zoneBlocs).appendChild(
        h(
          'div',
          null,
          blocs.length
            ? blocs
            : toutes.length
              ? V.vide('Aucune piste ne correspond à ce tri.')
              : V.vide('Aucune piste pour l’instant.', etat.serveur ? 'Notez ici ce que vous voulez vérifier plus tard.' : etat.public ? null : 'Lancez Demarrer.bat pour en ajouter.')
        )
      );
    }

    const tri =
      toutes.length > 8
        ? h(
            'div',
            { class: 'filtres-rangee', style: { marginBottom: '14px' } },
            h(
              'label',
              { class: 'champ', style: { flex: '0 1 240px' } },
              h('span', null, 'Thème'),
              h(
                'select',
                {
                  value: etat.themePiste || '',
                  'data-cle': 'pistes-theme',
                  onchange(ev) {
                    etat.themePiste = ev.target.value;
                    remplirBlocs();
                  }
                },
                h('option', { value: '' }, `Tous les thèmes (${toutes.length})`),
                themes.map(([t, n]) => h('option', { value: t }, `${nomTheme(t)} (${n})`)),
                sansTheme ? h('option', { value: '—' }, `Sans thème (${sansTheme})`) : null
              )
            ),
            h(
              'label',
              { class: 'champ', style: { flex: '1 1 240px' } },
              h('span', null, 'Recherche dans les pistes'),
              h('input', {
                type: 'search',
                value: etat.qPiste || '',
                placeholder: 'Mot-clé…',
                'data-cle': 'pistes-recherche',
                oninput: V.delai((ev) => {
                  etat.qPiste = ev.target.value;
                  remplirBlocs();
                }, 220)
              })
            )
          )
        : null;

    const formulaire = etat.serveur
      ? (() => {
          const titre = h('input', { type: 'text', required: true, maxlength: 220 });
          const description = h('textarea', { rows: 2 });
          const pourquoi = h('textarea', { rows: 2 });
          const url = h('input', { type: 'url', placeholder: 'https://…' });
          return h(
            'form',
            {
              class: 'carte formulaire',
              style: { marginBottom: '16px' },
              async onsubmit(ev) {
                ev.preventDefault();
                try {
                  // Une piste notée pendant qu'un pays est sélectionné relève de ce pays.
                  await V.api('POST', 'pistes', { titre: titre.value, description: description.value, pourquoi: pourquoi.value, url: url.value, veille: etat.filtres.veille || null });
                  V.avis('Piste ajoutée.');
                  await V.recharger();
                } catch (err) {
                  V.avis(`Piste non enregistrée : ${err.message}`, true);
                }
              }
            },
            h('label', { class: 'champ c6' }, h('span', null, 'Nouvelle piste — titre'), titre),
            h('label', { class: 'champ c3' }, h('span', null, 'Ce qui est avancé'), description),
            h('label', { class: 'champ c3' }, h('span', null, 'Pourquoi la surveiller'), pourquoi),
            h('label', { class: 'champ c4' }, h('span', null, 'Lien (facultatif)'), url),
            // La largeur de la cellule vient de app.css (.formulaire .pied-formulaire.c2), pleine largeur sur petit écran.
            h('div', { class: 'pied-formulaire c2', style: { alignItems: 'flex-end' } }, h('button', { class: 'bouton principal', type: 'submit', 'data-cle': 'piste-ajouter' }, 'Ajouter la piste'))
          );
        })()
      : null;

    function carte(p) {
      const lien = V.urlSure(p.url);
      return h(
        'article',
        { class: 'anomalie' },
        h(
          'header',
          null,
          h('div', null, h('h4', null, p.titre), h('div', { class: 'meta' }, [V.nom('etatsPiste', p.etat), !etat.filtres.veille && p.veille ? V.nomPays(p.veille) : null, p.theme ? `thème : ${nomTheme(p.theme)}` : null, p.cree ? `notée le ${V.dateCourte(V.jourLocal(p.cree))}` : null].filter(Boolean).join(' · '))),
          etat.serveur
            ? h(
                'select',
                {
                  'aria-label': 'État de la piste',
                  'data-cle': 'piste-etat-' + p.id,
                  value: p.etat,
                  style: { borderRadius: '8px', padding: '4px 8px', border: '1px solid var(--bordure-forte)', background: 'var(--surface)' },
                  async onchange(ev) {
                    try {
                      await V.api('PUT', 'pistes/' + encodeURIComponent(p.id), { etat: ev.target.value });
                      await V.recharger();
                    } catch (err) {
                      V.avis(err.message, true);
                    }
                  }
                },
                etats.map((x) => h('option', { value: x.id }, x.nom))
              )
            : null
        ),
        p.description ? h('p', { style: { fontSize: '13.5px', marginBottom: '6px' } }, p.description) : null,
        p.pourquoi ? h('p', { style: { fontSize: '13.5px', color: 'var(--encre-2)' } }, h('strong', null, 'Pourquoi la surveiller : '), p.pourquoi) : null,
        h(
          'div',
          { class: 'pied', style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px', alignItems: 'center' } },
          lien ? h('a', { href: lien, target: '_blank', rel: 'noopener noreferrer', style: { fontSize: '13px' } }, V.domaine(lien)) : null,
          h('span', { style: { flex: 1 } }),
          etat.serveur
            ? h(
                'button',
                {
                  class: 'bouton discret',
                  type: 'button',
                  'data-cle': 'piste-convertir-' + p.id,
                  onclick: () =>
                    V.ouvrirFormulaire(
                      null,
                      {
                        titre: p.titre,
                        resume: p.description,
                        veille: p.veille || etat.filtres.veille || V.veilleDefaut(),
                        statut: 'non-verifie',
                        fiabilite: 'faible',
                        suspicion: 2,
                        sources: lien ? [{ titre: p.titre, media: V.domaine(lien), url: lien }] : []
                      },
                      // Une fois la fiche créée, la piste passe à « Vérifiée » : elle ne reste pas à convertir.
                      async () => {
                        try {
                          await V.api('PUT', 'pistes/' + encodeURIComponent(p.id), { etat: 'verifiee' });
                        } catch (err) {
                          V.avis(`Fiche ajoutée, mais l’état de la piste n’a pas changé : ${err.message}`, true);
                        }
                      }
                    )
                },
                'Convertir en événement'
              )
            : null,
          etat.serveur
            ? h(
                'button',
                {
                  class: 'bouton discret danger',
                  type: 'button',
                  'data-cle': 'piste-supprimer-' + p.id,
                  async onclick() {
                    if (!window.confirm(`Supprimer la piste « ${p.titre} » ?`)) return;
                    try {
                      await V.api('DELETE', 'pistes/' + encodeURIComponent(p.id));
                      await V.recharger();
                    } catch (err) {
                      V.avis(err.message, true);
                    }
                  }
                },
                'Supprimer'
              )
            : null
        )
      );
    }

    remplirBlocs();

    return h(
      'div',
      null,
      V.titreVue(
        'Pistes à vérifier',
        'Signalements non confirmés, rumeurs à recouper, questions ouvertes. Une piste devient un événement quand une source solide la confirme; sinon elle est écartée.' +
          (etat.filtres.veille ? ` Pays suivi : ${V.nomPays(etat.filtres.veille)} (avec les pistes sans pays précisé).` : ''),
        [V.selectPays('pistes-pays')]
      ),
      formulaire,
      tri,
      zoneBlocs
    );
  }

  /* ---------- Synthèse ---------- */

  /* Brouillons de synthèse non enregistrés, par année : ils survivent au changement d'onglet,
   * d'année ou au bouton Précédent (qui reconstruisent la vue). */
  const brouillonsSynthese = new Map();

  function brouillonsEnCours() {
    if (!etat.d) return false;
    return [...brouillonsSynthese].some(([annee, texte]) => texte !== (etat.d.syntheses[annee] || ''));
  }

  window.addEventListener('beforeunload', (ev) => {
    if (!brouillonsEnCours()) return;
    ev.preventDefault();
    ev.returnValue = '';
  });

  function rendreSynthese() {
    const avecTexte = Object.keys(etat.d.syntheses).filter((a) => String(etat.d.syntheses[a] || '').trim());
    // Avec le serveur, on peut aussi commencer l'année en cours ou une année du registre sans synthèse.
    const annees = [
      ...new Set([
        ...Object.keys(etat.d.syntheses),
        ...(etat.serveur ? [...(etat.annees || []), String(new Date().getFullYear())] : []),
        ...brouillonsSynthese.keys()
      ])
    ]
      .sort()
      .reverse();
    if (!annees.length) annees.push(String(new Date().getFullYear()));
    if (!etat.anneeSynthese || !annees.includes(etat.anneeSynthese)) {
      etat.anneeSynthese = annees.find((a) => avecTexte.includes(a)) || annees[0];
    }
    const annee = etat.anneeSynthese;
    const source = etat.d.syntheses[annee] || '';
    const zone = h('div', { class: 'carte' });
    const boutonModifier = etat.serveur ? h('button', { class: 'bouton', type: 'button', 'data-cle': 'synthese-modifier', onclick: edition }, 'Modifier') : null;

    function lecture() {
      if (boutonModifier) boutonModifier.disabled = false;
      V.vider(zone).appendChild(
        source.trim()
          ? h('div', { class: 'prose' }, V.markdown(source))
          : V.vide(`Aucune synthèse pour ${annee}.`, etat.serveur ? 'Cliquez « Modifier » pour en rédiger une (format Markdown).' : null)
      );
    }

    function annuler() {
      brouillonsSynthese.delete(annee);
      lecture();
    }

    function edition() {
      // Pendant l'édition, « Modifier » ne doit pas recréer l'éditeur avec la version enregistrée.
      if (boutonModifier) boutonModifier.disabled = true;
      const texte = h('textarea', {
        rows: 26,
        'aria-label': `Synthèse ${annee} (Markdown)`,
        'data-cle': 'synthese-texte',
        style: { width: '100%', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '13px' },
        oninput() {
          if (texte.value === source) brouillonsSynthese.delete(annee);
          else brouillonsSynthese.set(annee, texte.value);
        }
      });
      texte.value = brouillonsSynthese.has(annee) ? brouillonsSynthese.get(annee) : source;
      V.vider(zone).appendChild(
        h(
          'div',
          { class: 'champ' },
          h('span', null, `Synthèse ${annee} — Markdown. Lien vers une fiche : [texte](#/chronologie?e=identifiant)`),
          texte,
          h(
            'div',
            { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' } },
            h('button', { class: 'bouton', type: 'button', 'data-cle': 'synthese-annuler', onclick: annuler }, 'Annuler'),
            h(
              'button',
              {
                class: 'bouton principal',
                type: 'button',
                'data-cle': 'synthese-enregistrer',
                async onclick() {
                  try {
                    await V.api('PUT', 'syntheses/' + annee, { markdown: texte.value });
                    brouillonsSynthese.delete(annee);
                    V.avis('Synthèse enregistrée.');
                    await V.recharger();
                  } catch (err) {
                    V.avis(err.message, true);
                  }
                }
              },
              'Enregistrer'
            )
          )
        )
      );
    }

    if (etat.serveur && brouillonsSynthese.has(annee)) edition();
    else lecture();
    return h(
      'div',
      null,
      V.titreVue('Synthèse annuelle', 'Lecture d’ensemble : tendances, recoupements entre dossiers et questions restées ouvertes.', [
        annees.length > 1
          ? h(
              'select',
              {
                class: 'bouton',
                'aria-label': 'Année',
                'data-cle': 'synthese-annee',
                value: annee,
                onchange(ev) {
                  etat.anneeSynthese = ev.target.value;
                  V.rendre();
                }
              },
              annees.map((a) => h('option', { value: a }, avecTexte.includes(a) || brouillonsSynthese.has(a) ? a : `${a} (à rédiger)`))
            )
          : null,
        boutonModifier
      ]),
      zone
    );
  }

  /* ---------- Méthode ---------- */

  function rendreMethode() {
    const meta = etat.d.meta;
    const ligne = (...c) => `| ${c.join(' | ')} |`;
    const pays = V.paysSuivis();
    const texte = [
      '## Ce que contient ce registre',
      '',
      `Des événements **rapportés publiquement** qui touchent un pays suivi (${pays.map((p) => p.nom).join(', ')}), sur son territoire ou à l’étranger, et qui peuvent indiquer une ingérence, de l’espionnage, une opération clandestine, de la répression transnationale, du sabotage ou une opération d’influence — ainsi que des événements simplement étranges ou mal expliqués.`,
      '',
      '## Pays suivis',
      '',
      'Chaque fiche relève d’un seul pays suivi (champ `veille`). La liste « Pays suivi », en tête des filtres, limite toutes les vues à ce pays; « Tous les pays » les réunit, et chaque fiche affiche alors son pays.',
      '',
      ligne('Pays', 'Identifiant', 'Régions ou provinces', 'Fiches'),
      ligne('---', '---', '---', '---'),
      ...pays.map((p) => ligne(p.nom, `\`${p.id}\``, (p.regions || []).length, etat.d.evenements.filter((e) => e.veille === p.id).length)),
      '',
      'Pour suivre un autre pays, ajoutez-le à `paysSuivis` dans `data/meta.json` (identifiant, nom, article, régions, centre et zoom de la carte) : aucune modification du code n’est nécessaire.',
      '',
      'Chaque fiche sépare deux choses :',
      '',
      '- **Les faits rapportés** : résumé, détails et sources, avec leur attribution (« selon la GRC », « selon la DGSI », « selon tel média »).',
      '- **L’analyse** : ce qui cloche, les autres explications possibles et le niveau de suspicion. C’est un jugement, pas une conclusion.',
      '',
      '## Échelle de suspicion',
      '',
      ligne('Niveau', 'Nom', 'Signification'),
      ligne('---', '---', '---'),
      ...meta.echelleSuspicion.map((n) => ligne(n.niveau, n.nom, n.description)),
      '',
      '## Statut de vérification',
      '',
      ligne('Statut', 'Signification'),
      ligne('---', '---'),
      ...meta.statuts.map((x) => ligne(x.nom, x.description)),
      '',
      '## Fiabilité des sources',
      '',
      ...meta.fiabilites.map((x) => `- **${x.nom}** — ${x.description}`),
      '',
      '## Limites à garder en tête',
      '',
      '- Le registre ne contient que des **sources ouvertes**. Ce qui n’a pas été publié n’y figure pas, et la couverture médiatique est inégale selon les pays et les communautés.',
      '- Une **attribution peut être fausse** : les États, les médias et les entreprises de cybersécurité se trompent, et certains ont intérêt à désigner un coupable.',
      '- Un événement étrange a **le plus souvent une explication ordinaire** : accident, crime de droit commun, erreur administrative, coïncidence.',
      '- Une accusation n’est pas une condamnation. La **présomption d’innocence** vaut pour toute personne nommée.',
      '- Le niveau de suspicion mesure la solidité des indices publics, pas la gravité de l’événement.',
      '',
      '## Tenir le registre à jour',
      '',
      '1. Lancez **Demarrer.bat** : le serveur local s’ouvre et l’indicateur passe à « Édition active ».',
      '2. **+ Ajouter** crée une fiche (choisissez son pays suivi); **Importer** intègre un fichier JSON d’événements (les doublons sont ignorés).',
      '3. L’étoile et les notes de chaque fiche sont votre suivi personnel; elles sont rangées à part et survivent aux importations.',
      '4. L’onglet **Pistes** sert à noter ce qui reste à vérifier.',
      '5. Pour une mise à jour de fond, demandez à Claude : « Mets à jour Veille Monde pour [pays] depuis le [date] ». Le fichier GUIDE.md décrit le format attendu.',
      '',
      '## Où sont les fichiers',
      '',
      '- `data/evenements/AAAA.json` — un fichier par année.',
      '- `data/perso.json` — vos étoiles et vos notes.',
      '- `data/dossiers.json`, `data/pistes.json`, `data/syntheses/AAAA.md`.',
      '- `data/sauvegardes/` — copie quotidienne avant modification (60 jours).',
      '- `data/corbeille.json` — fiches supprimées, récupérables.'
    ].join('\n');

    const journal = etat.d.journal.slice(-20).reverse();

    // D'où vient l'information : un registre qui s'appuie trop sur un seul média hérite de ses angles morts.
    const parDomaine = new Map();
    let nbSources = 0;
    for (const e of etat.d.evenements) {
      for (const s of e.sources) {
        const domaine = V.domaine(s.url);
        if (!domaine) continue;
        nbSources++;
        parDomaine.set(domaine, (parDomaine.get(domaine) || 0) + 1);
      }
    }
    const domaines = [...parDomaine.entries()].sort((a, b) => b[1] - a[1]);
    const carteSources = domaines.length
      ? V.carteGraphique({
          titre: 'D’où viennent les sources',
          sousTitre: `${V.pluriel(nbSources, 'source citée', 'sources citées')}, ${V.pluriel(domaines.length, 'site')}. Une forte concentration signale un angle mort possible.`,
          corps: V.barres({ donnees: domaines.map(([nom, n]) => ({ cle: nom, nom, valeur: n })), limite: 13, nomAutres: 'Autres sites', unite: 'source' }),
          donneesTableau: { colonnes: ['Site', 'Sources citées'], lignes: domaines }
        })
      : null;

    return h(
      'div',
      null,
      V.titreVue('Méthode et mode d’emploi'),
      h('div', { class: 'avertissement' }, meta.avertissement),
      h('div', { class: 'carte' }, h('div', { class: 'prose' }, V.markdown(texte))),
      carteSources ? h('div', { class: 'bloc' }, carteSources) : null,
      h(
        'section',
        { class: 'carte bloc' },
        h('header', null, h('div', null, h('h3', null, 'Journal des modifications'), h('p', null, 'Vingt dernières opérations enregistrées par le serveur local.'))),
        journal.length
          ? h(
              'ul',
              { class: 'liste-compacte' },
              journal.map((j) => h('li', null, h('span', { class: 'quand' }, V.dateCourte(V.jourLocal(j.date))), h('span', null, j.message), h('span', { class: 'quand' }, j.type)))
            )
          : h('p', { style: { color: 'var(--encre-2)', fontSize: '13.5px' } }, 'Aucune modification enregistrée.')
      )
    );
  }

  Object.assign(etat.rendus, {
    carte: rendreCarte,
    dossiers: rendreDossiers,
    acteurs: rendreActeurs,
    anomalies: rendreAnomalies,
    pistes: rendrePistes,
    synthese: rendreSynthese,
    methode: rendreMethode
  });
})();
