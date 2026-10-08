/* ============================================================
   ui.js — DOM helpers, formatting, icons, toasts, drawer.
   ============================================================ */
window.UI = (function () {
  'use strict';

  var ICONS = {
    chart:'<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6" rx="1"/><rect x="12" y="7" width="3" height="10" rx="1"/><rect x="17" y="13" width="3" height="4" rx="1"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    list:'<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    pie:'<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M21 12a9 9 0 0 0-9-9"/>',
    people:'<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.5a3.2 3.2 0 0 1 0 6"/><path d="M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
    cog:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
    menu:'<path d="M3 6h18M3 12h18M3 18h18"/>',
    x:'<path d="M18 6 6 18M6 6l12 12"/>',
    moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    file:'<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/>',
    download:'<path d="M12 3v12M7 11l5 5 5-5M4 20h16"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    check:'<path d="m4 12 5 5L20 6"/>'
  };

  function icon(name) {
    var d = ICONS[name];
    if (!d) return '';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
           'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  }

  function paintIcons(root) {
    (root || document).querySelectorAll('[data-ico]').forEach(function (el) {
      if (el.dataset.painted === el.dataset.ico) return;
      el.innerHTML = icon(el.dataset.ico);
      el.dataset.painted = el.dataset.ico;
    });
  }

  /* ---------- escaping ---------- */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------- formatting ---------- */
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function fmtDate(v) {
    if (!v) return '—';
    var d = new Date(v);
    if (isNaN(d)) return String(v);
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }
  function fmtDateTime(v) {
    if (!v) return '—';
    var d = new Date(v);
    if (isNaN(d)) return String(v);
    var h = d.getHours(), m = String(d.getMinutes()).padStart(2, '0');
    var ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return fmtDate(d) + ' · ' + h + ':' + m + ' ' + ap;
  }
  function fmtNum(n) {
    if (n === null || n === undefined || n === '') return '—';
    return Number(n).toLocaleString('en-IN');
  }
  function fmtMoney(n) {
    if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '—';
    return (CONFIG.CURRENCY || '₹') + Number(n).toLocaleString('en-IN');
  }
  function fmtHours(h) {
    if (h === null || h === undefined || h === '' || isNaN(Number(h))) return '—';
    h = Number(h);
    if (h < 24) return h.toFixed(1).replace(/\.0$/, '') + ' h';
    var d = Math.floor(h / 24), rem = Math.round(h % 24);
    return d + 'd' + (rem ? ' ' + rem + 'h' : '');
  }
  function fmtBytes(b) {
    if (!b) return '';
    var u = ['B','KB','MB','GB'], i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return (i ? b.toFixed(1) : b) + ' ' + u[i];
  }
  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2)
      .map(function (w) { return w[0]; }).join('').toUpperCase();
  }
  function relative(v) {
    var diff = (Date.now() - new Date(v)) / 1000;
    if (diff < 90) return 'just now';
    if (diff < 3600) return Math.round(diff / 60) + ' min ago';
    if (diff < 86400) return Math.round(diff / 3600) + ' h ago';
    var d = Math.round(diff / 86400);
    return d + (d === 1 ? ' day ago' : ' days ago');
  }

  /* ---------- status colours ---------- */
  var STATUS_TONE = {
    'Registered':'blue', 'Under Verification':'blue', 'Warranty Check':'violet',
    'Awaiting Payment':'amber', 'Payment Verification':'amber', 'Assigned':'violet',
    'In Progress':'amber', 'Resolved':'green', 'Awaiting Customer Confirmation':'blue',
    'Closed':'green', 'Rejected':'clay'
  };
  var WARRANTY_TONE = { 'Under Warranty':'green', 'Out of Warranty':'clay', 'Pending Verification':'grey' };
  var PAYMENT_TONE  = { 'Not Required':'grey', 'Pending':'amber', 'Collected':'blue', 'Verified':'green', 'Failed':'clay', 'Refunded':'violet' };
  var PRIORITY_TONE = { 'Low':'grey', 'Medium':'blue', 'High':'amber', 'Critical':'clay' };

  function badge(text, tone) {
    if (!text) return '<span class="muted">—</span>';
    return '<span class="badge badge--' + (tone || 'grey') + '">' + esc(text) + '</span>';
  }
  var statusBadge   = function (s) { return badge(s, STATUS_TONE[s]); };
  var warrantyBadge = function (s) { return badge(s, WARRANTY_TONE[s]); };
  var paymentBadge  = function (s) { return badge(s, PAYMENT_TONE[s]); };
  var priorityBadge = function (s) { return badge(s, PRIORITY_TONE[s]); };

  /* ---------- SLA ---------- */
  function isOverdue(c) {
    if (!c.is_open) return false;
    var target = (CONFIG.SLA_HOURS || {})[c.priority] || 72;
    return Number(c.age_hours || 0) > target;
  }

  /* ---------- toasts ---------- */
  function toast(message, kind) {
    var host = document.getElementById('toasts');
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' toast--' + kind : '');
    el.textContent = message;
    host.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s, transform .25s';
      el.style.opacity = '0';
      el.style.transform = 'translateX(14px)';
      setTimeout(function () { el.remove(); }, 260);
    }, kind === 'error' ? 6000 : 3600);
  }

  /* ---------- global loading bar ---------- */
  var busy = 0;
  function loading(on) {
    busy = Math.max(0, busy + (on ? 1 : -1));
    document.getElementById('loader').hidden = busy === 0;
  }

  /* ---------- drawer ---------- */
  var drawer = {
    open: function (title, eyebrow, html) {
      var d = document.getElementById('drawer');
      document.getElementById('drawerTitle').textContent = title;
      document.getElementById('drawerEyebrow').textContent = eyebrow || 'Complaint';
      document.getElementById('drawerBody').innerHTML = html;
      d.hidden = false;
      document.body.style.overflow = 'hidden';
      paintIcons(d);
      d.querySelector('.drawer__panel').scrollTop = 0;
    },
    setBody: function (html) {
      var b = document.getElementById('drawerBody');
      b.innerHTML = html;
      paintIcons(b);
    },
    close: function () {
      document.getElementById('drawer').hidden = true;
      document.body.style.overflow = '';
    },
    get body() { return document.getElementById('drawerBody'); }
  };

  /* ---------- misc ---------- */
  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 260);
    };
  }

  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function options(list, selected, placeholder) {
    var out = placeholder ? '<option value="">' + esc(placeholder) + '</option>' : '';
    (list || []).forEach(function (v) {
      var value = typeof v === 'string' ? v : v.value;
      var label = typeof v === 'string' ? v : v.label;
      out += '<option value="' + esc(value) + '"' + (String(selected) === String(value) ? ' selected' : '') + '>' + esc(label) + '</option>';
    });
    return out;
  }

  function downloadCsv(filename, rows) {
    var csv = rows.map(function (r) {
      return r.map(function (cell) {
        var s = cell === null || cell === undefined ? '' : String(cell);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\r\n');
    // BOM so Excel reads ₹ and other UTF-8 correctly.
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }

  function skeleton(rows) {
    var out = '';
    for (var i = 0; i < (rows || 4); i++) {
      out += '<div class="skeleton" style="height:58px;margin-bottom:10px"></div>';
    }
    return out;
  }

  return {
    icon: icon, paintIcons: paintIcons, esc: esc, el: el, options: options,
    fmtDate: fmtDate, fmtDateTime: fmtDateTime, fmtNum: fmtNum, fmtMoney: fmtMoney,
    fmtHours: fmtHours, fmtBytes: fmtBytes, initials: initials, relative: relative,
    badge: badge, statusBadge: statusBadge, warrantyBadge: warrantyBadge,
    paymentBadge: paymentBadge, priorityBadge: priorityBadge, isOverdue: isOverdue,
    toast: toast, loading: loading, drawer: drawer, debounce: debounce,
    downloadCsv: downloadCsv, skeleton: skeleton,
    STATUS_TONE: STATUS_TONE
  };
})();
