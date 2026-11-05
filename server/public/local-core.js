// AUTOMATISCH ERZEUGT mit build-local.js – nicht von Hand ändern
(function () {
"use strict";
var __mods = {};
function __req(n) { return n.indexOf("tournament") >= 0 ? __mods.tournament : __mods.core; }
/* tournament */
(function (module, exports, require) {
// Turnierlogik für Dart Live: Gruppenphase + K.-o.-Runde
'use strict';

const GROUP_NAMES = ['A', 'B', 'C', 'D', 'E', 'F'];
const KO_NAMES = { 16: 'Achtelfinale', 8: 'Viertelfinale', 4: 'Halbfinale', 2: 'Finale' };

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

/* ---------- Anlegen & Auslosen ---------- */
function create(opts) {
  const players = (opts.players || []).map(s => String(s).replace(/[<>]/g, '').trim().slice(0, 24)).filter(Boolean);
  const seen = {};
  const uniq = players.filter(p => { const k = p.toLowerCase(); if (seen[k]) return false; seen[k] = 1; return true; });
  if (uniq.length < 4) throw new Error('Mindestens 4 Spieler nötig');
  const groups = Math.max(1, Math.min(6, Number(opts.groups) || 3));
  if (uniq.length < groups * 2) throw new Error('Zu wenige Spieler für ' + groups + ' Gruppen');
  const seeds = (opts.seeds || []).map(String).filter(s => uniq.indexOf(s) >= 0);
  let koSize = Number(opts.koSize) || 8;
  if ([2, 4, 8, 16].indexOf(koSize) < 0) koSize = 8;
  while (koSize > uniq.length) koSize /= 2;
  const T = {
    id: uid(),
    name: String(opts.name || 'Vereinsmeisterschaft').slice(0, 60),
    status: 'setup',
    cfg: {
      start: [301, 501, 701].indexOf(Number(opts.start)) >= 0 ? Number(opts.start) : 501,
      legs: Math.max(1, Math.min(9, Number(opts.legs) || 3)),
      koLegs: Math.max(1, Math.min(11, Number(opts.koLegs) || Number(opts.legs) || 3)),
      finalLegs: Math.max(1, Math.min(11, Number(opts.finalLegs) || Number(opts.koLegs) || Number(opts.legs) || 3)),
      doubleOut: opts.doubleOut !== false,
      groups: groups,
      koSize: koSize,
      third: !!opts.third,
      boards: Array.isArray(opts.boards) && opts.boards.length ? opts.boards.map(Number).filter(n => n >= 1 && n <= 5) : [1, 2, 3, 4, 5]
    },
    players: uniq,
    seeds: seeds,
    groups: [],
    matches: [],
    champion: null,
    created: new Date().toISOString()
  };
  draw(T);
  return T;
}

function draw(T) {
  const g = T.cfg.groups;
  const groups = [];
  for (let i = 0; i < g; i++) groups.push({ name: GROUP_NAMES[i], players: [] });
  // Gesetzte Spieler der Reihe nach auf die Gruppen verteilen (Schlange), Rest zufällig auffüllen
  const seeds = T.seeds.slice();
  const rest = shuffle(T.players.filter(p => seeds.indexOf(p) < 0));
  let idx = 0, dir = 1;
  seeds.forEach(s => {
    groups[idx].players.push(s);
    idx += dir;
    if (idx === g) { idx = g - 1; dir = -1; } else if (idx < 0) { idx = 0; dir = 1; }
  });
  rest.forEach(p => {
    // in die kleinste Gruppe (bei Gleichstand die erste)
    let best = 0;
    for (let i = 1; i < g; i++) if (groups[i].players.length < groups[best].players.length) best = i;
    groups[best].players.push(p);
  });
  T.groups = groups;
}

function movePlayer(T, player, toGroup) {
  if (T.status !== 'setup') throw new Error('Gruppen können nur vor dem Start geändert werden');
  const to = T.groups.filter(g => g.name === toGroup)[0];
  if (!to) throw new Error('Gruppe unbekannt');
  T.groups.forEach(g => { g.players = g.players.filter(p => p !== player); });
  to.players.push(player);
}

/* ---------- Liga-Spieltag (Bezirk Niederbayern: 6 Einzel, 3 Doppel, 6 Einzel) ---------- */
const LEAGUE_SINGLES = [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6]];
const LEAGUE_SINGLES2 = [[1, 2], [2, 1], [3, 4], [4, 3], [5, 6], [6, 5]];

function cleanList(a, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ name: String((a && a[i] && a[i].name) || (a && typeof a[i] === 'string' ? a[i] : '') || '').replace(/[<>]/g, '').trim().slice(0, 24), nr: String((a && a[i] && a[i].nr) || '').slice(0, 12) });
  return out;
}

function createLeague(opts) {
  const home = cleanList(opts.home, 6), guest = cleanList(opts.guest, 6);
  const missing = home.concat(guest).filter(p => !p.name).length;
  if (missing) throw new Error('Bitte alle 12 Spieler eintragen (' + missing + ' fehlen)');
  const all = home.concat(guest).map(p => p.name.toLowerCase());
  if (all.some((n, i) => all.indexOf(n) !== i)) throw new Error('Jeder Name darf nur einmal vorkommen (z. B. Nachnamen ergänzen)');
  const legs = Math.max(1, Math.min(9, Number(opts.legs) || 3));
  const T = {
    id: uid(), type: 'league', status: 'league',
    name: String(opts.homeTeam || 'Heim') + ' – ' + String(opts.guestTeam || 'Gast'),
    homeTeam: String(opts.homeTeam || 'Heim').slice(0, 40), guestTeam: String(opts.guestTeam || 'Gast').slice(0, 40),
    place: String(opts.place || '').slice(0, 60), date: String(opts.date || '').slice(0, 20),
    cfg: (function () {
      // Liga: Auf der Heim-Scheibe beginnt das Heimteam, auf der Gast-Scheibe der Gastverein
      const hb = Number(opts.homeBoard) >= 1 && Number(opts.homeBoard) <= 5 ? Number(opts.homeBoard) : 2;
      let gb = Number(opts.guestBoard) >= 1 && Number(opts.guestBoard) <= 5 ? Number(opts.guestBoard) : 4;
      if (gb === hb) throw new Error('Heim- und Gast-Scheibe müssen verschieden sein');
      const startBy = {}; startBy[hb] = 'home'; startBy[gb] = 'guest';
      return { start: [301, 501].indexOf(Number(opts.start)) >= 0 ? Number(opts.start) : 501, legs: legs, doubleOut: opts.doubleOut !== false, strict: opts.strict !== false,
        boards: [hb, gb], homeBoard: hb, guestBoard: gb, startBy: startBy };
    })(),
    home: home, guest: guest, subs: [], notes: '', groups: [], matches: [], created: new Date().toISOString()
  };
  let order = 0;
  LEAGUE_SINGLES.forEach((p, i) => T.matches.push(leagueMatch(T, i + 1, 1, p, order++)));
  for (let d = 0; d < 3; d++) T.matches.push({ id: uid(), phase: 'league', no: 7 + d, sec: 2, label: 'Spiel ' + (7 + d) + ' · Doppel', doubles: true,
    hp: null, gp: null, p1: null, p2: null, status: 'pending', board: null, legs: null, winner: null, order: order++, legsToWin: legs });
  LEAGUE_SINGLES2.forEach((p, i) => T.matches.push(leagueMatch(T, 10 + i, 3, p, order++)));
  return T;
}

function leagueMatch(T, no, sec, pair, order) {
  return { id: uid(), phase: 'league', no: no, sec: sec, label: 'Spiel ' + no + ' · A' + pair[0] + '–B' + pair[1], hs: pair[0], gs: pair[1],
    p1: T.home[pair[0] - 1].name, p2: T.guest[pair[1] - 1].name, status: 'pending', board: null, legs: null, winner: null, order: order, legsToWin: T.cfg.legs };
}

function setDoubles(T, no, hp, gp) {
  const m = T.matches.filter(x => x.no === Number(no))[0];
  if (!m || !m.doubles) throw new Error('Doppel nicht gefunden');
  if (m.status === 'running' || m.status === 'done') throw new Error('Das Doppel läuft schon oder ist beendet');
  const hn = T.home.map(p => p.name), gn = T.guest.map(p => p.name);
  hp = (hp || []).filter(Boolean); gp = (gp || []).filter(Boolean);
  if (hp.length !== 2 || gp.length !== 2 || hp[0] === hp[1] || gp[0] === gp[1]) throw new Error('Pro Team 2 verschiedene Spieler wählen');
  if (hp.some(n => hn.indexOf(n) < 0) || gp.some(n => gn.indexOf(n) < 0)) throw new Error('Spieler gehört nicht zum Team');
  m.hp = hp; m.gp = gp;
  m.p1 = hp.join(' / '); m.p2 = gp.join(' / ');
  if (m.status === 'assigned') { m.status = 'pending'; m.board = null; }
}

function substitute(T, team, slot, name, nr, fromNo) {
  const list = team === 'home' ? T.home : T.guest;
  const i = Number(slot) - 1;
  if (!list[i]) throw new Error('Position unbekannt');
  name = String(name || '').replace(/[<>]/g, '').trim().slice(0, 24);
  if (!name) throw new Error('Name fehlt');
  const old = list[i].name, oldNr = list[i].nr;
  fromNo = Number(fromNo) || 1;
  T.matches.forEach(m => {
    if (m.no < fromNo || m.doubles || m.status === 'done' || m.status === 'running') return;
    if (team === 'home' && m.hs === i + 1) m.p1 = name;
    if (team === 'guest' && m.gs === i + 1) m.p2 = name;
  });
  list[i] = { name: name, nr: String(nr || '').slice(0, 12) };
  T.subs.push({ team: team, slot: i + 1, out: old, outNr: oldNr, in: name, fromNo: fromNo });
}

function leagueScore(T) {
  let h = 0, g = 0, lh = 0, lg = 0;
  const run = [];
  T.matches.slice().sort((a, b) => a.no - b.no).forEach(m => {
    if (m.status === 'done') { if (m.winner === m.p1) h++; else g++; lh += m.legs[0]; lg += m.legs[1]; }
    run.push(m.status === 'done' ? h + '-' + g : '');
  });
  return { home: h, guest: g, legsHome: lh, legsGuest: lg, running: run };
}

/* ---------- Spielplan ---------- */
function roundRobin(players) {
  // Kreisverfahren; bei ungerader Zahl spielfreier Platzhalter
  const list = players.slice();
  if (list.length % 2) list.push(null);
  const n = list.length, rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i], b = list[n - 1 - i];
      if (a && b) pairs.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop());
  }
  return rounds;
}

