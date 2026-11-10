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

module.exports = { createBlind, nextBlindRound, blindStandings, createLeague, setDoubles, substitute, leagueScore, create, draw, movePlayer, start, standings, qualifiers, buildKO, setResult, resetMatch, schedule, onBoard, boardFreed, assign, unassign, propagate, groupsDone };
