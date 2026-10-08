/**
 * 06_Dashboard.gs — every analytics number the dashboard shows.
 *
 * Computed in ONE pass over the complaints table and cached for 45 seconds,
 * so a dashboard refresh costs one sheet read no matter how many tiles and
 * charts are on screen.
 *
 * Definitions used throughout:
 *   Resolution %  = Resolved or Closed ÷ Total × 100
 *   Pending %     = 100 − Resolution %
 *   TAT (hours)   = resolution_date − created_at, averaged over closed complaints
 */

function api_dashboard_(params, session) {
  requirePermission_(session, 'dashboard.view');

  var cacheKey = 'dash_' + (params.date_from || '') + '_' + (params.date_to || '') + '_' + session.role + '_' + session.email;
  var cached = CacheService.getScriptCache().get(cacheKey);
  if (cached && !params.no_cache) return JSON.parse(cached);

  var rows = readTable_(SHEETS.COMPLAINTS).rows
    .filter(function (r) { return String(r.is_deleted) !== 'TRUE'; });
  rows = scopeComplaints_(session, rows);

  if (params.date_from) {
    var from = parseDate_(params.date_from).getTime();
    rows = rows.filter(function (r) { var d = parseDate_(r.created_at); return d && d.getTime() >= from; });
  }
  if (params.date_to) {
    var to = parseDate_(params.date_to).getTime() + 86399000;
    rows = rows.filter(function (r) { var d = parseDate_(r.created_at); return d && d.getTime() <= to; });
  }

  var payload = ok_(computeMetrics_(rows));
  CacheService.getScriptCache().put(cacheKey, JSON.stringify(payload), APP.CACHE_TTL_SECONDS);
  return payload;
}

function computeMetrics_(rows) {
  var todayKey = Utilities.formatDate(now_(), APP.TIMEZONE, 'yyyy-MM-dd');
  var total = rows.length;

  var counts = {
    today: 0, today_resolved: 0, open: 0, resolved: 0,
    warranty: 0, non_warranty: 0, warranty_pending: 0,
    paid_service: 0, payment_pending: 0, reopened: 0
  };
  var tatSum = 0, tatCount = 0, amountCollected = 0, amountPending = 0;
  var bySource = {}, byChair = {}, byIssue = {}, byStatus = {}, byEmployee = {}, byDay = {}, byPriority = {};
  var oldestPending = null;

  function bump(map, key, resolved) {
    if (!key) key = 'Unspecified';
    if (!map[key]) map[key] = { label: key, total: 0, resolved: 0, pending: 0 };
    map[key].total++;
    if (resolved) map[key].resolved++; else map[key].pending++;
  }

  rows.forEach(function (r) {
    var createdDate = parseDate_(r.created_at);
    var dayKey = createdDate ? Utilities.formatDate(createdDate, APP.TIMEZONE, 'yyyy-MM-dd') : 'unknown';
    var isResolved = CLOSED_STATUSES.indexOf(r.status) !== -1;

    if (dayKey === todayKey) {
      counts.today++;
      if (isResolved) counts.today_resolved++;
    }
    if (isResolved) counts.resolved++; else counts.open++;
    if (Number(r.reopened_count || 0) > 0) counts.reopened++;

    if (r.warranty_status === 'Under Warranty') counts.warranty++;
    else if (r.warranty_status === 'Out of Warranty') counts.non_warranty++;
    else counts.warranty_pending++;

    if (String(r.payment_required) === 'TRUE') counts.paid_service++;
    if (r.payment_status === 'Pending') {
      counts.payment_pending++;
      amountPending += Number(r.payment_amount || 0);
    }
    amountCollected += Number(r.payment_collected || 0);

    if (isResolved && r.tat_hours !== '' && !isNaN(Number(r.tat_hours))) {
      tatSum += Number(r.tat_hours); tatCount++;
    }

    bump(bySource, r.purchase_source, isResolved);
    bump(byChair, r.chair_type, isResolved);
    bump(byIssue, r.complaint_type, isResolved);
    bump(byStatus, r.status, isResolved);
    bump(byPriority, r.priority, isResolved);
    bump(byEmployee, r.assigned_to || 'Unassigned', isResolved);

    if (!byDay[dayKey]) byDay[dayKey] = { label: dayKey, total: 0, resolved: 0, pending: 0 };
    byDay[dayKey].total++;
    if (isResolved) byDay[dayKey].resolved++; else byDay[dayKey].pending++;

    if (!isResolved && createdDate) {
      if (!oldestPending || createdDate.getTime() < parseDate_(oldestPending.created_at).getTime()) {
        oldestPending = r;
      }
    }
  });

  // Employee performance needs average TAT per person too.
  var employeeStats = {};
  rows.forEach(function (r) {
    var key = r.assigned_to || 'Unassigned';
    if (!employeeStats[key]) employeeStats[key] = { tatSum: 0, tatCount: 0 };
    if (CLOSED_STATUSES.indexOf(r.status) !== -1 && r.tat_hours !== '' && !isNaN(Number(r.tat_hours))) {
      employeeStats[key].tatSum += Number(r.tat_hours);
      employeeStats[key].tatCount++;
    }
  });

  var sortDesc = function (m) {
    return Object.keys(m).map(function (k) {
      var o = m[k];
      o.resolution_pct = pct_(o.resolved, o.total);
      o.share_pct = pct_(o.total, total);
      return o;
    }).sort(function (a, b) { return b.total - a.total; });
  };

  var sourceList = sortDesc(bySource);
  var chairList = sortDesc(byChair);
  var issueList = sortDesc(byIssue);
  var statusList = sortDesc(byStatus);
  var priorityList = sortDesc(byPriority);

  var employeeList = sortDesc(byEmployee).map(function (e) {
    var s = employeeStats[e.label] || { tatSum: 0, tatCount: 0 };
    e.avg_tat_hours = s.tatCount ? Math.round((s.tatSum / s.tatCount) * 10) / 10 : null;
    return e;
  });

  var trend = Object.keys(byDay).sort().map(function (k) { return byDay[k]; }).slice(-30);

  return {
    generated_at: iso_(now_()),
    kpi: {
      total_complaints: total,
      complaints_today: counts.today,
      resolved_today: counts.today_resolved,
      open_complaints: counts.open,
      resolved_complaints: counts.resolved,
      reopened_complaints: counts.reopened,
      warranty_complaints: counts.warranty,
      non_warranty_complaints: counts.non_warranty,
      warranty_pending: counts.warranty_pending,
      paid_service_complaints: counts.paid_service,
      payment_pending_count: counts.payment_pending,
      amount_collected: Math.round(amountCollected),
      amount_pending: Math.round(amountPending),
      resolution_pct: pct_(counts.resolved, total),
      pending_pct: pct_(counts.open, total),
      warranty_pct: pct_(counts.warranty, total),
      non_warranty_pct: pct_(counts.non_warranty, total),
      paid_service_pct: pct_(counts.paid_service, total),
      avg_resolution_hours: tatCount ? Math.round((tatSum / tatCount) * 10) / 10 : null,
      avg_resolution_days: tatCount ? Math.round((tatSum / tatCount / 24) * 10) / 10 : null,
      oldest_pending: oldestPending ? {
        complaint_id: oldestPending.complaint_id,
        customer_name: oldestPending.customer_name,
        created_at: iso_(oldestPending.created_at),
        age_days: Math.floor(hoursBetween_(oldestPending.created_at, now_()) / 24),
        status: oldestPending.status
      } : null,
      most_complained_product: chairList.length ? chairList[0].label : null,
      most_common_issue: issueList.length ? issueList[0].label : null,
      top_source: sourceList.length ? sourceList[0].label : null
    },
    by_source: sourceList,
    by_chair_type: chairList,
    by_issue_type: issueList,
    by_status: statusList,
    by_priority: priorityList,
    by_employee: employeeList,
    trend: trend
  };
}

