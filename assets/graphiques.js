/* Veille Monde — composants graphiques (SVG et HTML, aucune bibliothèque).
 * Règles suivies : une seule échelle par graphique, marques fines, grille discrète,
 * légende dès deux séries, infobulle au survol et au clavier, et un tableau de
 * données équivalent pour chaque graphique. */
(function () {
  'use strict';
  const V = window.Veille;
  const { h, s } = V;

  // Abréviations usuelles (OQLF) : « juin » et « juill. » restent distincts.
  const MOIS_ABREGES = V.MOIS_COURTS;

  /** Graphiques à retracer quand la fenêtre change de largeur (vidé à chaque rendu de vue). */
  V.traces = [];
  window.addEventListener(
    'resize',
    V.delai(() => {
      V.traces = V.traces.filter((t) => t.el.isConnected);
      V.traces.forEach((t) => t.tracer());
    }, 150)
  );

  function tableau({ colonnes, lignes }) {
    return h(
      'div',
      { class: 'defilement' },
      h(
        'table',
        { class: 'tableau-donnees' },
        h('thead', null, h('tr', null, colonnes.map((c, i) => h('th', { class: i ? 'num' : '', scope: 'col' }, c)))),
        h(
          'tbody',
          null,
          lignes.map((l) => h('tr', null, l.map((c, i) => h(i ? 'td' : 'th', i ? { class: 'num' } : { scope: 'row' }, c == null ? '' : String(c)))))
        )
      )
    );
  }

  /** Carte de graphique : titre, légende, tracé et bascule vers le tableau de données. */
  V.carteGraphique = function ({ titre, sousTitre, legende, corps, donneesTableau }) {
    const zoneTrace = h('figure', { role: 'group', 'aria-label': titre }, legende, corps);
    const zoneTableau = donneesTableau ? tableau(donneesTableau) : null;
    if (zoneTableau) zoneTableau.hidden = true;
    const bascule = zoneTableau
      ? h(
          'button',
          {
            class: 'bouton discret',
            type: 'button',
            'aria-pressed': 'false',
            title: 'Afficher les mêmes données sous forme de tableau',
            onclick() {
              const versTableau = zoneTableau.hidden;
              zoneTableau.hidden = !versTableau;
              zoneTrace.hidden = versTableau;
              bascule.setAttribute('aria-pressed', String(versTableau));
              bascule.textContent = versTableau ? 'Graphique' : 'Tableau';
              if (!versTableau) V.traces.filter((t) => zoneTrace.contains(t.el)).forEach((t) => t.tracer());
            }
          },
          'Tableau'
        )
      : null;
    return h(
      'section',
      { class: 'carte graphique' },
      h('header', null, h('div', null, h('h3', null, titre), sousTitre ? h('p', null, sousTitre) : null), bascule),
      zoneTrace,
      zoneTableau
    );
  };

  V.legende = function (series) {
    return h(
      'div',
      { class: 'legende' },
      series.map((x) => h('span', null, h('i', { style: { background: x.couleur } }), x.nom))
    );
  };

  V.tuile = function ({ etiquette, valeur, detail, surClic, titre }) {
    const contenu = [
      h('span', { class: 'etiquette' }, etiquette),
      h('span', { class: 'valeur' }, valeur),
      detail ? h('span', { class: 'detail' }, detail) : null
    ];
    if (surClic) return h('button', { class: 'tuile', type: 'button', onclick: surClic, title: titre || null }, contenu);
    return h('div', { class: 'tuile' }, contenu);
  };

  /* ---------- Colonnes empilées par période ---------- */

  function pasLisible(max, nbGraduations) {
    const brut = max / nbGraduations;
    const puissance = Math.pow(10, Math.floor(Math.log10(Math.max(brut, 1))));
    for (const k of [1, 2, 5, 10]) if (k * puissance >= brut) return Math.max(1, k * puissance);
    return Math.max(1, 10 * puissance);
  }

  function rectangleHautArrondi(x, y, l, haut, r) {
    r = Math.max(0, Math.min(r, l / 2, haut));
    return `M${x},${y + haut}V${y + r}Q${x},${y} ${x + r},${y}H${x + l - r}Q${x + l},${y} ${x + l},${y + r}V${y + haut}Z`;
  }

  V.nomPeriode = function (cle) {
    const [a, m] = cle.split('-').map(Number);
    return `${V.MOIS[m - 1]} ${a}`;
  };

  /**
   * periodes : ['2026-01', ...]; series : [{ nom, couleur, valeurs }] de bas en haut.
   * La première série repose sur la ligne de base, ce qui permet de la comparer d'un mois à l'autre.
   */
  V.colonnesParPeriode = function ({ periodes, series, surClic, unite = 'événement', hauteur = 224 }) {
    const el = h('div', { class: 'trace-conteneur' });
    const totaux = periodes.map((_, i) => series.reduce((somme, x) => somme + (x.valeurs[i] || 0), 0));
    const max = Math.max(1, ...totaux);
    const indiceMax = totaux.indexOf(Math.max(...totaux));
    let dernierNonNul = -1;
    totaux.forEach((t, i) => {
      if (t > 0) dernierNonNul = i;
    });
    const plusieursAnnees = new Set(periodes.map((p) => p.slice(0, 4))).size > 1;

    function tracer() {
      const largeur = Math.max(240, Math.floor(el.clientWidth || 600));
      V.vider(el);
      const marge = { g: 30, d: 8, h: 20, b: plusieursAnnees ? 36 : 24 };
      const il = largeur - marge.g - marge.d;
      const ih = hauteur - marge.h - marge.b;
      const pas = pasLisible(max, 4);
      const sommet = Math.ceil(max / pas) * pas;
      const y = (v) => marge.h + ih - (v / sommet) * ih;
      const bande = il / periodes.length;
      const lb = Math.max(3, Math.min(24, bande * 0.62));
      const saut = Math.max(1, Math.ceil(36 / bande)); // « juill. » est plus large que trois lettres

      const svg = s('svg', {
        class: 'trace',
        width: largeur,
        height: hauteur,
        viewBox: `0 0 ${largeur} ${hauteur}`,
        role: 'img',
        'aria-label': `Nombre d'${unite}s par mois, maximum ${max}`
      });

      for (let t = 0; t <= sommet; t += pas) {
        svg.appendChild(s('line', { class: t === 0 ? 'axe-ligne' : 'grille-ligne', x1: marge.g, x2: largeur - marge.d, y1: y(t), y2: y(t) }));
        svg.appendChild(s('text', { x: marge.g - 6, y: y(t) + 3.5, 'text-anchor': 'end' }, String(t)));
      }

      periodes.forEach((p, i) => {
        const cx = marge.g + bande * i + bande / 2;
        const actifs = series.map((sr) => ({ sr, v: sr.valeurs[i] || 0 })).filter((o) => o.v > 0);
        let cumul = 0;
        actifs.forEach((o, k) => {
          const bas = y(cumul) - (k > 0 ? 2 : 0); // interstice de 2 px entre segments
          cumul += o.v;
          const haut = y(cumul);
          const hauteurSegment = Math.max(1, bas - haut);
          const dernier = k === actifs.length - 1;
          svg.appendChild(
            s('path', {
              d: rectangleHautArrondi(cx - lb / 2, bas - hauteurSegment, lb, hauteurSegment, dernier ? 4 : 0),
              fill: o.sr.couleur
            })
          );
        });

        // Étiquettes directes parcimonieuses : le maximum et le dernier mois renseigné.
        if (totaux[i] > 0 && (i === indiceMax || i === dernierNonNul)) {
          svg.appendChild(s('text', { class: 'valeur', x: cx, y: y(totaux[i]) - 5, 'text-anchor': 'middle' }, String(totaux[i])));
        }

        const [annee, mois] = p.split('-').map(Number);
        if (i % saut === 0) {
          svg.appendChild(s('text', { x: cx, y: hauteur - marge.b + 15, 'text-anchor': 'middle' }, MOIS_ABREGES[mois - 1]));
        }
        if (plusieursAnnees && (mois === 1 || (i === 0 && mois <= 10))) {
          svg.appendChild(s('text', { x: cx, y: hauteur - marge.b + 29, 'text-anchor': 'middle' }, String(annee)));
        }

        const detail = series.map((sr) => `${sr.nom} : ${sr.valeurs[i] || 0}`).join(', ');
        const zone = s('rect', {
          class: 'colonne-zone',
          x: marge.g + bande * i,
          y: marge.h - 6,
          width: bande,
          height: ih + 6,
          tabindex: 0,
          role: 'button',
          'aria-label': `${V.nomPeriode(p)} : ${totaux[i]} ${unite}${totaux[i] > 1 ? 's' : ''}. ${detail}. Activer pour filtrer sur ce mois.`
        });
        V.lierInfobulle(zone, () =>
          V.contenuInfobulle({
            titre: V.nomPeriode(p),
            lignes: [
              ...series
                .slice()
                .reverse()
                .map((sr) => ({ couleur: sr.couleur, valeur: String(sr.valeurs[i] || 0), nom: sr.nom })),
              { valeur: String(totaux[i]), nom: 'au total' }
            ]
          })
        );
        if (surClic) {
          zone.addEventListener('click', () => surClic(p));
          zone.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              surClic(p);
            }
          });
        }
        svg.appendChild(zone);
      });
      el.appendChild(svg);
    }

    V.traces.push({ el, tracer });
    requestAnimationFrame(() => {
      if (el.isConnected) tracer();
    });
    return el;
  };

  /* ---------- Barres horizontales classées ---------- */

  V.barres = function ({ donnees, surClic, limite = 10, nomAutres = 'Autres', unite = 'événement' }) {
    const total = donnees.reduce((somme, d) => somme + d.valeur, 0);
    let lignes = donnees;
    if (donnees.length > limite) {
      const tete = donnees.slice(0, limite - 1);
      const reste = donnees.slice(limite - 1);
      lignes = [...tete, { cle: null, nom: `${nomAutres} (${reste.length})`, valeur: reste.reduce((somme, d) => somme + d.valeur, 0) }];
    }
    const max = Math.max(1, ...lignes.map((d) => d.valeur));
    const el = h('div', { class: 'barres' });
    for (const d of lignes) {
      const part = total ? Math.round((d.valeur / total) * 100) : 0;
      const cliquable = Boolean(surClic && d.cle != null);
      const piste = h(
        cliquable ? 'button' : 'div',
        {
          class: 'piste-barre',
          type: cliquable ? 'button' : null,
          tabindex: cliquable ? null : 0,
          'aria-label': `${d.nom} : ${d.valeur} ${unite}${d.valeur > 1 ? 's' : ''}${cliquable ? '. Activer pour filtrer.' : ''}`,
          onclick: cliquable ? () => surClic(d.cle) : null
        },
        h('span', { class: 'barre', style: { width: `calc((100% - 44px) * ${(d.valeur / max).toFixed(4)})` } }),
        h('span', { class: 'chiffre' }, String(d.valeur))
      );
      V.lierInfobulle(piste, () =>
        V.contenuInfobulle({ titre: d.nom, lignes: [{ valeur: String(d.valeur), nom: `${unite}${d.valeur > 1 ? 's' : ''} · ${part} %` }] })
      );
      el.appendChild(h('span', { class: 'nom', title: d.nom }, d.nom));
      el.appendChild(piste);
    }
    return el;
  };

  /* ---------- Carte thermique ---------- */

  const NIVEAUX = 5;
  function classeThermique(valeur, max) {
    if (!valeur) return 0;
    return Math.max(1, Math.min(NIVEAUX, Math.ceil((valeur / max) * NIVEAUX)));
  }

  V.thermique = function ({ rangees, colonnes, surClic, unite = 'événement' }) {
    const max = Math.max(1, ...rangees.flatMap((r) => r.valeurs));
    const grille = h('div', {
      class: 'thermique',
      style: { gridTemplateColumns: `minmax(84px, 26%) repeat(${colonnes.length}, minmax(0, 1fr))` }
    });
    grille.appendChild(h('span'));
    colonnes.forEach((c) => grille.appendChild(h('span', { class: 'tete', title: c.nom }, c.court)));
    for (const r of rangees) {
      grille.appendChild(h('span', { class: 'rangee', title: r.nom }, r.nom));
      r.valeurs.forEach((v, i) => {
        const c = colonnes[i];
        const etiquette = `${r.nom}, ${c.nom} : ${v} ${unite}${v > 1 ? 's' : ''}`;
        // Une case vide (ou sans action) n'est pas un bouton : un lecteur d'écran l'annoncerait pour rien.
        const caseEl =
          surClic && v
            ? h('button', {
                class: 'case-t',
                type: 'button',
                style: { background: `var(--seq-${classeThermique(v, max)})` },
                'aria-label': etiquette,
                onclick: () => surClic(r.cle, c.cle)
              })
            : h('span', {
                class: 'case-t',
                role: 'img',
                style: { background: `var(--seq-${classeThermique(v, max)})`, cursor: 'default' },
                'aria-label': etiquette
              });
        V.lierInfobulle(caseEl, () =>
          V.contenuInfobulle({ titre: `${r.nom} · ${c.nom}`, lignes: [{ valeur: String(v), nom: `${unite}${v > 1 ? 's' : ''}` }] })
        );
        grille.appendChild(caseEl);
      });
    }
    const echelle = h(
      'div',
      { class: 'legende echelle', 'aria-hidden': 'true' },
      h('span', null, '0'),
      h('span', null, [0, 1, 2, 3, 4, 5].map((n) => h('i', { style: { background: `var(--seq-${n})` } }))),
      h('span', null, `${max} par mois`)
    );
    return { corps: grille, legende: echelle };
  };

  /* ---------- Mini-colonnes (aperçu d'activité, sans axe) ---------- */

  V.miniColonnes = function (valeurs, etiquettes) {
    const max = Math.max(1, ...valeurs);
    const el = h('div', { class: 'mini-colonnes', role: 'img', 'aria-label': `Activité par mois : ${valeurs.join(', ')}` });
    valeurs.forEach((v, i) => {
      const colonne = h('i', { class: v ? '' : 'zero', style: { height: v ? `${Math.max(8, (v / max) * 100)}%` : '2px' } });
      if (etiquettes) {
        V.lierInfobulle(colonne, () => V.contenuInfobulle({ titre: etiquettes[i], lignes: [{ valeur: String(v), nom: v > 1 ? 'événements' : 'événement' }] }));
      }
      el.appendChild(colonne);
    });
    return el;
  };

  /* ---------- Niveau de suspicion (1 à 5) ---------- */

  V.jaugeSuspicion = function (niveau, nom) {
    const n = Math.max(1, Math.min(5, Number(niveau) || 1));
    return h(
      'span',
      { class: 'suspicion', title: `Suspicion ${n} sur 5${nom ? ' — ' + nom : ''}` },
      h(
        'span',
        { class: 'jauge', 'aria-hidden': 'true' },
        [1, 2, 3, 4, 5].map((k) => h('i', { style: k <= n ? { background: `var(--ord-${n})` } : null }))
      ),
      h('b', null, `${n}/5`)
    );
  };
})();
