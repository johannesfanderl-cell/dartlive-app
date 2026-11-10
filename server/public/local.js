// Betrieb ohne Server: In der App (oder mit ?lokal=1) beantwortet das Gerät alle Anfragen selbst.
(function () {
  var on = false;
  try {
    if (/[?&]lokal=1/.test(location.search)) localStorage.setItem('dartlokal', '1');
    if (/[?&]lokal=0/.test(location.search)) localStorage.removeItem('dartlokal');
    on = !!window.DartLocal || localStorage.getItem('dartlokal') === '1';
  } catch (e) { on = !!window.DartLocal; }
  if (on) { document.write('<script src="/local-core.js"><\/script>'); return; }
  // Lange Warte-Verbindungen (/api/wait) brechen bei manchen Netzen ab (z. B. Portweiterleitung am Chromebook).
  // Dann automatisch kürzer warten: 25 s -> 5 s -> 1 s. Gilt für alle Seiten.
  try {
    var steps = [25, 5, 1], key = 'dl_wait_step', step = 0;
    try { step = Number(sessionStorage.getItem(key)) || 0; } catch (e) {}
    var XO = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (m, url) {
      if (typeof url === 'string' && url.indexOf('/api/wait') >= 0 && url.indexOf('max=') < 0) {
        var x = this, sent = new Date().getTime();
        url += (url.indexOf('?') < 0 ? '?' : '&') + 'max=' + steps[step];
        arguments[1] = url;
        if (x.addEventListener) x.addEventListener('loadend', function () {
          if (x.status === 200 || step >= steps.length - 1) return;
          if (new Date().getTime() - sent < 2000 && x.status !== 0) return;
          step++;
          try { sessionStorage.setItem(key, String(step)); } catch (e) {}
        });
      }
      return XO.apply(this, arguments);
    };
  } catch (e) {}
  // Uhrzeit an den Server melden: Ein Raspberry Pi im Keller ohne Internet kennt die Uhrzeit sonst nicht.
  try {
    if (/^https?:$/.test(location.protocol)) {
      var r = new XMLHttpRequest();
      r.open('GET', '/api/zeit?t=' + new Date().getTime(), true);
      r.send();
    }
  } catch (e) {}
})();
