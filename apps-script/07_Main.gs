/**
 * 07_Main.gs — the only two entry points Google calls.
 *
 * Every request is { action, token, ...params }.
 *   GET  — reads. Supports ?callback= for JSONP.
 *   POST — writes. Sent as text/plain so the browser skips the CORS preflight
 *          that Apps Script cannot answer.
 */

var PUBLIC_ACTIONS = ['ping', 'login'];

var ROUTES = {
  // auth
  'ping':             function (p, s) { return ok_({ app: APP.NAME, version: APP.VERSION, time: iso_(now_()) }); },
  'login':            api_login_,
  'logout':           api_logout_,
  'me':               function (p, s) { return ok_({ user: s, permissions: s.permissions }); },
  'changePassword':   api_changePassword_,

  // complaints
  'createComplaint':  api_createComplaint_,
  'listComplaints':   api_listComplaints_,
  'getComplaint':     api_getComplaint_,
  'updateComplaint':  api_updateComplaint_,
  'assignComplaint':  api_assignComplaint_,
  'deleteComplaint':  api_deleteComplaint_,

  // workflow
  'verifyWarranty':   api_verifyWarranty_,
  'recordPayment':    api_recordPayment_,
  'verifyPayment':    api_verifyPayment_,
  'updateStatus':     api_updateStatus_,
  'confirmByCustomer':api_confirmByCustomer_,
  'getTimeline':      api_getTimeline_,

  // files
  'uploadFiles':      api_uploadFiles_,

  // analytics + reference
  'dashboard':        api_dashboard_,
  'export':           api_export_,
  'masterData':       api_masterData_,

  // employees
  'listEmployees':    api_listEmployees_,
  'saveEmployee':     api_saveEmployee_
};

function doGet(e) {
  var params = e && e.parameter ? e.parameter : {};
  var callback = params.callback || null;
  if (params.payload) {
    try { params = JSON.parse(params.payload); } catch (err) {
      return respond_(fail_('BAD_REQUEST', 'payload was not valid JSON.'), callback);
    }
  }
  return respond_(handle_(params), callback);
}

function doPost(e) {
  var params = {};
  try {
    if (e && e.postData && e.postData.contents) {
      params = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      params = e.parameter;
    }
  } catch (err) {
    return respond_(fail_('BAD_REQUEST', 'Request body was not valid JSON.'));
  }
  return respond_(handle_(params), params.callback || null);
}

function handle_(params) {
  var started = new Date().getTime();
  try {
    var action = params.action;
    if (!action) return fail_('BAD_REQUEST', 'No action supplied.');

    var route = ROUTES[action];
    if (!route) return fail_('UNKNOWN_ACTION', 'Unknown action: ' + action, { available: Object.keys(ROUTES) });

    var session = null;
    if (PUBLIC_ACTIONS.indexOf(action) === -1) {
      session = requireSession_(params.token);
    }

    var result = route(params, session);
    result.meta = result.meta || {};
    result.meta.ms = new Date().getTime() - started;
    return result;

  } catch (err) {
    if (err && err.name === 'AppError') {
      return fail_(err.code, err.message, err.details);
    }
    console.error(err && err.stack ? err.stack : err);
    return fail_('INTERNAL_ERROR',
      'Something went wrong on the server. Please retry; if it persists, contact your administrator.',
      { detail: String(err && err.message ? err.message : err) });
  }
}
