/* Veille Monde — utilitaires partagés (aucune dépendance). */
(function () {
  'use strict';
  const V = (window.Veille = window.Veille || {});
  const NS_SVG = 'http://www.w3.org/2000/svg';

  /* ---------- Construction du DOM ----------
   * Tout le contenu passe par des nœuds texte : une donnée importée ne peut jamais
   * être interprétée comme du HTML. */

  function appliquer(el, attrs, estSvg) {
    if (!attrs) return;
    for (const [cle, valeur] of Object.entries(attrs)) {
      if (valeur == null || valeur === false) continue;
      if (cle === 'class') {
        if (estSvg) el.setAttribute('class', valeur);
        else el.className = valeur;
      } else if (cle === 'style' && typeof valeur === 'object') {
        for (const [p, v] of Object.entries(valeur)) {
          if (p.startsWith('--')) el.style.setProperty(p, v);
          else el.style[p] = v;
        }
      } else if (cle === 'dataset') {
        Object.assign(el.dataset, valeur);
      } else if (cle.startsWith('on') && typeof valeur === 'function') {
        el.addEventListener(cle.slice(2).toLowerCase(), valeur);
      } else if (cle === 'value' || cle === 'checked') {
        continue; // posés après les enfants (nécessaire pour <select>)
      } else if (valeur === true) {
        el.setAttribute(cle, '');
      } else {
        el.setAttribute(cle, String(valeur));
      }
    }
  }

  function ajouter(el, enfants) {
    for (const enfant of enfants) {
      if (enfant == null || enfant === false) continue;
      if (Array.isArray(enfant)) ajouter(el, enfant);
      else if (enfant instanceof Node) el.appendChild(enfant);
      else el.appendChild(document.createTextNode(String(enfant)));
    }
  }

  V.h = function h(balise, attrs, ...enfants) {
    const el = document.createElement(balise);
    appliquer(el, attrs, false);
    ajouter(el, enfants);
    if (attrs) {
      if (attrs.value != null) el.value = attrs.value;
      if (attrs.checked != null) el.checked = Boolean(attrs.checked);
    }
    return el;
  };

  V.s = function s(balise, attrs, ...enfants) {
    const el = document.createElementNS(NS_SVG, balise);
    appliquer(el, attrs, true);
    ajouter(el, enfants);
    return el;
  };

  V.vider = function (el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  };

  /* ---------- Texte, dates, nombres ---------- */

  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  V.MOIS = MOIS;
  V.MOIS_COURTS = MOIS_COURTS;

  V.formaterDate = function (iso, precision) {
    if (!iso) return '';
    const [a, m, j] = String(iso).slice(0, 10).split('-').map(Number);
    if (precision === 'annee') return String(a);
    if (precision === 'mois') return `${MOIS[m - 1]} ${a}`;
    return `${j === 1 ? '1er' : j} ${MOIS[m - 1]} ${a}`;
  };

  V.dateCourte = function (iso, precision) {
    if (!iso) return '';
    const [a, m, j] = String(iso).slice(0, 10).split('-').map(Number);
    if (precision === 'annee') return String(a);
    if (precision === 'mois') return `${MOIS_COURTS[m - 1]} ${a}`;
    return `${j === 1 ? '1er' : j} ${MOIS_COURTS[m - 1]} ${a}`;
  };

  V.aujourdhui = function () {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  /** Jour LOCAL (AAAA-MM-JJ) d'un horodatage ISO : toISOString() écrit en UTC, et couper
   * la chaîne donnerait le lendemain pour une action faite en soirée. */
  V.jourLocal = function (iso) {
    if (!iso) return '';
    const texte = String(iso);
    if (/^\d{4}-\d{2}-\d{2}$/.test(texte)) return texte; // date seule : déjà un jour
    const d = new Date(texte);
    if (Number.isNaN(d.getTime())) return texte.slice(0, 10);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  V.decalerJours = function (iso, jours) {
    const [a, m, j] = iso.split('-').map(Number);
    const d = new Date(a, m - 1, j + jours);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  V.simplifier = function (s) {
    return String(s == null ? '' : s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  };

  V.nombre = function (n) {
    return Number(n).toLocaleString('fr-CA');
  };

  V.pluriel = function (n, singulier, pluriel) {
    return `${V.nombre(n)} ${n > 1 ? pluriel || singulier + 's' : singulier}`;
  };

  V.urlSure = function (u) {
    try {
      const url = new URL(String(u));
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch {
      return null;
    }
  };

  V.domaine = function (u) {
    try {
      return new URL(u).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  };

  V.delai = function (fn, ms) {
    let t;
    return function (...a) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, a), ms);
    };
  };

  /* ---------- Mémoire locale du navigateur (préférences seulement) ---------- */

  V.memoire = {
    lire(cle, defaut) {
      try {
        const v = localStorage.getItem('veille:' + cle);
        return v == null ? defaut : JSON.parse(v);
      } catch {
        return defaut;
      }
    },
    ecrire(cle, valeur) {
      try {
        localStorage.setItem('veille:' + cle, JSON.stringify(valeur));
      } catch {
        /* stockage indisponible : la page fonctionne sans */
      }
    }
  };

  /* ---------- Serveur local ---------- */

  V.api = async function (methode, chemin, corps) {
    let reponse;
    try {
      reponse = await fetch('/api/' + chemin, {
        method: methode,
        headers: { 'Content-Type': 'application/json', 'X-Veille': '1' },
        body: corps === undefined ? undefined : JSON.stringify(corps)
      });
    } catch {
      // Le message du navigateur (« Failed to fetch ») est en anglais et n'indique pas quoi faire.
      throw Object.assign(new Error('serveur local injoignable; relancez Demarrer.bat'), { code: 0 });
    }
    const donnees = await reponse.json().catch(() => ({}));
    if (!reponse.ok) {
      const message = (donnees.erreurs || [donnees.erreur || `Erreur ${reponse.status}`]).join(' ; ');
      throw Object.assign(new Error(message), { code: reponse.status, reponse: donnees });
    }
    return donnees;
  };

  /* ---------- Infobulle ---------- */

  const infobulle = {
    el: null,
    montrer(contenu, x, y) {
      const el = this.el || (this.el = document.getElementById('infobulle'));
      if (!el) return;
      V.vider(el).appendChild(contenu);
      el.style.display = 'block';
      const r = el.getBoundingClientRect();
      let gauche = x + 14;
      let haut = y + 14;
      if (gauche + r.width > window.innerWidth - 8) gauche = x - r.width - 12;
      if (haut + r.height > window.innerHeight - 8) haut = y - r.height - 12;
      el.style.left = Math.max(8, gauche) + 'px';
      el.style.top = Math.max(8, haut) + 'px';
    },
    cacher() {
      if (this.el) this.el.style.display = 'none';
    }
  };
  V.infobulle = infobulle;

  /** Contenu d'infobulle : la valeur d'abord, le nom ensuite; une clé en trait, pas en boîte. */
  V.contenuInfobulle = function ({ titre, lignes }) {
    const boite = V.h('div', null, titre ? V.h('div', { class: 'ib-titre' }, titre) : null);
    for (const l of lignes || []) {
      boite.appendChild(
        V.h(
          'div',
          { class: 'ib-ligne' },
          l.couleur ? V.h('span', { class: 'ib-cle', style: { background: l.couleur } }) : null,
          V.h('b', null, l.valeur),
          l.nom ? V.h('span', { class: 'ib-nom' }, l.nom) : null
        )
      );
    }
    return boite;
  };

  /** Même contenu au survol et au focus clavier. */
  V.lierInfobulle = function (el, fabrique) {
    el.addEventListener('pointermove', (e) => infobulle.montrer(fabrique(), e.clientX, e.clientY));
    el.addEventListener('pointerleave', () => infobulle.cacher());
    el.addEventListener('focus', () => {
      const r = el.getBoundingClientRect();
      infobulle.montrer(fabrique(), r.left + r.width / 2, r.top + r.height / 2);
    });
    el.addEventListener('blur', () => infobulle.cacher());
    return el;
  };

  /* ---------- Avis ---------- */

  V.avis = function (message, erreur) {
    const zone = document.getElementById('avis');
    if (!zone) return;
    const el = V.h('div', { class: erreur ? 'erreur' : '', role: erreur ? 'alert' : 'status' }, message);
    zone.appendChild(el);
    setTimeout(() => el.remove(), erreur ? 7000 : 3200);
  };

  /* ---------- Exportation ---------- */

  V.telecharger = function (nom, contenu, type) {
    const blob = new Blob([contenu], { type: type || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = V.h('a', { href: url, download: nom });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  V.versCSV = function (lignes) {
    const cellule = (v) => {
      let s = v == null ? '' : String(v);
      // Neutralise les formules qu'un tableur exécuterait à l'ouverture.
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    // Séparateur de liste du tableur : « ; » là où la virgule sert de séparateur décimal (fr-CA).
    const sep = (1.1).toLocaleString().includes(',') ? ';' : ',';
    return '﻿' + lignes.map((l) => l.map(cellule).join(sep)).join('\r\n') + '\r\n';
  };

  /* ---------- Markdown minimal et sûr ----------
   * Titres, paragraphes, listes (imbriquées), citations, filets, tableaux,
   * gras, italique, code, liens http(s) et liens internes (#/...). */

  function lienSur(cible) {
    if (/^#\//.test(cible)) return cible;
    return V.urlSure(cible);
  }

  function enLigne(texte) {
    const frag = document.createDocumentFragment();
    const motif =
      /\*\*([^*]+(?:\*(?!\*)[^*]*)*)\*\*|\*([^\s*](?:[^*\n]*[^\s*])?)\*|`([^`]+)`|\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)|(https?:\/\/(?:[^\s<>()]|\([^\s<>()]*\))+(?:[^\s<>().,;:!?»]|\([^\s<>()]*\)))/g;
    let dernier = 0;
    let m;
    while ((m = motif.exec(texte))) {
      if (m.index > dernier) frag.appendChild(document.createTextNode(texte.slice(dernier, m.index)));
      if (m[1] != null) frag.appendChild(V.h('strong', null, enLigne(m[1])));
      else if (m[2] != null) frag.appendChild(V.h('em', null, enLigne(m[2])));
      else if (m[3] != null) frag.appendChild(V.h('code', null, m[3]));
      else if (m[4] != null) {
        const cible = lienSur(m[5]);
        if (!cible) frag.appendChild(document.createTextNode(m[4]));
        else if (cible.startsWith('#')) frag.appendChild(V.h('a', { href: cible }, enLigne(m[4])));
        else frag.appendChild(V.h('a', { href: cible, target: '_blank', rel: 'noopener noreferrer' }, enLigne(m[4])));
      } else if (m[6] != null) {
        const cible = V.urlSure(m[6]);
        if (cible) frag.appendChild(V.h('a', { href: cible, target: '_blank', rel: 'noopener noreferrer' }, V.domaine(cible) || m[6]));
        else frag.appendChild(document.createTextNode(m[6]));
      }
      dernier = motif.lastIndex;
    }
    if (dernier < texte.length) frag.appendChild(document.createTextNode(texte.slice(dernier)));
    return frag;
  }
  V.enLigne = enLigne;

  function cellules(ligne) {
    return ligne
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());
  }

  V.markdown = function (source) {
    const racine = document.createDocumentFragment();
    // U+2028 / U+2029 : séparateurs que « . » et « $ » ne franchissent pas; traités comme des fins de ligne.
    const lignes = String(source || '').replace(/\r\n?|[\u2028\u2029]/g, '\n').split('\n');
    let i = 0;
    const estListe = (l) => /^\s*([-*+]|\d+[.)])\s+/.test(l);

    while (i < lignes.length) {
      const ligne = lignes[i];
      if (!ligne.trim()) {
        i++;
        continue;
      }
      let m = /^(#{1,6})\s+(.*)$/.exec(ligne);
      if (m) {
        racine.appendChild(V.h('h' + Math.min(4, m[1].length), null, enLigne(m[2].replace(/\s+#+\s*$/, ''))));
        i++;
        continue;
      }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(ligne)) {
        racine.appendChild(V.h('hr'));
        i++;
        continue;
      }
      if (/^\s*>/.test(ligne)) {
        const bloc = [];
        while (i < lignes.length && /^\s*>/.test(lignes[i])) bloc.push(lignes[i++].replace(/^\s*>\s?/, ''));
        racine.appendChild(V.h('blockquote', null, V.markdown(bloc.join('\n'))));
        continue;
      }
      if (/^\s*\|/.test(ligne) && i + 1 < lignes.length && /^\s*\|?\s*:?-{2,}/.test(lignes[i + 1])) {
        const tete = cellules(ligne);
        i += 2;
        const corps = [];
        while (i < lignes.length && /^\s*\|/.test(lignes[i])) corps.push(cellules(lignes[i++]));
        racine.appendChild(
          V.h(
            'table',
            null,
            V.h('thead', null, V.h('tr', null, tete.map((c) => V.h('th', null, enLigne(c))))),
            V.h('tbody', null, corps.map((r) => V.h('tr', null, r.map((c) => V.h('td', null, enLigne(c))))))
          )
        );
        continue;
      }
      if (estListe(ligne)) {
        const pile = [];
        while (i < lignes.length && (estListe(lignes[i]) || (/^\s{2,}\S/.test(lignes[i]) && pile.length))) {
          const l = lignes[i];
          const mm = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(l);
          if (!mm) {
            // suite d'un élément sur la ligne suivante
            const dernierLi = pile.length ? pile[pile.length - 1].dernier : null;
            if (dernierLi) {
              dernierLi.appendChild(document.createTextNode(' '));
              dernierLi.appendChild(enLigne(l.trim()));
            }
            i++;
            continue;
          }
          const retrait = mm[1].replace(/\t/g, '  ').length;
          const type = /\d/.test(mm[2]) ? 'ol' : 'ul';
          while (pile.length && pile[pile.length - 1].retrait > retrait) pile.pop();
          if (!pile.length || pile[pile.length - 1].retrait < retrait) {
            const el = V.h(type);
            if (pile.length && pile[pile.length - 1].dernier) pile[pile.length - 1].dernier.appendChild(el);
            else racine.appendChild(el);
            pile.push({ retrait, el, dernier: null });
          }
          // Le numéro écrit est conservé : une liste aérée donne un <ol> par élément.
          const li = V.h('li', type === 'ol' ? { value: Number.parseInt(mm[2], 10) } : null, enLigne(mm[3]));
          pile[pile.length - 1].el.appendChild(li);
          pile[pile.length - 1].dernier = li;
          i++;
        }
        continue;
      }
      const para = [];
      while (
        i < lignes.length &&
        lignes[i].trim() &&
        !/^(#{1,6})\s+/.test(lignes[i]) &&
        !/^\s*>/.test(lignes[i]) &&
        !estListe(lignes[i]) &&
        !/^\s*\|/.test(lignes[i]) &&
        !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lignes[i])
      ) {
        para.push(lignes[i++].trim());
      }
      if (para.length) racine.appendChild(V.h('p', null, enLigne(para.join(' '))));
      // Ligne prise par aucune branche (tableau sans séparateur, texte commençant par « | ») : gardée telle quelle.
      else racine.appendChild(V.h('p', null, enLigne(lignes[i++].trim())));
    }
    return racine;
  };
})();
