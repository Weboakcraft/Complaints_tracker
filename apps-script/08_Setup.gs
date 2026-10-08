/**
 * 08_Setup.gs — run ONCE from the Apps Script editor.
 *
 *   1. Setup_initialiseSystem()   creates every sheet, header, setting,
 *                                 Drive folder and the first Admin login.
 *   2. Setup_loadSampleData()     optional: 24 realistic complaints so the
 *                                 dashboard has something to show on day one.
 *   3. Setup_resetPassword()      emergency password reset.
 */

var DEFAULT_ADMIN = {
  name: 'System Administrator',
  email: 'admin@oakcraft.in',
  password: 'OakCraft@2026',      // change this immediately after first login
  role: 'Admin',
  department: 'Customer Support'
};

function Setup_initialiseSystem() {
  var ss = ss_();
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  ss.setSpreadsheetTimeZone(APP.TIMEZONE);

  Object.keys(SCHEMA).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var headers = SCHEMA[name];
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    if (sh.getMaxColumns() > headers.length) {
      sh.deleteColumns(headers.length + 1, sh.getMaxColumns() - headers.length);
    }
    sh.autoResizeColumns(1, Math.min(headers.length, 12));
  });

  // Remove the default empty sheet if it is still around.
  var def = ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);

  seedSettings_(ss);
  seedMasterData_();
  Setup_createDriveFolders();
  seedAdmin_();
  bustCache_();

  Logger.log('Setup complete.');
  Logger.log('Spreadsheet: ' + ss.getUrl());
  Logger.log('Admin login: ' + DEFAULT_ADMIN.email + ' / ' + DEFAULT_ADMIN.password);
  return 'Setup complete. Deploy as a Web App next.';
}

function seedSettings_(ss) {
  var sh = sheet_(SHEETS.SETTINGS);
  if (sh.getLastRow() > 1) return;
  var rows = [
    ['company_name', 'OakCraft', 'Shown in the app header and exports'],
    ['complaint_id_prefix', APP.ID_PREFIX, 'Prefix for generated complaint IDs'],
    ['timezone', APP.TIMEZONE, 'All timestamps use this timezone'],
    ['drive_root_folder_name', APP.ROOT_FOLDER, 'Top level Drive folder'],
    ['drive_root_folder_id', '', 'Filled in automatically on first upload'],
    ['sla_hours_critical', '24', 'Target turnaround for Critical priority'],
    ['sla_hours_high', '48', 'Target turnaround for High priority'],
    ['sla_hours_default', '72', 'Target turnaround for everything else'],
    ['currency_symbol', '₹', 'Used in payment displays'],
    ['support_email', 'support@oakcraft.in', 'Reply-to for customer notifications']
  ].map(function (r) { return { key: r[0], value: r[1], description: r[2] }; });
  appendRows_(SHEETS.SETTINGS, rows);
}

function seedMasterData_() {
  var sh = sheet_(SHEETS.MASTER);
  if (sh.getLastRow() > 1) return;
  var rows = [];
  function add(category, list) {
    list.forEach(function (v, i) {
      rows.push({ category: category, value: v, label: v, sort_order: i + 1, active: 'TRUE' });
    });
  }
  add('chair_type', CHAIR_TYPES);
  add('purchase_source', PURCHASE_SOURCES);
  add('complaint_type', COMPLAINT_TYPES);
  add('invoice_entity', INVOICE_ENTITIES);
  add('status', STATUSES);
  add('warranty_status', WARRANTY_STATUSES);
  add('payment_status', PAYMENT_STATUSES);
  add('payment_mode', PAYMENT_MODES);
  add('priority', PRIORITIES);
  add('department', DEPARTMENTS);
  add('role', ROLES);
  appendRows_(SHEETS.MASTER, rows);
}

function seedAdmin_() {
  var t = readTable_(SHEETS.EMPLOYEES);
  if (t.rows.length) return;
  var salt = newSalt_();
  appendRow_(SHEETS.EMPLOYEES, {
    employee_id: uid_('EMP'),
    name: DEFAULT_ADMIN.name,
    email: DEFAULT_ADMIN.email,
    password_hash: hashPassword_(DEFAULT_ADMIN.password, salt),
    salt: salt,
    role: DEFAULT_ADMIN.role,
    department: DEFAULT_ADMIN.department,
    phone: '',
    active: 'TRUE',
    created_at: iso_(now_()),
    last_login: ''
  });
}

/** Emergency reset: edit the two values, run, then delete your edit. */
function Setup_resetPassword() {
  var email = 'admin@oakcraft.in';
  var newPassword = 'OakCraft@2026';

  var t = readTable_(SHEETS.EMPLOYEES);
  for (var i = 0; i < t.rows.length; i++) {
    if (String(t.rows[i].email).toLowerCase() === email.toLowerCase()) {
      var u = t.rows[i];
      u.salt = newSalt_();
      u.password_hash = hashPassword_(newPassword, u.salt);
      writeRow_(SHEETS.EMPLOYEES, u.__row, u);
      return 'Password reset for ' + email;
    }
  }
  return 'No employee found with that email.';
}

