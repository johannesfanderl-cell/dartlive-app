// Sponsoren-Anzeige für die Fernseh-Seiten (bewusst einfach gehalten für alte Fernseh-Browser)
(function () {
  var SP = { data: null, rev: null, idx: 0, onChange: null, timer: null };
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  SP.list = function () {
    if (!SP.data || !SP.data.items) return [];
    var out = [];
    for (var i = 0; i < SP.data.items.length; i++) if (SP.data.items[i].on !== false) out.push(SP.data.items[i]);
    return out;
  };
  SP.current = function (offset) { var l = SP.list(); if (!l.length) return null; return l[(SP.idx + (offset || 0)) % l.length]; };
  SP.update = function (rev) {
    if (rev === SP.rev && SP.data) return;
    SP.rev = rev;
    var r = new XMLHttpRequest();
    r.onreadystatechange = function () {
      if (r.readyState !== 4) return;
      try { SP.data = JSON.parse(r.responseText); } catch (e) { return; }
      SP.restart();
      if (SP.onChange) SP.onChange();
    };
    r.open('GET', '/api/x/sponsors?_=' + new Date().getTime(), true); r.send();
  };
  SP.restart = function () {
    if (SP.timer) clearInterval(SP.timer);
    var sec = (SP.data && SP.data.seconds) || 10;
    SP.timer = setInterval(function () { if (SP.list().length > 1) { SP.idx++; if (SP.onChange) SP.onChange(); } }, sec * 1000);
  };
  // Großes Feld (z. B. freie Scheibe oder Diashow)
  SP.slide = function (it, label) {
    if (!it) return '';
    return '<table style="width:100%;height:100%;border-collapse:collapse;background:#ffffff;color:#071d47"><tr><td style="text-align:center;vertical-align:middle;padding:0.4em">' +
      (label ? '<div style="font-size:0.8em;letter-spacing:0.1em;text-transform:uppercase;color:#3f5f99;margin-bottom:0.4em">' + esc(label) + '</div>' : '') +
      (it.img ? '<img src="' + it.img + '" alt="" style="max-width:90%;max-height:55%;display:block;margin:0 auto 0.4em auto">' : '') +
      (it.name ? '<div style="font-size:1.6em;font-weight:bold">' + esc(it.name) + '</div>' : '') +
      (it.text ? '<div style="font-size:1em;margin-top:0.2em">' + esc(it.text) + '</div>' : '') +
      '</td></tr></table>';
  };
  // Schmale Leiste unten
  SP.barOn = function () { return !!(SP.data && SP.data.bar && SP.list().length); };
  SP.bar = function () {
    var it = SP.current();
    if (!it || !SP.barOn()) return '';
    return '<table style="width:100%;height:100%;border-collapse:collapse;background:#ffffff;color:#071d47"><tr>' +
      '<td style="width:1%;white-space:nowrap;padding:0 0.6em;font-size:0.6em;letter-spacing:0.08em;text-transform:uppercase;color:#3f5f99">Mit Unterstützung von</td>' +
      (it.img ? '<td style="width:1%;padding:0.1em 0.4em"><img src="' + it.img + '" alt="" style="height:1.6em;display:block"></td>' : '') +
      '<td style="padding:0 0.4em;white-space:nowrap;overflow:hidden"><b>' + esc(it.name) + '</b>' + (it.text ? ' &middot; ' + esc(it.text) : '') + '</td></tr></table>';
  };
  window.Sponsor = SP;
})();
