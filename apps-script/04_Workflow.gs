/**
 * 04_Workflow.gs — warranty verification, payments, status transitions
 * and the immutable complaint timeline.
 */

/* ------------------------------------------------------------------ *
 * Timeline
 * ------------------------------------------------------------------ */

function logHistory_(complaintId, session, action, field, fromValue, toValue, remarks) {
  appendRow_(SHEETS.HISTORY, {
    history_id: uid_('HIS'),
    complaint_id: complaintId,
    timestamp: iso_(now_()),
    actor: session ? session.email : 'system',
    actor_role: session ? session.role : 'System',
    action: action,
    field: field || '',
    from_value: fromValue === undefined || fromValue === null ? '' : String(fromValue),
    to_value: toValue === undefined || toValue === null ? '' : String(toValue),
    remarks: remarks || ''
  });
}

function getTimeline_(complaintId) {
  return readTable_(SHEETS.HISTORY).rows
    .filter(function (r) { return String(r.complaint_id) === String(complaintId); })
    .map(function (r) {
      return {
        history_id: r.history_id, timestamp: iso_(r.timestamp), actor: r.actor,
        actor_role: r.actor_role, action: r.action, field: r.field,
        from_value: r.from_value, to_value: r.to_value, remarks: r.remarks
      };
    })
    .sort(function (a, b) { return a.timestamp < b.timestamp ? -1 : 1; });
}

function api_getTimeline_(params, session) {
  required_(params, ['complaint_id']);
  scopeGuard_(session, findComplaint_(params.complaint_id));
  return ok_(getTimeline_(params.complaint_id));
}

/* ------------------------------------------------------------------ *
 * Warranty verification
 * ------------------------------------------------------------------ */

function api_verifyWarranty_(params, session) {
  requirePermission_(session, 'warranty.verify');
  required_(params, ['complaint_id', 'warranty_status']);
  oneOf_(params.warranty_status, WARRANTY_STATUSES, 'warranty_status');

  var before = findComplaint_(params.complaint_id);
  scopeGuard_(session, before);

  var patch = {
    warranty_status: params.warranty_status,
    warranty_verified_by: session.email,
    warranty_verified_at: iso_(now_()),
    warranty_remarks: clean_(params.warranty_remarks, 1000),
    updated_at: iso_(now_()),
    updated_by: session.email
  };

  if (params.warranty_status === 'Out of Warranty') {
    var amount = Number(params.payment_amount || 0);
    if (params.payment_required === true || amount > 0) {
      if (amount <= 0) throw new AppError('VALIDATION_FAILED', 'Enter the service amount to charge the customer.');
      patch.payment_required = 'TRUE';
      patch.payment_status = 'Pending';
      patch.payment_amount = amount;
      patch.status = 'Awaiting Payment';
    } else {
      patch.status = 'Assigned';
    }
  } else if (params.warranty_status === 'Under Warranty') {
    patch.payment_required = 'FALSE';
    patch.payment_status = 'Not Required';
    patch.status = 'Assigned';
  } else {
    patch.status = 'Warranty Check';
  }

  patchComplaint_(params.complaint_id, patch);

  logHistory_(params.complaint_id, session, 'Warranty Verified', 'warranty_status',
    before.warranty_status, params.warranty_status, patch.warranty_remarks);
  if (patch.payment_amount) {
    logHistory_(params.complaint_id, session, 'Payment Required', 'payment_amount',
      '', '₹' + patch.payment_amount, 'Out-of-warranty paid service');
  }
  if (patch.status !== before.status) {
    logHistory_(params.complaint_id, session, 'Status Changed', 'status', before.status, patch.status, '');
  }

  bustCache_();
  return ok_({ complaint_id: params.complaint_id, warranty_status: params.warranty_status, status: patch.status });
}

/* ------------------------------------------------------------------ *
 * Payments
 * ------------------------------------------------------------------ */