/* ------------------------------------------------------------------ *
 * Sample data
 * ------------------------------------------------------------------ */

function Setup_loadSampleData() {
  if (readTable_(SHEETS.COMPLAINTS).rows.length) {
    return 'COMPLAINTS already has data — sample load skipped.';
  }

  var staff = [
    { name: 'Ritu Sharma', email: 'ritu@oakcraft.in', role: 'Complaint Executive', dept: 'Customer Support' },
    { name: 'Aman Verma', email: 'aman@oakcraft.in', role: 'Complaint Executive', dept: 'Customer Support' },
    { name: 'Pooja Nair', email: 'pooja@oakcraft.in', role: 'Manager', dept: 'Service & Repair' },
    { name: 'Rahul Mehta', email: 'rahul@oakcraft.in', role: 'Technician', dept: 'Service & Repair' },
    { name: 'Sneha Gupta', email: 'sneha@oakcraft.in', role: 'Viewer', dept: 'Quality' }
  ];
  var existing = {};
  readTable_(SHEETS.EMPLOYEES).rows.forEach(function (r) { existing[String(r.email).toLowerCase()] = true; });
  var newStaff = staff.filter(function (s) { return !existing[s.email]; }).map(function (s) {
    var salt = newSalt_();
    return {
      employee_id: uid_('EMP'), name: s.name, email: s.email,
      password_hash: hashPassword_('OakCraft@2026', salt), salt: salt,
      role: s.role, department: s.dept, phone: '',
      active: 'TRUE', created_at: iso_(now_()), last_login: ''
    };
  });
  appendRows_(SHEETS.EMPLOYEES, newStaff);

  var customers = ['Rohit Khanna','Meera Iyer','Sanjay Patel','Divya Rao','Imran Shaikh','Kavita Joshi',
    'Arjun Desai','Neha Bhatt','Vikram Singh','Anjali Menon','Tarun Kapoor','Priya Chawla',
    'Harsh Agarwal','Sunita Pillai','Deepak Yadav','Ritika Bose','Mohit Jain','Farah Khan',
    'Nikhil Reddy','Shalini Dutta','Gaurav Malhotra','Ananya Ghosh','Rakesh Kulkarni','Simran Kaur'];

  var complaints = [], history = [], payments = [];
  var props = PropertiesService.getScriptProperties();

  for (var i = 0; i < customers.length; i++) {
    var daysAgo = Math.floor(i * 1.3);
    var created = new Date(now_().getTime() - daysAgo * 86400000 - (i * 37 * 60000));
    var dayStr = Utilities.formatDate(created, APP.TIMEZONE, 'yyyyMMdd');
    var seqKey = 'SEQ_' + dayStr;
    var seq = Number(props.getProperty(seqKey) || 0) + 1;
    props.setProperty(seqKey, String(seq));

    var id = APP.ID_PREFIX + '-' + dayStr + '-' + padLeft_(seq, 4);
    var source = PURCHASE_SOURCES[i % PURCHASE_SOURCES.length];
    var chair = CHAIR_TYPES[i % CHAIR_TYPES.length];
    var issue = COMPLAINT_TYPES[i % COMPLAINT_TYPES.length];
    var owner = staff[i % 4];

    // Roughly two thirds closed, which gives a believable resolution rate.
    var resolved = (i % 3 !== 0);
    var outOfWarranty = (i % 4 === 1);
    var tat = resolved ? (12 + (i % 9) * 9) : '';
    var resolvedAt = resolved ? new Date(created.getTime() + tat * 3600000) : '';

    var rec = {
      complaint_id: id,
      created_at: iso_(created),
      created_by: owner.email,
      updated_at: iso_(resolved ? resolvedAt : created),
      updated_by: owner.email,
      customer_name: customers[i],
      customer_mobile: '9' + padLeft_(100000000 + i * 7919, 9).slice(0, 9),
      order_number: 'OAK-ORD-' + (24180 + i * 13),
      purchase_date: dateOnly_(new Date(created.getTime() - (30 + i * 5) * 86400000)),
      chair_type: chair,
      purchase_source: source,
      complaint_type: issue,
      description: sampleDescription_(issue, chair),
      invoice_generated_by: INVOICE_ENTITIES[i % INVOICE_ENTITIES.length],
      invoice_files: '', evidence_files: '',
      status: resolved ? (i % 6 === 0 ? 'Resolved' : 'Closed')
                       : ['Registered', 'Under Verification', 'Warranty Check', 'Assigned', 'In Progress'][i % 5],
      priority: PRIORITIES[i % PRIORITIES.length],
      assigned_to: owner.email,
      department: owner.dept,
      warranty_status: outOfWarranty ? 'Out of Warranty' : (i % 7 === 0 ? 'Pending Verification' : 'Under Warranty'),
      warranty_verified_by: i % 7 === 0 ? '' : owner.email,
      warranty_verified_at: i % 7 === 0 ? '' : iso_(new Date(created.getTime() + 5400000)),
      warranty_remarks: i % 7 === 0 ? '' : (outOfWarranty ? 'Purchased beyond 12-month cover.' : 'Invoice verified, within cover.'),
      payment_required: outOfWarranty ? 'TRUE' : 'FALSE',
      payment_status: outOfWarranty ? (resolved ? 'Verified' : 'Pending') : 'Not Required',
      payment_amount: outOfWarranty ? (450 + (i % 5) * 300) : 0,
      payment_collected: (outOfWarranty && resolved) ? (450 + (i % 5) * 300) : 0,
      action_taken: resolved ? sampleAction_(issue) : '',
      resolution: resolved ? 'Issue rectified and verified with the customer.' : '',
      resolution_date: resolved ? iso_(resolvedAt) : '',
      tat_hours: tat,
      customer_confirmed: resolved ? 'TRUE' : 'FALSE',
      closed_at: resolved && i % 6 !== 0 ? iso_(resolvedAt) : '',
      reopened_count: (i % 11 === 0) ? 1 : 0,
      is_deleted: 'FALSE'
    };
    complaints.push(rec);

    history.push(hist_(id, created, owner, 'Complaint Registered', 'status', '', 'Registered', source));
    if (rec.warranty_status !== 'Pending Verification') {
      history.push(hist_(id, new Date(created.getTime() + 5400000), owner, 'Warranty Verified',
        'warranty_status', 'Pending Verification', rec.warranty_status, rec.warranty_remarks));
    }
    if (outOfWarranty) {
      history.push(hist_(id, new Date(created.getTime() + 7200000), owner, 'Payment Required',
        'payment_amount', '', '₹' + rec.payment_amount, 'Out-of-warranty paid service'));
      if (resolved) {
        var payDate = new Date(created.getTime() + 10800000);
        payments.push({
          payment_id: uid_('PAY'), complaint_id: id, amount: rec.payment_amount,
          payment_date: dateOnly_(payDate), payment_mode: PAYMENT_MODES[i % PAYMENT_MODES.length],
          reference_id: 'TXN' + (90210 + i * 31), proof_file: '',
          collected_by: owner.email, verified_by: 'pooja@oakcraft.in',
          verification_status: 'Verified', remarks: 'Collected before dispatch of spare.',
          created_at: iso_(payDate)
        });
        history.push(hist_(id, payDate, owner, 'Payment Recorded', 'payment_collected', 0, rec.payment_amount, 'Verified'));
      }
    }
    if (resolved) {
      history.push(hist_(id, resolvedAt, owner, 'Status Changed', 'status', 'In Progress', rec.status, rec.action_taken));
    }
  }

  appendRows_(SHEETS.COMPLAINTS, complaints);
  appendRows_(SHEETS.HISTORY, history);
  appendRows_(SHEETS.PAYMENTS, payments);
  bustCache_();

  return 'Loaded ' + complaints.length + ' sample complaints, ' + payments.length +
         ' payments and ' + history.length + ' timeline events.';
}