function start(T) {
  if (T.status !== 'setup') throw new Error('Turnier läuft bereits');
  if (T.groups.some(g => g.players.length < 2)) throw new Error('Jede Gruppe braucht mindestens 2 Spieler');
  T.matches = [];
  let order = 0;
  T.groups.forEach(g => {
    roundRobin(g.players).forEach((pairs, r) => {
      pairs.forEach(p => {
        T.matches.push({ id: uid(), phase: 'group', group: g.name, round: r + 1, p1: p[0], p2: p[1], status: 'pending', board: null, legs: null, winner: null, order: order++, legsToWin: T.cfg.legs });
      });
    });
  });
  T.status = 'groups';
}

/* ---------- Tabellen ---------- */
function statsFor(players, matches) {
  const s = {};
  players.forEach(p => { s[p] = { name: p, played: 0, won: 0, lost: 0, lf: 0, la: 0, pts: 0 }; });
  matches.forEach(m => {
    if (m.status !== 'done' || !m.legs || !s[m.p1] || !s[m.p2]) return;
    const a = s[m.p1], b = s[m.p2];
    a.played++; b.played++;
    a.lf += m.legs[0]; a.la += m.legs[1]; b.lf += m.legs[1]; b.la += m.legs[0];
    if (m.winner === m.p1) { a.won++; b.lost++; a.pts += 2; } else { b.won++; a.lost++; b.pts += 2; }
  });
  return s;
}

