// Dart Live Riedenburg – Server ohne Abhängigkeiten (Node.js 18+)
// Start: node server.js        (Port 3000, ändern mit PORT=8080 node server.js)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

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
function notify() {
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
      state.v++;
      save();
      notify();
      sendJSON(res, 200, { ok: true, v: state.v });
    });
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

server.listen(PORT, '0.0.0.0', function () {
  const ips = [];
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach(function (k) { (nets[k] || []).forEach(function (n) { if (n.family === 'IPv4' && !n.internal) ips.push(n.address); }); });
  console.log('Dart Live läuft auf Port ' + PORT);
  console.log('Tablets:    http://<IP>:' + PORT + '/1  bis  /5');
  console.log('Monitor an Scheibe (nur Spielstand): http://<IP>:' + PORT + '/m1  bis  /m5');
  console.log('Training am Tablet: http://<IP>:' + PORT + '/t1  bis  /t5     Bestenliste: http://<IP>:' + PORT + '/bestenliste');
  console.log('Fernseher:  http://<IP>:' + PORT + '/tv1  (Scheiben 1-3)   /tv2  (Scheiben 4-5)');
  if (ips.length) console.log('Eigene IP(s) hier: ' + ips.join(', ') + '  (am Chromebook gilt die WLAN-IP aus den ChromeOS-Einstellungen)');
});
