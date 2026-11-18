/* Gemeinsame Dart-Daten für Training, Profil, Bestenliste und Ehrentafel (ES5) */
(function () {
  var M = window.DartMeta = {};

  // Spiel-Schlüssel: [Name, Wertung (max = höher besser, min = weniger besser, sum = Siege zählen), Einheit]
  M.GAMES = {
    jdc: ['JDC Challenge', 'max', 'Pkt.'], atc: ['Around the Clock', 'min', 'Darts'], bobs: ["Bob's 27", 'max', 'Pkt.'],
    checkout: ['Checkout-Training', 'max', 'Checks'], countup: ['Count Up', 'max', 'Pkt.'], cricket: ['Cricket', 'max', 'MPR'],
    killer: ['Swedish Killer', 'sum', 'Siege'], shanghai: ['Shanghai', 'max', 'Pkt.'], halveit: ['Halve It', 'max', 'Pkt.'],
    bermuda: ['Bermuda', 'max', 'Pkt.'], ladder: ['121-Checkout-Leiter', 'max', 'Check'], doubles: ['Doppel-Training', 'max', '%'],
    scoring: ['Triple-Training', 'max', '%'], bull500: ['Bull 500', 'min', 'Darts'], catch40: ['Catch 40', 'max', 'Pkt.'],
    twodart: ['2-Dart-Finishes', 'max', 'Pkt.'], randcheck: ['Zufalls-Checkouts', 'max', 'Pkt.'], beat: ['Beat the Score', 'sum', 'Siege'],
    flow: ['Darts Flow', 'max', 'Treffer'], gotcha: ['Gotcha', 'sum', 'Siege']
  };
  M.name = function (g) { return M.GAMES[g] ? M.GAMES[g][0] : g; };
  M.mode = function (g) { return M.GAMES[g] ? M.GAMES[g][1] : 'max'; };
  M.better = function (g, a, b) { return M.mode(g) === 'min' ? a < b : a > b; };
  M.fmt = function (g, s) {
    if (s == null || isNaN(s)) return '–';
    if (g === 'cricket') return (Math.round(s * 100) / 100).toFixed(2).replace('.', ',');
    if (g === 'doubles' || g === 'scoring') return (Math.round(s * 10) / 10).toFixed(1).replace('.', ',') + ' %';
    if (Math.round(s) !== s) return (Math.round(s * 10) / 10).toFixed(1).replace('.', ',');
    return String(s);
  };

  /* ---------- Kalender ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  M.dayKey = function (d) { d = new Date(d); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  // ISO-Kalenderwoche: Montag–Sonntag; Woche gehört zum Jahr ihres Donnerstags
  M.week = function (d) {
    d = new Date(d); var day = (d.getDay() + 6) % 7;
    var mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day), thu = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 3);
    var jan4 = new Date(thu.getFullYear(), 0, 4), mon1 = new Date(jan4.getFullYear(), 0, 4 - (jan4.getDay() + 6) % 7);
    var w = Math.round((mon - mon1) / 604800000) + 1;
    return { y: thu.getFullYear(), w: w, key: thu.getFullYear() + '-W' + pad(w), mon: mon, sun: new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6), month: thu.getMonth(), monthYear: thu.getFullYear() };
  };
  M.MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  /* ---------- Wochen-Challenge ---------- */
  // Jede Woche ein anderes Spiel mit festen Regeln; nur Spiele über „Challenge spielen“ zählen.
  M.CHALLENGES = [
    { game: 'bobs', label: "Bob's 27", cfg: {} },
    { game: 'countup', label: 'Count Up · 20 Aufnahmen', cfg: { rounds: 20 } },
    { game: 'ladder', label: '121-Checkout-Leiter · 10 Versuche', cfg: { att: 10, lm: '−1 zurück', cdm: { ladder: 9 } } },
    { game: 'atc', label: 'Around the Clock · Single', cfg: { atc: 'Single' } },
    { game: 'doubles', label: 'Doppel-Training · Alle Doppel', cfg: { dbl: 'Alle Doppel' } },
    { game: 'jdc', label: 'JDC Challenge', cfg: {} },
    { game: 'catch40', label: 'Catch 40 · 61–80', cfg: { c40: 20, cdm: { catch40: 6 } } },
    { game: 'halveit', label: 'Halve It', cfg: {} },
    { game: 'flow', label: 'Darts Flow · 10 Runden', cfg: { fr: 10 } },
    { game: 'shanghai', label: 'Shanghai', cfg: {} }
  ];
  var BASE = new Date(2026, 0, 5); // Montag KW 2/2026
  M.challenge = function (d) {
    var wk = M.week(d || new Date()), n = Math.round((wk.mon - BASE) / 604800000);
    var c = M.CHALLENGES[((n % M.CHALLENGES.length) + M.CHALLENGES.length) % M.CHALLENGES.length];
    return { game: c.game, label: c.label, cfg: c.cfg, week: wk };
  };
  // Bestes Ergebnis je Spieler in einer Challenge-Woche
  M.challengeTable = function (results, key) {
    var per = {}, game = null, k, arr = [];
    for (k = 0; k < results.length; k++) {
      var r = results[k]; if (r.ch !== key) continue;
      game = r.game;
      var id = r.name.toLowerCase(), e = per[id];
      if (!e) e = per[id] = { name: r.name, best: r.score, tries: 0 };
      e.tries++;
      if (M.better(r.game, r.score, e.best)) e.best = r.score;
    }
    for (k in per) arr.push(per[k]);
    arr.sort(function (a, b) { return M.mode(game) === 'min' ? a.best - b.best : b.best - a.best; });
    return { game: game, list: arr };
  };
  M.POINTS = [10, 8, 6, 5, 4, 3, 2];
  // Monatswertung: Punkte aus allen Challenge-Wochen, deren Donnerstag im Monat liegt
  M.challengeMonth = function (results, y, m) {
    var weeks = {}, k, tot = {}, arr = [];
    for (k = 0; k < results.length; k++) {
      var r = results[k]; if (!r.ch) continue;
      var wk = M.week(r.date); if (wk.monthYear !== y || wk.month !== m || wk.key !== r.ch) continue;
      weeks[r.ch] = 1;
    }
    for (var key in weeks) {
      var t = M.challengeTable(results, key).list;
      for (var i = 0; i < t.length; i++) {
        var id = t[i].name.toLowerCase(), e = tot[id] || (tot[id] = { name: t[i].name, pts: 0, wins: 0, weeks: 0 });
        e.pts += i < M.POINTS.length ? M.POINTS[i] : 1; e.weeks++; if (i === 0) e.wins++;
      }
    }
    for (k in tot) arr.push(tot[k]);
    arr.sort(function (a, b) { return b.pts - a.pts || b.wins - a.wins; });
    return arr;
  };

  /* ---------- Trainingsbeteiligung ---------- */
  // Ein Trainingstag = ein Tag, an dem jemand ein Spiel am Tablet beendet oder ein Training gespielt hat
  function namesOf(m, p) { return m.doubles ? String(p.name).split(/\s*[\/&+]\s*/) : [p.name]; }
  M.attendance = function (matches, results, year) {
    var per = {}, k, i;
    function add(name, date) {
      name = String(name || '').replace(/^\s+|\s+$/g, ''); if (!name) return;
      var d = new Date(date); if (year && d.getFullYear() !== year) return;
      var id = name.toLowerCase(), e = per[id] || (per[id] = { name: name, days: {}, n: 0, last: null, months: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
      var dk = M.dayKey(d);
      if (!e.days[dk]) { e.days[dk] = 1; e.n++; e.months[d.getMonth()]++; }
      if (!e.last || d > e.last) e.last = d;
    }
    for (k = 0; k < (matches || []).length; k++) {
      var m = matches[k]; if (!m.players) continue;
      for (i = 0; i < m.players.length; i++) { var ns = namesOf(m, m.players[i]); for (var j = 0; j < ns.length; j++) add(ns[j], m.date); }
    }
    for (k = 0; k < (results || []).length; k++) add(results[k].name, results[k].date);
    var arr = []; for (k in per) arr.push(per[k]);
    arr.sort(function (a, b) { return b.n - a.n || (b.last - a.last); });
    return arr;
  };
})();
