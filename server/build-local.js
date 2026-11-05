// Baut public/local-core.js: Turnier-Logik + Kern + Ersatz für Serveranfragen (Betrieb im Handy ohne Server)
// Aufruf nach Änderungen an core.js oder tournament.js:  node build-local.js
'use strict';
const fs = require('fs'), path = require('path');
const wrap = (name, file) => '/* ' + name + ' */\n(function (module, exports, require) {\n' + fs.readFileSync(path.join(__dirname, file), 'utf8') + '\n})(__mods.' + name + ' = { exports: {} }, undefined, __req);\n__mods.' + name + ' = __mods.' + name + '.exports;\n';
const out = '// AUTOMATISCH ERZEUGT mit build-local.js – nicht von Hand ändern\n(function () {\n"use strict";\nvar __mods = {};\nfunction __req(n) { return n.indexOf("tournament") >= 0 ? __mods.tournament : __mods.core; }\n' +
  wrap('tournament', 'tournament.js') + wrap('core', 'core.js') + fs.readFileSync(path.join(__dirname, 'local-shim.js'), 'utf8') + '\n})();\n';
fs.writeFileSync(path.join(__dirname, 'public', 'local-core.js'), out);
console.log('public/local-core.js geschrieben (' + out.length + ' Zeichen)');
