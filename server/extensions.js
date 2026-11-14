// Dart Live – Erweiterungen: Vereinsliga, Getränke-Strichliste, Anmeldelisten
// Jede Erweiterung: empty() liefert leere Daten, act(daten, anfrage, ctx) ändert sie (Fehler per throw),
// optional onBoard(daten, scheibe, board) wird bei jeder Änderung an einer Scheibe aufgerufen.
'use strict';
const EXT = require('./core').EXT;

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function clean(s, n) { return String(s == null ? '' : s).replace(/[<>]/g, '').trim().slice(0, n || 40); }
function money(x) { const v = Math.round(Number(String(x).replace(',', '.')) * 100) / 100; return isFinite(v) ? v : NaN; }

/* ---------- Vereinsliga: jeder gegen jeden über die Saison ---------- */
EXT.vliga = {
  empty: function () { return { season: null, games: [] }; },
  act: function (d, q) {
    if (q.action === 'create') {
      const seen = {};
      const players = (q.players || []).map(p => clean(p, 24)).filter(p => p && !seen[p.toLowerCase()] && (seen[p.toLowerCase()] = 1));
      if (players.length < 3) throw new Error('Mindestens 3 Spieler eintragen');
      d.season = { name: clean(q.name || ('Vereinsliga ' + new Date().getFullYear()), 50), players: players, legs: Math.max(1, Math.min(9, Number(q.legs) || 3)),
        start: Number(q.start) === 301 ? 301 : 501, twice: !!q.twice, created: new Date().toISOString() };
      d.games = [];
      for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
        d.games.push({ id: uid(), p1: players[i], p2: players[j], status: 'open', legs: null, winner: null });
        if (d.season.twice) d.games.push({ id: uid(), p1: players[j], p2: players[i], status: 'open', legs: null, winner: null });
      }
      return;
    }
    if (q.action === 'delete') { d.season = null; d.games = []; return; }
    const g = d.games.filter(x => x.id === q.id)[0];
    if (!g) throw new Error('Spiel nicht gefunden');
    if (q.action === 'result') {
      const a = Math.floor(Number(q.legs && q.legs[0]) || 0), b = Math.floor(Number(q.legs && q.legs[1]) || 0), need = d.season.legs;
      if (!((a === need && b < need) || (b === need && a < need))) throw new Error('Ergebnis muss ' + need + ':x oder x:' + need + ' sein');
      g.legs = [a, b]; g.winner = a > b ? g.p1 : g.p2; g.status = 'done'; g.date = new Date().toISOString(); g.board = null;
    } else if (q.action === 'reset') { g.legs = null; g.winner = null; g.status = 'open'; g.board = null; g.date = null; }
    else if (q.action === 'claim') {
      // Tablet hat das Spiel gestartet
      if (g.status === 'done') throw new Error('Spiel ist schon gespielt');
      g.status = 'running'; g.board = Number(q.board) || null;
    } else if (q.action === 'release') { if (g.status === 'running') { g.status = 'open'; g.board = null; } }
    else throw new Error('Unbekannte Aktion');
  },
  onBoard: function (d, n, b) {
    if (!b || !b.vliga || !d.games) return;
    const g = d.games.filter(x => x.id === b.vliga)[0];
    if (!g) return;
    if (b.status === 'play') { if (g.status !== 'done' || g.board === n) { g.status = 'running'; g.board = n; g.legs = null; g.winner = null; } }
    else if (b.status === 'done' && b.players) {
      g.legs = [b.players[0].legs, b.players[1].legs]; g.winner = g.legs[0] > g.legs[1] ? g.p1 : g.p2;
      g.status = 'done'; g.date = new Date().toISOString(); g.mid = b.mid;
    } else if (b.status === 'idle' && g.status === 'running') { g.status = 'open'; g.board = null; }
  }
};

/* ---------- Turnier-Archiv (wird vom Kern bei Turnierende befüllt) ---------- */
EXT.archiv = {
  empty: function () { return { list: [] }; },
  act: function (d, q) {
    if (!Array.isArray(d.list)) d.list = [];
    if (q.action === 'delete') {
      const n = d.list.length;
      d.list = d.list.filter(e => e.id !== q.id);
      if (d.list.length === n) throw new Error('Turnier nicht im Archiv');
      return;
    }
    if (q.action === 'rename') {
      const e = d.list.filter(x => x.id === q.id)[0];
      if (!e) throw new Error('Turnier nicht im Archiv');
      e.name = clean(q.name, 60) || e.name;
      return;
    }
    throw new Error('Unbekannte Aktion');
  }
};

