/* ============================================================
   app.js — boot, auth gate, hash router, chrome.
   ============================================================ */
(function () {
  'use strict';

  var ROUTES = {
    '/dashboard':  { title: 'Dashboard',          perm: 'dashboard.view', render: function (h, r) { return ViewDashboard.render(h, r); } },
    '/new':        { title: 'Register a complaint', perm: 'complaint.create', render: function (h) { return ViewForm.render(h); } },
    '/complaints': { title: 'Complaints',         perm: null,             render: function (h, r) { return ViewComplaints.render(h, r); } },
    '/analytics':  { title: 'Analytics',          perm: 'dashboard.view', render: function (h, r) { return ViewDashboard.renderAnalytics(h, r); } },
    '/employees':  { title: 'Team',               perm: 'employee.read',  render: function (h) { return ViewAdmin.employees(h); } },
    '/settings':   { title: 'Settings',           perm: null,             render: function (h) { return ViewAdmin.settings(h); } }
  };

  var range = { preset: '30' };

  /* ---------------- theme ---------------- */
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem('oakcraft.theme'); } catch (e) {}
    var theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(theme);
    document.getElementById('themeBtn').addEventListener('click', function () {
      var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem('oakcraft.theme', next); } catch (e) {}
      if (currentRoute()) route();   // re-render so inline chart colours follow
    });
  }
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    var btn = document.getElementById('themeBtn').firstElementChild || document.getElementById('themeBtn');
    document.getElementById('themeBtn').innerHTML = UI.icon(t === 'dark' ? 'sun' : 'moon');
  }

  /* ---------------- date range ---------------- */
  function rangeParams() {
    if (range.preset === 'all') return {};
    var days = Number(range.preset);
    var to = new Date();
    var from = new Date(to.getTime() - (days - 1) * 86400000);
    return { date_from: from.toISOString().slice(0, 10), date_to: to.toISOString().slice(0, 10) };
  }

  /* ---------------- routing ---------------- */
  function currentRoute() {
    var hash = location.hash.replace(/^#/, '') || '/dashboard';
    return ROUTES[hash] ? hash : null;
  }

  function route() {
    var path = currentRoute();
    if (!path) { location.hash = '#/dashboard'; return; }

    var def = ROUTES[path];
    if (def.perm && !API.can(def.perm)) {
      var fallback = API.can('dashboard.view') ? '#/dashboard' : '#/complaints';
      UI.toast('Your role does not have access to that section.', 'error');
      location.hash = fallback;
      return;
    }

    document.getElementById('pageTitle').textContent = def.title;
    document.querySelectorAll('.nav a').forEach(function (a) {
      a.classList.toggle('is-active', a.getAttribute('href') === '#' + path);
    });
    document.getElementById('sidebar').classList.remove('is-open');
    UI.drawer.close();

    var host = document.getElementById('view');
    host.innerHTML = '';
    var dateVisible = path === '/dashboard' || path === '/complaints' || path === '/analytics';
    document.getElementById('dateRange').style.display = dateVisible ? '' : 'none';

    Promise.resolve(def.render(host, rangeParams())).then(function () {
      host.focus({ preventScroll: true });
    });
  }

  /* ---------------- chrome ---------------- */
  function paintUser() {
    var u = API.state.user;
    document.getElementById('whoName').textContent = u.name;
    document.getElementById('whoRole').textContent = u.role + (API.isDemo() ? ' · demo' : '');
    document.getElementById('whoAvatar').textContent = UI.initials(u.name);

    document.querySelectorAll('[data-perm]').forEach(function (el) {
      var p = el.dataset.perm;
      var allowed = p === '*' ? API.can('*') : API.can(p);
      var target = el.tagName === 'A' ? el.parentElement : el;
      target.hidden = !allowed;
    });
  }

  function showApp() {
    document.getElementById('login').hidden = true;
    document.getElementById('app').hidden = false;
    paintUser();
    UI.paintIcons(document);
    route();
  }

  function showLogin(message) {
    document.getElementById('app').hidden = true;
    document.getElementById('login').hidden = false;
    var err = document.getElementById('loginError');
    if (message) { err.textContent = message; err.hidden = false; } else { err.hidden = true; }
  }

  /* ---------------- wiring ---------------- */
  function wire() {
    document.getElementById('loginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = document.getElementById('loginBtn');
      var err = document.getElementById('loginError');
      err.hidden = true;
      btn.disabled = true;
      btn.textContent = 'Signing in…';
      UI.loading(true);

      API.login(document.getElementById('loginEmail').value.trim(),
                document.getElementById('loginPassword').value)
        .then(function () {
          document.getElementById('loginPassword').value = '';
          showApp();
        })
        .catch(function (ex) { err.textContent = ex.message; err.hidden = false; })
        .finally(function () {
          btn.disabled = false;
          btn.textContent = 'Sign in';
          UI.loading(false);
        });
    });

    document.getElementById('logoutBtn').addEventListener('click', function () {
      API.logout().then(function () { showLogin(); location.hash = '#/dashboard'; });
    });

    document.getElementById('quickNew').addEventListener('click', function () { location.hash = '#/new'; });

    document.getElementById('menuBtn').addEventListener('click', function () {
      document.getElementById('sidebar').classList.toggle('is-open');
    });

    document.getElementById('rangePreset').addEventListener('change', function (e) {
      range.preset = e.target.value;
      route();
    });

    document.getElementById('drawer').addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) UI.drawer.close();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') UI.drawer.close();
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        var s = document.querySelector('#fq');
        if (s) { e.preventDefault(); s.focus(); }
      }
    });

    window.addEventListener('hashchange', route);

    API.onSessionLost(function () { showLogin('Your session expired. Please sign in again.'); });
  }

  /* ---------------- boot ---------------- */
  document.addEventListener('DOMContentLoaded', function () {
    UI.paintIcons(document);
    initTheme();
    wire();

    // In live mode the demo helper text would be misleading.
    if (API.isLive()) {
      var demoBox = document.querySelector('.login__demo');
      if (demoBox) demoBox.hidden = true;
    }

    UI.loading(true);
    API.restore()
      .then(function (user) { user ? showApp() : showLogin(); })
      .catch(function () { showLogin(); })
      .finally(function () { UI.loading(false); });
  });
})();