function standings(T, groupName) {
  const g = T.groups.filter(x => x.name === groupName)[0];
  if (!g) return [];
  const ms = T.matches.filter(m => m.phase === 'group' && m.group === groupName);
  const s = statsFor(g.players, ms);
  const arr = g.players.map(p => s[p]);
  const base = (a, b) => (b.pts - a.pts) || ((b.lf - b.la) - (a.lf - a.la));
  arr.sort(base);
  // Gleichstände nach Punkten & Leg-Differenz: direkter Vergleich (Mini-Tabelle), dann mehr gewonnene Legs
  const out = [];
  for (let i = 0; i < arr.length;) {
    let j = i + 1;
    while (j < arr.length && base(arr[i], arr[j]) === 0) j++;
    const tied = arr.slice(i, j);
    if (tied.length > 1) {
      const names = tied.map(t => t.name);
      const mini = statsFor(names, ms.filter(m => names.indexOf(m.p1) >= 0 && names.indexOf(m.p2) >= 0));
      tied.sort((a, b) => (mini[b.name].pts - mini[a.name].pts) || (b.lf - a.lf) || a.name.localeCompare(b.name));
    }
    tied.forEach(t => out.push(t));
    i = j;
  }
  out.forEach((t, k) => { t.rank = k + 1; t.group = groupName; t.diff = t.lf - t.la; });
  return out;
}

function groupsDone(T) {
  return T.matches.filter(m => m.phase === 'group').every(m => m.status === 'done');
}

/* ---------- K.-o.-Runde ---------- */
function seedOrder(size) {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    const next = [];
    order.forEach(s => { next.push(s); next.push(n + 1 - s); });
    order = next;
  }
  return order; // z. B. 8: [1,8,4,5,2,7,3,6]
}

function permutations(a) {
  if (a.length <= 1) return [a.slice()];
  const out = [];
  a.forEach((x, i) => { permutations(a.slice(0, i).concat(a.slice(i + 1))).forEach(p => out.push([x].concat(p))); });
  return out;
}

function qualifiers(T) {
  const g = T.groups.length, size = T.cfg.koSize;
  const tables = T.groups.map(gr => standings(T, gr.name));
  const per = Math.floor(size / g), extra = size - per * g;
  const cmp = (a, b) => (b.pts - a.pts) || (b.diff - a.diff) || (b.lf - a.lf) || a.name.localeCompare(b.name);
  const q = [];
  for (let place = 1; place <= per; place++) {
    const tier = tables.map(t => t[place - 1]).filter(Boolean).map(x => Object.assign({}, x));
    tier.sort(cmp);
    tier.forEach(x => q.push(x));
  }
  if (extra > 0) {
    // Beste der nächsten Platzierung; bei ungleichen Gruppen zählen Spiele gegen Plätze > kleinste Gruppengröße nicht
    const minSize = Math.min.apply(null, T.groups.map(x => x.players.length));
    const cands = [];
    tables.forEach((t, gi) => {
      const x = t[per];
      if (!x) return;
      const keep = t.slice(0, minSize).map(y => y.name);
      const gname = T.groups[gi].name;
      const ms = T.matches.filter(m => m.phase === 'group' && m.group === gname && keep.indexOf(m.p1) >= 0 && keep.indexOf(m.p2) >= 0);
      const st = statsFor(keep, ms)[x.name];
      cands.push(Object.assign({}, x, { pts: st.pts, lf: st.lf, la: st.la, diff: st.lf - st.la, played: st.played, won: st.won, lost: st.lost, cmpOnly: keep.length < t.length }));
    });
    cands.sort(cmp);
    cands.slice(0, extra).forEach(x => q.push(x));
  }
  return q.slice(0, size);
}

