// Dart Live Riedenburg – Server ohne Abhängigkeiten (Node.js 18+)
// Start: node server.js        (Port 3000, ändern mit PORT=8080 node server.js)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.PORT) || 3000;
const PUB = path.join(__dirname, 'public');
const DATA = path.join(__dirname, 'data');
const { createCore } = require('./core');
const { execFile } = require('child_process');
// Auf dem Raspberry Pi gesetzt (installieren.sh): Server darf die Uhr stellen und sich ausschalten
const PI = process.env.DART_PI === '1';
require('./extensions');

// Daten liegen als JSON-Dateien im Ordner data/
const FILES = { live: 'live.json', matches: 'matches.json', results: 'results.json', extra: 'extra.json' };
const core = createCore({
  load: function (name) { try { return JSON.parse(fs.readFileSync(path.join(DATA, FILES[name]), 'utf8')); } catch (e) { return null; } },
  save: function (name, obj) {
    const f = path.join(DATA, FILES[name]);
    try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(obj)); fs.renameSync(f + '.tmp', f); }
    catch (e) { console.error('Speichern fehlgeschlagen (' + name + '):', e.message); }
  }
});

// Tägliche automatische Sicherung (data/sicherungen, die letzten 30 Tage)
// Ist der Downloads-Ordner des Chromebooks für Linux freigegeben, landet dort zusätzlich eine Kopie.
const BACKUPS = path.join(DATA, 'sicherungen');
function dailyBackup() {
  try {
    const day = new Date().toISOString().slice(0, 10), name = 'dartlive-sicherung-' + day + '.json';
    fs.mkdirSync(BACKUPS, { recursive: true });
    const r = core.handle('GET', '/api/backup', '');
    const txt = JSON.stringify(r.json);
    fs.writeFileSync(path.join(BACKUPS, name), txt);
    const files = fs.readdirSync(BACKUPS).filter(f => /^dartlive-sicherung-.*\.json$/.test(f)).sort();
    while (files.length > 30) fs.unlinkSync(path.join(BACKUPS, files.shift()));
    const dl = '/mnt/chromeos/MyFiles/Downloads';
    if (fs.existsSync(dl)) { fs.mkdirSync(path.join(dl, 'Dart-Sicherungen'), { recursive: true }); fs.writeFileSync(path.join(dl, 'Dart-Sicherungen', name), txt); }
  } catch (e) { console.error('Sicherung fehlgeschlagen:', e.message); }
}
setTimeout(dailyBackup, 5000);
setInterval(dailyBackup, 60 * 60 * 1000);

// Wartende Anzeigen (Long-Polling)
let waiting = [], clockBusy = false;
core.onChange(function (state) {
  const list = waiting; waiting = [];
  list.forEach(function (w) { clearTimeout(w.timer); sendJSON(w.res, 200, state); });
});

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
  '/turnier-tv': 'turnier-tv.html', '/turnier-archiv': 'turnier-archiv.html',
  '/verwaltung': 'verwaltung.html', '/checkliste': 'checkliste.html',
  '/rangliste': 'rangliste.html', '/rangliste-tv': 'rangliste-tv.html',
  '/getraenke': 'getraenke.html', '/sponsoren': 'sponsoren.html', '/sponsoren-tv': 'sponsoren-tv.html', '/kurzanleitung': 'kurzanleitung.html', '/termine': 'termine.html',
  '/vereinsliga': 'vereinsliga.html', '/blind': 'blind.html',
  '/diag': 'diag.html',
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.js': 'application/javascript; charset=utf-8' };

function readBody(req, cb) {
  let size = 0; const chunks = [];
  req.on('data', function (c) { size += c.length; if (size > 20 * 1024 * 1024) { req.destroy(); return; } chunks.push(c); });
  req.on('end', function () { cb(Buffer.concat(chunks).toString('utf8')); });
}


const server = http.createServer(function (req, res) {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'GET' && p === '/api/wait') {
    const v = Number(u.searchParams.get('v')) || 0;
    if (core.version() !== v) return sendJSON(res, 200, core.state());
    const w = { res: res, timer: null };
    // max = höchstens so viele Sekunden warten (Geräte, bei denen lange Verbindungen abbrechen, fragen kürzer)
    const maxWait = Math.max(0, Math.min(25, Number(u.searchParams.get('max') || 25))) * 1000;
    w.timer = setTimeout(function () { waiting = waiting.filter(function (x) { return x !== w; }); sendJSON(res, 200, core.state()); }, maxWait);
    waiting.push(w);
    req.on('close', function () { clearTimeout(w.timer); waiting = waiting.filter(function (x) { return x !== w; }); });
    return;
  }

  // Uhrzeit von Tablets/Fernsehern übernehmen (nur vorstellen, nie zurück – der Pi ohne Internet geht nach)
  if (p === '/api/zeit') {
    const t = Number(u.searchParams.get('t'));
    if (PI && t > 1.7e12 && t - Date.now() > 120000 && t - Date.now() < 5 * 365 * 864e5 && !clockBusy) {
      clockBusy = true;
      execFile('sudo', ['-n', '/usr/bin/date', '-s', '@' + Math.round(t / 1000)], function (err) {
        clockBusy = false;
        if (err) console.error('Uhr stellen fehlgeschlagen:', err.message); else console.log('Uhrzeit vom Gerät übernommen: ' + new Date().toLocaleString('de-DE'));
      });
    }
    return sendJSON(res, 200, { ok: true, server: Date.now() });
  }
  if (p === '/api/system') return sendJSON(res, 200, { pi: PI, uptime: Math.round(os.uptime()), time: Date.now() });
  if (p === '/api/system/aus' && req.method === 'POST') {
    if (!PI) return sendJSON(res, 400, { error: 'Ausschalten geht nur auf dem Raspberry Pi' });
    sendJSON(res, 200, { ok: true });
    try { dailyBackup(); } catch (e) {}
    setTimeout(function () { execFile('sudo', ['-n', '/usr/bin/systemctl', 'poweroff'], function (err) { if (err) console.error('Ausschalten fehlgeschlagen:', err.message); }); }, 1000);
    return;
  }

  if (p.indexOf('/api/') === 0) {
    return readBody(req, function (txt) {
      const r = core.handle(req.method, p, txt);
      sendJSON(res, r.code, r.json);
    });
  }

  const isFile = /^\/(icon\.svg|local\.js|local-core\.js|sponsor\.js)$/.test(p);
  if (req.method === 'GET' && (PAGES[p] || isFile)) {
    const file = PAGES[p] || p.slice(1);
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
  console.log('Turnierleitung: http://<IP>:' + PORT + '/turnier     Turnier am Fernseher: http://<IP>:' + PORT + '/turnier-tv');
  console.log('Liga-Spieltag: http://<IP>:' + PORT + '/liga     am Fernseher: http://<IP>:' + PORT + '/liga-tv');
  console.log('Fernseher:  http://<IP>:' + PORT + '/tv1  (Scheiben 1-3)   /tv2  (Scheiben 4-5)');
  if (ips.length) console.log('Eigene IP(s) hier: ' + ips.join(', ') + '  (am Chromebook gilt die WLAN-IP aus den ChromeOS-Einstellungen)');
});
