// Betrieb ohne Server: In der App (oder mit ?lokal=1) beantwortet das Gerät alle Anfragen selbst.
(function () {
  var on = false;
  try {
    if (/[?&]lokal=1/.test(location.search)) localStorage.setItem('dartlokal', '1');
    if (/[?&]lokal=0/.test(location.search)) localStorage.removeItem('dartlokal');
    on = !!window.DartLocal || localStorage.getItem('dartlokal') === '1';
  } catch (e) { on = !!window.DartLocal; }
  if (on) { document.write('<script src="/local-core.js"><\/script>'); return; }
  // Uhrzeit an den Server melden: Ein Raspberry Pi im Keller ohne Internet kennt die Uhrzeit sonst nicht.
  try {
    if (/^https?:$/.test(location.protocol)) {
      var r = new XMLHttpRequest();
      r.open('GET', '/api/zeit?t=' + new Date().getTime(), true);
      r.send();
    }
  } catch (e) {}
})();