function buildKO(T) {
  if (T.status !== 'groups') throw new Error('K.-o.-Runde schon erstellt');
  if (!groupsDone(T)) throw new Error('Noch nicht alle Gruppenspiele beendet');
  const size = T.cfg.koSize;
  const q = qualifiers(T);
  if (q.length < size) throw new Error('Zu wenige Spieler für die K.-o.-Runde');
  const order = seedOrder(size);
  // Paarungen: obere Hälfte fest, untere Hälfte so tauschen, dass möglichst keine Gruppengegner aufeinandertreffen
  const pairs = [];
  for (let i = 0; i < order.length; i += 2) pairs.push([order[i], order[i + 1]]);
  const lows = pairs.map(p => p[1]);
  let best = lows, bestScore = Infinity;
  if (size <= 8) {
    permutations(lows).forEach(perm => {
      let conflicts = 0, dev = 0;
      pairs.forEach((p, i) => {
        if (q[p[0] - 1].group === q[perm[i] - 1].group) conflicts++;
        dev += Math.abs(perm[i] - lows[i]);
      });
      const score = conflicts * 1000 + dev;
      if (score < bestScore) { bestScore = score; best = perm; }
    });
  }
  const round1 = [];
  let order2 = T.matches.length;
  const name1 = KO_NAMES[size] || ('Runde der ' + size);
  pairs.forEach((p, i) => {
    const a = q[p[0] - 1], b = q[best[i] - 1];
    round1.push({ id: uid(), phase: 'ko', koRound: size, slot: i, label: name1 + ' ' + (i + 1), p1: a.name, p2: b.name,
      seed1: p[0], seed2: best[i], status: 'pending', board: null, legs: null, winner: null, order: order2++,
      legsToWin: size === 2 ? T.cfg.finalLegs : T.cfg.koLegs });
  });
  T.matches = T.matches.concat(round1);
  // Folgerunden als Platzhalter
  let prev = round1, rs = size / 2;
  while (rs >= 2) {
    const cur = [];
    for (let i = 0; i < prev.length; i += 2) {
      cur.push({ id: uid(), phase: 'ko', koRound: rs, slot: i / 2, label: (KO_NAMES[rs] || 'Runde') + (rs > 2 ? ' ' + (i / 2 + 1) : ''),
        p1: null, p2: null, from: [prev[i].id, prev[i + 1].id], status: 'pending', board: null, legs: null, winner: null, order: order2++,
        legsToWin: rs === 2 ? T.cfg.finalLegs : T.cfg.koLegs });
    }
    if (rs === 2 && T.cfg.third && prev.length === 2) {
      cur.push({ id: uid(), phase: 'ko', koRound: 3, slot: 0, label: 'Spiel um Platz 3', p1: null, p2: null, from: [prev[0].id, prev[1].id], loserOf: true,
        status: 'pending', board: null, legs: null, winner: null, order: order2++, legsToWin: T.cfg.koLegs });
    }
    T.matches = T.matches.concat(cur);
    prev = cur.filter(m => !m.loserOf); rs /= 2;
  }
  T.koSeeds = q.map((x, i) => ({ seed: i + 1, name: x.name, group: x.group, rank: x.rank }));
  T.status = 'ko';
}

function byId(T, id) { return T.matches.filter(m => m.id === id)[0]; }

function loserOf(m) { return m.winner === m.p1 ? m.p2 : m.p1; }

function propagate(T) {
  T.matches.forEach(m => {
    if (!m.from) return;
    const a = byId(T, m.from[0]), b = byId(T, m.from[1]);
    const v1 = a && a.status === 'done' ? (m.loserOf ? loserOf(a) : a.winner) : null;
    const v2 = b && b.status === 'done' ? (m.loserOf ? loserOf(b) : b.winner) : null;
    if (m.status === 'pending' || m.status === 'assigned') {
      if (m.p1 !== v1 || m.p2 !== v2) { m.p1 = v1; m.p2 = v2; if (m.status === 'assigned' && (!v1 || !v2)) { m.status = 'pending'; m.board = null; } }
    }
  });
  const fin = T.matches.filter(m => m.phase === 'ko' && m.koRound === 2)[0];
  if (fin && fin.status === 'done') { T.champion = fin.winner; T.status = 'done'; }
  else if (T.status === 'done') { T.status = 'ko'; T.champion = null; }
}