function getPayments_(complaintId) {
  return readTable_(SHEETS.PAYMENTS).rows
    .filter(function (r) { return String(r.complaint_id) === String(complaintId); })
    .map(function (r) {
      return {
        payment_id: r.payment_id, complaint_id: r.complaint_id, amount: Number(r.amount || 0),
        payment_date: dateOnly_(r.payment_date), payment_mode: r.payment_mode,
        reference_id: r.reference_id, proof_file: parseFiles_(r.proof_file),
        collected_by: r.collected_by, verified_by: r.verified_by,
        verification_status: r.verification_status, remarks: r.remarks,
        created_at: iso_(r.created_at)
      };
    });
}

function api_recordPayment_(params, session) {
  requirePermission_(session, 'payment.update');
  required_(params, ['complaint_id', 'amount', 'payment_date', 'payment_mode']);
  oneOf_(params.payment_mode, PAYMENT_MODES, 'payment_mode');

  var amount = Number(params.amount);
  if (!(amount > 0)) throw new AppError('VALIDATION_FAILED', 'Payment amount must be greater than zero.');

  var complaint = findComplaint_(params.complaint_id);
  scopeGuard_(session, complaint);

  // Duplicate guard on the transaction reference.
  if (params.reference_id) {
    var existing = readTable_(SHEETS.PAYMENTS).rows.filter(function (r) {
      return r.reference_id && String(r.reference_id) === String(params.reference_id);
    });
    if (existing.length) {
      throw new AppError('DUPLICATE_PAYMENT',
        'Transaction reference ' + params.reference_id + ' is already recorded against ' + existing[0].complaint_id + '.');
    }
  }

  var proof = [];
  if (params.proof_file && params.proof_file.length) {
    proof = storeFiles_(params.complaint_id, 'Payment Proof', params.proof_file, APP.MAX_INVOICE_MB);
  }

  var payment = {
    payment_id: uid_('PAY'),
    complaint_id: params.complaint_id,
    amount: amount,
    payment_date: dateOnly_(parseDate_(params.payment_date)),
    payment_mode: params.payment_mode,
    reference_id: clean_(params.reference_id, 120),
    proof_file: serialiseFiles_(proof),
    collected_by: session.email,
    verified_by: '',
    verification_status: 'Pending',
    remarks: clean_(params.remarks, 1000),
    created_at: iso_(now_())
  };
  appendRow_(SHEETS.PAYMENTS, payment);

  var collected = Number(complaint.payment_collected || 0) + amount;
  patchComplaint_(params.complaint_id, {
    payment_required: 'TRUE',
    payment_status: 'Collected',
    payment_collected: collected,
    payment_amount: Number(complaint.payment_amount || 0) || amount,
    status: 'Payment Verification',
    updated_at: iso_(now_()),
    updated_by: session.email
  });

  logHistory_(params.complaint_id, session, 'Payment Recorded', 'payment_collected',
    complaint.payment_collected, collected,
    params.payment_mode + (params.reference_id ? ' · ref ' + params.reference_id : ''));

  bustCache_();
  return ok_({ payment_id: payment.payment_id, collected: collected, proof: proof });
}

function api_verifyPayment_(params, session) {
  requirePermission_(session, 'payment.verify');
  required_(params, ['payment_id', 'verification_status']);
  oneOf_(params.verification_status, ['Verified', 'Failed', 'Refunded'], 'verification_status');

  var t = readTable_(SHEETS.PAYMENTS);
  var pay = null;
  for (var i = 0; i < t.rows.length; i++) {
    if (String(t.rows[i].payment_id) === String(params.payment_id)) { pay = t.rows[i]; break; }
  }
  if (!pay) throw new AppError('NOT_FOUND', 'Payment not found: ' + params.payment_id);

  pay.verification_status = params.verification_status;
  pay.verified_by = session.email;
  pay.remarks = clean_(params.remarks, 1000) || pay.remarks;
  writeRow_(SHEETS.PAYMENTS, pay.__row, pay);

  var complaintPatch = {
    payment_status: params.verification_status === 'Verified' ? 'Verified' : params.verification_status,
    updated_at: iso_(now_()),
    updated_by: session.email
  };
  if (params.verification_status === 'Verified') complaintPatch.status = 'In Progress';
  patchComplaint_(pay.complaint_id, complaintPatch);

  logHistory_(pay.complaint_id, session, 'Payment ' + params.verification_status,
    'payment_status', 'Collected', params.verification_status, pay.remarks);

  bustCache_();
  return ok_({ payment_id: pay.payment_id, verification_status: params.verification_status });
}

