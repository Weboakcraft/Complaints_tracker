/**
 * 01_Utils.gs — spreadsheet access, row/object mapping, validation, responses.
 *
 * Performance note: every read goes through readTable_(), which pulls the whole
 * sheet in ONE getValues() call and maps it in memory. Apps Script is slow per
 * call, not per row — 20k rows in one call is far faster than 50 ranged reads.
 */

/* ------------------------------------------------------------------ *
 * Spreadsheet handles
 * ------------------------------------------------------------------ */

function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new AppError('SHEET_MISSING', 'Sheet not found: ' + name + '. Run Setup_initialiseSystem().');
  return sh;
}

/**
 * Read an entire sheet as an array of plain objects keyed by SCHEMA.
 * Returns { rows: [...], headers: [...], sheet: Sheet }.
 */
function readTable_(name) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  var headers = SCHEMA[name];
  if (last < 2) return { rows: [], headers: headers, sheet: sh };

  var values = sh.getRange(2, 1, last - 1, headers.length).getValues();
  var rows = new Array(values.length);
  for (var r = 0; r < values.length; r++) {
    var o = {};
    for (var c = 0; c < headers.length; c++) o[headers[c]] = values[r][c];
    o.__row = r + 2;               // physical row number, for targeted updates
    rows[r] = o;
  }
  return { rows: rows, headers: headers, sheet: sh };
}

/** Convert an object to a row array in schema order. */
function toRow_(name, obj) {
  var headers = SCHEMA[name];
  var row = new Array(headers.length);
  for (var i = 0; i < headers.length; i++) {
    var v = obj[headers[i]];
    row[i] = (v === undefined || v === null) ? '' : v;
  }
  return row;
}

/** Append one object. */
function appendRow_(name, obj) {
  sheet_(name).appendRow(toRow_(name, obj));
}

/** Append many objects in a single write. */
function appendRows_(name, objs) {
  if (!objs.length) return;
  var sh = sheet_(name);
  var rows = objs.map(function (o) { return toRow_(name, o); });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, SCHEMA[name].length).setValues(rows);
}

/** Overwrite a single physical row from an object. */
function writeRow_(name, rowNumber, obj) {
  sheet_(name).getRange(rowNumber, 1, 1, SCHEMA[name].length)
    .setValues([toRow_(name, obj)]);
}

/* ------------------------------------------------------------------ *
 * Errors + API responses
 * ------------------------------------------------------------------ */

function AppError(code, message, details) {
  this.name = 'AppError';
  this.code = code;
  this.message = message;
  this.details = details || null;
}
AppError.prototype = Object.create(Error.prototype);

function ok_(data, meta) {
  return { success: true, data: data === undefined ? null : data, meta: meta || {} };
}

function fail_(code, message, details) {
  return { success: false, error: { code: code, message: message, details: details || null } };
}