/* ---------- Ergebnisse ---------- */
function setResult(T, id, legs) {
  const m = byId(T, id);
  if (!m) throw new Error('Spiel nicht gefunden');
  if (!m.p1 || !m.p2) throw new Error('Spieler stehen noch nicht fest');
  const a = Math.max(0, Math.floor(Number(legs[0]) || 0)), b = Math.max(0, Math.floor(Number(legs[1]) || 0));
  const need = m.legsToWin;
  if (!((a === need && b < need) || (b === need && a < need))) throw new Error('Ergebnis muss ' + need + ':x oder x:' + need + ' sein');
  if (m.phase === 'ko' && dependentsStarted(T, m)) throw new Error('Das nächste Spiel läuft schon – erst dort zurücksetzen');
  m.legs = [a, b];
  m.winner = a > b ? m.p1 : m.p2;
  m.status = 'done';
  m.ended = Date.now();
  m.board = m.board || null;
  afterChange(T);
}

function dependentsStarted(T, m) {
  return T.matches.some(x => x.from && x.from.indexOf(m.id) >= 0 && (x.status === 'running' || x.status === 'done'));
}

function resetMatch(T, id) {
  const m = byId(T, id);
  if (!m) throw new Error('Spiel nicht gefunden');
  if (m.status === 'done' && m.phase === 'ko' && dependentsStarted(T, m)) throw new Error('Das nächste Spiel läuft schon – erst dort zurücksetzen');
  if (m.status === 'done' && m.phase === 'group' && T.status !== 'groups') throw new Error('K.-o.-Runde läuft schon – Gruppenergebnis bitte nur noch korrigieren, nicht zurücksetzen');
  m.status = 'pending'; m.legs = null; m.winner = null; m.board = null;
  afterChange(T);
}

function afterChange(T) {
  if (T.type === 'league') { if (T.matches.every(m => m.status === 'done')) T.status = 'done'; else T.status = 'league'; schedule(T); return; }
  propagate(T);
  if (T.status === 'groups' && groupsDone(T)) buildKO(T);
  schedule(T);
}

/* ---------- Scheiben zuteilen ---------- */
function busyPlayers(T) {
  const b = {};
  T.matches.forEach(m => {
    if (m.status !== 'assigned' && m.status !== 'running') return;
    (m.doubles && m.hp ? m.hp.concat(m.gp) : [m.p1, m.p2]).forEach(n => { b[n] = 1; });
  });
  return b;
}

function lastEnd(T, p) {
  let t = 0;
  T.matches.forEach(m => { if (m.status === 'done' && (m.p1 === p || m.p2 === p) && m.ended > t) t = m.ended; });
  return t;
}

function schedule(T, boardsState) {
  if (T.status !== 'groups' && T.status !== 'ko' && T.status !== 'league') return;
  const used = {};
  T.matches.forEach(m => { if ((m.status === 'assigned' || m.status === 'running') && m.board) used[m.board] = 1; });
  const free = T.cfg.boards.filter(n => !used[n] && !(boardsState && boardsState[n] && boardsState[n].status === 'play' && !boardsState[n].tmatch));
  free.forEach(board => {
    const busy = busyPlayers(T);
    const remaining = {};
    T.matches.forEach(m => { if (m.phase === 'group' && m.status === 'pending') remaining[m.group] = (remaining[m.group] || 0) + 1; });
    const isBusy = m => (m.doubles ? m.hp.concat(m.gp) : [m.p1, m.p2]).some(n => busy[n]);
    const openSec = {};
    T.matches.forEach(m => { if (m.sec && m.status !== 'done') openSec[m.sec] = 1; });
    const cands = T.matches.filter(m => m.status === 'pending' && m.p1 && m.p2 && !isBusy(m) &&
      !(T.type === 'league' && T.cfg.strict && Object.keys(openSec).some(s => Number(s) < m.sec)));
    if (!cands.length) return;
    cands.sort((a, b) => {
      if (a.phase !== b.phase) return a.phase === 'group' ? -1 : 1;
      if (a.phase === 'ko' && a.koRound !== b.koRound) return b.koRound - a.koRound;
      if (a.phase === 'ko' && a.koRound === 3) return 1;
      if (b.phase === 'ko' && b.koRound === 3) return -1;
      if (a.no && b.no) return a.no - b.no;
    if (a.round !== b.round) return (a.round || 0) - (b.round || 0);
      const ra = remaining[a.group] || 0, rb = remaining[b.group] || 0;
      if (ra !== rb) return rb - ra;
      const la = Math.max(lastEnd(T, a.p1), lastEnd(T, a.p2)), lb = Math.max(lastEnd(T, b.p1), lastEnd(T, b.p2));
      if (la !== lb) return la - lb;
      return a.order - b.order;
    });
    const m = cands[0];
    m.status = 'assigned'; m.board = board; m.assigned = Date.now();
  });
}