/* ---------- Getränke-Strichliste ---------- */
EXT.drinks = {
  empty: function () {
    return {
      products: [
        { id: 'p1', name: 'Bier 0,5', price: 3.5 }, { id: 'p2', name: 'Radler 0,5', price: 3.5 }, { id: 'p3', name: 'Spezi', price: 2.5 },
        { id: 'p4', name: 'Wasser', price: 2 }, { id: 'p5', name: 'Kaffee', price: 1.5 }, { id: 'p6', name: 'Schnaps', price: 2 }
      ],
      people: [], entries: [], settlements: []
    };
  },
  act: function (d, q) {
    if (q.action === 'add') {
      const name = clean(q.name, 24), pr = d.products.filter(p => p.id === q.product)[0];
      if (!name) throw new Error('Name fehlt');
      if (!pr) throw new Error('Getränk nicht gefunden');
      const n = Math.max(1, Math.min(20, Number(q.count) || 1));
      const ids = [];
      for (let i = 0; i < n; i++) { const id = uid() + i; ids.push(id); d.entries.push({ id: id, name: name, product: pr.name, price: pr.price, date: new Date().toISOString(), settled: false }); }
      if (d.people.map(x => x.toLowerCase()).indexOf(name.toLowerCase()) < 0) d.people.push(name);
      return { ok: true, ids: ids };
    }
    if (q.action === 'undo') {
      const ids = q.ids || [q.id];
      d.entries = d.entries.filter(e => ids.indexOf(e.id) < 0 || e.settled);
      return;
    }
    if (q.action === 'person') {
      const name = clean(q.name, 24);
      if (!name) throw new Error('Name fehlt');
      if (d.people.map(x => x.toLowerCase()).indexOf(name.toLowerCase()) < 0) d.people.push(name);
      d.people.sort((a, b) => a.localeCompare(b));
      return;
    }
    if (q.action === 'removePerson') {
      if (d.entries.some(e => e.name === q.name && !e.settled)) throw new Error(q.name + ' hat noch offene Striche');
      d.people = d.people.filter(p => p !== q.name);
      return;
    }
    if (q.action === 'product') {
      const name = clean(q.name, 30), price = money(q.price);
      if (!name || !(price >= 0)) throw new Error('Name und Preis eingeben');
      if (q.id) { const p = d.products.filter(x => x.id === q.id)[0]; if (!p) throw new Error('Getränk nicht gefunden'); p.name = name; p.price = price; }
      else d.products.push({ id: uid(), name: name, price: price });
      return;
    }
    if (q.action === 'removeProduct') { d.products = d.products.filter(p => p.id !== q.id); return; }
    if (q.action === 'settle') {
      const open = d.entries.filter(e => e.name === q.name && !e.settled);
      if (!open.length) throw new Error('Nichts offen');
      const sum = Math.round(open.reduce((s, e) => s + e.price, 0) * 100) / 100;
      const sid = uid();
      open.forEach(e => { e.settled = sid; });
      d.settlements.push({ id: sid, name: q.name, amount: sum, count: open.length, date: new Date().toISOString() });
      return { ok: true, amount: sum };
    }
    if (q.action === 'unsettle') {
      d.entries.forEach(e => { if (e.settled === q.id) e.settled = false; });
      d.settlements = d.settlements.filter(s => s.id !== q.id);
      return;
    }
    throw new Error('Unbekannte Aktion');
  }
};

/* ---------- Anmeldelisten für Termine ---------- */
EXT.events = {
  empty: function () { return { events: [] }; },
  act: function (d, q) {
    if (q.action === 'create') {
      const title = clean(q.title, 60);
      if (!title) throw new Error('Titel fehlt');
      d.events.push({ id: uid(), title: title, date: clean(q.date, 20), note: clean(q.note, 200), entries: [], created: new Date().toISOString() });
      d.events.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      return;
    }
    const ev = d.events.filter(e => e.id === q.id)[0];
    if (!ev) throw new Error('Termin nicht gefunden');
    if (q.action === 'delete') { d.events = d.events.filter(e => e !== ev); return; }
    if (q.action === 'respond') {
      const name = clean(q.name, 24), st = ['ja', 'nein', 'vielleicht'].indexOf(q.status) >= 0 ? q.status : 'ja';
      if (!name) throw new Error('Name fehlt');
      const ex = ev.entries.filter(e => e.name.toLowerCase() === name.toLowerCase())[0];
      if (ex) { ex.status = st; ex.date = new Date().toISOString(); } else ev.entries.push({ name: name, status: st, date: new Date().toISOString() });
      return;
    }
    if (q.action === 'remove') { ev.entries = ev.entries.filter(e => e.name !== q.name); return; }
    throw new Error('Unbekannte Aktion');
  }
};

/* ---------- Sponsoren für die Fernseher ---------- */
EXT.sponsors = {
  empty: function () { return { items: [], seconds: 10, bar: true, idle: true }; },
  act: function (d, q, ctx) {
    function img(x) {
      if (!x) return '';
      if (!/^data:image\/(png|jpeg|jpg|gif|webp);base64,/.test(x)) throw new Error('Bild muss PNG oder JPG sein');
      if (x.length > 1500000) throw new Error('Bild zu groß');
      return x;
    }
    if (q.action === 'add' || q.action === 'edit') {
      const name = clean(q.name, 50), text = clean(q.text, 120);
      if (!name && !q.img) throw new Error('Name oder Logo angeben');
      if (q.action === 'add') d.items.push({ id: uid(), name: name, text: text, img: img(q.img), on: true });
      else {
        const it = d.items.filter(x => x.id === q.id)[0];
        if (!it) throw new Error('Sponsor nicht gefunden');
        it.name = name; it.text = text; if (q.img) it.img = img(q.img); if (q.noimg) it.img = '';
      }
    } else if (q.action === 'remove') d.items = d.items.filter(x => x.id !== q.id);
    else if (q.action === 'toggle') { const it = d.items.filter(x => x.id === q.id)[0]; if (it) it.on = !it.on; }
    else if (q.action === 'move') {
      const i = d.items.findIndex(x => x.id === q.id), j = i + (q.dir < 0 ? -1 : 1);
      if (i >= 0 && j >= 0 && j < d.items.length) { const t = d.items[i]; d.items[i] = d.items[j]; d.items[j] = t; }
    } else if (q.action === 'settings') {
      d.seconds = Math.max(4, Math.min(60, Number(q.seconds) || 10)); d.bar = !!q.bar; d.idle = !!q.idle;
    } else throw new Error('Unbekannte Aktion');
    // Fernseher laden die Bilder nur neu, wenn sich hier etwas geändert hat
    if (ctx && ctx.state) ctx.state.sponsorsRev = Date.now();
    return { ok: true };
  }
};

module.exports = EXT;
