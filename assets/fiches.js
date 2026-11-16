/* Veille Monde — fiche détaillée (tiroir), formulaires et importation. */
(function () {
  'use strict';
  const V = window.Veille;
  const { h } = V;
  const etat = V.etat;

  const ETATS_PERSO = [
    { id: '', nom: '—' },
    { id: 'a-creuser', nom: 'À creuser' },
    { id: 'en-veille', nom: 'En veille' },
    { id: 'classe', nom: 'Classé' }
  ];

  /* ---------- Tiroir ---------- */

  let affiche = null;
  let retourFocus = null;
  // Notes de la fiche affichée : envoi immédiat à la fermeture du tiroir ou de la page.
  let notesEnCours = null;
  // Adresse de l'entrée d'historique ajoutée à l'ouverture de la fiche (null si aucune).
  let entreeEmpilee = null;

  function paragraphes(texte) {
    return String(texte || '')
      .split(/\n{2,}|\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => h('p', null, p));
  }

  function construireFiche(e) {
    const perso = V.perso(e.id);
    const niveau = V.niveau(e.suspicion);
    const indicateur = h('span', { style: { fontSize: '12px', color: 'var(--encre-3)' }, 'aria-live': 'polite' });

    const notes = h('textarea', { rows: 4, placeholder: 'Vos observations, recoupements, questions…' });
    notes.value = perso.notes || '';
    // Dernier texte envoyé (null après un échec : le prochain envoi est retenté).
    let notesEnregistrees = notes.value;
    function sauverNotes() {
      if (notes.value === notesEnregistrees) return;
      const texte = notes.value;
      notesEnregistrees = texte;
      V.annoter(e.id, { notes: texte })
        .then(() => {
          if (notes.value === texte) indicateur.textContent = 'Notes enregistrées';
        })
        .catch((err) => {
          notesEnregistrees = null;
          indicateur.textContent = `Non enregistré : ${err.message}`;
        });
    }
    const enregistrerNotes = V.delai(sauverNotes, 600);
    notes.addEventListener('input', () => {
      indicateur.textContent = 'Enregistrement…';
      enregistrerNotes();
    });
    // En quittant le champ, on enregistre tout de suite : rien ne se perd si la fiche est fermée aussitôt.
    notes.addEventListener('blur', sauverNotes);
    notesEnCours = {
      envoyer: sauverNotes,
      // Page fermée ou rechargée : le minuteur ne survivrait pas, on envoie sur-le-champ.
      urgence() {
        if (notes.value === notesEnregistrees) return;
        notesEnregistrees = notes.value;
        if (!etat.serveur) {
          V.annoter(e.id, { notes: notes.value }).catch(() => {});
          return;
        }
        try {
          fetch('/api/perso/' + encodeURIComponent(e.id), {
            method: 'PUT',
            keepalive: true,
            headers: { 'Content-Type': 'application/json', 'X-Veille': '1' },
            body: JSON.stringify({ notes: notes.value })
          }).catch(() => {});
        } catch {
          /* envoi impossible pendant la fermeture de la page */
        }
      }
    };

    const etatPerso = h(
      'select',
      {
        value: perso.etat || '',
        async onchange(ev) {
          try {
            await V.annoter(e.id, { etat: ev.target.value });
            indicateur.textContent = 'Enregistré';
          } catch (err) {
            V.avis(err.message, true);
          }
        }
      },
      ETATS_PERSO.map((x) => h('option', { value: x.id }, x.nom))
    );

    const suivre = h('input', {
      type: 'checkbox',
      checked: Boolean(perso.suivi),
      async onchange(ev) {
        try {
          await V.annoter(e.id, { suivi: ev.target.checked });
          // Seules ces vues montrent les étoiles ou le compte des suivis : les autres gardent leur état.
          if (etat.filtres.suivis || ['tableau', 'chronologie', 'registre'].includes(etat.vue)) V.rendre();
        } catch (err) {
          V.avis(err.message, true);
        }
      }
    });

    const dossier = e.dossier
      ? h(
          'a',
          {
            href: '#',
            onclick(ev) {
              ev.preventDefault();
              etat.ouvert = null;
              V.definirFiltres({ ...V.filtresParDefaut(), veille: etat.filtres.veille, periode: 'tout', dossier: e.dossier }, 'chronologie');
            }
          },
          V.titreDossier(e.dossier)
        )
      : null;

    return h(
      'div',
      { class: 'detail' },
      V.puces(e, { acteurs: false }),
      h('h2', { id: 'tiroir-titre' }, e.titre),
      h(
        'div',
        { class: 'quand' },
        V.formaterDate(e.date, e.date_precision),
        e.date_fin ? ` → ${V.formaterDate(e.date_fin)}` : '',
        V.lieu(e) ? ` · ${V.lieu(e)}` : ''
      ),
      h('div', { style: { marginTop: '10px' } }, V.jaugeSuspicion(e.suspicion, niveau.nom), h('span', { style: { color: 'var(--encre-2)', fontSize: '13px', marginLeft: '8px' } }, `${niveau.nom} — ${niveau.description}`)),

      h('section', null, h('h3', null, 'Les faits rapportés'), paragraphes(e.resume), paragraphes(e.details)),

      e.anomalies.length
        ? h(
            'section',
            null,
            h('h3', null, 'Ce qui cloche'),
            h(
              'div',
              { class: 'analyse' },
              h('ul', null, e.anomalies.map((a) => h('li', null, a))),
              h('p', { class: 'note-analyse' }, 'Analyse : observations sur le dossier public, à distinguer des faits rapportés ci-dessus.')
            )
          )
        : null,

      e.hypotheses.length ? h('section', null, h('h3', null, 'Autres explications possibles'), h('ul', null, e.hypotheses.map((x) => h('li', null, x)))) : null,

      h(
        'section',
        null,
        h('h3', null, 'Fiche'),
        h(
          'dl',
          null,
          h('dt', null, 'Pays suivi'),
          h('dd', null, V.nomPays(e.veille)),
          e.province ? [h('dt', null, 'Région / province'), h('dd', null, V.nomRegion(e.veille, e.province))] : null,
          h('dt', null, 'Acteurs présumés'),
          h('dd', null, e.acteurs.join(', ')),
          e.cibles.length ? [h('dt', null, 'Cibles'), h('dd', null, e.cibles.join(' · '))] : null,
          h('dt', null, 'Statut'),
          h('dd', null, `${V.nom('statuts', e.statut)} — ${V.description('statuts', e.statut)}`),
          h('dt', null, 'Fiabilité des sources'),
          h('dd', null, `${V.nom('fiabilites', e.fiabilite)} — ${V.description('fiabilites', e.fiabilite)}`),
          h('dt', null, 'État du dossier public'),
          h('dd', null, V.nom('suivis', e.suivi)),
          dossier ? [h('dt', null, 'Dossier'), h('dd', null, dossier)] : null,
          e.tags.length ? [h('dt', null, 'Mots-clés'), h('dd', null, e.tags.join(', '))] : null,
          h('dt', null, 'Fiche mise à jour'),
          h('dd', null, e.maj ? V.dateCourte(V.jourLocal(e.maj)) : '—')
        )
      ),

      h(
        'section',
        null,
        h('h3', null, `Sources (${e.sources.length})`),
        e.sources.length
          ? h(
              'ul',
              { class: 'sources' },
              e.sources.map((s) => {
                const url = V.urlSure(s.url);
                return h(
                  'li',
                  null,
                  url ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, s.titre || url) : s.titre,
                  h('small', null, ` — ${[s.media || V.domaine(s.url), s.date ? V.dateCourte(s.date) : null].filter(Boolean).join(', ')}`)
                );
              })
            )
          : h('p', { style: { color: 'var(--encre-2)' } }, 'Aucune source enregistrée : à traiter comme une piste.')
      ),

      h(
        'section',
        null,
        h('h3', null, 'Mon suivi'),
        h(
          'div',
          { class: 'perso' },
          h(
            'div',
            { class: 'ligne' },
            h('label', { class: 'case' }, suivre, 'Suivre cet événement'),
            h('label', { class: 'champ', style: { flex: '0 1 180px' } }, h('span', null, 'Où j’en suis'), etatPerso),
            indicateur
          ),
          h('label', { class: 'champ' }, h('span', null, 'Mes notes'), notes),
          etat.serveur ? null : h('p', { style: { fontSize: '12px', color: 'var(--encre-3)', margin: 0 } }, etat.public ? 'Version publique : vos notes restent dans ce navigateur et ne sont visibles que par vous.' : 'Lecture seule : vos notes restent dans ce navigateur. Lancez Demarrer.bat pour les enregistrer dans le registre.')
        )
      ),

      h(
        'section',
        { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        h(
          'button',
          {
            class: 'bouton',
            type: 'button',
            async onclick() {
              try {
                await navigator.clipboard.writeText(location.href);
                V.avis('Lien copié.');
              } catch {
                V.avis('Copie impossible : copiez l’adresse dans la barre du navigateur.', true);
              }
            }
          },
          'Copier le lien'
        ),
        etat.serveur ? h('button', { class: 'bouton', type: 'button', onclick: () => V.ouvrirFormulaire(e) }, 'Modifier') : null,
        etat.serveur
          ? h(
              'button',
              {
                class: 'bouton danger',
                type: 'button',
                async onclick() {
                  if (!window.confirm(`Mettre « ${e.titre} » à la corbeille ?`)) return;
                  try {
                    await V.api('DELETE', 'evenements/' + encodeURIComponent(e.id));
                    etat.ouvert = null;
                    V.ecrireHash(false);
                    V.avis('Fiche mise à la corbeille (data/corbeille.json).');
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

  /* Tiroir ou fenêtre modale ouverts : le reste de la page devient inerte (focus contenu, « / » sans effet dessous). */
  function majInert() {
    const tiroir = document.getElementById('tiroir');
    const modaleOuverte = Boolean(fermetureModale);
    const tiroirOuvert = tiroir.classList.contains('ouvert');
    const pageInerte = modaleOuverte || tiroirOuvert;
    for (const el of document.querySelectorAll('.evitement, #entete, #onglets, #filtres, #contenu, .pied-page')) el.inert = pageInerte;
    tiroir.inert = !tiroirOuvert || modaleOuverte;
  }

  function envoyerNotes() {
    if (notesEnCours) notesEnCours.envoyer();
    notesEnCours = null;
  }

  V.synchroniserTiroir = function () {
    const tiroir = document.getElementById('tiroir');
    const voile = document.getElementById('voile');
    const e = etat.ouvert ? etat.parId.get(etat.ouvert) : null;
    if (!e) {
      const etaitOuvert = tiroir.classList.contains('ouvert');
      envoyerNotes();
      tiroir.classList.remove('ouvert');
      voile.classList.remove('ouvert');
      tiroir.setAttribute('aria-hidden', 'true');
      affiche = null;
      majInert();
      if (etaitOuvert && retourFocus && retourFocus.isConnected) retourFocus.focus();
      return;
    }
    if (affiche !== e.id) {
      envoyerNotes();
      V.vider(document.getElementById('tiroir-corps')).appendChild(construireFiche(e));
      document.getElementById('tiroir-corps').scrollTop = 0;
      affiche = e.id;
    }
    const dejaOuvert = tiroir.classList.contains('ouvert');
    tiroir.classList.add('ouvert');
    voile.classList.add('ouvert');
    tiroir.setAttribute('aria-hidden', 'false');
    majInert();
    if (!dejaOuvert) document.getElementById('tiroir-fermer').focus();
  };

  V.ouvrirEvenement = function (id) {
    if (!etat.parId.has(id)) return;
    const dejaOuvert = Boolean(etat.ouvert);
    if (!dejaOuvert) retourFocus = document.activeElement;
    etat.ouvert = id;
    if (dejaOuvert) {
      // Passage d'une fiche à l'autre : on remplace l'entrée, pour que la fermeture revienne à la vue.
      V.ecrireHash(false);
      if (entreeEmpilee) entreeEmpilee = location.hash;
    } else {
      entreeEmpilee = V.ecrireHash(true) ? location.hash : null;
    }
    V.synchroniserTiroir();
  };

  V.fermerTiroir = function () {
    if (!etat.ouvert) return;
    const revenir = entreeEmpilee !== null && entreeEmpilee === location.hash;
    entreeEmpilee = null;
    etat.ouvert = null;
    V.synchroniserTiroir();
    // L'ouverture a ajouté une entrée d'historique : on la retire, sinon « Précédent » ne ferait rien une fois.
    if (revenir) history.back();
    else V.ecrireHash(false);
  };

  /* ---------- Fenêtre modale ---------- */

  let fermetureModale = null;
  // Vrai dès qu'un champ de la fenêtre a été modifié et non enregistré.
  let modaleModifiee = false;

  function ouvrirModale(titre, intro, contenu) {
    const modale = document.getElementById('modale');
    const precedent = document.activeElement;
    V.vider(modale).appendChild(
      h('div', { class: 'boite', role: 'dialog', 'aria-modal': 'true', 'aria-label': titre }, h('h2', null, titre), intro ? h('p', { class: 'intro' }, intro) : null, contenu)
    );
    modale.classList.add('ouvert');
    modaleModifiee = false;
    fermetureModale = () => {
      modale.classList.remove('ouvert');
      V.vider(modale);
      fermetureModale = null;
      modaleModifiee = false;
      majInert();
      if (precedent && precedent.isConnected) precedent.focus();
    };
    majInert();
    const premier = modale.querySelector('input, select, textarea, button');
    if (premier) premier.focus();
  }

  function fermerModale() {
    if (fermetureModale) fermetureModale();
  }

  /* Échap ou clic sur le fond : on demande avant de perdre une saisie. */
  function fermerModaleSiAccord() {
    if (!fermetureModale) return;
    if (modaleModifiee && !window.confirm('Abandonner la saisie ?')) return;
    fermerModale();
  }

  /* Empêche un double envoi (double clic, Entrée répétée) : un seul envoi à la fois par formulaire. */
  function envoiUnique(action, libelleEnCours) {
    return async function (ev) {
      ev.preventDefault();
      const formulaire = ev.currentTarget;
      if (formulaire.dataset.envoi) return;
      const bouton = formulaire.querySelector('button[type="submit"]');
      const libelle = bouton ? bouton.textContent : '';
      formulaire.dataset.envoi = '1';
      if (bouton) {
        bouton.disabled = true;
        bouton.textContent = libelleEnCours || 'Enregistrement…';
      }
      try {
        await action(ev);
      } finally {
        delete formulaire.dataset.envoi;
        if (bouton) {
          bouton.disabled = false;
          bouton.textContent = libelle;
        }
      }
    };
  }

  /* ---------- Formulaire d'événement ---------- */

  function champ(etiquette, controle, classe, aide) {
    return h('label', { class: 'champ ' + (classe || 'c2') }, h('span', null, etiquette), controle, aide ? h('span', { class: 'aide' }, aide) : null);
  }

  function selection(liste, valeur, cleNom) {
    return h('select', { value: valeur }, liste.map((x) => h('option', { value: x.id != null ? x.id : x.niveau }, cleNom ? cleNom(x) : x.nom)));
  }

  function lignes(texte) {
    return String(texte || '')
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
  }

  /* apresCreation(evenement) : facultatif, attendu après un ajout réussi et avant le rechargement. */
  V.ouvrirFormulaire = function (existant, prerempli, apresCreation) {
    const meta = etat.d.meta;
    // Nouvelle fiche : pays suivi du filtre en cours (ou celui fourni par une piste), sinon le pays par défaut.
    const veilleInitiale = (prerempli && V.paysSuivi(prerempli.veille) && prerempli.veille) || etat.filtres.veille || V.veilleDefaut();
    const e = existant || {
      date: V.aujourdhui(),
      date_precision: 'jour',
      territoire: 'interieur',
      pays: V.nomPays(veilleInitiale),
      categorie: 'inexplique',
      statut: 'rapporte',
      fiabilite: 'moyenne',
      suspicion: 2,
      suivi: 'a-surveiller',
      acteurs: [],
      cibles: [],
      anomalies: [],
      hypotheses: [],
      tags: [],
      sources: [],
      ...(prerempli || {}),
      veille: veilleInitiale
    };
    const veilleFiche = e.veille && V.paysSuivi(e.veille) ? e.veille : V.veilleDefaut();

    const c = {
      date: h('input', { type: 'date', required: true, value: e.date }),
      date_precision: h('select', { value: e.date_precision || 'jour' }, h('option', { value: 'jour' }, 'Au jour près'), h('option', { value: 'mois' }, 'Au mois près'), h('option', { value: 'annee' }, 'À l’année près')),
      titre: h('input', { type: 'text', required: true, maxlength: 220, value: e.titre || '' }),
      categorie: selection(meta.categories, e.categorie),
      territoire: selection(meta.territoires, e.territoire),
      statut: selection(meta.statuts, e.statut),
      fiabilite: selection(meta.fiabilites, e.fiabilite),
      suspicion: selection(meta.echelleSuspicion, e.suspicion, (x) => `${x.niveau} — ${x.nom}`),
      suivi: selection(meta.suivis, e.suivi),
      veille: h('select', { value: veilleFiche }, V.paysSuivis().map((p) => h('option', { value: p.id }, p.nom))),
      lieu: h('input', { type: 'text', value: e.lieu || '', placeholder: 'Ville, région' }),
      province: h('select'),
      pays: h('input', { type: 'text', value: e.pays || V.nomPays(veilleFiche) }),
      lat: h('input', { type: 'number', step: 'any', min: -90, max: 90, value: e.lat == null ? '' : e.lat }),
      lon: h('input', { type: 'number', step: 'any', min: -180, max: 180, value: e.lon == null ? '' : e.lon }),
      acteurs: h('input', { type: 'text', value: (e.acteurs || []).join(', '), placeholder: 'Chine, Inconnu…', list: 'liste-acteurs' }),
      // Une cible peut contenir des virgules : une par ligne.
      cibles: h('textarea', { rows: 2 }),
      dossier: h('input', { type: 'text', value: e.dossier || '', list: 'liste-dossiers', placeholder: 'identifiant-du-dossier' }),
      tags: h('input', { type: 'text', value: (e.tags || []).join(', ') }),
      resume: h('textarea', { rows: 3 }),
      details: h('textarea', { rows: 5 }),
      anomalies: h('textarea', { rows: 3 }),
      hypotheses: h('textarea', { rows: 3 })
    };
    c.resume.value = e.resume || '';
    c.details.value = e.details || '';
    c.anomalies.value = (e.anomalies || []).join('\n');
    c.hypotheses.value = (e.hypotheses || []).join('\n');
    c.cibles.value = (e.cibles || []).join('\n');
    // Régions ou provinces du pays suivi choisi; elles changent avec lui.
    function remplirRegions(veille, valeur) {
      const p = V.paysSuivi(veille);
      V.vider(c.province).appendChild(h('option', { value: '' }, '—'));
      for (const r of (p && p.regions) || []) c.province.appendChild(h('option', { value: r.code }, `${r.nom} (${r.code})`));
      c.province.value = valeur || '';
      if (c.province.value !== (valeur || '')) c.province.value = '';
    }
    remplirRegions(veilleFiche, e.province);
    let veillePrecedente = veilleFiche;
    c.veille.addEventListener('change', () => {
      remplirRegions(c.veille.value, c.province.value);
      // Le pays proposé suit le pays suivi, sauf s'il a été changé à la main (fiche à l'étranger).
      if (!c.pays.value.trim() || c.pays.value.trim() === V.nomPays(veillePrecedente)) c.pays.value = V.nomPays(c.veille.value);
      veillePrecedente = c.veille.value;
    });
    // Valeurs initiales des listes à virgules : inchangées, elles ne sont pas renvoyées (le serveur garde l'original).
    const acteursInitiaux = c.acteurs.value;
    const tagsInitiaux = c.tags.value;

    const zoneSources = h('div');
    function ligneSource(s) {
      const ligne = h(
        'div',
        { class: 'source-ligne' },
        h('input', { type: 'text', placeholder: 'Titre de l’article ou du document', value: (s && s.titre) || '', 'aria-label': 'Titre de la source' }),
        h('input', { type: 'text', placeholder: 'Média ou organisme', value: (s && s.media) || '', 'aria-label': 'Média' }),
        h('input', { type: 'url', placeholder: 'https://…', value: (s && s.url) || '', 'aria-label': 'Adresse de la source' }),
        h('button', { class: 'bouton discret', type: 'button', 'aria-label': 'Retirer cette source', onclick: () => ligne.remove() }, '×')
      );
      ligne.dataset.date = (s && s.date) || '';
      return ligne;
    }
    ((e.sources && e.sources.length ? e.sources : [null])).forEach((s) => zoneSources.appendChild(ligneSource(s)));

    const erreurs = h('div', { class: 'erreurs', role: 'alert' });
    const virgules = (v) => v.split(',').map((x) => x.trim()).filter(Boolean);

    const formulaire = h(
      'form',
      {
        class: 'formulaire',
        onsubmit: envoiUnique(async () => {
          const corps = {
            date: c.date.value,
            date_precision: c.date_precision.value,
            titre: c.titre.value,
            categorie: c.categorie.value,
            veille: c.veille.value,
            territoire: c.territoire.value,
            statut: c.statut.value,
            fiabilite: c.fiabilite.value,
            suspicion: Number(c.suspicion.value),
            suivi: c.suivi.value,
            lieu: c.lieu.value,
            province: c.province.value || null,
            pays: c.pays.value,
            lat: c.lat.value === '' ? null : Number(c.lat.value),
            lon: c.lon.value === '' ? null : Number(c.lon.value),
            acteurs: virgules(c.acteurs.value),
            cibles: lignes(c.cibles.value),
            dossier: c.dossier.value || null,
            tags: virgules(c.tags.value),
            resume: c.resume.value,
            details: c.details.value,
            anomalies: lignes(c.anomalies.value),
            hypotheses: lignes(c.hypotheses.value),
            sources: [...zoneSources.children]
              .map((l) => {
                const [titre, media, url] = [...l.querySelectorAll('input')].map((i) => i.value.trim());
                return { titre, media, url, date: l.dataset.date || null };
              })
              .filter((s) => s.url)
          };
          if (existant && c.acteurs.value === acteursInitiaux) delete corps.acteurs;
          if (existant && c.tags.value === tagsInitiaux) delete corps.tags;
          let r;
          try {
            r = existant
              ? await V.api('PUT', 'evenements/' + encodeURIComponent(existant.id), corps)
              : await V.api('POST', 'evenements', corps);
          } catch (err) {
            erreurs.textContent = `Enregistrement impossible : ${err.message}`;
            return;
          }
          fermerModale();
          V.avis(existant ? 'Fiche modifiée.' : 'Fiche ajoutée.');
          affiche = null;
          if (!existant && apresCreation) {
            try {
              await apresCreation(r.evenement);
            } catch (err) {
              V.avis(`Fiche ajoutée, mais l’étape suivante a échoué : ${err.message}`, true);
            }
          }
          try {
            await V.recharger();
          } catch (err) {
            V.avis(`Rechargement impossible : ${err.message}`, true);
            return;
          }
          if (!existant && r.evenement) V.ouvrirEvenement(r.evenement.id);
        })
      },
      champ('Titre', c.titre, 'c4', 'Factuel, sans conclusion : ce qui s’est passé, où, selon qui.'),
      champ('Pays suivi', c.veille, 'c2', 'Le pays dont la veille retient cette fiche.'),
      champ('Date', c.date, 'c2'),
      champ('Précision de la date', c.date_precision, 'c2'),
      champ('Catégorie', c.categorie, 'c2'),
      champ('Territoire', c.territoire, 'c2', 'Sur le territoire du pays suivi, ou à l’étranger.'),
      champ('Lieu', c.lieu, 'c2'),
      champ('Pays', c.pays, 'c2', 'Pays où l’événement a eu lieu.'),
      champ('Région / province', c.province, 'c2'),
      champ('Latitude', c.lat, 'c2'),
      champ('Longitude', c.lon, 'c2', 'Facultatif : place la fiche sur la carte.'),
      champ('Acteurs présumés', c.acteurs, 'c3', 'Séparés par des virgules. « Inconnu » si aucune attribution.'),
      champ('Cibles', c.cibles, 'c3', 'Une par ligne.'),
      champ('Statut de vérification', c.statut, 'c2'),
      champ('Fiabilité des sources', c.fiabilite, 'c2'),
      champ('Niveau de suspicion', c.suspicion, 'c2'),
      champ('Résumé des faits', c.resume, 'c6', 'Deux à quatre phrases, avec l’attribution (« selon… »).'),
      champ('Détails', c.details, 'c6'),
      champ('Ce qui cloche', c.anomalies, 'c3', 'Une observation par ligne. C’est de l’analyse.'),
      champ('Autres explications possibles', c.hypotheses, 'c3', 'Une par ligne, y compris les plus banales.'),
      champ('Dossier', c.dossier, 'c2'),
      champ('Mots-clés', c.tags, 'c2'),
      champ('État du dossier public', c.suivi, 'c2'),
      h(
        'div',
        { class: 'champ c6' },
        h('span', null, 'Sources'),
        zoneSources,
        h('div', null, h('button', { class: 'bouton discret', type: 'button', onclick: () => zoneSources.appendChild(ligneSource(null)) }, '+ Ajouter une source'))
      ),
      erreurs,
      h(
        'div',
        { class: 'pied-formulaire' },
        h('button', { class: 'bouton', type: 'button', onclick: fermerModale }, 'Annuler'),
        h('button', { class: 'bouton principal', type: 'submit' }, existant ? 'Enregistrer' : 'Ajouter la fiche')
      ),
      h('datalist', { id: 'liste-dossiers' }, [...new Set([...etat.d.dossiers.map((d) => d.id), ...etat.d.evenements.map((x) => x.dossier).filter(Boolean)])].sort().map((id) => h('option', { value: id }, V.titreDossier(id)))),
      h('datalist', { id: 'liste-acteurs' }, V.compter(etat.d.evenements, 'acteurs').map(([nom]) => h('option', { value: nom })))
    );

    ouvrirModale(existant ? 'Modifier la fiche' : 'Nouvel événement', 'Consignez les faits d’abord, l’analyse ensuite. Sans source, la fiche reste une piste.', formulaire);
  };

  /* ---------- Formulaire de dossier ---------- */

  V.ouvrirDossier = function (existant) {
    const d = existant || {};
    const titre = h('input', { type: 'text', required: true, value: d.titre || '' });
    const id = h('input', { type: 'text', value: d.id || '', disabled: Boolean(existant), placeholder: 'laissé vide : créé à partir du titre' });
    const resume = h('textarea', { rows: 6 });
    resume.value = d.resume || '';
    const questions = h('textarea', { rows: 4 });
    questions.value = (d.questions || []).join('\n');
    // Nouveau dossier : pays du filtre en cours; « — » pour une affaire commune à plusieurs pays.
    const veille = h('select', { value: existant ? d.veille || '' : etat.filtres.veille || '' }, V.optionsPays('—'));
    const erreurs = h('div', { class: 'erreurs', role: 'alert' });
    ouvrirModale(
      existant ? 'Modifier le dossier' : 'Nouveau dossier',
      'Un dossier relie plusieurs événements. Rattachez-y une fiche en inscrivant son identifiant dans le champ « Dossier » de la fiche.',
      h(
        'form',
        {
          class: 'formulaire',
          onsubmit: envoiUnique(async () => {
            const corps = { titre: titre.value, resume: resume.value, questions: lignes(questions.value), veille: veille.value || null };
            try {
              if (existant) await V.api('PUT', 'dossiers/' + encodeURIComponent(existant.id), corps);
              else await V.api('POST', 'dossiers', { ...corps, id: id.value });
              fermerModale();
              V.avis('Dossier enregistré.');
              await V.recharger();
            } catch (err) {
              erreurs.textContent = `Enregistrement impossible : ${err.message}`;
            }
          })
        },
        champ('Titre', titre, 'c6'),
        champ('Identifiant', id, 'c3'),
        champ('Pays suivi', veille, 'c3', 'Facultatif : « — » pour une affaire commune à plusieurs pays.'),
        champ('Résumé', resume, 'c6', 'Markdown accepté.'),
        champ('Questions ouvertes', questions, 'c6', 'Une par ligne.'),
        erreurs,
        h('div', { class: 'pied-formulaire' }, h('button', { class: 'bouton', type: 'button', onclick: fermerModale }, 'Annuler'), h('button', { class: 'bouton principal', type: 'submit' }, 'Enregistrer'))
      )
    );
  };

  /* ---------- Importation ---------- */

  // Sections d'un fichier « Sauvegarde » transmises telles quelles au serveur.
  const SECTIONS_IMPORT = ['dossiers', 'perso', 'syntheses'];
  // Clés lues à l'importation, ou simples métadonnées d'une sauvegarde : elles ne sont pas signalées comme ignorées.
  const CLES_RECONNUES = new Set(['evenements', 'pistes', 'theme', ...SECTIONS_IMPORT, 'schema', 'genere', 'annees']);
  const NOMS_SECTIONS = { pistes: 'Pistes', dossiers: 'Dossiers', perso: 'Étoiles et notes', syntheses: 'Synthèses' };
  const LIBELLES_RAPPORT = {
    ajoutes: 'ajouté(s)',
    ajoutees: 'ajoutée(s)',
    mis_a_jour: 'mis à jour',
    mises_a_jour: 'mise(s) à jour',
    remplaces: 'remplacé(s)',
    remplacees: 'remplacée(s)',
    ignores: 'ignoré(s), déjà présent(s)',
    ignorees: 'ignorée(s), déjà présente(s)',
    erreurs: 'en erreur'
  };
  const taille = (v) => (Array.isArray(v) ? v.length : 0);

  function detailRapport(liste) {
    return h(
      'ul',
      null,
      liste.slice(0, 20).map((x) =>
        h('li', null, x && typeof x === 'object' ? `${x.id || '(sans identifiant)'} : ${[].concat(x.erreurs || x.avertissements || []).join(' ; ')}` : String(x))
      ),
      liste.length > 20 ? h('li', null, `… et ${liste.length - 20} de plus`) : null
    );
  }

  function resumeSection(nom, res) {
    if (!res || typeof res !== 'object') return h('p', null, `${nom} : section non reprise par le serveur.`);
    const parties = [];
    for (const [cle, v] of Object.entries(res)) {
      const n = Array.isArray(v) ? v.length : typeof v === 'number' ? v : null;
      if (n != null) parties.push(`${n} ${LIBELLES_RAPPORT[cle] || cle.replace(/_/g, ' ')}`);
    }
    const erreurs = Array.isArray(res.erreurs) ? res.erreurs : [];
    return [h('p', null, `${nom} : ${parties.join(', ') || 'rien à signaler'}.`), erreurs.length ? detailRapport(erreurs) : null];
  }

  function rapportImportation(r, corps, nonReprises) {
    const rp = r.rapport || {};
    const erreurs = Array.isArray(rp.erreurs) ? rp.erreurs : [];
    const corrigees = (Array.isArray(rp.avertissements) ? rp.avertissements : []).filter((x) => x && taille(x.avertissements));
    return h(
      'div',
      null,
      h(
        'p',
        null,
        h('strong', null, `Événements : ${taille(rp.ajoutes)} ajouté(s), ${taille(rp.mis_a_jour)} mis à jour, ${taille(rp.ignores)} ignoré(s), ${erreurs.length} en erreur.`)
      ),
      erreurs.length ? detailRapport(erreurs) : null,
      corrigees.length ? [h('p', null, `${corrigees.length} fiche(s) corrigée(s) à la lecture, à vérifier :`), detailRapport(corrigees)] : null,
      corps.pistes ? resumeSection(NOMS_SECTIONS.pistes, r.pistes) : null,
      SECTIONS_IMPORT.filter((cle) => corps[cle] != null).map((cle) => resumeSection(NOMS_SECTIONS[cle], r[cle])),
      nonReprises.length ? h('p', null, `Sections non reprises : ${nonReprises.join(', ')}.`) : null
    );
  }

  V.ouvrirImportation = function () {
    const fichier = h('input', { type: 'file', accept: '.json,application/json' });
    const texte = h('textarea', { rows: 8, placeholder: '{ "evenements": [ … ], "pistes": [ … ] }' });
    const mode = h('select', null, h('option', { value: 'ajouter' }, 'Ajouter seulement (ignore les fiches déjà présentes)'), h('option', { value: 'remplacer' }, 'Ajouter et mettre à jour les fiches déjà présentes'));
    // Comme « --veille » d'outils/importer.js : pays donné aux événements et aux pistes qui n'en précisent pas.
    const veille = h(
      'select',
      { value: etat.filtres.veille || '' },
      h('option', { value: '' }, `Laisser tel quel (sans pays : ${V.nomPays(V.veilleDefaut())})`),
      V.paysSuivis().map((p) => h('option', { value: p.id }, p.nom))
    );
    const avecVeille = (x) => (veille.value && x && typeof x === 'object' && !Array.isArray(x) && (x.veille == null || x.veille === '') ? { ...x, veille: veille.value } : x);
    const rapport = h('div', { class: 'c6', style: { gridColumn: 'span 6', fontSize: '13.5px' } });
    fichier.addEventListener('change', async () => {
      if (fichier.files[0]) texte.value = await fichier.files[0].text();
    });
    const signaler = (message) => V.vider(rapport).appendChild(h('p', { style: { color: 'var(--critique)' } }, message));
    ouvrirModale(
      'Importer des événements',
      'Collez ou choisissez un fichier JSON au format du registre, ou un fichier « Sauvegarde ». Vos étoiles et vos notes existantes ne sont jamais écrasées.',
      h(
        'form',
        {
          class: 'formulaire',
          onsubmit: envoiUnique(async () => {
            let donnees;
            try {
              donnees = JSON.parse(texte.value);
            } catch {
              signaler('Ce texte n’est pas du JSON valide.');
              return;
            }
            let corps;
            if (Array.isArray(donnees)) corps = { evenements: donnees };
            else if (!donnees || typeof donnees !== 'object') {
              signaler('Format inattendu : le fichier doit contenir un objet { "evenements": [ … ] } ou une liste d’événements.');
              return;
            } else {
              if (donnees.evenements != null && !Array.isArray(donnees.evenements)) {
                signaler('Format inattendu : « evenements » doit être une liste.');
                return;
              }
              corps = { evenements: donnees.evenements || [] };
              // Comme outils/importer.js : le thème du fichier s'applique aux pistes qui n'en ont pas.
              if (Array.isArray(donnees.pistes)) {
                corps.pistes = donnees.pistes.map((p) => (p && typeof p === 'object' && !Array.isArray(p) ? { theme: donnees.theme || '', ...p } : p));
              }
              // Sections d'un fichier « Sauvegarde ».
              for (const cle of SECTIONS_IMPORT) if (donnees[cle] != null) corps[cle] = donnees[cle];
            }
            corps.evenements = corps.evenements.map(avecVeille);
            if (corps.pistes) corps.pistes = corps.pistes.map(avecVeille);
            corps.mode = mode.value;
            const nonReprises = Array.isArray(donnees) ? [] : Object.keys(donnees).filter((k) => !CLES_RECONNUES.has(k));
            let r;
            try {
              r = await V.api('POST', 'import', corps);
            } catch (err) {
              signaler(`Importation impossible : ${err.message}`);
              return;
            }
            V.vider(rapport).appendChild(rapportImportation(r, corps, nonReprises));
            modaleModifiee = false;
            affiche = null;
            try {
              await V.recharger();
            } catch (err) {
              rapport.appendChild(h('p', { style: { color: 'var(--critique)' } }, `Rechargement impossible : ${err.message}`));
            }
          }, 'Importation…')
        },
        champ('Fichier', fichier, 'c2'),
        champ('Mode', mode, 'c2'),
        champ('Pays suivi des fiches sans pays', veille, 'c2'),
        champ('Contenu JSON', texte, 'c6'),
        rapport,
        h('div', { class: 'pied-formulaire' }, h('button', { class: 'bouton', type: 'button', onclick: fermerModale }, 'Fermer'), h('button', { class: 'bouton principal', type: 'submit' }, 'Importer'))
      )
    );
  };

  /* ---------- Écouteurs globaux ---------- */

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      if (fermetureModale) fermerModaleSiAccord();
      else if (etat.ouvert) V.fermerTiroir();
      return;
    }
    // « / » place le curseur dans la recherche, sauf si l'on est déjà en train d'écrire
    // ou si une fiche ou une fenêtre couvre la page.
    const enSaisie = ev.target instanceof Element && ev.target.closest('input, textarea, select, [contenteditable]');
    const champRecherche = etat.controles && etat.controles.q;
    if (
      ev.key === '/' &&
      !enSaisie &&
      !ev.ctrlKey &&
      !ev.metaKey &&
      !ev.altKey &&
      !etat.ouvert &&
      !fermetureModale &&
      champRecherche &&
      !document.getElementById('filtres').hidden
    ) {
      ev.preventDefault();
      champRecherche.focus();
    }
  });

  // Fermeture ou rechargement de la page : les notes en attente partent tout de suite.
  window.addEventListener('pagehide', () => {
    if (notesEnCours) notesEnCours.urgence();
  });

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('voile').addEventListener('click', V.fermerTiroir);
    document.getElementById('tiroir-fermer').addEventListener('click', V.fermerTiroir);
    const modale = document.getElementById('modale');
    modale.addEventListener('input', () => (modaleModifiee = true));
    modale.addEventListener('change', () => (modaleModifiee = true));
    // Le fond ferme la fenêtre seulement si la pression commence et finit dessus, hors de sa barre de défilement.
    let pressionFond = false;
    modale.addEventListener('mousedown', (ev) => {
      pressionFond = ev.target === modale && ev.offsetX < modale.clientWidth && ev.offsetY < modale.clientHeight;
    });
    modale.addEventListener('click', (ev) => {
      const fond = pressionFond && ev.target === modale;
      pressionFond = false;
      if (fond) fermerModaleSiAccord();
    });
    // Lien d'évitement : on déplace le focus sans changer l'adresse (qui décrit la vue et les filtres).
    const evitement = document.querySelector('.evitement');
    if (evitement) {
      evitement.addEventListener('click', (ev) => {
        ev.preventDefault();
        const main = document.getElementById('contenu');
        main.tabIndex = -1;
        main.focus();
      });
    }
    V.demarrer();
  });
})();