/* ---------- Verbindung zu den Tablets ---------- */
// Wird bei jedem PUT /api/board/N aufgerufen
function onBoard(T, n, b) {
  if (!T || !b || !b.tmatch) return false;
  const m = byId(T, b.tmatch);
  if (!m) return false;
  if (b.status === 'play' && (m.status === 'assigned' || m.status === 'running' || m.status === 'done')) {
    if (m.status === 'done') {
      // Rückgängig am Tablet nach Spielende: Ergebnis wieder öffnen, wenn noch nichts darauf aufbaut
      if (m.phase === 'ko' && dependentsStarted(T, m)) return false;
      m.legs = null; m.winner = null; propagate(T);
    }
    m.status = 'running'; m.board = n;
    m.live = b.players ? [b.players[0].legs, b.players[1].legs] : null;
    return true;
  }
  if (b.status === 'done' && b.players && m.status !== 'done') {
    m.board = n;
    try { setResult(T, m.id, [b.players[0].legs, b.players[1].legs]); } catch (e) { return false; }
    return true;
  }
  if (b.status === 'idle' && (m.status === 'running')) {
    // Spiel am Tablet abgebrochen -> wieder zuteilen
    m.status = 'assigned'; m.live = null;
    return true;
  }
  return false;
}

function boardFreed(T, n) {
  // Ein Tablet hat ein Turnierspiel abgebrochen oder ein freies Spiel beendet
  schedule(T);
}

function assign(T, id, board) {
  const m = byId(T, id);
  if (!m) throw new Error('Spiel nicht gefunden');
  if (m.status === 'running' || m.status === 'done') throw new Error('Spiel läuft schon oder ist beendet');
  board = Number(board);
  T.matches.forEach(x => { if (x.status === 'assigned' && x.board === board) { x.status = 'pending'; x.board = null; } });
  if (T.matches.some(x => x.status === 'running' && x.board === board)) throw new Error('Auf Scheibe ' + board + ' läuft gerade ein Spiel');
  const busy = busyPlayers(T);
  if (m.status !== 'assigned' && (m.doubles && m.hp ? m.hp.concat(m.gp) : [m.p1, m.p2]).some(n => busy[n])) throw new Error('Ein Spieler ist gerade beschäftigt');
  m.status = 'assigned'; m.board = board; m.assigned = Date.now();
}

function unassign(T, id) {
  const m = byId(T, id);
  if (!m || m.status !== 'assigned') throw new Error('Nur zugeteilte Spiele können freigegeben werden');
  m.status = 'pending'; m.board = null;
}

