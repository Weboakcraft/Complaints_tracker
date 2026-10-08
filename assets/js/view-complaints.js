/* ============================================================
   view-complaints.js — the complaint register table and the
   detail drawer (overview, timeline, workflow actions, payments).
   ============================================================ */
window.ViewComplaints = (function () {
  'use strict';

  var state = {
    filters: {}, page: 1, sort_by: 'created_at', sort_dir: 'desc',
    rows: [], meta: {}, master: null, current: null, tab: 'overview'
  };

  var COLUMNS = [
    { key: 'complaint_id', label: 'Complaint ID' },
    { key: 'created_at', label: 'Registered' },
    { key: 'customer_name', label: 'Customer' },
    { key: 'customer_mobile', label: 'Mobile' },
    { key: 'order_number', label: 'Order' },
    { key: 'chair_type', label: 'Chair type' },
    { key: 'purchase_source', label: 'Source' },
    { key: 'complaint_type', label: 'Issue' },
    { key: 'warranty_status', label: 'Warranty' },
    { key: 'payment_status', label: 'Payment' },
    { key: 'assigned_to', label: 'Assigned' },
    { key: 'status', label: 'Status' },
    { key: 'tat_hours', label: 'TAT' },
    { key: 'payment_collected', label: 'Collected' }
  ];

  /* ------------------------------------------------------------------ */
  function render(host, range) {
    state.filters.date_from = range.date_from;
    state.filters.date_to = range.date_to;

    host.innerHTML =
      '<div class="toolbar" id="cmpToolbar">' +
        '<input type="search" id="fq" placeholder="Search ID, customer, mobile, order…" value="' + UI.esc(state.filters.q || '') + '">' +
        '<select id="fstatus"></select>' +
        '<select id="fsource"></select>' +
        '<select id="fwarranty"></select>' +
        '<select id="femployee"></select>' +
        '<select id="fchair"></select>' +
        '<label class="radio" style="padding:7px 11px"><input type="checkbox" id="fpending"><span>Open only</span></label>' +
        '<button class="btn btn--ghost btn--sm" id="fclear">Clear</button>' +
        '<span style="flex:1"></span>' +
        '<button class="btn btn--ghost btn--sm" id="fexport"><span data-ico="download"></span>Export CSV</button>' +
      '</div>' +
      '<div class="chipbar" id="chips"></div>' +
      '<div id="tableHost">' + UI.skeleton(6) + '</div>' +
      '<div class="pager" id="pager"></div>';

    UI.paintIcons(host);

    return API.master().then(function (m) {
      state.master = m;
      fillSelect('fstatus', m.statuses, 'All statuses', state.filters.status);
      fillSelect('fsource', m.purchase_sources, 'All sources', state.filters.purchase_source);
      fillSelect('fwarranty', m.warranty_statuses, 'All warranty states', state.filters.warranty_status);
      fillSelect('fchair', m.chair_types, 'All chair types', state.filters.chair_type);
      fillSelect('femployee', m.employees.map(function (e) { return { value: e.email, label: e.name }; }),
                 'All employees', state.filters.assigned_to);
      document.getElementById('fpending').checked = !!state.filters.pending_only;
      wireToolbar();
      return load();
    });
  }

  function fillSelect(id, list, placeholder, selected) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = UI.options(list, selected, placeholder);
  }

  function wireToolbar() {
    var q = document.getElementById('fq');
    q.addEventListener('input', UI.debounce(function () {
      state.filters.q = q.value.trim() || undefined;
      state.page = 1; load();
    }, 300));

    bindFilter('fstatus', 'status');
    bindFilter('fsource', 'purchase_source');
    bindFilter('fwarranty', 'warranty_status');
    bindFilter('femployee', 'assigned_to');
    bindFilter('fchair', 'chair_type');

    document.getElementById('fpending').addEventListener('change', function (e) {
      state.filters.pending_only = e.target.checked || undefined;
      state.page = 1; load();
    });
    document.getElementById('fclear').addEventListener('click', function () {
      var keep = { date_from: state.filters.date_from, date_to: state.filters.date_to };
      state.filters = keep;
      state.page = 1;
      document.getElementById('fq').value = '';
      ['fstatus','fsource','fwarranty','femployee','fchair'].forEach(function (id) {
        document.getElementById(id).value = '';
      });
      document.getElementById('fpending').checked = false;
      load();
    });
    document.getElementById('fexport').addEventListener('click', exportCsv);
  }

  function bindFilter(id, key) {
    var el = document.getElementById(id);
    el.addEventListener('change', function () {
      state.filters[key] = el.value || undefined;
      state.page = 1; load();
    });
  }

  /* ------------------------------------------------------------------ */
  function load() {
    UI.loading(true);
    return API.call('listComplaints', {
      filters: state.filters, page: state.page,
      page_size: CONFIG.PAGE_SIZE, sort_by: state.sort_by, sort_dir: state.sort_dir
    }).then(function (res) {
      state.rows = res.data;
      state.meta = res.meta;
      paintTable();
      paintChips();
      paintPager();
    }).catch(function (e) {
      document.getElementById('tableHost').innerHTML =
        '<div class="alert alert--error">' + UI.esc(e.message) + '</div>';
    }).finally(function () { UI.loading(false); });
  }

  function paintTable() {
    var host = document.getElementById('tableHost');
    if (!state.rows.length) {
      host.innerHTML = '<div class="card"><div class="empty">' +
        '<h3>No complaints match these filters</h3>' +
        '<p>Try clearing a filter or widening the date range.</p></div></div>';
      return;
    }

    var head = COLUMNS.map(function (c) {
      var cls = state.sort_by === c.key ? (state.sort_dir === 'asc' ? 'sort-asc' : 'sort-desc') : '';
      return '<th data-sort="' + c.key + '" class="' + cls + '">' + c.label + '</th>';
    }).join('') + '<th></th>';

    var body = state.rows.map(function (r) {
      return '<tr class="' + (UI.isOverdue(r) ? 'is-overdue' : '') + '" data-id="' + UI.esc(r.complaint_id) + '">' +
        '<td class="cid">' + UI.esc(r.complaint_id) + '</td>' +
        '<td>' + UI.fmtDate(r.created_at) + '<br><small class="muted">' + UI.relative(r.created_at) + '</small></td>' +
        '<td><strong>' + UI.esc(r.customer_name) + '</strong></td>' +
        '<td class="muted">' + UI.esc(r.customer_mobile) + '</td>' +
        '<td class="muted">' + UI.esc(r.order_number) + '</td>' +
        '<td><span class="truncate" title="' + UI.esc(r.chair_type) + '">' + UI.esc(r.chair_type) + '</span></td>' +
        '<td><span class="truncate" title="' + UI.esc(r.purchase_source) + '">' + UI.esc(shortSource(r.purchase_source)) + '</span></td>' +
        '<td><span class="truncate" title="' + UI.esc(r.complaint_type) + '">' + UI.esc(r.complaint_type) + '</span></td>' +
        '<td>' + UI.warrantyBadge(r.warranty_status) + '</td>' +
        '<td>' + UI.paymentBadge(r.payment_status) + '</td>' +
        '<td class="muted">' + UI.esc(nameFor(r.assigned_to)) + '</td>' +
        '<td>' + UI.statusBadge(r.status) + '</td>' +
        '<td class="num">' + UI.fmtHours(r.is_open ? r.age_hours : r.tat_hours) +
          (UI.isOverdue(r) ? '<br><small style="color:var(--clay)">over SLA</small>' : '') + '</td>' +
        '<td class="num">' + (Number(r.payment_collected) ? UI.fmtMoney(r.payment_collected) : '<span class="muted">—</span>') + '</td>' +
        '<td><button class="btn btn--sm btn--ghost" data-view="' + UI.esc(r.complaint_id) + '">View</button></td>' +
      '</tr>';
    }).join('');

    host.innerHTML = '<div class="tablewrap"><table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';

    host.querySelectorAll('th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var key = th.dataset.sort;
        if (state.sort_by === key) state.sort_dir = state.sort_dir === 'asc' ? 'desc' : 'asc';
        else { state.sort_by = key; state.sort_dir = 'desc'; }
        load();
      });
    });
    host.querySelectorAll('[data-view]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); openDetail(b.dataset.view); });
    });
    host.querySelectorAll('tbody tr').forEach(function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.dataset.id); });
    });
  }

  function shortSource(s) {
    return String(s || '')
      .replace('Third-Party Retailer (', '').replace(')', '')
      .replace('Company Website/Online Store', 'Website')
      .replace('Physical Retail Store (Our Brand', 'Retail store');
  }

  function nameFor(email) {
    if (!email) return 'Unassigned';
    var m = (state.master && state.master.employees) || [];
    for (var i = 0; i < m.length; i++) if (m[i].email === email) return m[i].name;
    return email;
  }

  function paintChips() {
    var host = document.getElementById('chips');
    if (!host) return;
    var labels = {
      q: 'Search', status: 'Status', purchase_source: 'Source', warranty_status: 'Warranty',
      assigned_to: 'Employee', chair_type: 'Chair', complaint_type: 'Issue',
      payment_status: 'Payment', pending_only: 'Open only'
    };
    var chips = Object.keys(labels).filter(function (k) { return state.filters[k]; }).map(function (k) {
      var v = k === 'pending_only' ? 'yes' : (k === 'assigned_to' ? nameFor(state.filters[k]) : state.filters[k]);
      return '<span class="chip">' + labels[k] + ': ' + UI.esc(v) +
             '<button data-drop="' + k + '" aria-label="Remove filter">×</button></span>';
    });
    host.innerHTML = chips.join('');
    host.querySelectorAll('[data-drop]').forEach(function (b) {
      b.addEventListener('click', function () {
        delete state.filters[b.dataset.drop];
        state.page = 1;
        var map = { q:'fq', status:'fstatus', purchase_source:'fsource', warranty_status:'fwarranty',
                    assigned_to:'femployee', chair_type:'fchair', pending_only:'fpending' };
        var el = document.getElementById(map[b.dataset.drop]);
        if (el) { if (el.type === 'checkbox') el.checked = false; else el.value = ''; }
        load();
      });
    });
  }

  function paintPager() {
    var m = state.meta;
    var from = m.total ? ((m.page - 1) * m.page_size) + 1 : 0;
    var to = Math.min(m.total, m.page * m.page_size);
    document.getElementById('pager').innerHTML =
      '<span>Showing <b>' + from + '–' + to + '</b> of <b>' + UI.fmtNum(m.total) + '</b> complaints</span>' +
      '<span style="display:flex;gap:7px">' +
        '<button class="btn btn--sm btn--ghost" id="prev"' + (m.page <= 1 ? ' disabled' : '') + '>Previous</button>' +
        '<button class="btn btn--sm btn--ghost" id="next"' + (m.page >= m.pages ? ' disabled' : '') + '>Next</button>' +
      '</span>';
    var p = document.getElementById('prev'), n = document.getElementById('next');
    if (p) p.addEventListener('click', function () { state.page--; load(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    if (n) n.addEventListener('click', function () { state.page++; load(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }

  function exportCsv() {
    if (!API.can('export.data')) return UI.toast('Your role cannot export data.', 'error');
    UI.loading(true);
    API.call('export', { filters: state.filters, sort_by: state.sort_by, sort_dir: state.sort_dir })
      .then(function (res) {
        var header = ['Complaint ID','Registered','Customer','Mobile','Order number','Purchase date',
          'Chair type','Purchase source','Issue type','Description','Invoice by','Warranty status',
          'Warranty verified by','Payment status','Payment amount','Amount collected','Assigned to',
          'Department','Priority','Status','Action taken','Resolution','Resolution date','TAT (hours)','Reopened'];
        var rows = [header].concat(res.data.map(function (r) {
          return [r.complaint_id, UI.fmtDateTime(r.created_at), r.customer_name, r.customer_mobile,
            r.order_number, UI.fmtDate(r.purchase_date), r.chair_type, r.purchase_source, r.complaint_type,
            r.description, r.invoice_generated_by, r.warranty_status, r.warranty_verified_by,
            r.payment_status, r.payment_amount, r.payment_collected, r.assigned_to, r.department,
            r.priority, r.status, r.action_taken, r.resolution,
            r.resolution_date ? UI.fmtDateTime(r.resolution_date) : '', r.tat_hours, r.reopened_count];
        }));
        UI.downloadCsv('oakcraft-complaints-' + new Date().toISOString().slice(0, 10) + '.csv', rows);
        UI.toast(res.data.length + ' complaints exported.');
      })
      .catch(function (e) { UI.toast(e.message, 'error'); })
      .finally(function () { UI.loading(false); });
  }

  /* ------------------------------------------------------------------ *
   * Detail drawer
   * ------------------------------------------------------------------ */
  function openDetail(id) {
    UI.drawer.open(id, 'Complaint', UI.skeleton(5));
    state.tab = 'overview';
    return refreshDetail(id);
  }

  function refreshDetail(id) {
    UI.loading(true);
    return API.call('getComplaint', { complaint_id: id }, { dedupe: false })
      .then(function (res) {
        state.current = res.data;
        paintDetail();
      })
      .catch(function (e) { UI.drawer.setBody('<div class="alert alert--error">' + UI.esc(e.message) + '</div>'); })
      .finally(function () { UI.loading(false); });
  }

  var LIFECYCLE = ['Registered','Under Verification','Warranty Check','Awaiting Payment',
                   'Payment Verification','Assigned','In Progress','Resolved',
                   'Awaiting Customer Confirmation','Closed'];

  function paintDetail() {
    var c = state.current.complaint;
    var tabs = [['overview','Overview'], ['timeline','Timeline'], ['actions','Actions'], ['files','Files']];

    var html =
      '<div class="steps">' + LIFECYCLE.map(function (s, i) {
        var now = s === c.status;
        var done = LIFECYCLE.indexOf(c.status) > i;
        return '<span class="step' + (now ? ' is-now' : done ? ' is-done' : '') + '">' + s + '</span>' +
               (i < LIFECYCLE.length - 1 ? '<i>›</i>' : '');
      }).join('') + '</div>' +
      '<div class="tabs">' + tabs.map(function (t) {
        return '<button data-tab="' + t[0] + '" class="' + (state.tab === t[0] ? 'is-on' : '') + '">' + t[1] + '</button>';
      }).join('') + '</div>' +
      '<div id="tabBody">' + tabBody() + '</div>';

    UI.drawer.setBody(html);
    document.getElementById('drawerTitle').textContent = c.complaint_id;
    document.getElementById('drawerEyebrow').textContent =
      c.customer_name + ' · ' + c.status + (UI.isOverdue(c) ? ' · over SLA' : '');

    UI.drawer.body.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { state.tab = b.dataset.tab; paintDetail(); });
    });
    wireTab();
  }

  function tabBody() {
    if (state.tab === 'timeline') return timelineHtml();
    if (state.tab === 'actions') return actionsHtml();
    if (state.tab === 'files') return filesHtml();
    return overviewHtml();
  }

  function overviewHtml() {
    var c = state.current.complaint;
    var pays = state.current.payments || [];
    function row(k, v) { return '<dt>' + k + '</dt><dd>' + v + '</dd>'; }

    return '<div class="card"><div class="card__body"><dl class="dl">' +
        row('Customer', '<strong>' + UI.esc(c.customer_name) + '</strong>') +
        row('Mobile', '<a href="tel:' + UI.esc(c.customer_mobile) + '">' + UI.esc(c.customer_mobile) + '</a>') +
        row('Order number', UI.esc(c.order_number)) +
        row('Purchased on', UI.fmtDate(c.purchase_date)) +
        row('Invoice by', UI.esc(c.invoice_generated_by)) +
        row('Chair type', UI.esc(c.chair_type)) +
        row('Purchase source', UI.esc(c.purchase_source)) +
        row('Issue type', UI.esc(c.complaint_type)) +
        row('Priority', UI.priorityBadge(c.priority)) +
      '</dl></div></div>' +

      '<div class="card"><div class="card__head"><h3>What the customer reported</h3></div>' +
        '<div class="card__body" style="white-space:pre-wrap;font-size:13.5px">' + UI.esc(c.description) + '</div></div>' +

      '<div class="card"><div class="card__body"><dl class="dl">' +
        row('Status', UI.statusBadge(c.status)) +
        row('Warranty', UI.warrantyBadge(c.warranty_status) +
            (c.warranty_verified_by ? '<br><small class="muted">by ' + UI.esc(c.warranty_verified_by) + ' · ' + UI.fmtDateTime(c.warranty_verified_at) + '</small>' : '')) +
        (c.warranty_remarks ? row('Warranty note', UI.esc(c.warranty_remarks)) : '') +
        row('Payment', UI.paymentBadge(c.payment_status) +
            (Number(c.payment_amount) ? ' <span class="muted">' + UI.fmtMoney(c.payment_amount) + ' due</span>' : '') +
            (Number(c.payment_collected) ? '<br><small>Collected: <b>' + UI.fmtMoney(c.payment_collected) + '</b></small>' : '')) +
        row('Assigned to', UI.esc(nameFor(c.assigned_to)) + ' <span class="muted">· ' + UI.esc(c.department) + '</span>') +
        row('Registered', UI.fmtDateTime(c.created_at) + ' <span class="muted">by ' + UI.esc(c.created_by) + '</span>') +
        row(c.is_open ? 'Open for' : 'Turnaround', UI.fmtHours(c.is_open ? c.age_hours : c.tat_hours)) +
        (c.resolution_date ? row('Resolved on', UI.fmtDateTime(c.resolution_date)) : '') +
        (Number(c.reopened_count) ? row('Reopened', c.reopened_count + ' time(s)') : '') +
      '</dl></div></div>' +

      (c.action_taken || c.resolution ?
        '<div class="card"><div class="card__head"><h3>Resolution</h3></div><div class="card__body">' +
          (c.action_taken ? '<p style="margin:0 0 8px"><b>Action taken.</b> ' + UI.esc(c.action_taken) + '</p>' : '') +
          (c.resolution ? '<p style="margin:0">' + UI.esc(c.resolution) + '</p>' : '') +
        '</div></div>' : '') +

      (pays.length ? paymentsHtml(pays) : '');
  }

  function paymentsHtml(pays) {
    return '<div class="card"><div class="card__head"><h3>Payments</h3>' +
      '<p>' + pays.length + ' record' + (pays.length > 1 ? 's' : '') + '</p></div>' +
      '<div class="card__body" style="display:flex;flex-direction:column;gap:11px">' +
      pays.map(function (p) {
        return '<div style="border:1px solid var(--line);border-radius:9px;padding:11px 13px">' +
          '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center">' +
            '<strong>' + UI.fmtMoney(p.amount) + '</strong>' + UI.paymentBadge(p.verification_status) +
          '</div>' +
          '<div class="muted" style="font-size:12.3px;margin-top:4px">' +
            UI.esc(p.payment_mode) + ' · ' + UI.fmtDate(p.payment_date) +
            (p.reference_id ? ' · ref ' + UI.esc(p.reference_id) : '') +
            '<br>Collected by ' + UI.esc(p.collected_by) +
            (p.verified_by ? ' · verified by ' + UI.esc(p.verified_by) : '') +
          '</div>' +
          ((p.proof_file || []).length ? '<div class="filelist" style="margin-top:8px">' +
            p.proof_file.map(function (f) {
              return '<a href="' + UI.esc(f.url) + '" target="_blank" rel="noopener"><span data-ico="file"></span>' +
                UI.esc(f.name) + '<small>' + UI.fmtBytes(f.size) + '</small></a>';
            }).join('') + '</div>' : '') +
          (p.verification_status === 'Pending' && API.can('payment.verify') ?
            '<div style="display:flex;gap:7px;margin-top:9px">' +
              '<button class="btn btn--sm btn--primary" data-verify="' + UI.esc(p.payment_id) + '" data-outcome="Verified">Verify</button>' +
              '<button class="btn btn--sm btn--danger" data-verify="' + UI.esc(p.payment_id) + '" data-outcome="Failed">Mark failed</button>' +
            '</div>' : '') +
        '</div>';
      }).join('') + '</div></div>';
  }

  function timelineHtml() {
    var t = state.current.timeline || [];
    if (!t.length) return '<div class="empty"><p>No events recorded yet.</p></div>';
    return '<div class="card"><div class="card__body"><ul class="timeline">' +
      t.map(function (h) {
        var change = (h.field && (h.from_value || h.to_value))
          ? '<span class="change">' + UI.esc(h.from_value || '—') + ' → ' + UI.esc(h.to_value || '—') + '</span>' : '';
        return '<li>' +
          '<time>' + UI.fmtDateTime(h.timestamp) + '</time>' +
          '<strong>' + UI.esc(h.action) + '</strong>' +
          (change ? '<p>' + change + '</p>' : '') +
          (h.remarks ? '<p>' + UI.esc(h.remarks) + '</p>' : '') +
          '<p class="muted" style="font-size:11.8px">' + UI.esc(h.actor) + ' · ' + UI.esc(h.actor_role) + '</p>' +
        '</li>';
      }).join('') + '</ul></div></div>';
  }

  function filesHtml() {
    var c = state.current.complaint;
    function group(title, files, category) {
      return '<div class="card"><div class="card__head"><div><h3>' + title + '</h3>' +
        '<p>' + (files.length || 'No') + ' file' + (files.length === 1 ? '' : 's') + '</p></div></div>' +
        '<div class="card__body">' +
          (files.length ? '<div class="filelist">' + files.map(function (f) {
            return '<a href="' + UI.esc(f.url) + '" target="_blank" rel="noopener">' +
              '<span data-ico="file"></span>' + UI.esc(f.name) +
              '<small>' + UI.fmtBytes(f.size) + '</small></a>';
          }).join('') + '</div>' : '<p class="muted" style="margin:0">Nothing uploaded yet.</p>') +
          (API.can('complaint.update') ?
            '<label class="dropzone" style="margin-top:11px" data-upload="' + category + '">' +
              '<input type="file" multiple>Click to attach · up to ' + CONFIG.LIMITS.maxFiles + ' files' +
            '</label>' : '') +
        '</div></div>';
    }
    return group('Invoice files', c.invoice_files || [], 'Invoices') +
           group('Evidence (photos / video)', c.evidence_files || [], 'Complaint Evidence');
  }

  /* ---------------- actions tab ---------------- */
  function actionsHtml() {
    var c = state.current.complaint;
    var m = state.master || {};
    var blocks = [];

    if (!API.can('complaint.update') && !API.can('warranty.verify')) {
      return '<div class="alert alert--info">Your role has read-only access to complaints.</div>';
    }

    /* Warranty */
    if (API.can('warranty.verify')) {
      blocks.push('<div class="card"><div class="card__head"><div><h3>Warranty verification</h3>' +
        '<p>Current: ' + UI.esc(c.warranty_status) + '</p></div></div><div class="card__body">' +
        '<label class="field"><span class="field__label">Decision</span>' +
          '<select id="wStatus">' + UI.options(m.warranty_statuses || [], c.warranty_status) + '</select></label>' +
        '<div id="wPayWrap" ' + (c.warranty_status === 'Out of Warranty' ? '' : 'hidden') + '>' +
          '<label class="field"><span class="field__label">Service charge to collect (' + CONFIG.CURRENCY + ')</span>' +
            '<input type="number" id="wAmount" min="0" step="1" value="' + (Number(c.payment_amount) || '') + '" placeholder="e.g. 750"></label>' +
          '<p class="field__hint" style="margin:-6px 0 12px">Leave blank or zero if the repair is free of charge.</p>' +
        '</div>' +
        '<label class="field"><span class="field__label">Remarks</span>' +
          '<textarea id="wRemarks" style="min-height:70px" placeholder="What did the invoice show?">' + UI.esc(c.warranty_remarks || '') + '</textarea></label>' +
        '<button class="btn btn--primary" id="wSave">Save warranty decision</button>' +
      '</div></div>');
    }

    /* Payment collection */
    if (API.can('payment.update') && String(c.payment_required) === 'TRUE' && c.payment_status !== 'Verified') {
      blocks.push('<div class="card"><div class="card__head"><div><h3>Record a payment</h3>' +
        '<p>' + UI.fmtMoney(c.payment_amount) + ' due · ' + UI.fmtMoney(c.payment_collected) + ' collected so far</p></div></div>' +
        '<div class="card__body">' +
        '<label class="field"><span class="field__label">Amount (' + CONFIG.CURRENCY + ') <span class="req">*</span></span>' +
          '<input type="number" id="pAmount" min="1" step="1" value="' + (Number(c.payment_amount) || '') + '"></label>' +
        '<label class="field"><span class="field__label">Date received <span class="req">*</span></span>' +
          '<input type="date" id="pDate" value="' + new Date().toISOString().slice(0, 10) + '"></label>' +
        '<label class="field"><span class="field__label">Mode <span class="req">*</span></span>' +
          '<select id="pMode">' + UI.options(m.payment_modes || [], 'UPI') + '</select></label>' +
        '<label class="field"><span class="field__label">Transaction reference</span>' +
          '<input type="text" id="pRef" placeholder="UPI ref / receipt no."></label>' +
        '<label class="field"><span class="field__label">Payment proof</span>' +
          '<label class="dropzone" data-proof><input type="file" accept="image/*,application/pdf" multiple>' +
          'Attach a screenshot or receipt PDF</label></label>' +
        '<label class="field"><span class="field__label">Remarks</span>' +
          '<input type="text" id="pRemarks" placeholder="Optional"></label>' +
        '<button class="btn btn--primary" id="pSave">Record payment</button>' +
      '</div></div>');
    }

    /* Assignment */
    if (API.can('complaint.assign')) {
      blocks.push('<div class="card"><div class="card__head"><h3>Assignment</h3></div><div class="card__body">' +
        '<label class="field"><span class="field__label">Assign to</span>' +
          '<select id="aEmp">' + UI.options((m.employees || []).map(function (e) {
            return { value: e.email, label: e.name + ' · ' + e.role };
          }), c.assigned_to, 'Unassigned') + '</select></label>' +
        '<label class="field"><span class="field__label">Department</span>' +
          '<select id="aDept">' + UI.options(m.departments || [], c.department) + '</select></label>' +
        '<button class="btn" id="aSave">Update assignment</button>' +
      '</div></div>');
    }

    /* Status */
    var allowed = ((m.transitions || {})[c.status] || []).slice();
    if (API.can('*')) allowed = (m.statuses || []).filter(function (s) { return s !== c.status; });
    blocks.push('<div class="card"><div class="card__head"><div><h3>Move this complaint forward</h3>' +
      '<p>Currently ' + UI.esc(c.status) + '</p></div></div><div class="card__body">' +
      (allowed.length ?
        '<label class="field"><span class="field__label">Next status</span>' +
          '<select id="sStatus">' + UI.options(allowed) + '</select></label>' +
        '<label class="field"><span class="field__label">Action taken</span>' +
          '<textarea id="sAction" style="min-height:70px" placeholder="What was done to fix it?">' + UI.esc(c.action_taken || '') + '</textarea></label>' +
        '<label class="field"><span class="field__label">Resolution summary</span>' +
          '<textarea id="sResolution" style="min-height:70px">' + UI.esc(c.resolution || '') + '</textarea></label>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button class="btn btn--primary" id="sSave">Update status</button>' +
          (c.status === 'Resolved' || c.status === 'Awaiting Customer Confirmation' ?
            '<button class="btn btn--oak" id="sConfirm">Customer confirmed · close</button>' : '') +
        '</div>'
        : '<p class="muted" style="margin:0">This complaint is closed. Reopen it from the status list if the customer comes back.</p>') +
    '</div></div>');

    return blocks.join('');
  }

  /* ---------------- wiring for the active tab ---------------- */
  function wireTab() {
    var body = UI.drawer.body;
    var c = state.current.complaint;
    var pendingProof = [];

    // payment verification buttons live on the overview tab
    body.querySelectorAll('[data-verify]').forEach(function (b) {
      b.addEventListener('click', function () {
        act('verifyPayment', { payment_id: b.dataset.verify, verification_status: b.dataset.outcome },
            'Payment marked ' + b.dataset.outcome.toLowerCase() + '.');
      });
    });

    // file uploads
    body.querySelectorAll('[data-upload]').forEach(function (zone) {
      var input = zone.querySelector('input');
      input.addEventListener('change', function () {
        var files = Array.prototype.slice.call(input.files);
        if (!files.length) return;
        var isEvidence = zone.dataset.upload === 'Complaint Evidence';
        var limitMb = isEvidence ? CONFIG.LIMITS.maxEvidenceMB : CONFIG.LIMITS.maxInvoiceMB;
        var tooBig = files.filter(function (f) { return f.size > limitMb * 1024 * 1024; });
        if (tooBig.length) return UI.toast('"' + tooBig[0].name + '" is over the ' + limitMb + ' MB limit.', 'error');
        if (files.length > CONFIG.LIMITS.maxFiles) return UI.toast('Up to ' + CONFIG.LIMITS.maxFiles + ' files at a time.', 'error');

        UI.loading(true);
        Promise.all(files.map(API.readFile))
          .then(function (payload) {
            return API.call('uploadFiles', { complaint_id: c.complaint_id, category: zone.dataset.upload, files: payload }, { dedupe: false });
          })
          .then(function () { UI.toast(files.length + ' file(s) attached.'); return refreshDetail(c.complaint_id); })
          .catch(function (e) { UI.toast(e.message, 'error'); })
          .finally(function () { UI.loading(false); });
      });
    });

    var proofZone = body.querySelector('[data-proof]');
    if (proofZone) {
      proofZone.querySelector('input').addEventListener('change', function (e) {
        var files = Array.prototype.slice.call(e.target.files);
        Promise.all(files.map(API.readFile)).then(function (p) {
          pendingProof = p;
          proofZone.childNodes[proofZone.childNodes.length - 1].textContent =
            files.length + ' file(s) ready: ' + files.map(function (f) { return f.name; }).join(', ');
        });
      });
    }

    var wStatus = body.querySelector('#wStatus');
    if (wStatus) {
      wStatus.addEventListener('change', function () {
        body.querySelector('#wPayWrap').hidden = wStatus.value !== 'Out of Warranty';
      });
      body.querySelector('#wSave').addEventListener('click', function () {
        var amount = Number((body.querySelector('#wAmount') || {}).value || 0);
        act('verifyWarranty', {
          complaint_id: c.complaint_id,
          warranty_status: wStatus.value,
          payment_amount: amount,
          payment_required: amount > 0,
          warranty_remarks: body.querySelector('#wRemarks').value.trim()
        }, 'Warranty decision saved.');
      });
    }

    var pSave = body.querySelector('#pSave');
    if (pSave) {
      pSave.addEventListener('click', function () {
        act('recordPayment', {
          complaint_id: c.complaint_id,
          amount: Number(body.querySelector('#pAmount').value),
          payment_date: body.querySelector('#pDate').value,
          payment_mode: body.querySelector('#pMode').value,
          reference_id: body.querySelector('#pRef').value.trim(),
          remarks: body.querySelector('#pRemarks').value.trim(),
          proof_file: pendingProof
        }, 'Payment recorded.');
      });
    }

    var aSave = body.querySelector('#aSave');
    if (aSave) {
      aSave.addEventListener('click', function () {
        act('assignComplaint', {
          complaint_id: c.complaint_id,
          assigned_to: body.querySelector('#aEmp').value,
          department: body.querySelector('#aDept').value
        }, 'Assignment updated.');
      });
    }

    var sSave = body.querySelector('#sSave');
    if (sSave) {
      sSave.addEventListener('click', function () {
        act('updateStatus', {
          complaint_id: c.complaint_id,
          status: body.querySelector('#sStatus').value,
          action_taken: body.querySelector('#sAction').value.trim(),
          resolution: body.querySelector('#sResolution').value.trim()
        }, 'Status updated.');
      });
    }

    var sConfirm = body.querySelector('#sConfirm');
    if (sConfirm) {
      sConfirm.addEventListener('click', function () {
        act('confirmByCustomer', { complaint_id: c.complaint_id }, 'Customer confirmation recorded — complaint closed.');
      });
    }
  }

  function act(action, params, successMessage) {
    UI.loading(true);
    API.call(action, params, { dedupe: false })
      .then(function () {
        UI.toast(successMessage);
        return refreshDetail(state.current.complaint.complaint_id);
      })
      .then(function () { if (document.querySelector('#tableHost')) load(); })
      .catch(function (e) { UI.toast(e.message, 'error'); })
      .finally(function () { UI.loading(false); });
  }

  return {
    render: render,
    openDetail: openDetail,
    reload: load,
    setFilter: function (patch) { Object.assign(state.filters, patch); state.page = 1; }
  };
})();
