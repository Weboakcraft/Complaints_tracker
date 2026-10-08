/**
 * 05_Files.gs — Google Drive storage.
 *
 * Layout:
 *   Complaint Management/
 *     Invoices/<COMPLAINT_ID>/
 *     Complaint Evidence/<COMPLAINT_ID>/
 *     Payment Proof/<COMPLAINT_ID>/
 *
 * Nothing is kept in the browser. The sheet stores a compact JSON array of
 * {id, name, url, size, type} so the UI can render links without a Drive call.
 */

var SUBFOLDERS = ['Invoices', 'Complaint Evidence', 'Payment Proof'];

function getRootFolder_() {
  var settings = getSettings_();
  if (settings.drive_root_folder_id) {
    try { return DriveApp.getFolderById(settings.drive_root_folder_id); } catch (e) { /* recreate below */ }
  }
  var name = settings.drive_root_folder_name || APP.ROOT_FOLDER;
  var it = DriveApp.getFoldersByName(name);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(name);
  setSetting_('drive_root_folder_id', folder.getId());
  return folder;
}

function getOrCreateChild_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function folderFor_(category, complaintId) {
  var root = getRootFolder_();
  var cat = getOrCreateChild_(root, category);
  return getOrCreateChild_(cat, complaintId);
}

/**
 * files: [{ name, mimeType, data (base64, no data: prefix) }]
 * Returns [{ id, name, url, size, type }]
 */
function storeFiles_(complaintId, category, files, maxMb) {
  if (SUBFOLDERS.indexOf(category) === -1) {
    throw new AppError('VALIDATION_FAILED', 'Unknown file category: ' + category);
  }
  if (files.length > APP.MAX_FILES_PER_FIELD) {
    throw new AppError('TOO_MANY_FILES', 'Up to ' + APP.MAX_FILES_PER_FIELD + ' files are allowed per field.');
  }

  var folder = folderFor_(category, complaintId);
  var limit = maxMb * 1024 * 1024;
  var saved = [];

  files.forEach(function (f, i) {
    if (!f || !f.data) return;
    var b64 = String(f.data).replace(/^data:[^;]+;base64,/, '');
    var bytes = Utilities.base64Decode(b64);
    if (bytes.length > limit) {
      throw new AppError('FILE_TOO_LARGE',
        '"' + (f.name || 'file') + '" is larger than the ' + maxMb + ' MB limit for this field.');
    }
    var safeName = complaintId + '_' + category.replace(/\s+/g, '') + '_' + (i + 1) + '_' +
      clean_(f.name || 'file', 80).replace(/[^\w.\- ]+/g, '_');
    var blob = Utilities.newBlob(bytes, f.mimeType || 'application/octet-stream', safeName);
    var file = folder.createFile(blob);
    file.setDescription('Complaint ' + complaintId + ' · ' + category);
    saved.push({
      id: file.getId(),
      name: safeName,
      url: 'https://drive.google.com/file/d/' + file.getId() + '/view',
      size: bytes.length,
      type: f.mimeType || ''
    });
  });

  return saved;
}

function serialiseFiles_(arr) {
  return (arr && arr.length) ? JSON.stringify(arr) : '';
}

function parseFiles_(raw) {
  if (!raw) return [];
  try {
    var v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}

/** Attach files to an existing complaint after registration. */
function api_uploadFiles_(params, session) {
  requirePermission_(session, 'complaint.update');
  required_(params, ['complaint_id', 'category', 'files']);

  var complaint = findComplaint_(params.complaint_id);
  scopeGuard_(session, complaint);

  var maxMb = params.category === 'Complaint Evidence' ? APP.MAX_EVIDENCE_MB : APP.MAX_INVOICE_MB;
  var fieldMap = { 'Invoices': 'invoice_files', 'Complaint Evidence': 'evidence_files' };
  var field = fieldMap[params.category];

  var saved = storeFiles_(params.complaint_id, params.category, params.files, maxMb);

  if (field) {
    var merged = parseFiles_(complaint[field]).concat(saved);
    if (merged.length > APP.MAX_FILES_PER_FIELD) {
      throw new AppError('TOO_MANY_FILES',
        'This complaint already has ' + parseFiles_(complaint[field]).length + ' file(s) in ' + params.category + '.');
    }
    var patch = { updated_at: iso_(now_()), updated_by: session.email };
    patch[field] = serialiseFiles_(merged);
    patchComplaint_(params.complaint_id, patch);
  }

  logHistory_(params.complaint_id, session, 'Files Attached', params.category, '',
    saved.length + ' file(s)', saved.map(function (f) { return f.name; }).join(', '));

  return ok_({ files: saved });
}

/** One-time Drive scaffold; also called by Setup. */
function Setup_createDriveFolders() {
  var root = getRootFolder_();
  SUBFOLDERS.forEach(function (n) { getOrCreateChild_(root, n); });
  Logger.log('Drive root: ' + root.getUrl());
  return root.getId();
}
