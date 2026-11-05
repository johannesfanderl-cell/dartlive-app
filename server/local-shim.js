/* Ersatz für XMLHttpRequest: /api/... wird direkt im Handy beantwortet, Daten im Gerätespeicher */
var KEYS = { live: 'dl_live', matches: 'dl_matches', results: 'dl_results' };
var core = __mods.core.createCore({
  load: function (name) { try { var t = window.localStorage.getItem(KEYS[name]); return t ? JSON.parse(t) : null; } catch (e) { return null; } },
  save: function (name, obj) { try { window.localStorage.setItem(KEYS[name], JSON.stringify(obj)); } catch (e) { /* Speicher voll */ } }
});
var RealXHR = window.XMLHttpRequest;
function FakeXHR() { this.readyState = 0; this.status = 0; this.responseText = ''; this.onreadystatechange = null; this.timeout = 0; }
FakeXHR.prototype.open = function (method, url, async) {
  this._m = String(method || 'GET').toUpperCase();
  this._url = new URL(url, location.href);
  this._api = this._url.pathname.indexOf('/api/') === 0;
  if (!this._api) {
    var self = this, r = this._real = new RealXHR();
    r.open(method, url, async !== false);
    r.onreadystatechange = function () {
      self.readyState = r.readyState;
      if (r.readyState === 4) { self.status = r.status; self.responseText = r.responseText; }
      if (self.onreadystatechange) self.onreadystatechange();
    };
  }
  this.readyState = 1;
};
FakeXHR.prototype.setRequestHeader = function (k, v) { if (this._real) this._real.setRequestHeader(k, v); };
FakeXHR.prototype.abort = function () { this._aborted = true; if (this._cancel) this._cancel(); if (this._real) this._real.abort(); };
FakeXHR.prototype.send = function (body) {
  if (this._real) { if (this.timeout) this._real.timeout = this.timeout; return this._real.send(body); }
  var self = this, path = this._url.pathname.replace(/\/+$/, '');
  function finish(r) {
    if (self._aborted) return;
    self.readyState = 4; self.status = r.code; self.responseText = JSON.stringify(r.json);
    if (self.onreadystatechange) self.onreadystatechange();
    if (self.onload) self.onload();
  }
  core.reload();
  if (path === '/api/wait') {
    var v = Number(this._url.searchParams.get('v')) || 0;
    if (core.version() !== v) { setTimeout(function () { finish({ code: 200, json: core.state() }); }, 0); return; }
    var done = false, timer, off;
    var stop = function () { done = true; clearInterval(timer); if (off) off(); };
    var check = function () {
      if (done) return;
      core.reload();
      if (core.version() !== v) { stop(); finish({ code: 200, json: core.state() }); }
    };
    off = core.onChange(function () { setTimeout(check, 0); });
    timer = setInterval(check, 400);   // andere Ansichten (z. B. Monitor) schreiben in denselben Speicher
    setTimeout(function () { if (!done) { stop(); finish({ code: 200, json: core.state() }); } }, 20000);
    this._cancel = stop;
    return;
  }
  var r = core.handle(this._m, path, body || '');
  setTimeout(function () { finish(r); }, 0);
};
window.XMLHttpRequest = FakeXHR;
window.DartLokal = { aktiv: true, reset: function () { try { localStorage.removeItem(KEYS.live); localStorage.removeItem(KEYS.matches); localStorage.removeItem(KEYS.results); } catch (e) {} } };
