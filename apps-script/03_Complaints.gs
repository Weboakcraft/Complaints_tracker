/**
 * 03_Complaints.gs — create, read, search and update complaint records.
 */

/* ------------------------------------------------------------------ *
 * CREATE
 * ------------------------------------------------------------------ */

function api_createComplaint_(params, session) {
  requirePermission_(session, 'complaint.create');

  required_(params, [
    'customer_name', 'customer_mobile', 'order_number', 'purchase_date',
    'chair_type', 'purchase_source', 'complaint_type', 'description',
    'invoice_generated_by'
  ]);

  oneOf_(params.chair_type, CHAIR_TYPES, 'chair_type');
  oneOf_(params.purchase_source, PURCHASE_SOURCES, 'purchase_source');
  oneOf_(params.complaint_type, COMPLAINT_TYPES, 'complaint_type');
  oneOf_(params.invoice_generated_by, INVOICE_ENTITIES, 'invoice_generated_by');

  var mobile = normaliseMobile_(params.customer_mobile);
  var purchaseDate = parseDate_(params.purchase_date);
  if (!purchaseDate) throw new AppError('VALIDATION_FAILED', 'Purchase date could not be read. Use DD/MM/YYYY.');
  if (purchaseDate.getTime() > now_().getTime()) {
    throw new AppError('VALIDATION_FAILED', 'Purchase date cannot be in the future.');
  }

  // Duplicate guard: same order + same issue type inside 24h is almost always
  // a double submit, not a second genuine complaint.
  var dup = findRecentDuplicate_(params.order_number, params.complaint_type, mobile);
  if (dup && !params.force) {
    throw new AppError('DUPLICATE_COMPLAINT',
      'A complaint for this order and issue was already registered as ' + dup.complaint_id + '.',
      { complaint_id: dup.complaint_id, created_at: iso_(dup.created_at) });
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var rec;
  try {
    var id = nextComplaintId_();
    var ts = iso_(now_());

    rec = {
      complaint_id: id,
      created_at: ts,
      created_by: session.email,
      updated_at: ts,
      updated_by: session.email,
      customer_name: clean_(params.customer_name, 120),
      customer_mobile: mobile,
      order_number: clean_(params.order_number, 60).toUpperCase(),
      purchase_date: dateOnly_(purchaseDate),
      chair_type: params.chair_type,
      purchase_source: params.purchase_source,
      complaint_type: params.complaint_type,
      description: clean_(params.description, 4000),
      invoice_generated_by: params.invoice_generated_by,
      invoice_files: '',
      evidence_files: '',
      status: 'Registered',
      priority: PRIORITIES.indexOf(params.priority) !== -1 ? params.priority : 'Medium',
      assigned_to: clean_(params.assigned_to),
      department: clean_(params.department) || 'Customer Support',
      warranty_status: 'Pending Verification',
      warranty_verified_by: '',
      warranty_verified_at: '',
      warranty_remarks: '',
      payment_required: 'FALSE',
      payment_status: 'Not Required',
      payment_amount: 0,
      payment_collected: 0,
      action_taken: '',
      resolution: '',
      resolution_date: '',
      tat_hours: '',
      customer_confirmed: 'FALSE',
      closed_at: '',
      reopened_count: 0,
      is_deleted: 'FALSE'
    };

    appendRow_(SHEETS.COMPLAINTS, rec);
  } finally {
    lock.releaseLock();
  }

  logHistory_(rec.complaint_id, session, 'Complaint Registered', '', '', 'Registered',
    params.purchase_source + ' · ' + params.complaint_type);

  // Files arrive as base64 payloads alongside the form.
  var uploaded = { invoice_files: [], evidence_files: [] };
  if (params.invoice_files && params.invoice_files.length) {
    uploaded.invoice_files = storeFiles_(rec.complaint_id, 'Invoices', params.invoice_files, APP.MAX_INVOICE_MB);
  }
  if (params.evidence_files && params.evidence_files.length) {
    uploaded.evidence_files = storeFiles_(rec.complaint_id, 'Complaint Evidence', params.evidence_files, APP.MAX_EVIDENCE_MB);
  }
  if (uploaded.invoice_files.length || uploaded.evidence_files.length) {
    patchComplaint_(rec.complaint_id, {
      invoice_files: serialiseFiles_(uploaded.invoice_files),
      evidence_files: serialiseFiles_(uploaded.evidence_files)
    });
    logHistory_(rec.complaint_id, session, 'Files Attached', 'attachments', '',
      (uploaded.invoice_files.length + uploaded.evidence_files.length) + ' file(s)', '');
  }

  bustCache_();
  return ok_({
    complaint_id: rec.complaint_id,
    status: rec.status,
    files: uploaded
  });
}

function findRecentDuplicate_(orderNumber, complaintType, mobile) {
  var cutoff = now_().getTime() - 24 * 3600 * 1000;
  var rows = readTable_(SHEETS.COMPLAINTS).rows;
  var order = clean_(orderNumber).toUpperCase();
  for (var i = rows.length - 1; i >= 0; i--) {
    var r = rows[i];
    if (String(r.is_deleted) === 'TRUE') continue;
    if (String(r.order_number).toUpperCase() !== order) continue;
    if (r.complaint_type !== complaintType) continue;
    if (String(r.customer_mobile) !== String(mobile)) continue;
    var created = parseDate_(r.created_at);
    if (created && created.getTime() >= cutoff) return r;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * READ / SEARCH
 * ------------------------------------------------------------------ */

/**
 * Server-side search, filter, sort and pagination. The client never
 * downloads the full table, which is what keeps the UI quick as the
 * sheet grows past a few thousand rows.
 */
function api_listComplaints_(params, session) {
  var t = readTable_(SHEETS.COMPLAINTS);
  var rows = t.rows.filter(function (r) { return String(r.is_deleted) !== 'TRUE'; });
  rows = scopeComplaints_(session, rows);

  var f = params.filters || {};

  if (f.q) {
    var q = String(f.q).toLowerCase();
    rows = rows.filter(function (r) {
      return [r.complaint_id, r.customer_name, r.customer_mobile, r.order_number,
              r.description, r.assigned_to, r.chair_type, r.complaint_type]
        .join(' ').toLowerCase().indexOf(q) !== -1;
    });
  }
  if (f.date_from) {
    var from = parseDate_(f.date_from).getTime();
    rows = rows.filter(function (r) { var d = parseDate_(r.created_at); return d && d.getTime() >= from; });
  }
  if (f.date_to) {
    var to = parseDate_(f.date_to).getTime() + 86399000;
    rows = rows.filter(function (r) { var d = parseDate_(r.created_at); return d && d.getTime() <= to; });
  }
  ['purchase_source', 'warranty_status', 'status', 'assigned_to',
   'chair_type', 'complaint_type', 'payment_status', 'priority'].forEach(function (key) {
    if (f[key]) rows = rows.filter(function (r) { return String(r[key]) === String(f[key]); });
  });
  if (f.pending_only) {
    rows = rows.filter(function (r) { return CLOSED_STATUSES.indexOf(r.status) === -1; });
  }

  var sortBy = params.sort_by || 'created_at';
  var dir = (params.sort_dir === 'asc') ? 1 : -1;
  rows.sort(function (a, b) {
    var av = a[sortBy], bv = b[sortBy];
    if (av === bv) return 0;
    return (av > bv ? 1 : -1) * dir;
  });

  var total = rows.length;
  var page = Math.max(1, Number(params.page || 1));
  var size = Math.min(500, Math.max(1, Number(params.page_size || 50)));
  var slice = params.all ? rows : rows.slice((page - 1) * size, page * size);

  return ok_(slice.map(serialiseComplaint_), {
    total: total, page: page, page_size: size,
    pages: Math.max(1, Math.ceil(total / size))
  });
}

function api_getComplaint_(params, session) {
  required_(params, ['complaint_id']);
  var r = findComplaint_(params.complaint_id);
  var scoped = scopeComplaints_(session, [r]);
  if (!scoped.length) throw new AppError('FORBIDDEN', 'This complaint is not assigned to you.');

  return ok_({
    complaint: serialiseComplaint_(r),
    timeline: getTimeline_(r.complaint_id),
    payments: getPayments_(r.complaint_id)
  });
}

function findComplaint_(id) {
  var rows = readTable_(SHEETS.COMPLAINTS).rows;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].complaint_id) === String(id)) return rows[i];
  }
  throw new AppError('NOT_FOUND', 'Complaint not found: ' + id);
}