/** Serialise any payload as JSON, with optional JSONP callback. */
function respond_(payload, callback) {
  var json = JSON.stringify(payload, dateReplacer_);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

/** Dates always leave the API as ISO strings — never locale-dependent text. */
function dateReplacer_(key, value) {
  return value;
}

/* ------------------------------------------------------------------ *
 * Dates
 * ------------------------------------------------------------------ */

function now_() { return new Date(); }

function iso_(d) {
  if (!d) return '';
  if (typeof d === 'string') return d;
  if (Object.prototype.toString.call(d) !== '[object Date]') return String(d);
  return Utilities.formatDate(d, APP.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function dateOnly_(d) {
  if (!d) return '';
  if (typeof d === 'string') return d.slice(0, 10);
  return Utilities.formatDate(d, APP.TIMEZONE, 'yyyy-MM-dd');
}

function parseDate_(v) {
  if (!v) return null;
  if (Object.prototype.toString.call(v) === '[object Date]') return v;
  var s = String(v).trim();
  // Accept DD/MM/YYYY as well as ISO
  var m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function hoursBetween_(a, b) {
  var d1 = parseDate_(a), d2 = parseDate_(b);
  if (!d1 || !d2) return '';
  return Math.round(((d2.getTime() - d1.getTime()) / 36e5) * 10) / 10;
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

function required_(obj, fields) {
  var missing = fields.filter(function (f) {
    return obj[f] === undefined || obj[f] === null || String(obj[f]).trim() === '';
  });
  if (missing.length) {
    throw new AppError('VALIDATION_FAILED', 'Missing required field(s): ' + missing.join(', '), { fields: missing });
  }
}

function oneOf_(value, list, fieldName) {
  if (list.indexOf(value) === -1) {
    throw new AppError('VALIDATION_FAILED',
      'Invalid value for ' + fieldName + ': "' + value + '"', { allowed: list });
  }
}

function normaliseMobile_(raw) {
  var digits = String(raw).replace(/\D/g, '');
  if (digits.length === 12 && digits.indexOf('91') === 0) digits = digits.slice(2);
  if (digits.length === 11 && digits.charAt(0) === '0') digits = digits.slice(1);
  if (digits.length !== 10) {
    throw new AppError('VALIDATION_FAILED', 'Mobile number must be 10 digits. Received: ' + raw);
  }
  return digits;
}

function clean_(v, maxLen) {
  var s = String(v === undefined || v === null ? '' : v).trim();
  if (maxLen && s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

/* ------------------------------------------------------------------ *
 * Settings + cache
 * ------------------------------------------------------------------ */

function getSettings_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('settings');
  if (hit) return JSON.parse(hit);

  var t = readTable_(SHEETS.SETTINGS);
  var out = {};
  t.rows.forEach(function (r) { if (r.key) out[String(r.key)] = r.value; });
  cache.put('settings', JSON.stringify(out), 300);
  return out;
}

function setSetting_(key, value) {
  var t = readTable_(SHEETS.SETTINGS);
  var found = null;
  for (var i = 0; i < t.rows.length; i++) if (t.rows[i].key === key) { found = t.rows[i]; break; }
  if (found) {
    t.sheet.getRange(found.__row, 2).setValue(value);
  } else {
    appendRow_(SHEETS.SETTINGS, { key: key, value: value, description: '' });
  }
  CacheService.getScriptCache().remove('settings');
}

function bustCache_() {
  CacheService.getScriptCache().removeAll(['settings', 'dashboard', 'master']);
}

/* ------------------------------------------------------------------ *
 * IDs
 * ------------------------------------------------------------------ */

/**
 * Unique complaint ID: OAK-CMP-YYYYMMDD-0001.
 * Guarded by a script lock + a persisted counter, so two simultaneous
 * submissions can never receive the same ID.
 */
function nextComplaintId_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var props = PropertiesService.getScriptProperties();
    var today = Utilities.formatDate(now_(), APP.TIMEZONE, 'yyyyMMdd');
    var key = 'SEQ_' + today;
    var seq = Number(props.getProperty(key) || 0) + 1;
    props.setProperty(key, String(seq));
    var prefix = (getSettings_().complaint_id_prefix || APP.ID_PREFIX);
    var id = prefix + '-' + today + '-' + padLeft_(seq, 4);

    // Belt and braces: if the ID somehow exists, keep incrementing.
    var existing = complaintIdIndex_();
    while (existing[id]) {
      seq++;
      props.setProperty(key, String(seq));
      id = prefix + '-' + today + '-' + padLeft_(seq, 4);
    }
    return id;
  } finally {
    lock.releaseLock();
  }
}

function complaintIdIndex_() {
  var t = readTable_(SHEETS.COMPLAINTS);
  var idx = {};
  t.rows.forEach(function (r) { idx[r.complaint_id] = true; });
  return idx;
}

function padLeft_(n, width) {
  var s = String(n);
  while (s.length < width) s = '0' + s;
  return s;
}

function uid_(prefix) {
  return prefix + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase();
}

function pct_(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}
