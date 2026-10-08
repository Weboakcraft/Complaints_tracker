/* ============================================================
   api.js — one transport for the whole app.

   Writes go out as POST with Content-Type: text/plain, which is a
   "simple request" in CORS terms, so the browser never sends the preflight
   OPTIONS that Apps Script cannot answer. Reads use the same channel.

   Nothing from the business domain is cached in localStorage. The only thing
   kept across a reload is the session token, in sessionStorage.
   ============================================================ */
window.API = (function () {
  'use strict';

  var TOKEN_KEY = 'oakcraft.cms.token';
  var state = { token: null, user: null, permissions: [], master: null };

  try { state.token = sessionStorage.getItem(TOKEN_KEY); } catch (e) { /* private mode */ }

  function live() { return !!(window.CONFIG && CONFIG.API_URL); }

  function setToken(t) {
    state.token = t;
    try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }

  /** Short-lived in-flight de-duplication: identical GET-ish calls share one promise. */
  var inflight = {};

  function call(action, params, opts) {
    params = params || {};
    opts = opts || {};
    var body = Object.assign({ action: action, token: state.token }, params);

    var key = opts.dedupe === false ? null : action + ':' + JSON.stringify(params);
    if (key && inflight[key]) return inflight[key];

    var p = (live() ? sendHttp(body) : window.DEMO.handle(body))
      .then(function (res) {
        if (!res || typeof res !== 'object') throw mkErr('BAD_RESPONSE', 'The server returned an unreadable response.');
        if (res.success === false) {
          var err = mkErr(res.error.code, res.error.message, res.error.details);
          if (err.code === 'SESSION_EXPIRED' || err.code === 'UNAUTHENTICATED') onSessionLost();
          throw err;
        }
        return res;
      })
      .finally(function () { if (key) delete inflight[key]; });

    if (key) inflight[key] = p;
    return p;
  }

  function sendHttp(body) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 60000);
    return fetch(CONFIG.API_URL, {
      method: 'POST',
      // text/plain avoids the CORS preflight Apps Script can't respond to.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      signal: controller.signal
    })
      .then(function (r) {
        if (!r.ok) throw mkErr('HTTP_' + r.status, 'The backend replied with HTTP ' + r.status + '.');
        return r.text();
      })
      .then(function (text) {
        try { return JSON.parse(text); }
        catch (e) {
          throw mkErr('BAD_RESPONSE',
            'The backend did not return JSON. Check that the Web App is deployed with access set to "Anyone".');
        }
      })
      .catch(function (e) {
        if (e && e.name === 'AbortError') throw mkErr('TIMEOUT', 'The request took too long. Please try again.');
        if (e && e.code) throw e;
        throw mkErr('NETWORK', 'Could not reach the backend. Check your connection and the API URL in config.js.');
      })
      .finally(function () { clearTimeout(timer); });
  }

  function mkErr(code, message, details) {
    var e = new Error(message);
    e.code = code;
    e.details = details || null;
    return e;
  }

  var sessionLostHandler = null;
  function onSessionLost() {
    setToken(null);
    state.user = null;
    if (sessionLostHandler) sessionLostHandler();
  }

  /** Read a File into the { name, mimeType, data } shape the upload API expects. */
  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onerror = function () { reject(mkErr('FILE_READ', 'Could not read "' + file.name + '".')); };
      fr.onload = function () {
        resolve({
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          data: String(fr.result).split(',')[1]       // strip the data: prefix
        });
      };
      fr.readAsDataURL(file);
    });
  }

  return {
    get state() { return state; },
    isLive: live,
    isDemo: function () { return !live(); },
    onSessionLost: function (fn) { sessionLostHandler = fn; },
    call: call,
    readFile: readFile,

    login: function (email, password) {
      return call('login', { email: email, password: password }, { dedupe: false })
        .then(function (res) {
          setToken(res.data.token);
          state.user = res.data.user;
          state.permissions = res.data.permissions || [];
          return res.data;
        });
    },

    restore: function () {
      if (!state.token) return Promise.resolve(null);
      return call('me', {}, { dedupe: false })
        .then(function (res) {
          state.user = res.data.user;
          state.permissions = res.data.permissions || [];
          return state.user;
        })
        .catch(function () { setToken(null); return null; });
    },

    logout: function () {
      return call('logout', {}, { dedupe: false })
        .catch(function () {})
        .finally(function () { setToken(null); state.user = null; state.permissions = []; });
    },

    master: function () {
      if (state.master) return Promise.resolve(state.master);
      return call('masterData').then(function (res) { state.master = res.data; return res.data; });
    },

    can: function (perm) {
      var p = state.permissions || [];
      return p.indexOf('*') !== -1 || p.indexOf(perm) !== -1;
    }
  };
})();
