# OakCraft Complaint Desk

A complaint management and analytics system for a furniture business selling through
its own website, its retail stores, and marketplaces. Complaints are registered,
warranty-checked, paid for where they fall outside cover, worked, and closed — with a
timestamped audit trail on every record.

```
Frontend  →  GitHub Pages (static HTML/CSS/JS, no build step)
Backend   →  Google Apps Script Web App (JSON API)
Database  →  Google Sheets
Files     →  Google Drive
```

Nothing but a session token is kept in the browser. Every complaint, payment and file
lives in your Google account.

---

## What it does

| Area | Covered |
|---|---|
| Registration | Customer, order, chair type, purchase source, issue type, description, invoice entity, invoice + evidence uploads |
| Warranty | Under / Out of warranty / Pending, with verifier, timestamp and remarks |
| Paid service | Amount due, collection, mode, transaction reference, proof upload, separate verification step |
| Workflow | 11 states with enforced transitions, assignment, action taken, resolution, customer confirmation |
| Audit | Every change appended to `COMPLAINT_HISTORY` with who, when, from, to |
| Analytics | Daily volume, resolution %, pending %, warranty mix, paid-service revenue, TAT, oldest pending, source / product / issue / employee breakdowns |
| Register | Searchable, filterable, sortable, paginated table with CSV export |
| Access | Five roles; the server scopes data, not the browser |

---

## Quick start

1. **Try it first.** Open `index.html` in a browser. With no backend configured it runs
   in demo mode on seeded sample data, so you can click through everything before
   committing to a deployment. Sign in as `admin@oakcraft.in` / `OakCraft@2026`.
2. **Deploy the backend.** Follow [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — about
   fifteen minutes, all of it in the browser.
3. **Point the frontend at it.** Paste the Web App `/exec` URL into `assets/js/config.js`.
4. **Publish the frontend.** Push to GitHub and turn on Pages.

---

## Repository layout

```
oakcraft-cms/
├── index.html                 the whole app shell
├── assets/
│   ├── css/app.css            design tokens, components, light + dark
│   └── js/
│       ├── config.js          ← the only file you edit after deploying
│       ├── api.js             transport, session, CORS-safe POST
│       ├── demo.js            in-browser stand-in for the backend
│       ├── ui.js              formatting, badges, toasts, drawer
│       ├── charts.js          dependency-free SVG charts
│       ├── view-dashboard.js  KPIs and analytics
│       ├── view-complaints.js register table + complaint drawer
│       ├── view-form.js       registration form
│       ├── view-admin.js      team and settings
│       └── app.js             boot, auth gate, router
├── apps-script/               paste these into the Apps Script editor
│   ├── 00_Config.gs           schema, statuses, roles, permissions
│   ├── 01_Utils.gs            sheet I/O, validation, IDs
│   ├── 02_Auth.gs             login, sessions, RBAC
│   ├── 03_Complaints.gs       create, search, update
│   ├── 04_Workflow.gs         warranty, payments, status, timeline
│   ├── 05_Files.gs            Google Drive storage
│   ├── 06_Dashboard.gs        every analytics figure
│   ├── 07_Main.gs             doGet / doPost router
│   ├── 08_Setup.gs            one-click setup + sample data
│   └── appsscript.json        manifest and OAuth scopes
├── docs/
│   ├── DEPLOYMENT.md          step-by-step setup
│   ├── API.md                 every endpoint, request and response
│   ├── SHEET_STRUCTURE.md     column-by-column schema
│   └── WORKFLOW.md            lifecycle, rules, dashboard formulas
├── sample-data/               CSVs you can paste straight into the sheets
└── demo/artifact.html         the same app, packaged for a hosted preview
```

---

## Design decisions worth knowing

**One sheet read per request.** Apps Script is slow per API call, not per row. Every
read pulls the whole tab in a single `getValues()` and filters in memory, so a dashboard
with eight tiles and four charts costs one read, not twelve.

**Search and paging happen on the server.** The browser never downloads the full table,
so the register stays quick as the sheet grows.

**POST is sent as `text/plain`.** That makes it a CORS "simple request", which skips the
preflight `OPTIONS` that Apps Script cannot answer. This is why the app works from a
GitHub Pages origin without a proxy.

**Complaint IDs are allocated under a script lock.** Two people submitting at the same
second get `…-0001` and `…-0002`, never the same number.

**Deleting is soft.** Rows are flagged `is_deleted` and filtered out, so the audit trail
survives.

**Permissions are enforced server-side.** Hiding a button is a convenience; the API
re-checks the role on every write and scopes reads for anyone without `complaint.read.all`.

---

## Roles

| | Admin | Manager | Complaint Executive | Technician | Viewer |
|---|---|---|---|---|---|
| Register complaints | ● | ● | ● | | |
| See every complaint | ● | ● | | | ● |
| See only their own | | | ● | ● | |
| Verify warranty | ● | ● | ● | | |
| Record payments | ● | ● | ● | | |
| Verify payments | ● | ● | | | |
| Assign complaints | ● | ● | | | |
| Dashboard & analytics | ● | ● | ● | | ● |
| Export | ● | ● | | | ● |
| Manage team & settings | ● | | | | |

---

## Security notes

- Passwords are stored as SHA-256 over a per-user salt, never in plain text.
- Sessions expire after 8 hours and live in `CacheService`, not in the sheet.
- The Web App runs as the deploying account, so only that account's Drive and Sheets
  are touched. Anonymous access is needed for the browser to reach it; authentication
  is the app's own.
- Change the default admin password the first time you sign in.
- Anyone with the Web App URL can call `login`. Use strong passwords and remove
  employees who leave by setting `active` to `FALSE`.