/* ------------------------------------------------------------------ *
 * Status transitions
 * ------------------------------------------------------------------ */

/** Which statuses may follow which. Keeps the lifecycle honest. */
var TRANSITIONS = {
  'Registered': ['Under Verification', 'Warranty Check', 'Assigned', 'Rejected'],
  'Under Verification': ['Warranty Check', 'Assigned', 'Rejected'],
  'Warranty Check': ['Awaiting Payment', 'Assigned', 'Rejected'],
  'Awaiting Payment': ['Payment Verification', 'Assigned', 'Rejected'],
  'Payment Verification': ['Assigned', 'In Progress', 'Rejected'],
  'Assigned': ['In Progress', 'Resolved', 'Rejected'],
  'In Progress': ['Resolved', 'Awaiting Customer Confirmation', 'Rejected'],
  'Resolved': ['Awaiting Customer Confirmation', 'Closed', 'In Progress'],
  'Awaiting Customer Confirmation': ['Closed', 'In Progress'],
  'Closed': ['In Progress'],
  'Rejected': ['Under Verification']
};

function api_updateStatus_(params, session) {
  requirePermission_(session, 'complaint.update');
  required_(params, ['complaint_id', 'status']);
  oneOf_(params.status, STATUSES, 'status');

  var before = findComplaint_(params.complaint_id);
  scopeGuard_(session, before);

  var allowed = TRANSITIONS[before.status] || STATUSES;
  if (before.status !== params.status && allowed.indexOf(params.status) === -1 && !can_(session, '*')) {
    throw new AppError('INVALID_TRANSITION',
      'Cannot move a complaint from "' + before.status + '" to "' + params.status + '".',
      { allowed: allowed });
  }
  if ((params.status === 'Closed' || params.status === 'Resolved') &&
      String(before.payment_status) === 'Pending') {
    throw new AppError('PAYMENT_PENDING', 'Collect and verify the pending payment before closing this complaint.');
  }

  var patch = { status: params.status, updated_at: iso_(now_()), updated_by: session.email };
  if (params.action_taken) patch.action_taken = clean_(params.action_taken, 2000);
  if (params.resolution) patch.resolution = clean_(params.resolution, 2000);

  if (params.status === 'Resolved' || params.status === 'Closed') {
    if (!before.resolution_date) {
      patch.resolution_date = iso_(now_());
      patch.tat_hours = hoursBetween_(before.created_at, now_());
    }
  }
  if (params.status === 'Closed') {
    patch.closed_at = iso_(now_());
    if (params.customer_confirmed) patch.customer_confirmed = 'TRUE';
  }
  if (params.status === 'In Progress' && CLOSED_STATUSES.indexOf(before.status) !== -1) {
    patch.reopened_count = Number(before.reopened_count || 0) + 1;
    patch.closed_at = '';
  }

  patchComplaint_(params.complaint_id, patch);
  logHistory_(params.complaint_id, session, 'Status Changed', 'status',
    before.status, params.status, clean_(params.remarks, 1000));

  bustCache_();
  return ok_({ complaint_id: params.complaint_id, status: params.status, tat_hours: patch.tat_hours });
}

function api_confirmByCustomer_(params, session) {
  requirePermission_(session, 'complaint.update');
  required_(params, ['complaint_id']);
  var before = findComplaint_(params.complaint_id);

  patchComplaint_(params.complaint_id, {
    customer_confirmed: 'TRUE',
    status: 'Closed',
    closed_at: iso_(now_()),
    resolution_date: before.resolution_date || iso_(now_()),
    tat_hours: before.tat_hours || hoursBetween_(before.created_at, now_()),
    updated_at: iso_(now_()),
    updated_by: session.email
  });

  logHistory_(params.complaint_id, session, 'Customer Confirmed Resolution',
    'customer_confirmed', 'FALSE', 'TRUE', clean_(params.remarks, 500));
  logHistory_(params.complaint_id, session, 'Complaint Closed', 'status', before.status, 'Closed', '');

  bustCache_();
  return ok_({ complaint_id: params.complaint_id, status: 'Closed' });
}
