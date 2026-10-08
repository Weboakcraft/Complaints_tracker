/* ============================================================
   view-admin.js — team roster and settings.
   ============================================================ */
window.ViewAdmin = (function () {
  'use strict';

  function employees(host) {
    host.innerHTML = UI.skeleton(4);
    UI.loading(true);

    return Promise.all([API.call('listEmployees'), API.master()])
      .then(function (r) {
        var rows = r[0].data, m = r[1];
        host.innerHTML =
          (API.can('employee.manage') ? addForm(m) : '') +
          '<h2 class="section-title">Team</h2>' +
          '<div class="tablewrap"><table><thead><tr>' +
            '<th>Name</th><th>Email</th><th>Role</th><th>Department</th>' +
            '<th class="num">Assigned</th><th class="num">Resolved</th><th>Status</th>' +
          '</tr></thead><tbody>' +
          rows.map(function (e) {
            var active = String(e.active).toUpperCase() === 'TRUE';
            return '<tr>' +
              '<td><strong>' + UI.esc(e.name) + '</strong></td>' +
              '<td class="muted">' + UI.esc(e.email) + '</td>' +
              '<td>' + UI.badge(e.role, roleTone(e.role)) + '</td>' +
              '<td class="muted">' + UI.esc(e.department || '—') + '</td>' +
              '<td class="num">' + (e.assigned === undefined ? '—' : UI.fmtNum(e.assigned)) + '</td>' +
              '<td class="num">' + (e.resolved === undefined ? '—' : UI.fmtNum(e.resolved)) + '</td>' +
              '<td>' + UI.badge(active ? 'Active' : 'Disabled', active ? 'green' : 'grey') + '</td>' +
            '</tr>';
          }).join('') + '</tbody></table></div>' +
          '<h2 class="section-title">What each role can do</h2>' + permissionMatrix();

        var form = host.querySelector('#empForm');
        if (form) {
          form.addEventListener('submit', function (ev) {
            ev.preventDefault();
            var d = {};
            new FormData(form).forEach(function (v, k) { d[k] = String(v).trim(); });
            if (!d.name || !d.email || !d.role) return UI.toast('Name, email and role are required.', 'error');
            UI.loading(true);
            API.call('saveEmployee', d, { dedupe: false })
              .then(function () { UI.toast('Team member saved.'); employees(host); })
              .catch(function (e) { UI.toast(e.message, 'error'); })
              .finally(function () { UI.loading(false); });
          });
        }
      })
      .catch(function (e) { host.innerHTML = '<div class="alert alert--error">' + UI.esc(e.message) + '</div>'; })
      .finally(function () { UI.loading(false); });
  }

  function addForm(m) {
    return '<div class="card"><div class="card__head"><div><h3>Add or update a team member</h3>' +
      '<p>An existing email updates that person instead of creating a duplicate</p></div></div>' +
      '<div class="card__body"><form id="empForm" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 14px">' +
        '<label class="field"><span class="field__label">Name</span><input name="name" required></label>' +
        '<label class="field"><span class="field__label">Work email</span><input type="email" name="email" required></label>' +
        '<label class="field"><span class="field__label">Role</span><select name="role">' + UI.options(m.roles, 'Complaint Executive') + '</select></label>' +
        '<label class="field"><span class="field__label">Department</span><select name="department">' + UI.options(m.departments, 'Customer Support') + '</select></label>' +
        '<label class="field"><span class="field__label">Password</span><input type="password" name="password" minlength="8" placeholder="Min 8 characters"></label>' +
        '<div style="display:flex;align-items:flex-end;padding-bottom:13px"><button class="btn btn--primary" type="submit">Save</button></div>' +
      '</form></div></div>';
  }

  function roleTone(role) {
    return { 'Admin':'clay', 'Manager':'violet', 'Complaint Executive':'blue',
             'Technician':'amber', 'Viewer':'grey' }[role] || 'grey';
  }

  var MATRIX = [
    ['Register complaints',      ['Admin','Manager','Complaint Executive']],
    ['See every complaint',      ['Admin','Manager','Viewer']],
    ['See only their own',       ['Complaint Executive','Technician']],
    ['Update complaint details', ['Admin','Manager','Complaint Executive','Technician']],
    ['Verify warranty',          ['Admin','Manager','Complaint Executive']],
    ['Record payments',          ['Admin','Manager','Complaint Executive']],
    ['Verify payments',          ['Admin','Manager']],
    ['Assign complaints',        ['Admin','Manager']],
    ['Dashboard & analytics',    ['Admin','Manager','Complaint Executive','Viewer']],
    ['Export data',              ['Admin','Manager','Viewer']],
    ['Manage team & settings',   ['Admin']]
  ];
  var ROLE_COLS = ['Admin','Manager','Complaint Executive','Technician','Viewer'];

  function permissionMatrix() {
    return '<div class="tablewrap"><table><thead><tr><th>Capability</th>' +
      ROLE_COLS.map(function (r) { return '<th style="text-align:center">' + r + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      MATRIX.map(function (row) {
        return '<tr><td>' + row[0] + '</td>' + ROLE_COLS.map(function (r) {
          var on = row[1].indexOf(r) !== -1;
          return '<td style="text-align:center;color:' + (on ? 'var(--green)' : 'var(--ink-3)') + '">' +
            (on ? '●' : '·') + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  function settings(host) {
    var live = API.isLive();
    host.innerHTML =
      '<div class="card"><div class="card__head"><div><h3>Backend connection</h3>' +
        '<p>Where this frontend sends its data</p></div></div><div class="card__body">' +
        '<dl class="dl">' +
          '<dt>Mode</dt><dd>' + UI.badge(live ? 'Live' : 'Demo', live ? 'green' : 'amber') + '</dd>' +
          '<dt>API endpoint</dt><dd class="cid">' + (live ? UI.esc(CONFIG.API_URL) : 'not configured') + '</dd>' +
          '<dt>Database</dt><dd>' + (live ? 'Google Sheets' : 'In-memory sample data') + '</dd>' +
          '<dt>File storage</dt><dd>' + (live ? 'Google Drive · Complaint Management/' : 'Not available in demo mode') + '</dd>' +
        '</dl>' +
        (live ? '' :
          '<div class="alert alert--info" style="margin:14px 0 0">To go live, deploy the Apps Script Web App and paste its ' +
          '<code>/exec</code> URL into <code>assets/js/config.js</code>. Nothing else needs changing.</div>') +
      '</div></div>' +

      '<h2 class="section-title">Complaint ID format</h2>' +
      '<div class="card"><div class="card__body">' +
        '<p style="margin:0 0 10px">IDs are generated server-side under a script lock, so two people submitting at the same moment can never collide.</p>' +
        '<p class="cid" style="font-size:15px;margin:0">OAK-CMP-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-0001</p>' +
        '<p class="muted" style="font-size:12.3px;margin:6px 0 0">prefix · date · daily sequence</p>' +
      '</div></div>' +

      '<h2 class="section-title">Your account</h2>' +
      '<div class="card"><div class="card__body"><dl class="dl">' +
        '<dt>Name</dt><dd>' + UI.esc(API.state.user.name) + '</dd>' +
        '<dt>Email</dt><dd>' + UI.esc(API.state.user.email) + '</dd>' +
        '<dt>Role</dt><dd>' + UI.badge(API.state.user.role, roleTone(API.state.user.role)) + '</dd>' +
        '<dt>Department</dt><dd>' + UI.esc(API.state.user.department || '—') + '</dd>' +
      '</dl>' +
      (live ? '<form id="pwForm" style="margin-top:16px;max-width:360px">' +
        '<label class="field"><span class="field__label">Current password</span><input type="password" name="current_password" required></label>' +
        '<label class="field"><span class="field__label">New password</span><input type="password" name="new_password" minlength="8" required></label>' +
        '<button class="btn" type="submit">Change password</button></form>' : '') +
      '</div></div>';

    var pw = host.querySelector('#pwForm');
    if (pw) {
      pw.addEventListener('submit', function (e) {
        e.preventDefault();
        var d = {};
        new FormData(pw).forEach(function (v, k) { d[k] = v; });
        UI.loading(true);
        API.call('changePassword', d, { dedupe: false })
          .then(function () { UI.toast('Password changed.'); pw.reset(); })
          .catch(function (err) { UI.toast(err.message, 'error'); })
          .finally(function () { UI.loading(false); });
      });
    }
    return Promise.resolve();
  }

  return { employees: employees, settings: settings };
})();