/** Optional: snapshot KPIs into DASHBOARD_DATA for sheet-side reporting. */
function Cron_snapshotDashboard() {
  var rows = readTable_(SHEETS.COMPLAINTS).rows.filter(function (r) { return String(r.is_deleted) !== 'TRUE'; });
  var m = computeMetrics_(rows);
  var sh = sheet_(SHEETS.DASHBOARD);
  sh.getRange(2, 1, Math.max(0, sh.getLastRow() - 1), SCHEMA.DASHBOARD_DATA.length).clearContent();
  var ts = iso_(now_());
  var out = Object.keys(m.kpi)
    .filter(function (k) { return typeof m.kpi[k] !== 'object'; })
    .map(function (k) {
      return { metric_key: k, metric_label: k.replace(/_/g, ' '), metric_value: m.kpi[k], computed_at: ts };
    });
  appendRows_(SHEETS.DASHBOARD, out);
}

/** Export endpoint — returns every row the user may see, for CSV/Excel download. */
function api_export_(params, session) {
  requirePermission_(session, 'export.data');
  params.all = true;
  return api_listComplaints_(params, session);
}

/** Master data for the form dropdowns, in one round trip. */
function api_masterData_(params, session) {
  return ok_({
    chair_types: CHAIR_TYPES,
    purchase_sources: PURCHASE_SOURCES,
    complaint_types: COMPLAINT_TYPES,
    invoice_entities: INVOICE_ENTITIES,
    statuses: STATUSES,
    warranty_statuses: WARRANTY_STATUSES,
    payment_statuses: PAYMENT_STATUSES,
    payment_modes: PAYMENT_MODES,
    priorities: PRIORITIES,
    departments: DEPARTMENTS,
    roles: ROLES,
    transitions: TRANSITIONS,
    employees: readTable_(SHEETS.EMPLOYEES).rows
      .filter(function (r) { return String(r.active).toUpperCase() === 'TRUE' || r.active === true; })
      .map(function (r) { return { name: r.name, email: r.email, role: r.role, department: r.department }; }),
    limits: {
      max_files: APP.MAX_FILES_PER_FIELD,
      max_invoice_mb: APP.MAX_INVOICE_MB,
      max_evidence_mb: APP.MAX_EVIDENCE_MB
    }
  });
}