function serialiseComplaint_(r) {
  var o = {};
  SCHEMA.COMPLAINTS.forEach(function (k) {
    var v = r[k];
    o[k] = (Object.prototype.toString.call(v) === '[object Date]') ? iso_(v) : v;
  });
  o.invoice_files = parseFiles_(r.invoice_files);
  o.evidence_files = parseFiles_(r.evidence_files);
  o.is_open = CLOSED_STATUSES.indexOf(r.status) === -1;
  o.age_hours = o.is_open ? hoursBetween_(r.created_at, now_()) : r.tat_hours;
  return o;
}

/* ------------------------------------------------------------------ *
 * UPDATE
 * ------------------------------------------------------------------ */

/** Low-level partial update — writes only the touched cells. */
function patchComplaint_(id, patch) {
  var t = readTable_(SHEETS.COMPLAINTS);
  var target = null;
  for (var i = 0; i < t.rows.length; i++) {
    if (String(t.rows[i].complaint_id) === String(id)) { target = t.rows[i]; break; }
  }
  if (!target) throw new AppError('NOT_FOUND', 'Complaint not found: ' + id);

  Object.keys(patch).forEach(function (k) {
    var col = SCHEMA.COMPLAINTS.indexOf(k);
    if (col === -1) return;
    t.sheet.getRange(target.__row, col + 1).setValue(patch[k]);
    target[k] = patch[k];
  });
  return target;
}