module.exports = { createLeague, setDoubles, substitute, leagueScore, create, draw, movePlayer, start, standings, qualifiers, buildKO, setResult, resetMatch, schedule, onBoard, boardFreed, assign, unassign, propagate, groupsDone };

})(__mods.tournament = { exports: {} }, undefined, __req);
__mods.tournament = __mods.tournament.exports;
/* core */
(function (module, exports, require) {
// Dart Live – gemeinsamer Kern: läuft im Server (Node) und im Handy (Browser/App ohne Server)
// storage: { load(name) -> Objekt|null, save(name, obj) }
'use strict';
const TN = require('./tournament');

function createCore(storage) {
  const BOARDS = 5;

  function emptyState() {
    const boards = {};
    for (let i = 1; i <= BOARDS; i++) boards[i] = { status: 'idle' };
    return { v: 1, boards: boards, names: [] };
  }

  let state = emptyState();
  const s = storage.load('live');
  if (s && s.boards) { state = s; for (let i = 1; i <= BOARDS; i++) if (!state.boards[i]) state.boards[i] = { status: 'idle' }; if (!Array.isArray(state.names)) state.names = []; }
  let archive = storage.load('matches'); if (!Array.isArray(archive)) archive = [];
  let results = storage.load('results'); if (!Array.isArray(results)) results = [];

  const listeners = [];
  function save() { storage.save('live', state); }
  function saveArchive() { storage.save('matches', archive); }
  function saveResults() { storage.save('results', results); }

  // Tabellen fürs Turnier mitschicken (berechnet, nicht gespeichert)
  function decorate() {
    const T = state.tournament;
    delete state.leagueScore;
    if (T && T.type === 'league') { delete state.standings; state.leagueScore = TN.leagueScore(T); return; }
    if (!T || T.status === 'setup') { delete state.standings; return; }
    const q = {};
    try { TN.qualifiers(T).forEach(function (x) { q[x.name] = 1; }); } catch (e) { /* noch keine Ergebnisse */ }
    state.standings = {};
    T.groups.forEach(function (g) { state.standings[g.name] = TN.standings(T, g.name).map(function (r) { r.q = !!q[r.name]; return r; }); });
  }

  function changed() {
    state.v++;
    decorate();
    listeners.slice().forEach(function (fn) { try { fn(state); } catch (e) { /* egal */ } });
  }

  function cleanName(n) { return String(n || '').replace(/[<>]/g, '').trim().slice(0, 24); }

  function archiveBoard(n, b) {
    if (!b || !b.mid || !Array.isArray(b.players) || b.players.length !== 2) return;
    const i = archive.findIndex(function (a) { return a.mid === b.mid; });
    if (b.status === 'done') {
      const rec = {
        mid: b.mid, date: new Date().toISOString(), started: b.started || null, board: n, start: b.start, legsToWin: b.legsToWin, doubleOut: b.doubleOut,
        winner: b.winner, tmatch: b.tmatch || null, tlabel: b.tlabel || null, league: b.league || null, doubles: !!b.doubles,
        players: b.players.map(function (p) { return { name: p.name, legs: p.legs, sum: p.sum || 0, darts: p.darts || 0, visits: p.visits || 0, c100: p.c100 || 0, c140: p.c140 || 0, c180: p.c180 || 0, hf: p.hf || 0, bl: p.bl || 0 }; })
      };
      if (i >= 0) archive[i] = rec; else archive.push(rec);
      saveArchive();
    } else if (b.status === 'play' && i >= 0) {
      archive.splice(i, 1); saveArchive(); // Rückgängig nach Spielende
    }
  }

  function ok(json) { return { code: 200, json: json }; }
  function bad(msg) { return { code: 400, json: { error: msg } }; }
  function parse(txt) { try { return JSON.parse(txt); } catch (e) { return undefined; } }

  // Bearbeitet eine API-Anfrage (ohne /api/wait – das Warten regelt der Aufrufer)
  function handle(method, p, body) {
    if (method === 'GET' && (p === '/api/state' || p === '/api/wait')) return ok(state);

    let m = p.match(/^\/api\/board\/([1-5])$/);
    if (m && (method === 'PUT' || method === 'POST')) {
      const b = parse(body);
      if (!b || typeof b !== 'object' || Array.isArray(b)) return bad('Ungültige Daten');
      if (b.players && Array.isArray(b.players)) {
        b.players.forEach(function (pl) {
          pl.name = cleanName(pl.name);
          if ((b.status === 'play' || b.status === 'training') && pl.name && pl.name.indexOf(' / ') < 0) {
            state.names = [pl.name].concat(state.names.filter(function (n) { return n.toLowerCase() !== pl.name.toLowerCase(); })).slice(0, 40);
          }
        });
      }
      state.boards[m[1]] = b;
      archiveBoard(Number(m[1]), b);
      if (state.tournament) {
        try { TN.onBoard(state.tournament, Number(m[1]), b); TN.schedule(state.tournament, state.boards); }
        catch (e) { /* Turnierfehler nicht an das Tablet melden */ }
      }
      changed(); save();
      return ok({ ok: true, v: state.v });
    }

    if (method === 'POST' && p === '/api/turnier') {
      const q = parse(body);
      if (!q) return bad('Ungültige Daten');
      const T = state.tournament;
      try {
        switch (q.action) {
          case 'create': state.tournament = TN.create(q); break;
          case 'league': state.tournament = TN.createLeague(q); TN.schedule(state.tournament, state.boards); break;
          case 'delete': state.tournament = null; break;
          default:
            if (!T) throw new Error('Kein Turnier angelegt');
            if (q.action === 'draw') { if (T.status !== 'setup') throw new Error('Turnier läuft bereits'); TN.draw(T); }
            else if (q.action === 'move') TN.movePlayer(T, q.player, q.group);
            else if (q.action === 'start') { TN.start(T); TN.schedule(T, state.boards); }
            else if (q.action === 'result') TN.setResult(T, q.id, q.legs);
            else if (q.action === 'reset') TN.resetMatch(T, q.id);
            else if (q.action === 'assign') TN.assign(T, q.id, q.board);
            else if (q.action === 'unassign') TN.unassign(T, q.id);
            else if (q.action === 'boards') { T.cfg.boards = (q.boards || []).map(Number).filter(function (n) { return n >= 1 && n <= 5; }); TN.schedule(T, state.boards); }
            else if (q.action === 'schedule') TN.schedule(T, state.boards);
            else if (q.action === 'doubles') { TN.setDoubles(T, q.no, q.hp, q.gp); TN.schedule(T, state.boards); }
            else if (q.action === 'sub') { TN.substitute(T, q.team, q.slot, q.name, q.nr, q.fromNo); TN.schedule(T, state.boards); }
            else if (q.action === 'notes') { T.notes = String(q.notes || '').slice(0, 2000); }
            else throw new Error('Unbekannte Aktion');
        }
      } catch (e) { return bad(e.message); }
      changed(); save();
      return ok({ ok: true, tournament: state.tournament });
    }

    if (method === 'GET' && p === '/api/matches') return ok({ matches: archive });
    m = p.match(/^\/api\/matches\/([a-z0-9]+)$/);
    if (m && method === 'DELETE') { const id = m[1]; archive = archive.filter(function (a) { return a.mid !== id; }); saveArchive(); changed(); save(); return ok({ ok: true }); }

    if (method === 'GET' && p === '/api/results') return ok({ results: results });
    if (method === 'POST' && p === '/api/results') {
      let list = parse(body);
      if (list === undefined) return bad('Ungültige Daten');
      if (!Array.isArray(list)) list = [list];
      const now = new Date().toISOString(), ids = [];
      list.slice(0, 10).forEach(function (r) {
        if (!r || typeof r !== 'object') return;
        const name = cleanName(r.name), game = String(r.game || '').slice(0, 20), score = Number(r.score);
        if (!name || !game || !isFinite(score)) return;
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        ids.push(id);
        results.push({ id: id, name: name, game: game, variant: String(r.variant || '').slice(0, 40), score: score, detail: String(r.detail || '').slice(0, 120), date: now });
      });
      if (results.length > 5000) results = results.slice(-5000);
      saveResults(); changed(); save();
      return ok({ ok: true, ids: ids });
    }
    m = p.match(/^\/api\/results\/([a-z0-9]+)$/);
    if (m && method === 'DELETE') { const id = m[1]; results = results.filter(function (r) { return r.id !== id; }); saveResults(); changed(); save(); return ok({ ok: true }); }

    if (method === 'DELETE' && p === '/api/names') { state.names = []; changed(); save(); return ok({ ok: true }); }

    return { code: 404, json: { error: 'Nicht gefunden' } };
  }

  decorate();
  return {
    handle: handle,
    state: function () { return state; },
    version: function () { return state.v; },
    onChange: function (fn) { listeners.push(fn); return function () { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
    reload: function () {
      // Im Handy: Daten neu einlesen, wenn eine andere Ansicht (z. B. der Monitor) etwas geändert hat
      const s2 = storage.load('live'); if (s2 && s2.boards) state = s2;
      const a2 = storage.load('matches'); if (Array.isArray(a2)) archive = a2;
      const r2 = storage.load('results'); if (Array.isArray(r2)) results = r2;
      decorate();
    }
  };
}

module.exports = { createCore: createCore };

})(__mods.core = { exports: {} }, undefined, __req);
__mods.core = __mods.core.exports;
/* Ersatz für XMLHttpRequest: /api/... wird direkt im Handy beantwortet, Daten im Gerätespeicher */
var KEYS = { live: 'dl_live', matches: 'dl_matches', results: 'dl_results' };
var core = __mods.core.createCore({
  load: function (name) { try { var t = window.localStorage.getItem(KEYS[name]); return t ? JSON.parse(t) : null; } catch (e) { return null; } },
  save: function (name, obj) { try { window.localStorage.setItem(KEYS[name], JSON.stringify(obj)); } catch (e) { /* Speicher voll */ } }
});
var RealXHR = window.XMLHttpRequest;
function FakeXHR() { this.readyState = 0; this.status = 0; this.responseText = ''; this.onreadystatechange = null; this.timeout = 0; }
FakeXHR.prototype.open = function (method, url, async) {
  this._m = String(method || 'GET').toUpperCase();
  this._url = new URL(url, location.href);
  this._api = this._url.pathname.indexOf('/api/') === 0;
  if (!this._api) {
    var self = this, r = this._real = new RealXHR();
    r.open(method, url, async !== false);
    r.onreadystatechange = function () {
      self.readyState = r.readyState;
      if (r.readyState === 4) { self.status = r.status; self.responseText = r.responseText; }
      if (self.onreadystatechange) self.onreadystatechange();
    };
  }
  this.readyState = 1;
};
FakeXHR.prototype.setRequestHeader = function (k, v) { if (this._real) this._real.setRequestHeader(k, v); };
FakeXHR.prototype.abort = function () { this._aborted = true; if (this._cancel) this._cancel(); if (this._real) this._real.abort(); };
FakeXHR.prototype.send = function (body) {
  if (this._real) { if (this.timeout) this._real.timeout = this.timeout; return this._real.send(body); }
  var self = this, path = this._url.pathname.replace(/\/+$/, '');
  function finish(r) {
    if (self._aborted) return;
    self.readyState = 4; self.status = r.code; self.responseText = JSON.stringify(r.json);
    if (self.onreadystatechange) self.onreadystatechange();
    if (self.onload) self.onload();
  }
  core.reload();
  if (path === '/api/wait') {
    var v = Number(this._url.searchParams.get('v')) || 0;
    if (core.version() !== v) { setTimeout(function () { finish({ code: 200, json: core.state() }); }, 0); return; }
    var done = false, timer, off;
    var stop = function () { done = true; clearInterval(timer); if (off) off(); };
    var check = function () {
      if (done) return;
      core.reload();
      if (core.version() !== v) { stop(); finish({ code: 200, json: core.state() }); }
    };
    off = core.onChange(function () { setTimeout(check, 0); });
    timer = setInterval(check, 400);   // andere Ansichten (z. B. Monitor) schreiben in denselben Speicher
    setTimeout(function () { if (!done) { stop(); finish({ code: 200, json: core.state() }); } }, 20000);
    this._cancel = stop;
    return;
  }
  var r = core.handle(this._m, path, body || '');
  setTimeout(function () { finish(r); }, 0);
};
window.XMLHttpRequest = FakeXHR;
window.DartLokal = { aktiv: true, reset: function () { try { localStorage.removeItem(KEYS.live); localStorage.removeItem(KEYS.matches); localStorage.removeItem(KEYS.results); } catch (e) {} } };

})();
