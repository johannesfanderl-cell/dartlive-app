// Dart Live Riedenburg – Server ohne Abhängigkeiten (Node.js 18+)
// Start: node server.js        (Port 3000, ändern mit PORT=8080 node server.js)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const TN = require('./tournament');

const PORT = Number(process.env.PORT) || 3000;
const BOARDS = 5;
const PUB = path.join(__dirname, 'public');
const DATA = path.join(__dirname, 'data');
const FILE = path.join(DATA, 'live.json');
const RFILE = path.join(DATA, 'results.json');

function emptyState() {
  const boards = {};
  for (let i = 1; i <= BOARDS; i++) boards[i] = { status: 'idle' };
  return { v: 1, boards: boards, names: [] };
}

let state = emptyState();
try {
  const s = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  if (s && s.boards) { state = s; for (let i = 1; i <= BOARDS; i++) if (!state.boards[i]) state.boards[i] = { status: 'idle' }; if (!Array.isArray(state.names)) state.names = []; }
} catch (e) { /* noch keine Datei */ }

// Archiv beendeter Spiele (für Statistiken)
const MFILE = path.join(DATA, 'matches.json');
let archive = [];
try { archive = JSON.parse(fs.readFileSync(MFILE, 'utf8')); if (!Array.isArray(archive)) archive = []; } catch (e) { archive = []; }
function saveArchive() {
  try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(MFILE + '.tmp', JSON.stringify(archive)); fs.renameSync(MFILE + '.tmp', MFILE); }
  catch (e) { console.error('Archiv speichern fehlgeschlagen:', e.message); }
}
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
    // Rückgängig nach Spielende: Eintrag wieder entfernen
    archive.splice(i, 1); saveArchive();
  }
}

let results = [];
try { results = JSON.parse(fs.readFileSync(RFILE, 'utf8')); if (!Array.isArray(results)) results = []; } catch (e) { results = []; }
function saveResults() {
  try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(RFILE + '.tmp', JSON.stringify(results)); fs.renameSync(RFILE + '.tmp', RFILE); }
  catch (e) { console.error('Ergebnisse speichern fehlgeschlagen:', e.message); }
}

function save() {
  try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(FILE + '.tmp', JSON.stringify(state)); fs.renameSync(FILE + '.tmp', FILE); }
  catch (e) { console.error('Speichern fehlgeschlagen:', e.message); }
}

// Wartende Anzeigen (Long-Polling)
let waiting = [];
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

function notify() {
  decorate();
  const list = waiting; waiting = [];
  list.forEach(function (w) { clearTimeout(w.timer); sendJSON(w.res, 200, state); });
}

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

