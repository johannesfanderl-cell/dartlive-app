// Update ohne Internet: Archiv (GitHub "Download ZIP" oder .tar.gz) über die Verwaltungsseite einspielen.
// Ohne Abhängigkeiten: tar.gz und zip werden hier selbst entpackt (zlib ist in Node eingebaut).
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

function str(buf, a, b) { const s = buf.slice(a, b); const z = s.indexOf(0); return (z >= 0 ? s.slice(0, z) : s).toString('utf8'); }
function oct(buf, a, b) { const t = str(buf, a, b).trim(); return t ? parseInt(t, 8) : 0; }

function parseTar(buf) {
  const out = []; let pos = 0, longName = null, paxPath = null;
  while (pos + 512 <= buf.length) {
    const h = buf.slice(pos, pos + 512);
    if (h.every(function (x) { return x === 0; })) break;
    let name = str(h, 0, 100); const size = oct(h, 124, 136), type = String.fromCharCode(h[156] || 48);
    const prefix = str(h, 345, 500);
    if (prefix && str(h, 257, 262) === 'ustar') name = prefix + '/' + name;
    const data = buf.slice(pos + 512, pos + 512 + size);
    pos += 512 + Math.ceil(size / 512) * 512;
    if (type === 'L') { longName = str(data, 0, data.length); continue; }
    if (type === 'x') { const m = /\d+ path=([^\n]*)\n/.exec(data.toString('utf8')); paxPath = m ? m[1] : null; continue; }
    if (type === 'g') continue;
    if (longName) { name = longName; longName = null; }
    if (paxPath) { name = paxPath; paxPath = null; }
    if (type === '0' || type === '\0' || type === '7') out.push({ name: name, data: data });
  }
  return out;
}

function parseZip(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Die ZIP-Datei ist beschädigt.');
  const count = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16); const out = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Die ZIP-Datei ist beschädigt.');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), loc = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    p += 46 + nlen + xlen + clen;
    if (/\/$/.test(name)) continue;
    const start = loc + 30 + buf.readUInt16LE(loc + 26) + buf.readUInt16LE(loc + 28);
    const raw = buf.slice(start, start + csize);
    let data;
    if (method === 0) data = raw; else if (method === 8) data = zlib.inflateRawSync(raw); else throw new Error('ZIP-Kompression wird nicht unterstützt.');
    out.push({ name: name, data: data });
  }
  return out;
}

function readArchive(buf) {
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) return parseTar(zlib.gunzipSync(buf));
  if (buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50) return parseZip(buf);
  if (buf.length > 262 && buf.slice(257, 262).toString() === 'ustar') return parseTar(buf); // .tar (vom Handy schon entpackt)
  throw new Error('Das ist keine Update-Datei (erwartet: .zip oder .tar.gz von GitHub).');
}

function rmrf(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) {} }
function copyDir(src, dst, skip) {
  fs.mkdirSync(dst, { recursive: true });
  fs.readdirSync(src).forEach(function (n) {
    if (skip && skip.indexOf(n) >= 0) return;
    const s = path.join(src, n), d = path.join(dst, n), st = fs.statSync(s);
    if (st.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  });
}

// Prüft und installiert das Archiv in appDir. Die Daten (data/) bleiben unberührt.
function install(buf, appDir) {
  const entries = readArchive(buf), byName = {};
  entries.forEach(function (x) { byName[x.name] = x; });
  // Programmordner im Archiv finden: dort liegen server.js, core.js und public/tablet.html
  let root = null;
  entries.forEach(function (x) {
    if (!/(^|\/)server\.js$/.test(x.name)) return;
    const r = x.name.slice(0, -'server.js'.length);
    if (byName[r + 'core.js'] && byName[r + 'public/tablet.html'] && (root === null || r.length < root.length)) root = r;
  });
  if (root === null) throw new Error('In der Datei ist kein Dart-Live-Programm enthalten.');
  const files = [];
  entries.forEach(function (x) {
    if (x.name.indexOf(root) !== 0) return;
    const rel = x.name.slice(root.length);
    if (!rel || /(^|\/)\.\.(\/|$)/.test(rel) || /^\//.test(rel) || /^(data|node_modules)(\/|$)/.test(rel)) return;
    files.push({ rel: rel, data: x.data });
  });
  const stage = path.join(appDir, 'data', 'update-neu');
  rmrf(stage);
  files.forEach(function (f) { const t = path.join(stage, f.rel); fs.mkdirSync(path.dirname(t), { recursive: true }); fs.writeFileSync(t, f.data); });
  // Syntax der Server-Dateien prüfen, bevor etwas ersetzt wird
  fs.readdirSync(stage).filter(function (n) { return /\.js$/.test(n); }).forEach(function (n) {
    const r = spawnSync(process.execPath, ['--check', path.join(stage, n)], { encoding: 'utf8' });
    if (r.status !== 0) { rmrf(stage); throw new Error('Fehler in ' + n + ' – Update abgebrochen, nichts wurde geändert.'); }
  });
  let version = '';
  try { version = fs.readFileSync(path.join(stage, 'version.txt'), 'utf8').trim(); } catch (e) {}
  // Bisherige Version aufheben (für „Vorige Version wiederherstellen“)
  const prev = path.join(appDir, 'data', 'vorige-version');
  rmrf(prev);
  copyDir(appDir, prev, ['data', 'node_modules']);
  copyDir(stage, appDir);
  rmrf(stage);
  return { files: files.length, version: version };
}

function rollback(appDir) {
  const prev = path.join(appDir, 'data', 'vorige-version');
  if (!fs.existsSync(path.join(prev, 'server.js'))) throw new Error('Es gibt keine vorige Version.');
  rmrf(path.join(appDir, 'version.txt'));
  copyDir(prev, appDir);
  let version = '';
  try { version = fs.readFileSync(path.join(prev, 'version.txt'), 'utf8').trim(); } catch (e) {}
  return { version: version };
}

function currentVersion(appDir) {
  let v = '', prev = '';
  try { v = fs.readFileSync(path.join(appDir, 'version.txt'), 'utf8').trim(); } catch (e) {}
  try { prev = fs.existsSync(path.join(appDir, 'data', 'vorige-version', 'server.js')) ? (fs.readFileSync(path.join(appDir, 'data', 'vorige-version', 'version.txt'), 'utf8').trim() || 'ältere Version') : ''; } catch (e) { prev = 'ältere Version'; }
  return { version: v, previous: prev };
}

module.exports = { install: install, rollback: rollback, currentVersion: currentVersion, readArchive: readArchive };
