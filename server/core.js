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
        try { TN.onBoard(state.tournament, Number(m[1]), b); TN.schedule(state.tournament, state.boards); }
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
