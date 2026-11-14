// AUTOMATISCH ERZEUGT mit build-local.js – nicht von Hand ändern
(function () {
"use strict";
var __mods = {};
function __req(n) { return n.indexOf("tournament") >= 0 ? __mods.tournament : __mods.core; }
/* tournament */
(function (module, exports, require) {
// Turnierlogik für Dart Live: Gruppenphase + K.-o.-Runde, reines K.-o.-Turnier, Doppel-K.-o., Jeder gegen jeden
'use strict';

const GROUP_NAMES = ['A', 'B', 'C', 'D', 'E', 'F'];
const KO_NAMES = { 32: 'Sechzehntelfinale', 16: 'Achtelfinale', 8: 'Viertelfinale', 4: 'Halbfinale', 2: 'Finale' };

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
  // Modus: 'gko' = Gruppen + K.-o. (Standard), 'ko' = nur K.-o. (mit Freilosen),
  // 'dko' = Doppel-K.-o. (erst nach zwei Niederlagen raus), 'liga' = jeder gegen jeden
  const mode = ['ko', 'dko', 'liga'].indexOf(opts.mode) >= 0 ? opts.mode : 'gko';
  let groups, koSize;
  if (mode === 'ko' || mode === 'dko') {
    const min = mode === 'dko' ? 3 : 2;
    if (uniq.length < min) throw new Error('Mindestens ' + min + ' Spieler nötig');
    if (uniq.length > 32) throw new Error('Im ' + (mode === 'dko' ? 'Doppel-K.-o.' : 'K.-o.') + '-Modus sind höchstens 32 Spieler möglich');
    groups = 0; koSize = 2;
    while (koSize < uniq.length) koSize *= 2;
  } else if (mode === 'liga') {
    if (uniq.length < 3) throw new Error('Mindestens 3 Spieler nötig');
    groups = 1; koSize = 0;
  } else {
    if (uniq.length < 4) throw new Error('Mindestens 4 Spieler nötig');
    groups = Math.max(1, Math.min(6, Number(opts.groups) || 3));
    if (uniq.length < groups * 2) throw new Error('Zu wenige Spieler für ' + groups + ' Gruppen');
    koSize = Number(opts.koSize) || 8;
    if ([2, 4, 8, 16].indexOf(koSize) < 0) koSize = 8;
    while (koSize > uniq.length) koSize /= 2;
  }
  const seeds = mode === 'liga' ? [] : (opts.seeds || []).map(String).filter(s => uniq.indexOf(s) >= 0);
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
      mode: mode,
      rueck: (mode === 'gko' || mode === 'liga') && !!opts.rueck,
      // Doppel-K.-o.: gewinnt der Spieler aus der Verliererrunde das Große Finale, folgt ein Entscheidungsspiel
      reset: mode === 'dko' && !!opts.reset,
      groups: groups,
      koSize: koSize,
      third: (mode === 'gko' || mode === 'ko') && !!opts.third && !(mode === 'ko' && uniq.length < 4),
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

function isKoOnly(T) { return T.cfg.mode === 'ko' || T.cfg.mode === 'dko'; }

function draw(T) {
  if (isKoOnly(T)) {
    // Setzliste: Gesetzte in ihrer Reihenfolge, der Rest zufällig. Die Besten bekommen die Freilose.
    T.groups = [];
    T.koOrder = T.seeds.concat(shuffle(T.players.filter(p => T.seeds.indexOf(p) < 0)));
    return;
  }
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
  if (isKoOnly(T)) throw new Error('Im K.-o.-Modus gibt es keine Gruppen');
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

/* ---------- Blind-Doppel: jede Runde neue, zugeloste Partner ---------- */
function createBlind(opts) {
  const seen = {};
  const players = (opts.players || []).map(p => String(p).replace(/[<>]/g, '').trim().slice(0, 24)).filter(p => p && !seen[p.toLowerCase()] && (seen[p.toLowerCase()] = 1));
  if (players.length < 4) throw new Error('Mindestens 4 Spieler eintragen');
  const T = {
    id: uid(), type: 'blind', status: 'blind', name: String(opts.name || 'Blind-Doppel').slice(0, 60),
    cfg: { start: Number(opts.start) === 301 ? 301 : 501, legs: Math.max(1, Math.min(9, Number(opts.legs) || 2)), doubleOut: opts.doubleOut !== false,
      rounds: Math.max(1, Math.min(12, Number(opts.rounds) || 4)),
      boards: Array.isArray(opts.boards) && opts.boards.length ? opts.boards.map(Number).filter(n => n >= 1 && n <= 5) : [1, 2, 3, 4, 5] },
    players: players, round: 0, sitOut: {}, partners: {}, matches: [], groups: [], created: new Date().toISOString()
  };
  players.forEach(p => { T.sitOut[p] = 0; });
  nextBlindRound(T);
  return T;
}

function pairKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }

function nextBlindRound(T) {
  if (T.round >= T.cfg.rounds) throw new Error('Alle Runden sind gespielt');
  if (T.matches.some(m => m.round === T.round && m.status !== 'done')) throw new Error('Die aktuelle Runde läuft noch');
  const n = T.players.length, active = Math.floor(n / 4) * 4;
  // Wer am seltensten Pause hatte, setzt zuerst aus
  const order = shuffle(T.players).sort((a, b) => T.sitOut[a] - T.sitOut[b]);
  const sitting = order.slice(0, n - active), play = order.slice(n - active);
  let best = null, bestScore = Infinity;
  for (let tries = 0; tries < 300; tries++) {
    const sh = shuffle(play);
    let score = 0;
    for (let i = 0; i < sh.length; i += 2) score += (T.partners[pairKey(sh[i], sh[i + 1])] || 0) * 10;
    for (let i = 0; i < sh.length; i += 4) { /* Gegner-Wiederholungen weniger schlimm */
      [[0, 2], [0, 3], [1, 2], [1, 3]].forEach(x => { if (sh[i + x[0]] && sh[i + x[1]]) score += (T.partners['vs:' + pairKey(sh[i + x[0]], sh[i + x[1]])] || 0); });
    }
    if (score < bestScore) { bestScore = score; best = sh; if (!score) break; }
  }
  T.round++;
  sitting.forEach(p => { T.sitOut[p]++; });
  T.sitting = sitting;
  let order2 = T.matches.length;
  for (let i = 0; i < best.length; i += 4) {
    const hp = [best[i], best[i + 1]], gp = [best[i + 2], best[i + 3]];
    T.partners[pairKey(hp[0], hp[1])] = (T.partners[pairKey(hp[0], hp[1])] || 0) + 1;
    T.partners[pairKey(gp[0], gp[1])] = (T.partners[pairKey(gp[0], gp[1])] || 0) + 1;
    hp.forEach(a => gp.forEach(b => { T.partners['vs:' + pairKey(a, b)] = (T.partners['vs:' + pairKey(a, b)] || 0) + 1; }));
    T.matches.push({ id: uid(), phase: 'blind', round: T.round, label: 'Runde ' + T.round + ' · Doppel ' + (i / 4 + 1), doubles: true, hp: hp, gp: gp,
      p1: hp.join(' / '), p2: gp.join(' / '), status: 'pending', board: null, legs: null, winner: null, order: order2++, legsToWin: T.cfg.legs });
  }
}

function blindStandings(T) {
  const S = {};
  T.players.forEach(p => { S[p] = { name: p, played: 0, won: 0, lost: 0, lf: 0, la: 0, pts: 0, sat: T.sitOut[p] || 0 }; });
  T.matches.forEach(m => {
    if (m.status !== 'done' || !m.legs) return;
    m.hp.forEach(p => { const s = S[p]; if (!s) return; s.played++; s.lf += m.legs[0]; s.la += m.legs[1]; if (m.winner === m.p1) { s.won++; s.pts += 2; } else s.lost++; });
    m.gp.forEach(p => { const s = S[p]; if (!s) return; s.played++; s.lf += m.legs[1]; s.la += m.legs[0]; if (m.winner === m.p2) { s.won++; s.pts += 2; } else s.lost++; });
  });
  const arr = Object.keys(S).map(k => S[k]);
  arr.forEach(s => { s.diff = s.lf - s.la; s.quote = s.played ? s.won / s.played : 0; });
  // Wer öfter aussetzen musste, wird über die Siegquote nicht benachteiligt
  arr.sort((a, b) => (b.quote - a.quote) || (b.pts - a.pts) || (b.diff - a.diff) || a.name.localeCompare(b.name));
  arr.forEach((s, i) => { s.rank = i + 1; });
  return arr;
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
  if (isKoOnly(T)) {
    const q = (T.koOrder || T.players).map(n => ({ name: n, group: null, rank: null }));
    if (T.cfg.mode === 'dko') doubleBracket(T, q, T.cfg.koSize); else bracket(T, q, T.cfg.koSize, null);
    T.koSeeds = q.map((x, i) => ({ seed: i + 1, name: x.name, group: '', rank: '' }));
    T.status = 'ko';
    propagate(T);
    return;
  }
  const liga = T.cfg.mode === 'liga';
  let order = 0;
  T.groups.forEach(g => {
    let rounds = roundRobin(g.players);
    // Rückrunde: dieselben Paarungen noch einmal, der andere Spieler steht vorne
    if (T.cfg.rueck) rounds = rounds.concat(rounds.map(pairs => pairs.map(p => [p[1], p[0]])));
    rounds.forEach((pairs, r) => {
      pairs.forEach(p => {
        const m = { id: uid(), phase: 'group', group: g.name, round: r + 1, p1: p[0], p2: p[1], status: 'pending', board: null, legs: null, winner: null, order: order++, legsToWin: T.cfg.legs };
        if (liga) m.label = 'Runde ' + (r + 1);
        T.matches.push(m);
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
  if (!g || !size) return [];
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
    // (nur Gruppen, die auf diesem Platz überhaupt jemanden haben – sonst fällt der Kandidat selbst aus dem Vergleich)
    const minSize = Math.min.apply(null, tables.filter(t => t[per]).map(t => t.length));
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

// Baut den K.-o.-Baum. q = Setzliste (darf kürzer als size sein: fehlende Plätze sind Freilose für die Besten),
// lows = Reihenfolge der unteren Setzplätze je Paarung (null = Standard 1–8, 4–5, 2–7, 3–6 …)
function bracket(T, q, size, lows) {
  const order = seedOrder(size);
  const pairs = [];
  for (let i = 0; i < order.length; i += 2) pairs.push([order[i], order[i + 1]]);
  const best = lows || pairs.map(p => p[1]);
  const round1 = [];
  let order2 = T.matches.length;
  const name1 = KO_NAMES[size] || ('Runde der ' + size);
  pairs.forEach((p, i) => {
    const a = q[p[0] - 1], b = q[best[i] - 1];
    const m = { id: uid(), phase: 'ko', koRound: size, slot: i, label: size === 2 ? name1 : name1 + ' ' + (i + 1), p1: a ? a.name : null, p2: b ? b.name : null,
      seed1: p[0], seed2: best[i], status: 'pending', board: null, legs: null, winner: null, order: order2++,
      legsToWin: size === 2 ? T.cfg.finalLegs : T.cfg.koLegs };
    if (!a || !b) { m.bye = true; m.status = 'done'; m.winner = a ? a.name : (b ? b.name : null); }
    round1.push(m);
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
    if (rs === 2 && T.cfg.third && prev.length === 2 && !prev.some(m => m.bye)) {
      cur.push({ id: uid(), phase: 'ko', koRound: 3, slot: 0, label: 'Spiel um Platz 3', p1: null, p2: null, from: [prev[0].id, prev[1].id], loserOf: true,
        status: 'pending', board: null, legs: null, winner: null, order: order2++, legsToWin: T.cfg.koLegs });
    }
    T.matches = T.matches.concat(cur);
    prev = cur.filter(m => !m.loserOf); rs /= 2;
  }
}

/* ---------- Doppel-K.-o. ----------
   Gewinnerrunde (br 'W') wie ein normaler K.-o.-Baum. Wer dort verliert, fällt in die Verliererrunde (br 'L'),
   wer dort verliert, ist ausgeschieden. Die Sieger beider Seiten spielen das Große Finale (br 'F').
   Jedes Spiel holt seine Spieler über src: [{ id, take: 'w' | 'l' }, …] (Sieger bzw. Verlierer eines anderen Spiels).
   Fehlt ein Gegner (Freilos), geht der andere automatisch weiter (autoBye). */
function doubleBracket(T, q, size) {
  const R = Math.log2(size), order = seedOrder(size), W = [], L = [];
  let no = T.matches.length;
  const make = (o) => Object.assign({ id: uid(), phase: 'dko', p1: null, p2: null, status: 'pending', board: null, legs: null, winner: null, order: no++, legsToWin: T.cfg.koLegs }, o);
  // Gewinnerrunde
  for (let r = 0; r < R; r++) {
    W[r] = [];
    const cnt = size >> (r + 1), last = r === R - 1;
    for (let i = 0; i < cnt; i++) {
      const m = make({ br: 'W', rnd: r + 1, slot: i, lvl: 2 * r,
        col: last ? 'Finale Gewinnerrunde' : 'Gewinnerrunde ' + (r + 1),
        label: last ? 'Finale Gewinnerrunde' : 'Gewinnerrunde ' + (r + 1) + ' · Spiel ' + (i + 1) });
      if (r === 0) {
        const a = q[order[2 * i] - 1], b = q[order[2 * i + 1] - 1];
        m.p1 = a ? a.name : null; m.p2 = b ? b.name : null; m.seed1 = order[2 * i]; m.seed2 = order[2 * i + 1];
        if (!a || !b) { m.bye = true; m.status = 'done'; m.winner = a ? a.name : (b ? b.name : null); }
      } else m.src = [{ id: W[r - 1][2 * i].id, take: 'w' }, { id: W[r - 1][2 * i + 1].id, take: 'w' }];
      W[r].push(m);
    }
  }
  // Verliererrunde: abwechselnd „Verlierer aus der Gewinnerrunde kommen dazu“ und „Verliererrunde unter sich“
  const LR = 2 * (R - 1);
  T.__tmp = {};
  W.forEach(r => r.forEach(m => { T.__tmp[m.id] = m; }));
  const lvlOf = m => m.lvl;
  for (let k = 1; k <= LR; k++) {
    L[k] = [];
    let cnt;
    if (k === 1) cnt = size >> 2;
    else if (k % 2 === 0) cnt = size >> (k / 2 + 1);
    else cnt = size >> ((k - 1) / 2 + 2);
    for (let i = 0; i < cnt; i++) {
      let src;
      if (k === 1) src = [{ id: W[0][2 * i].id, take: 'l' }, { id: W[0][2 * i + 1].id, take: 'l' }];
      else if (k % 2 === 0) {
        const j = k / 2, wr = W[j], from = j % 2 ? wr[cnt - 1 - i] : wr[i];   // gespiegelt, damit sich Paarungen nicht gleich wiederholen
        src = [{ id: L[k - 1][i].id, take: 'w' }, { id: from.id, take: 'l' }];
      } else src = [{ id: L[k - 1][2 * i].id, take: 'w' }, { id: L[k - 1][2 * i + 1].id, take: 'w' }];
      const last = k === LR;
      const lv = Math.max.apply(null, src.map(s => lvlOf(T.__tmp[s.id]))) + 1;
      const m = make({ br: 'L', rnd: k, slot: i, lvl: lv, src: src,
        col: last ? 'Finale Verliererrunde' : 'Verliererrunde ' + k,
        label: last ? 'Finale Verliererrunde' : 'Verliererrunde ' + k + ' · Spiel ' + (i + 1) });
      L[k].push(m);
      T.__tmp[m.id] = m;
    }
  }
  delete T.__tmp;
  const wf = W[R - 1][0], lf = LR ? L[LR][0] : null;
  const gf = make({ br: 'F', rnd: 1, slot: 0, lvl: Math.max(wf.lvl, lf ? lf.lvl : 0) + 1, col: 'Großes Finale', label: 'Großes Finale',
    src: [{ id: wf.id, take: 'w' }, { id: lf.id, take: 'w' }], legsToWin: T.cfg.finalLegs });
  const all = [];
  W.forEach(r => r.forEach(m => all.push(m)));
  for (let k = 1; k <= LR; k++) L[k].forEach(m => all.push(m));
  all.push(gf);
  if (T.cfg.reset) {
    all.push(make({ br: 'F', rnd: 2, slot: 0, lvl: gf.lvl + 1, col: 'Großes Finale', label: 'Entscheidungsspiel', resetOf: gf.id,
      src: [{ id: gf.id, take: 'p1' }, { id: gf.id, take: 'p2' }], legsToWin: T.cfg.finalLegs }));
  }
  T.matches = T.matches.concat(all);
}

// Wert einer Quelle: undefined = noch offen, null = niemand (Freilos), sonst der Spielername
function srcValue(T, s) {
  const m = byId(T, s.id);
  if (!m || m.status !== 'done') return undefined;
  if (s.take === 'p1') return m.p1;
  if (s.take === 'p2') return m.p2;
  if (s.take === 'w') return m.winner || null;
  return m.bye ? null : loserOf(m);
}

function propagateDouble(T) {
  T.matches.forEach(m => {
    if (m.phase !== 'dko' || !m.src) return;
    if (m.status === 'running' || (m.status === 'done' && !m.autoBye)) return;
    if (m.resetOf) {
      // Entscheidungsspiel nur, wenn der Spieler aus der Verliererrunde das Große Finale gewonnen hat
      const gf = byId(T, m.resetOf);
      if (gf.status === 'done') {
        if (gf.winner === gf.p1) { setAuto(m, gf.p1, null, gf.p1, true); return; }
        if (m.autoBye) clearAuto(m);
        if (m.p1 !== gf.p1 || m.p2 !== gf.p2) { m.p1 = gf.p1; m.p2 = gf.p2; }
      } else {
        if (m.autoBye) clearAuto(m);
        if (m.status === 'assigned') { m.status = 'pending'; m.board = null; }
        m.p1 = null; m.p2 = null;
      }
      return;
    }
    const v1 = srcValue(T, m.src[0]), v2 = srcValue(T, m.src[1]);
    if (v1 !== undefined && v2 !== undefined && (!v1 || !v2)) { setAuto(m, v1 || null, v2 || null, v1 || v2 || null, false); return; }
    if (m.autoBye) clearAuto(m);
    const p1 = v1 || null, p2 = v2 || null;
    if (m.p1 !== p1 || m.p2 !== p2) {
      m.p1 = p1; m.p2 = p2;
      if (m.status === 'assigned' && (!p1 || !p2)) { m.status = 'pending'; m.board = null; }
    }
  });
  const fin = finalDouble(T);
  if (fin && fin.status === 'done') { T.champion = fin.winner; T.status = 'done'; }
  else if (T.status === 'done') { T.status = 'ko'; T.champion = null; }
}

function setAuto(m, p1, p2, w, skip) {
  m.p1 = p1; m.p2 = p2; m.winner = w; m.status = 'done'; m.bye = true; m.autoBye = true; m.board = null; m.legs = null;
  if (skip) m.skip = true; else delete m.skip;
}
function clearAuto(m) { m.status = 'pending'; m.winner = null; m.bye = false; m.autoBye = false; delete m.skip; m.board = null; }

// Das Spiel, das das Turnier entscheidet: Entscheidungsspiel (falls vorhanden) bzw. Großes Finale
function finalDouble(T) {
  const f = T.matches.filter(m => m.phase === 'dko' && m.br === 'F');
  return f.length ? f[f.length - 1] : null;
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
  if (size <= 16) {
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
  bracket(T, q, size, best);
  T.koSeeds = q.map((x, i) => ({ seed: i + 1, name: x.name, group: x.group, rank: x.rank }));
  T.status = 'ko';
}

function koStarted(T) {
  return T.matches.some(m => m.phase === 'ko' && !m.bye && (m.status === 'running' || m.status === 'done'));
}

// Wird ein Gruppenergebnis geändert, bevor in der K.-o.-Runde gespielt wurde, wird die K.-o.-Runde neu gesetzt
function reopenGroups(T) {
  if (T.cfg.mode === 'ko' || T.cfg.mode === 'liga' || T.status !== 'ko' || koStarted(T)) return false;
  T.matches = T.matches.filter(m => m.phase !== 'ko');
  T.koSeeds = null; T.champion = null;
  T.status = 'groups';
  return true;
}

function byId(T, id) { return T.matches.filter(m => m.id === id)[0]; }

function loserOf(m) { return m.winner === m.p1 ? m.p2 : m.p1; }

function propagate(T) {
  if (T.cfg.mode === 'dko') { propagateDouble(T); return; }
  if (T.cfg.mode === 'liga') {
    // Jeder gegen jeden: Sieger ist der Tabellenerste, sobald alles gespielt ist
    if (T.status === 'groups' && groupsDone(T)) { T.status = 'done'; T.champion = standings(T, T.groups[0].name)[0].name; }
    else if (T.status === 'done' && !groupsDone(T)) { T.status = 'groups'; T.champion = null; }
    else if (T.status === 'done') T.champion = standings(T, T.groups[0].name)[0].name;
    return;
  }
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
  if (m.bye) throw new Error('Freilos – hier gibt es kein Ergebnis');
  if ((m.phase === 'ko' || m.phase === 'dko') && dependentsStarted(T, m)) throw new Error('Das nächste Spiel läuft schon – erst dort zurücksetzen');
  if (m.phase === 'group') reopenGroups(T);
  m.legs = [a, b];
  m.winner = a > b ? m.p1 : m.p2;
  m.status = 'done';
  m.ended = Date.now();
  m.board = m.board || null;
  afterChange(T);
}

function dependentsStarted(T, m) {
  return T.matches.some(x => {
    const dep = (x.from && x.from.indexOf(m.id) >= 0) || (x.src && x.src.some(s => s.id === m.id));
    if (!dep) return false;
    // automatisch weitergegebene Freilose zählen nicht – aber das, was danach kommt
    if (x.autoBye) return dependentsStarted(T, x);
    return x.status === 'running' || x.status === 'done';
  });
}

function resetMatch(T, id) {
  const m = byId(T, id);
  if (!m) throw new Error('Spiel nicht gefunden');
  if (m.status === 'done' && (m.phase === 'ko' || m.phase === 'dko') && dependentsStarted(T, m)) throw new Error('Das nächste Spiel läuft schon – erst dort zurücksetzen');
  if (m.bye) throw new Error('Ein Freilos kann nicht zurückgesetzt werden');
  if (m.phase === 'group' && T.cfg.mode !== 'liga' && T.status !== 'groups' && !reopenGroups(T)) throw new Error('K.-o.-Runde läuft schon – Gruppenergebnis bitte nur noch korrigieren, nicht zurücksetzen');
  m.status = 'pending'; m.legs = null; m.winner = null; m.board = null;
  afterChange(T);
}

/* ---------- Rückgängig (letzte Eingabe der Turnierleitung) ---------- */
function snapshot(T, id) {
  const m = byId(T, id);
  if (!m) return null;
  return { id: m.id, label: (m.p1 || '?') + ' – ' + (m.p2 || '?'), legs: m.status === 'done' && m.legs ? m.legs.slice() : null };
}

function undo(T) {
  const u = T.lastAct;
  if (!u) throw new Error('Nichts zum Rückgängigmachen');
  if (!byId(T, u.id)) { T.lastAct = null; throw new Error('Das Spiel gibt es nicht mehr'); }
  if (u.legs) setResult(T, u.id, u.legs); else resetMatch(T, u.id);
  T.lastAct = null;
}

/* ---------- Plätze 1–3 ---------- */
function podium(T) {
  if (!T || T.status !== 'done' || T.type) return null;
  if (T.cfg.mode === 'liga') {
    const st = standings(T, T.groups[0].name);
    return { first: st[0] ? st[0].name : null, second: st[1] ? st[1].name : null, third: st[2] ? [st[2].name] : [] };
  }
  if (T.cfg.mode === 'dko') {
    const fd = finalDouble(T), gf = T.matches.filter(m => m.phase === 'dko' && m.br === 'F')[0];
    if (!fd || fd.status !== 'done') return null;
    const lfin = T.matches.filter(m => m.phase === 'dko' && m.br === 'L').pop();
    return { first: fd.winner, second: gf.winner === gf.p1 && fd !== gf ? gf.p2 : loserOf(fd), third: lfin && lfin.status === 'done' && !lfin.bye ? [loserOf(lfin)] : [] };
  }
  const fin = T.matches.filter(m => m.phase === 'ko' && m.koRound === 2)[0];
  if (!fin || fin.status !== 'done') return null;
  const small = T.matches.filter(m => m.phase === 'ko' && m.koRound === 3)[0];
  let third = [];
  if (small) { if (small.status === 'done') third = [small.winner]; }
  else third = T.matches.filter(m => m.phase === 'ko' && m.koRound === 4 && m.status === 'done' && !m.bye).map(loserOf);
  return { first: fin.winner, second: loserOf(fin), third: third };
}

function afterChange(T) {
  if (T.type === 'blind') {
    const cur = T.matches.filter(m => m.round === T.round);
    if (cur.length && cur.every(m => m.status === 'done')) {
      if (T.round < T.cfg.rounds) nextBlindRound(T);
      else { T.status = 'done'; T.champion = blindStandings(T)[0].name; }
    } else if (T.status === 'done') { T.status = 'blind'; T.champion = null; }
    schedule(T); return;
  }
  if (T.type === 'league') { if (T.matches.every(m => m.status === 'done')) T.status = 'done'; else T.status = 'league'; schedule(T); return; }
  propagate(T);
  if (T.cfg.mode !== 'liga' && T.status === 'groups' && groupsDone(T)) buildKO(T);
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
  if (T.status !== 'groups' && T.status !== 'ko' && T.status !== 'league' && T.status !== 'blind') return;
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
      if (a.phase === 'dko' && a.lvl !== b.lvl) return a.lvl - b.lvl;
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
      if ((m.phase === 'ko' || m.phase === 'dko') && dependentsStarted(T, m)) return false;
      if (m.phase === 'group' && T.cfg.mode !== 'liga' && T.status !== 'groups' && !reopenGroups(T)) return false;
      m.legs = null; m.winner = null; m.status = 'running'; propagate(T);
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

module.exports = { snapshot, undo, podium, createBlind, nextBlindRound, blindStandings, createLeague, setDoubles, substitute, leagueScore, create, draw, movePlayer, start, standings, qualifiers, buildKO, setResult, resetMatch, schedule, onBoard, boardFreed, assign, unassign, propagate, groupsDone };

})(__mods.tournament = { exports: {} }, undefined, __req);
__mods.tournament = __mods.tournament.exports;
/* core */
(function (module, exports, require) {
// Dart Live – gemeinsamer Kern: läuft im Server (Node) und im Handy (Browser/App ohne Server)
// storage: { load(name) -> Objekt|null, save(name, obj) }
'use strict';
const TN = require('./tournament');

// Erweiterungen: name -> { empty(), act(daten, anfrage, ctx) }
const EXT = {};

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
  // Weitere Daten (Getränke, Anmeldelisten, Vereinsliga …) in einem gemeinsamen Speicher
  let extra = storage.load('extra'); if (!extra || typeof extra !== 'object' || Array.isArray(extra)) extra = {};

  const listeners = [];
  function save() { storage.save('live', state); }
  function saveArchive() { storage.save('matches', archive); }
  function saveResults() { storage.save('results', results); }
  function saveExtra() { storage.save('extra', extra); }

  function backup() {
    const live = JSON.parse(JSON.stringify(state));
    delete live.standings; delete live.leagueScore; delete live.blindTable; delete live.podium;
    return { app: 'Dart Live', format: 1, date: new Date().toISOString(), live: live, matches: archive, results: results, extra: extra };
  }
  function restore(b) {
    if (!b || b.app !== 'Dart Live' || !b.live || !b.live.boards) throw new Error('Das ist keine Dart-Live-Sicherung');
    const v = state.v;
    state = b.live; state.v = Math.max(v, state.v || 0);
    if (!Array.isArray(state.names)) state.names = [];
    for (let i = 1; i <= BOARDS; i++) if (!state.boards[i]) state.boards[i] = { status: 'idle' };
    archive = Array.isArray(b.matches) ? b.matches : [];
    results = Array.isArray(b.results) ? b.results : [];
    extra = b.extra && typeof b.extra === 'object' ? b.extra : {};
    saveArchive(); saveResults(); saveExtra();
  }

  // Tabellen fürs Turnier mitschicken (berechnet, nicht gespeichert)
  function decorate() {
    const T = state.tournament;
    delete state.leagueScore;
    delete state.blindTable;
    delete state.podium;
    if (T && T.type === 'league') { delete state.standings; state.leagueScore = TN.leagueScore(T); return; }
    if (T && T.type === 'blind') { delete state.standings; state.blindTable = TN.blindStandings(T); return; }
    if (!T || T.status === 'setup') { delete state.standings; return; }
    const q = {};
    try { TN.qualifiers(T).forEach(function (x) { q[x.name] = 1; }); } catch (e) { /* noch keine Ergebnisse */ }
    state.standings = {};
    T.groups.forEach(function (g) { state.standings[g.name] = TN.standings(T, g.name).map(function (r) { r.q = !!q[r.name]; return r; }); });
    const pod = TN.podium(T);
    if (pod) state.podium = pod;
  }

  function changed() {
    state.v++;
    decorate();
    listeners.slice().forEach(function (fn) { try { fn(state); } catch (e) { /* egal */ } });
  }

  /* ---------- Turnier-Archiv: beendete Turniere bleiben erhalten ---------- */
  function archiveEntry(T) {
    const ids = {};
    const matches = T.matches.map(function (m) {
      ids[m.id] = 1;
      const c = Object.assign({}, m);
      delete c.board; delete c.live; delete c.assigned; delete c.order;
      return c;
    });
    // Werte von den Tablets (Average, 180er, Highfinish), soweit dort gespielt wurde
    const st = {};
    archive.forEach(function (a) {
      if (!a.tmatch || !ids[a.tmatch] || !a.players) return;
      a.players.forEach(function (p) {
        const s = st[p.name] || (st[p.name] = { name: p.name, sum: 0, darts: 0, c180: 0, c140: 0, c100: 0, hf: 0, legs: 0 });
        s.sum += p.sum || 0; s.darts += p.darts || 0; s.c180 += p.c180 || 0; s.c140 += p.c140 || 0; s.c100 += p.c100 || 0; s.legs += p.legs || 0;
        if ((p.hf || 0) > s.hf) s.hf = p.hf;
      });
    });
    const stats = Object.keys(st).map(function (k) { const s = st[k]; s.avg = s.darts ? Math.round(s.sum / s.darts * 300) / 100 : 0; return s; })
      .sort(function (a, b) { return b.avg - a.avg; });
    const standings = {};
    (T.groups || []).forEach(function (g) { standings[g.name] = TN.standings(T, g.name); });
    return {
      id: T.id, name: T.name, created: T.created, finished: new Date().toISOString(), cfg: T.cfg, players: T.players,
      groups: T.groups, koSeeds: T.koSeeds || null, champion: T.champion, podium: TN.podium(T), standings: standings, matches: matches, stats: stats
    };
  }
  function syncArchive() {
    const T = state.tournament;
    if (!T || T.type || !T.id) return;
    if (!extra.archiv || !Array.isArray(extra.archiv.list)) extra.archiv = { list: [] };
    const list = extra.archiv.list, i = list.findIndex(function (e) { return e.id === T.id; });
    if (T.status === 'done') {
      const e = archiveEntry(T);
      if (i >= 0) { e.finished = list[i].finished; list[i] = e; } else list.unshift(e);
      if (list.length > 200) list.length = 200;
      saveExtra();
    } else if (i >= 0) {
      // Turnier wurde wieder geöffnet (Rückgängig/Korrektur) – kommt nach dem neuen Ende wieder ins Archiv
      list.splice(i, 1); saveExtra();
    }
  }

  function cleanName(n) { return String(n || '').replace(/[<>]/g, '').trim().slice(0, 24); }

  function archiveBoard(n, b) {
    if (!b || !b.mid || !Array.isArray(b.players) || b.players.length !== 2) return;
    const i = archive.findIndex(function (a) { return a.mid === b.mid; });
    if (b.status === 'done') {
      const rec = {
        mid: b.mid, date: new Date().toISOString(), started: b.started || null, board: n, start: b.start, legsToWin: b.legsToWin, doubleOut: b.doubleOut,
        winner: b.winner, tmatch: b.tmatch || null, tlabel: b.tlabel || null, league: b.league || null, doubles: !!b.doubles,
        handicap: !!b.handicap,
        players: b.players.map(function (p) { return { name: p.name, start: p.start || b.start, legs: p.legs, sum: p.sum || 0, darts: p.darts || 0, visits: p.visits || 0, c100: p.c100 || 0, c140: p.c140 || 0, c180: p.c180 || 0, hf: p.hf || 0, bl: p.bl || 0 }; })
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
        try { TN.onBoard(state.tournament, Number(m[1]), b); TN.schedule(state.tournament, state.boards); syncArchive(); }
        catch (e) { /* Turnierfehler nicht an das Tablet melden */ }
      }
      let extChanged = false;
      Object.keys(EXT).forEach(function (k) {
        if (EXT[k].onBoard && extra[k]) { try { EXT[k].onBoard(extra[k], Number(m[1]), b); extChanged = true; } catch (e) { /* egal */ } }
      });
      if (extChanged) saveExtra();
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
          case 'blind': state.tournament = TN.createBlind(q); TN.schedule(state.tournament, state.boards); break;
          case 'delete': state.tournament = null; break;
          default:
            if (!T) throw new Error('Kein Turnier angelegt');
            if (q.action === 'draw') { if (T.status !== 'setup') throw new Error('Turnier läuft bereits'); TN.draw(T); }
            else if (q.action === 'move') TN.movePlayer(T, q.player, q.group);
            else if (q.action === 'start') { TN.start(T); TN.schedule(T, state.boards); }
            else if (q.action === 'result') { const u = TN.snapshot(T, q.id); TN.setResult(T, q.id, q.legs); T.lastAct = u; }
            else if (q.action === 'reset') { const u = TN.snapshot(T, q.id); TN.resetMatch(T, q.id); T.lastAct = u && u.legs ? u : null; }
            else if (q.action === 'undo') TN.undo(T);
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
      try { syncArchive(); } catch (e) { /* Archiv ist Nebensache */ }
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

    if (method === 'GET' && p === '/api/backup') return ok(backup());
    if (method === 'POST' && p === '/api/restore') {
      const b = parse(body);
      try { restore(b); } catch (e) { return bad(e.message); }
      changed(); save();
      return ok({ ok: true, matches: archive.length, results: results.length });
    }

    // Weitere Module (Getränke, Termine, Vereinsliga, Blind-Doppel) melden sich hier an
    m = p.match(/^\/api\/x\/([a-z]+)$/);
    if (m && EXT[m[1]]) {
      if (method === 'GET') return ok(extra[m[1]] || EXT[m[1]].empty());
      const q = parse(body);
      if (!q) return bad('Ungültige Daten');
      const cur = extra[m[1]] || EXT[m[1]].empty();
      let out;
      try { out = EXT[m[1]].act(cur, q, { state: state, archive: archive, TN: TN }); } catch (e) { return bad(e.message); }
      extra[m[1]] = cur; saveExtra(); changed(); save();
      return ok(out || { ok: true, data: cur });
    }

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
      const e2 = storage.load('extra'); if (e2 && typeof e2 === 'object') extra = e2;
      decorate();
    }
  };
}

module.exports = { createCore: createCore, EXT: EXT };

})(__mods.core = { exports: {} }, undefined, __req);
__mods.core = __mods.core.exports;
/* extensions */
(function (module, exports, require) {
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

})(__mods.extensions = { exports: {} }, undefined, __req);
__mods.extensions = __mods.extensions.exports;
/* Ersatz für XMLHttpRequest: /api/... wird direkt im Handy beantwortet, Daten im Gerätespeicher */
var KEYS = { live: 'dl_live', matches: 'dl_matches', results: 'dl_results', extra: 'dl_extra' };
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
window.DartLokal = { aktiv: true, reset: function () { try { localStorage.removeItem(KEYS.live); localStorage.removeItem(KEYS.matches); localStorage.removeItem(KEYS.results); localStorage.removeItem(KEYS.extra); } catch (e) {} } };

})();
