/**
 * 02_Auth.gs — login, session tokens and role-based access control.
 *
 * Sessions live in CacheService (fast, auto-expiring) with a ScriptProperties
 * mirror so a cache eviction does not log everyone out mid-shift.
 * Passwords are stored as SHA-256(salt + password) — never in plain text.
 */

function hashPassword_(password, salt) {
  var raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + '::' + password,
    Utilities.Charset.UTF_8
  );
  return raw.map(function (b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}

function newSalt_() {
  return Utilities.getUuid().replace(/-/g, '');
}

/** POST login — returns a session token plus the user's permission set. */
function api_login_(params) {
  required_(params, ['email', 'password']);
  var email = clean_(params.email).toLowerCase();

  var t = readTable_(SHEETS.EMPLOYEES);
  var user = null;
  for (var i = 0; i < t.rows.length; i++) {
    if (String(t.rows[i].email).toLowerCase() === email) { user = t.rows[i]; break; }
  }
  if (!user) throw new AppError('AUTH_FAILED', 'Invalid email or password.');
  if (String(user.active).toUpperCase() !== 'TRUE' && user.active !== true) {
    throw new AppError('ACCOUNT_DISABLED', 'This account has been deactivated. Contact your administrator.');
  }
  if (hashPassword_(params.password, user.salt) !== String(user.password_hash)) {
    throw new AppError('AUTH_FAILED', 'Invalid email or password.');
  }

  var token = Utilities.getUuid() + '.' + Utilities.getUuid();
  var session = {
    token: token,
    employee_id: user.employee_id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    issued_at: iso_(now_())
  };
  storeSession_(token, session);

  t.sheet.getRange(user.__row, SCHEMA.EMPLOYEES.indexOf('last_login') + 1).setValue(iso_(now_()));

  return ok_({
    token: token,
    user: {
      employee_id: user.employee_id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department
    },
    permissions: PERMISSIONS[user.role] || []
  });
}

function storeSession_(token, session) {
  var json = JSON.stringify(session);
  CacheService.getScriptCache().put('sess_' + token, json, APP.SESSION_TTL_SECONDS);
  PropertiesService.getScriptProperties().setProperty('sess_' + token, json);
}

function api_logout_(params, session) {
  CacheService.getScriptCache().remove('sess_' + session.token);
  PropertiesService.getScriptProperties().deleteProperty('sess_' + session.token);
  return ok_({ loggedOut: true });
}

/** Resolve a token to a session, or throw. */
function requireSession_(token) {
  if (!token) throw new AppError('UNAUTHENTICATED', 'Sign in to continue.');
  var cache = CacheService.getScriptCache();
  var json = cache.get('sess_' + token);
  if (!json) {
    json = PropertiesService.getScriptProperties().getProperty('sess_' + token);
    if (json) cache.put('sess_' + token, json, APP.SESSION_TTL_SECONDS);
  }
  if (!json) throw new AppError('SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
  var s = JSON.parse(json);
  s.token = token;
  s.permissions = PERMISSIONS[s.role] || [];
  return s;
}

function can_(session, permission) {
  var p = session.permissions || [];
  return p.indexOf('*') !== -1 || p.indexOf(permission) !== -1;
}

function requirePermission_(session, permission) {
  if (!can_(session, permission)) {
    throw new AppError('FORBIDDEN',
      'Your role (' + session.role + ') is not allowed to perform this action.',
      { required: permission });
  }
}

/**
 * Scope rule: anyone without complaint.read.all only ever sees complaints
 * they raised or are assigned to. Applied on the server, not the client.
 */
function scopeComplaints_(session, rows) {
  if (can_(session, 'complaint.read.all')) return rows;
  var email = String(session.email).toLowerCase();
  return rows.filter(function (r) {
    return String(r.assigned_to).toLowerCase() === email ||
           String(r.created_by).toLowerCase() === email;
  });
}

/* ---------------- Employee management (Admin only) ---------------- */

function api_listEmployees_(params, session) {
  requirePermission_(session, 'employee.read');
  var rows = readTable_(SHEETS.EMPLOYEES).rows.map(function (r) {
    return {
      employee_id: r.employee_id, name: r.name, email: r.email, role: r.role,
      department: r.department, phone: r.phone, active: r.active,
      created_at: iso_(r.created_at), last_login: iso_(r.last_login)
    };
  });
  return ok_(rows);
}

function api_saveEmployee_(params, session) {
  requirePermission_(session, 'employee.manage');
  required_(params, ['name', 'email', 'role']);
  oneOf_(params.role, ROLES, 'role');

  var email = clean_(params.email).toLowerCase();
  var t = readTable_(SHEETS.EMPLOYEES);
  var existing = null;
  for (var i = 0; i < t.rows.length; i++) {
    if (String(t.rows[i].email).toLowerCase() === email) { existing = t.rows[i]; break; }
  }

  if (existing) {
    existing.name = clean_(params.name);
    existing.role = params.role;
    existing.department = clean_(params.department);
    existing.phone = clean_(params.phone);
    existing.active = params.active === false ? 'FALSE' : 'TRUE';
    if (params.password) {
      existing.salt = newSalt_();
      existing.password_hash = hashPassword_(params.password, existing.salt);
    }
    writeRow_(SHEETS.EMPLOYEES, existing.__row, existing);
    return ok_({ employee_id: existing.employee_id, updated: true });
  }

  if (!params.password) throw new AppError('VALIDATION_FAILED', 'A password is required for a new employee.');
  var salt = newSalt_();
  var rec = {
    employee_id: uid_('EMP'),
    name: clean_(params.name),
    email: email,
    password_hash: hashPassword_(params.password, salt),
    salt: salt,
    role: params.role,
    department: clean_(params.department),
    phone: clean_(params.phone),
    active: 'TRUE',
    created_at: iso_(now_()),
    last_login: ''
  };
  appendRow_(SHEETS.EMPLOYEES, rec);
  return ok_({ employee_id: rec.employee_id, created: true });
}

function api_changePassword_(params, session) {
  required_(params, ['current_password', 'new_password']);
  if (String(params.new_password).length < 8) {
    throw new AppError('VALIDATION_FAILED', 'New password must be at least 8 characters.');
  }
  var t = readTable_(SHEETS.EMPLOYEES);
  var user = null;
  for (var i = 0; i < t.rows.length; i++) {
    if (String(t.rows[i].email).toLowerCase() === String(session.email).toLowerCase()) { user = t.rows[i]; break; }
  }
  if (!user) throw new AppError('NOT_FOUND', 'Employee record not found.');
  if (hashPassword_(params.current_password, user.salt) !== String(user.password_hash)) {
    throw new AppError('AUTH_FAILED', 'Current password is incorrect.');
  }
  user.salt = newSalt_();
  user.password_hash = hashPassword_(params.new_password, user.salt);
  writeRow_(SHEETS.EMPLOYEES, user.__row, user);
  return ok_({ changed: true });
}