var EDITABLE_FIELDS = [
  'customer_name', 'customer_mobile', 'order_number', 'purchase_date',
  'chair_type', 'purchase_source', 'complaint_type', 'description',
  'invoice_generated_by', 'priority', 'assigned_to', 'department',
  'action_taken', 'resolution'
];

function api_updateComplaint_(params, session) {
  requirePermission_(session, 'complaint.update');
  required_(params, ['complaint_id']);

  var before = findComplaint_(params.complaint_id);
  scopeGuard_(session, before);

  var patch = {}, changes = [];
  EDITABLE_FIELDS.forEach(function (f) {
    if (params[f] === undefined) return;
    var newVal = (f === 'customer_mobile') ? normaliseMobile_(params[f]) : clean_(params[f], 4000);
    if (String(before[f]) !== String(newVal)) {
      patch[f] = newVal;
      changes.push({ field: f, from: before[f], to: newVal });
    }
  });

  if (!changes.length) return ok_({ complaint_id: params.complaint_id, changed: 0 });

  patch.updated_at = iso_(now_());
  patch.updated_by = session.email;
  patchComplaint_(params.complaint_id, patch);

  changes.forEach(function (c) {
    logHistory_(params.complaint_id, session, 'Complaint Updated', c.field, c.from, c.to, clean_(params.remarks));
  });

  bustCache_();
  return ok_({ complaint_id: params.complaint_id, changed: changes.length });
}

function scopeGuard_(session, complaint) {
  if (!scopeComplaints_(session, [complaint]).length) {
    throw new AppError('FORBIDDEN', 'This complaint is not assigned to you.');
  }
}

function api_assignComplaint_(params, session) {
  requirePermission_(session, 'complaint.assign');
  required_(params, ['complaint_id', 'assigned_to']);
  var before = findComplaint_(params.complaint_id);

  patchComplaint_(params.complaint_id, {
    assigned_to: clean_(params.assigned_to).toLowerCase(),
    department: clean_(params.department) || before.department,
    status: CLOSED_STATUSES.indexOf(before.status) === -1 ? 'Assigned' : before.status,
    updated_at: iso_(now_()),
    updated_by: session.email
  });

  logHistory_(params.complaint_id, session, 'Complaint Assigned', 'assigned_to',
    before.assigned_to, params.assigned_to, clean_(params.remarks));
  bustCache_();
  return ok_({ complaint_id: params.complaint_id, assigned_to: params.assigned_to });
}

/** Soft delete — the row stays for audit, flagged out of every query. */
function api_deleteComplaint_(params, session) {
  requirePermission_(session, 'complaint.delete');
  required_(params, ['complaint_id', 'remarks']);
  patchComplaint_(params.complaint_id, {
    is_deleted: 'TRUE', updated_at: iso_(now_()), updated_by: session.email
  });
  logHistory_(params.complaint_id, session, 'Complaint Deleted', 'is_deleted', 'FALSE', 'TRUE', params.remarks);
  bustCache_();
  return ok_({ complaint_id: params.complaint_id, deleted: true });
}