function hist_(id, when, owner, action, field, from, to, remarks) {
  return {
    history_id: uid_('HIS'), complaint_id: id, timestamp: iso_(when),
    actor: owner.email, actor_role: owner.role, action: action, field: field || '',
    from_value: from === undefined ? '' : String(from), to_value: to === undefined ? '' : String(to),
    remarks: remarks || ''
  };
}

function sampleDescription_(issue, chair) {
  var map = {
    'Structural Defect': 'The base of the ' + chair.toLowerCase() + ' developed a visible crack near the weld within weeks of use.',
    'Assembly Issue': 'Two bolt holes on the seat plate do not line up with the supplied bracket, so assembly cannot be completed.',
    'Comfort/Ergonomics Issue': 'Lumbar support sits far lower than shown on the product page and causes back strain after an hour.',
    'Material/Upholstery Damage': 'Fabric on the left armrest has frayed and the seam has opened along a 6 cm stretch.',
    'Mechanism Failure': 'The gas lift no longer holds height and the seat sinks fully within a minute of sitting down.',
    'Aesthetic/Finish Issue': 'Noticeable scratches and a patch of uneven polish on the right leg, visible on delivery.',
    'Other': 'Wheels squeak loudly on a hard floor and one castor keeps detaching from its socket.'
  };
  return map[issue] || map['Other'];
}

function sampleAction_(issue) {
  var map = {
    'Structural Defect': 'Replacement base dispatched and fitted on site by the service team.',
    'Assembly Issue': 'Corrected bracket shipped with illustrated assembly guide; installation confirmed.',
    'Comfort/Ergonomics Issue': 'Lumbar module swapped for the adjustable variant at no cost.',
    'Material/Upholstery Damage': 'Armrest upholstery re-stitched and matched to the original fabric.',
    'Mechanism Failure': 'Gas lift cylinder replaced and load-tested on site.',
    'Aesthetic/Finish Issue': 'Leg refinished at the workshop and returned within the TAT window.',
    'Other': 'Castor set replaced with the heavy-duty variant.'
  };
  return map[issue] || map['Other'];
}