const PAGES = {
  '/': 'index.html', '/index.html': 'index.html',
  '/1': 'tablet.html', '/2': 'tablet.html', '/3': 'tablet.html', '/4': 'tablet.html', '/5': 'tablet.html',
  '/tv': 'tv.html', '/tv1': 'tv.html', '/tv2': 'tv.html', '/tv3': 'tv.html',
  '/m1': 'tv.html', '/m2': 'tv.html', '/m3': 'tv.html', '/m4': 'tv.html', '/m5': 'tv.html',
  '/t1': 'training.html', '/t2': 'training.html', '/t3': 'training.html', '/t4': 'training.html', '/t5': 'training.html',
  '/bestenliste': 'best.html',
  '/turnier': 'turnier.html',
  '/statistik': 'statistik.html',
  '/liga': 'liga.html',
  '/liga-tv': 'liga-tv.html',
  '/liga-bericht': 'liga-bericht.html',
  '/statistik-tv': 'statistik-tv.html',
  '/turnier-tv': 'turnier-tv.html',
  '/diag': 'diag.html',
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml' };

function readBody(req, cb) {
  let size = 0; const chunks = [];
  req.on('data', function (c) { size += c.length; if (size > 50000) { req.destroy(); return; } chunks.push(c); });
  req.on('end', function () { cb(Buffer.concat(chunks).toString('utf8')); });
}

function cleanName(n) { return String(n || '').replace(/[<>]/g, '').trim().slice(0, 24); }

const server = http.createServer(function (req, res) {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'GET' && p === '/api/state') return sendJSON(res, 200, state);

  if (req.method === 'GET' && p === '/api/wait') {
    const v = Number(u.searchParams.get('v')) || 0;
    if (state.v !== v) return sendJSON(res, 200, state);
    const w = { res: res, timer: null };
    w.timer = setTimeout(function () { waiting = waiting.filter(function (x) { return x !== w; }); sendJSON(res, 200, state); }, 25000);
    waiting.push(w);
    req.on('close', function () { clearTimeout(w.timer); waiting = waiting.filter(function (x) { return x !== w; }); });
    return;
  }

  const m = p.match(/^\/api\/board\/([1-5])$/);
  if (m && (req.method === 'PUT' || req.method === 'POST')) {
    return readBody(req, function (txt) {
      let b;
      try { b = JSON.parse(txt); } catch (e) { return sendJSON(res, 400, { error: 'Ungültige Daten' }); }
      if (!b || typeof b !== 'object' || Array.isArray(b)) return sendJSON(res, 400, { error: 'Ungültige Daten' });
      if (b.players && Array.isArray(b.players)) {
        b.players.forEach(function (pl) {
          pl.name = cleanName(pl.name);
          if ((b.status === 'play' || b.status === 'training') && pl.name) {
            state.names = [pl.name].concat(state.names.filter(function (n) { return n.toLowerCase() !== pl.name.toLowerCase(); })).slice(0, 40);
          }
        });
      }
      state.boards[m[1]] = b;
      archiveBoard(Number(m[1]), b);
      if (state.tournament) {
        try { TN.onBoard(state.tournament, Number(m[1]), b); TN.schedule(state.tournament, state.boards); }
        catch (e) { console.error('Turnier:', e.message); }
      }
      state.v++;
      save();
      notify();
      sendJSON(res, 200, { ok: true, v: state.v });
    });
  }

  if (req.method === 'POST' && p === '/api/turnier') {
    return readBody(req, function (txt) {
      let q;
      try { q = JSON.parse(txt); } catch (e) { return sendJSON(res, 400, { error: 'Ungültige Daten' }); }
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
            else if (q.action === 'unassign') { TN.unassign(T, q.id); }
            else if (q.action === 'boards') { T.cfg.boards = (q.boards || []).map(Number).filter(n => n >= 1 && n <= 5); TN.schedule(T, state.boards); }
            else if (q.action === 'schedule') TN.schedule(T, state.boards);
            else if (q.action === 'doubles') { TN.setDoubles(T, q.no, q.hp, q.gp); TN.schedule(T, state.boards); }
            else if (q.action === 'sub') { TN.substitute(T, q.team, q.slot, q.name, q.nr, q.fromNo); TN.schedule(T, state.boards); }
            else if (q.action === 'notes') { T.notes = String(q.notes || '').slice(0, 2000); }
            else throw new Error('Unbekannte Aktion');
        }
      } catch (e) { return sendJSON(res, 400, { error: e.message }); }
      state.v++; save(); notify();
      sendJSON(res, 200, { ok: true, tournament: state.tournament });
    });
  }

  if (req.method === 'GET' && p === '/api/matches') return sendJSON(res, 200, { matches: archive });

  const dm = p.match(/^\/api\/matches\/([a-z0-9]+)$/);
  if (dm && req.method === 'DELETE') {
    archive = archive.filter(function (a) { return a.mid !== dm[1]; }); saveArchive(); state.v++; notify();
    return sendJSON(res, 200, { ok: true });
  }

  if (req.method === 'GET' && p === '/api/results') return sendJSON(res, 200, { results: results });

  if (req.method === 'POST' && p === '/api/results') {
    return readBody(req, function (txt) {
      let list;
      try { list = JSON.parse(txt); } catch (e) { return sendJSON(res, 400, { error: 'Ungültige Daten' }); }
      if (!Array.isArray(list)) list = [list];
      const now = new Date().toISOString();
      const ids = [];
      list.slice(0, 10).forEach(function (r) {
        if (!r || typeof r !== 'object') return;
        const name = cleanName(r.name), game = String(r.game || '').slice(0, 20);
        const score = Number(r.score);
        if (!name || !game || !isFinite(score)) return;
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        ids.push(id);
        results.push({ id: id, name: name, game: game,
          variant: String(r.variant || '').slice(0, 40), score: score, detail: String(r.detail || '').slice(0, 120), date: now });
      });
      if (results.length > 5000) results = results.slice(-5000);
      saveResults();
      state.v++; notify();
      sendJSON(res, 200, { ok: true, ids: ids });
    });
  }

  const rd = p.match(/^\/api\/results\/([a-z0-9]+)$/);
  if (rd && req.method === 'DELETE') {
    const before = results.length;
    results = results.filter(function (r) { return r.id !== rd[1]; });
    if (results.length !== before) { saveResults(); state.v++; notify(); }
    return sendJSON(res, 200, { ok: true });
  }

  if (req.method === 'DELETE' && p === '/api/names') { state.names = []; state.v++; save(); notify(); return sendJSON(res, 200, { ok: true }); }

  if (req.method === 'GET' && (PAGES[p] || p === '/icon.svg')) {
    const file = PAGES[p] || 'icon.svg';
    return fs.readFile(path.join(PUB, file), function (err, data) {
      if (err) { res.writeHead(404); return res.end('Nicht gefunden'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Nicht gefunden');
});

decorate();
server.listen(PORT, '0.0.0.0', function () {
  const ips = [];
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach(function (k) { (nets[k] || []).forEach(function (n) { if (n.family === 'IPv4' && !n.internal) ips.push(n.address); }); });
  console.log('Dart Live läuft auf Port ' + PORT);
  console.log('Tablets:    http://<IP>:' + PORT + '/1  bis  /5');
  console.log('Monitor an Scheibe (nur Spielstand): http://<IP>:' + PORT + '/m1  bis  /m5');
  console.log('Training am Tablet: http://<IP>:' + PORT + '/t1  bis  /t5     Bestenliste: http://<IP>:' + PORT + '/bestenliste');
  console.log('Turnierleitung: http://<IP>:' + PORT + '/turnier     Turnier am Fernseher: http://<IP>:' + PORT + '/turnier-tv');
  console.log('Liga-Spieltag: http://<IP>:' + PORT + '/liga     am Fernseher: http://<IP>:' + PORT + '/liga-tv');
  console.log('Fernseher:  http://<IP>:' + PORT + '/tv1  (Scheiben 1-3)   /tv2  (Scheiben 4-5)');
  if (ips.length) console.log('Eigene IP(s) hier: ' + ips.join(', ') + '  (am Chromebook gilt die WLAN-IP aus den ChromeOS-Einstellungen)');
});
