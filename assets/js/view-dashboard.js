/* ============================================================
   view-dashboard.js — KPI tiles, charts and the analytics view.
   ============================================================ */
window.ViewDashboard = (function () {
  'use strict';

  function kpi(label, value, sub, tone) {
    return '<div class="kpi kpi--' + (tone || 'grey') + '">' +
      '<div class="kpi__label">' + UI.esc(label) + '</div>' +
      '<div class="kpi__value">' + value + '</div>' +
      '<div class="kpi__sub">' + (sub || '&nbsp;') + '</div>' +
    '</div>';
  }

  function render(host, range) {
    host.innerHTML = '<div class="kpis">' + UI.skeleton(1) + UI.skeleton(1) + UI.skeleton(1) + UI.skeleton(1) + '</div>';
    UI.loading(true);

    return API.call('dashboard', range)
      .then(function (res) { paint(host, res.data, range); })
      .catch(function (e) {
        host.innerHTML = '<div class="alert alert--error">' + UI.esc(e.message) + '</div>';
      })
      .finally(function () { UI.loading(false); });
  }

  function paint(host, d, range) {
    var k = d.kpi;
    var oldest = k.oldest_pending;

    var html =
      '<div class="kpis">' +
        kpi('Complaints today', UI.fmtNum(k.complaints_today),
            UI.fmtNum(k.resolved_today) + ' resolved today', 'oak') +
        kpi('Open right now', UI.fmtNum(k.open_complaints),
            '<b>' + k.pending_pct + '%</b> of all complaints', 'clay') +
        kpi('Resolution rate', k.resolution_pct + '%',
            UI.fmtNum(k.resolved_complaints) + ' of ' + UI.fmtNum(k.total_complaints) + ' closed', 'green') +
        kpi('Average turnaround', UI.fmtHours(k.avg_resolution_hours),
            k.avg_resolution_days ? k.avg_resolution_days + ' days end to end' : 'No closed complaints yet', 'blue') +
      '</div>' +

      '<div class="kpis" style="margin-top:13px">' +
        kpi('Under warranty', UI.fmtNum(k.warranty_complaints), k.warranty_pct + '% of total', 'green') +
        kpi('Out of warranty', UI.fmtNum(k.non_warranty_complaints), k.non_warranty_pct + '% of total', 'amber') +
        kpi('Paid service jobs', UI.fmtNum(k.paid_service_complaints),
            UI.fmtMoney(k.amount_collected) + ' collected', 'violet') +
        kpi('Payment pending', UI.fmtNum(k.payment_pending_count),
            UI.fmtMoney(k.amount_pending) + ' outstanding', k.payment_pending_count ? 'clay' : 'grey') +
      '</div>' +

      (oldest ? '<div class="card" style="margin-top:16px"><div class="card__body" style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between">' +
        '<div><strong>Oldest unresolved complaint</strong><br>' +
          '<span class="muted">' + UI.esc(oldest.customer_name) + ' · ' + UI.statusBadge(oldest.status) +
          ' · open for <b>' + oldest.age_days + ' days</b></span></div>' +
        '<button class="btn btn--sm" data-open="' + UI.esc(oldest.complaint_id) + '">' +
          '<span class="cid">' + UI.esc(oldest.complaint_id) + '</span></button>' +
      '</div></div>' : '') +

      '<h2 class="section-title">Complaint volume</h2>' +
      '<div class="card"><div class="card__head"><div>' +
        '<h3>Received vs resolved</h3><p>Daily counts across the selected range</p>' +
      '</div></div><div class="card__body">' + Charts.trend(d.trend) + '</div></div>' +

      '<h2 class="section-title">Where complaints come from</h2>' +
      '<div class="charts">' +
        card('Purchase source', 'Channel mix for the selected range',
             Charts.donut(d.by_source, { centerLabel: 'complaints' })) +
        card('Workflow status', 'Every complaint by its current stage',
             Charts.statusBar(d.by_status)) +
      '</div>' +

      '<h2 class="section-title">Product and issue analysis</h2>' +
      '<div class="charts">' +
        card('Complaints by chair type',
             'Most complained: ' + (k.most_complained_product ? UI.esc(k.most_complained_product) : '—'),
             Charts.ranked(d.by_chair_type)) +
        card('Complaints by issue type',
             'Most common: ' + (k.most_common_issue ? UI.esc(k.most_common_issue) : '—'),
             Charts.ranked(d.by_issue_type, { color: '#c77a0f' })) +
      '</div>' +

      '<h2 class="section-title">Employee performance</h2>' +
      employeeTable(d.by_employee) +

      '<p class="muted" style="margin-top:18px;font-size:12px">Generated ' + UI.fmtDateTime(d.generated_at) +
        (API.isDemo() ? ' · demo data' : '') + '</p>';

    host.innerHTML = html;
    Charts.bindTrend(host);
    UI.paintIcons(host);

    host.querySelectorAll('[data-open]').forEach(function (b) {
      b.addEventListener('click', function () { ViewComplaints.openDetail(b.dataset.open); });
    });
  }

  function card(title, sub, body) {
    return '<div class="card"><div class="card__head"><div><h3>' + title + '</h3>' +
      (sub ? '<p>' + sub + '</p>' : '') + '</div></div><div class="card__body">' + body + '</div></div>';
  }

  function employeeTable(rows) {
    if (!rows || !rows.length) return '<div class="empty"><p>No complaints assigned yet.</p></div>';
    return '<div class="tablewrap"><table><thead><tr>' +
      '<th>Employee</th><th class="num">Assigned</th><th class="num">Resolved</th>' +
      '<th class="num">Open</th><th style="width:190px">Resolution rate</th><th class="num">Avg TAT</th>' +
      '</tr></thead><tbody>' +
      rows.map(function (e) {
        return '<tr>' +
          '<td>' + UI.esc(e.label) + '</td>' +
          '<td class="num">' + UI.fmtNum(e.total) + '</td>' +
          '<td class="num">' + UI.fmtNum(e.resolved) + '</td>' +
          '<td class="num">' + UI.fmtNum(e.pending) + '</td>' +
          '<td>' + Charts.meter(e.resolution_pct) + '</td>' +
          '<td class="num">' + UI.fmtHours(e.avg_tat_hours) + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  /* Analytics view: the same data, arranged for reading rather than monitoring. */
  function renderAnalytics(host, range) {
    host.innerHTML = UI.skeleton(3);
    UI.loading(true);
    return API.call('dashboard', range)
      .then(function (res) {
        var d = res.data, k = d.kpi;
        host.innerHTML =
          '<div class="kpis">' +
            kpi('Resolution %', k.resolution_pct + '%', 'Resolved ÷ total', 'green') +
            kpi('Pending %', k.pending_pct + '%', 'Still open', 'clay') +
            kpi('Warranty %', k.warranty_pct + '%', 'Covered under warranty', 'blue') +
            kpi('Non-warranty %', k.non_warranty_pct + '%', 'Outside cover', 'amber') +
            kpi('Paid service %', k.paid_service_pct + '%', UI.fmtMoney(k.amount_collected) + ' collected', 'violet') +
            kpi('Reopened', UI.fmtNum(k.reopened_complaints), 'Came back after closure', 'oak') +
          '</div>' +
          '<h2 class="section-title">Source-wise performance</h2>' +
          breakdownTable(d.by_source, 'Purchase source') +
          '<h2 class="section-title">Product-wise performance</h2>' +
          breakdownTable(d.by_chair_type, 'Chair type') +
          '<h2 class="section-title">Issue-wise performance</h2>' +
          breakdownTable(d.by_issue_type, 'Issue type') +
          '<h2 class="section-title">Priority mix</h2>' +
          breakdownTable(d.by_priority, 'Priority') +
          '<div style="margin-top:18px"><button class="btn btn--ghost btn--sm" id="exportAnalytics">' +
            '<span data-ico="download"></span>Download analytics as CSV</button></div>';
        UI.paintIcons(host);
        var btn = host.querySelector('#exportAnalytics');
        if (btn) btn.addEventListener('click', function () { exportAnalytics(d); });
      })
      .catch(function (e) { host.innerHTML = '<div class="alert alert--error">' + UI.esc(e.message) + '</div>'; })
      .finally(function () { UI.loading(false); });
  }

  function breakdownTable(rows, label) {
    if (!rows || !rows.length) return '<div class="empty"><p>No data in this range.</p></div>';
    return '<div class="tablewrap"><table><thead><tr>' +
      '<th>' + label + '</th><th class="num">Complaints</th><th class="num">Share</th>' +
      '<th class="num">Resolved</th><th class="num">Open</th><th style="width:190px">Resolution rate</th>' +
      '</tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td>' + UI.esc(r.label) + '</td>' +
          '<td class="num">' + UI.fmtNum(r.total) + '</td>' +
          '<td class="num">' + r.share_pct + '%</td>' +
          '<td class="num">' + UI.fmtNum(r.resolved) + '</td>' +
          '<td class="num">' + UI.fmtNum(r.pending) + '</td>' +
          '<td>' + Charts.meter(r.resolution_pct) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function exportAnalytics(d) {
    var rows = [['Dimension', 'Value', 'Complaints', 'Share %', 'Resolved', 'Open', 'Resolution %']];
    [['Purchase source', d.by_source], ['Chair type', d.by_chair_type],
     ['Issue type', d.by_issue_type], ['Status', d.by_status],
     ['Priority', d.by_priority], ['Employee', d.by_employee]].forEach(function (pair) {
      pair[1].forEach(function (r) {
        rows.push([pair[0], r.label, r.total, r.share_pct, r.resolved, r.pending, r.resolution_pct]);
      });
    });
    UI.downloadCsv('oakcraft-analytics-' + new Date().toISOString().slice(0, 10) + '.csv', rows);
    UI.toast('Analytics exported.');
  }

  return { render: render, renderAnalytics: renderAnalytics };
})();
