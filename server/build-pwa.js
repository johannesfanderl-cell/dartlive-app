// Baut die Trainings-App als Web-App für iPhone/iPad (und jedes Handy): läuft offline, Daten bleiben auf dem Gerät.
// Aufruf:  node build-pwa.js <Zielordner>    (Standard: ./pwa)
'use strict';
const fs = require('fs'), path = require('path');
const out = path.resolve(process.argv[2] || path.join(__dirname, 'pwa'));
const pub = path.join(__dirname, 'public');
fs.mkdirSync(out, { recursive: true });
const ver = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);

let html = fs.readFileSync(path.join(pub, 'training.html'), 'utf8');
const head = [
  '<script>window.DART_PWA = true;</script>',
  '<script src="local-core.js"></script>',
  '<link rel="manifest" href="manifest.webmanifest">',
  '<link rel="apple-touch-icon" href="icon-180.png">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
  '<meta name="apple-mobile-web-app-title" content="Dart Training">'
].join('\n');
if (html.indexOf('<script src="/local.js"></script>') < 0) throw new Error('local.js-Einbindung nicht gefunden');
html = html.replace('<script src="/local.js"></script>', head).replace(/href="\/icon\.svg"/g, 'href="icon.svg"');
html = html.replace('</body>', '<script>if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});</script>\n</body>');
fs.writeFileSync(path.join(out, 'index.html'), html);
for (const f of ['local-core.js', 'icon.svg']) fs.copyFileSync(path.join(pub, f), path.join(out, f));
for (const f of ['icon-180.png', 'icon-512.png']) if (fs.existsSync(path.join(__dirname, 'pwa-icons', f))) fs.copyFileSync(path.join(__dirname, 'pwa-icons', f), path.join(out, f));

fs.writeFileSync(path.join(out, 'manifest.webmanifest'), JSON.stringify({
  name: 'Dart Training – TV Riedenburg', short_name: 'Dart Training', start_url: './', scope: './',
  display: 'standalone', orientation: 'any', background_color: '#071d47', theme_color: '#071d47', lang: 'de',
  icons: [{ src: 'icon-180.png', sizes: '180x180', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }]
}, null, 2));

// Service Worker: alles zwischenspeichern, damit die App ohne Internet startet. Neue Version = neuer Cache-Name.
fs.writeFileSync(path.join(out, 'sw.js'), `var C = 'dart-training-${ver}';
var FILES = ['./', 'index.html', 'local-core.js', 'icon.svg', 'icon-180.png', 'icon-512.png', 'manifest.webmanifest'];
self.addEventListener('install', function (e) { self.skipWaiting(); e.waitUntil(caches.open(C).then(function (c) { return c.addAll(FILES); })); });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (k) { return Promise.all(k.filter(function (n) { return n !== C; }).map(function (n) { return caches.delete(n); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  // Netz zuerst (damit Updates ankommen), sonst Zwischenspeicher
  e.respondWith(fetch(e.request).then(function (r) { var cp = r.clone(); caches.open(C).then(function (c) { c.put(e.request, cp); }); return r; })
    .catch(function () { return caches.match(e.request, { ignoreSearch: true }).then(function (r) { return r || caches.match('index.html'); }); }));
});
`);
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log('Web-App gebaut in ' + out + ' (Version ' + ver + ')');
