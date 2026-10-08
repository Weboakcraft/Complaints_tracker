# API reference

One endpoint, one envelope, one transport.

```
POST  https://script.google.com/macros/s/<id>/exec
Content-Type: text/plain;charset=utf-8
```

`text/plain` is deliberate: it keeps the request inside the CORS "simple request" rules,
so the browser never sends a preflight `OPTIONS` that Apps Script cannot answer.

`GET` works too, for quick checks and JSONP: `?action=ping` or
`?payload=<url-encoded JSON>&callback=myFn`.

### Request

```json
{ "action": "listComplaints", "token": "<session token>", "...": "action params" }
```

### Response

```json
{ "success": true,  "data": { }, "meta": { "ms": 142 } }
{ "success": false, "error": { "code": "VALIDATION_FAILED", "message": "…", "details": { } } }
```

`success` is always present. `meta.ms` is server processing time. Errors never throw an
HTTP status — check `success`.

---

## Error codes

| Code | Meaning |
|---|---|
| `BAD_REQUEST` | No action, or unparseable body |
| `UNKNOWN_ACTION` | Action not in the router |
| `UNAUTHENTICATED` | No token on a protected action |
| `SESSION_EXPIRED` | Token unknown or past its 8-hour life |
| `AUTH_FAILED` | Wrong email or password |
| `ACCOUNT_DISABLED` | `active` is not `TRUE` |
| `FORBIDDEN` | Role lacks the permission, or the record is out of scope |
| `VALIDATION_FAILED` | Missing or invalid field; `details.fields` lists them |
| `NOT_FOUND` | No record with that ID |
| `DUPLICATE_COMPLAINT` | Same order + issue + mobile within 24h; resend with `force: true` to override |
| `DUPLICATE_PAYMENT` | That transaction reference already exists |
| `INVALID_TRANSITION` | Status move not allowed from the current state; `details.allowed` lists what is |
| `PAYMENT_PENDING` | Cannot resolve or close while money is outstanding |
| `FILE_TOO_LARGE` / `TOO_MANY_FILES` | Upload limits |
| `INTERNAL_ERROR` | Unhandled server fault; `details.detail` carries the message |

---

## Authentication

### `ping` — public
Health check. Returns app name, version and server time.

### `login` — public
```json
{ "action": "login", "email": "ritu@oakcraft.in", "password": "…" }
```
→ `{ token, user: { employee_id, name, email, role, department }, permissions: [...] }`

The token goes in every subsequent call. Store it in `sessionStorage`, not `localStorage`.

### `me`
Returns the current session and its permission list. Used to restore a session on reload.

### `logout`
Invalidates the token.

### `changePassword`
`current_password`, `new_password` (8+ characters).

---

## Complaints

### `createComplaint` — needs `complaint.create`

| Field | Required | Notes |
|---|---|---|
| `customer_name` | ● | |
| `customer_mobile` | ● | Any format; normalised to 10 digits |
| `order_number` | ● | Upper-cased |
| `purchase_date` | ● | `YYYY-MM-DD` or `DD/MM/YYYY`; cannot be in the future |
| `chair_type` | ● | Must match the master list |
| `purchase_source` | ● | Must match the master list |
| `complaint_type` | ● | Must match the master list |
| `description` | ● | Up to 4000 characters |
| `invoice_generated_by` | ● | Vishu Sales / Naman Packaging / Kanha Creation / Capital Sales |
| `priority` | | Low / Medium / High / Critical; defaults to Medium |
| `assigned_to` | | Employee email |
| `department` | | Defaults to Customer Support |
| `invoice_files` | | Up to 5 × 10 MB, `[{ name, mimeType, data }]` base64 |
| `evidence_files` | | Up to 5 × 100 MB |
| `force` | | `true` overrides the 24-hour duplicate guard |

→ `{ complaint_id, status, files: { invoice_files: [...], evidence_files: [...] } }`

The complaint ID is `OAK-CMP-YYYYMMDD-NNNN`, allocated under a script lock.

### `listComplaints`

```json
{
  "action": "listComplaints",
  "filters": {
    "q": "free text over ID, name, mobile, order, description, assignee",
    "date_from": "2026-09-01", "date_to": "2026-10-08",
    "status": "In Progress", "purchase_source": "…", "warranty_status": "…",
    "payment_status": "…", "assigned_to": "ritu@oakcraft.in",
    "chair_type": "…", "complaint_type": "…", "priority": "High",
    "pending_only": true
  },
  "sort_by": "created_at", "sort_dir": "desc",
  "page": 1, "page_size": 50
}
```

→ `data: [complaint]`, `meta: { total, page, page_size, pages }`

Pass `all: true` to skip pagination (used by export). Anyone without
`complaint.read.all` only ever receives complaints they raised or are assigned to —
filtering happens on the server.

Each complaint carries two computed fields: `is_open` and `age_hours` (for open
complaints) or `tat_hours` (for closed ones).

### `getComplaint`
`complaint_id` → `{ complaint, timeline: [...], payments: [...] }`

### `updateComplaint`
`complaint_id` plus any of: `customer_name`, `customer_mobile`, `order_number`,
`purchase_date`, `chair_type`, `purchase_source`, `complaint_type`, `description`,
`invoice_generated_by`, `priority`, `assigned_to`, `department`, `action_taken`,
`resolution`. Each changed field is written to the timeline separately.
→ `{ complaint_id, changed: <count> }`

### `assignComplaint` — needs `complaint.assign`
`complaint_id`, `assigned_to`, optional `department`, `remarks`.

### `deleteComplaint` — Admin
Soft delete. `complaint_id` and `remarks` both required.

---

## Workflow

### `verifyWarranty` — needs `warranty.verify`

```json
{ "complaint_id": "…", "warranty_status": "Out of Warranty",
  "payment_amount": 750, "payment_required": true, "warranty_remarks": "…" }
```

The decision drives the next status:

| Decision | Resulting status |
|---|---|
| Under Warranty | `Assigned`, payment set to Not Required |
| Out of Warranty **with** an amount | `Awaiting Payment`, payment set to Pending |
| Out of Warranty **without** an amount | `Assigned` |
| Pending Verification | `Warranty Check` |

### `recordPayment` — needs `payment.update`
`complaint_id`, `amount`, `payment_date`, `payment_mode`, optional `reference_id`,
`remarks`, `proof_file` (base64 array). Moves the complaint to `Payment Verification`.
A repeated `reference_id` is rejected.

### `verifyPayment` — needs `payment.verify`
`payment_id`, `verification_status` (`Verified` | `Failed` | `Refunded`), optional
`remarks`. Verifying moves the complaint to `In Progress`.

### `updateStatus`
`complaint_id`, `status`, optional `action_taken`, `resolution`, `remarks`.
Transitions are validated against the lifecycle map (Admins may override). Reaching
`Resolved` or `Closed` stamps `resolution_date` and computes `tat_hours`. Moving a closed
complaint back to `In Progress` increments `reopened_count`.

### `confirmByCustomer`
Records the customer's confirmation and closes the complaint in one step.

### `getTimeline`
`complaint_id` → the full chronological event list.

---

## Files

### `uploadFiles`
`complaint_id`, `category` (`Invoices` | `Complaint Evidence` | `Payment Proof`),
`files: [{ name, mimeType, data }]` where `data` is base64 without the `data:` prefix.

→ `{ files: [{ id, name, url, size, type }] }`

Files land in `Complaint Management/<category>/<complaint id>/` in Drive, and the sheet
stores the returned array as JSON.

---

## Analytics and reference

### `dashboard` — needs `dashboard.view`
Optional `date_from`, `date_to`, `no_cache`. Cached 45 seconds per user and range.
Returns `kpi`, `by_source`, `by_chair_type`, `by_issue_type`, `by_status`,
`by_priority`, `by_employee`, `trend`. See [WORKFLOW.md](WORKFLOW.md) for the formulas.

### `export` — needs `export.data`
Same shape as `listComplaints` with `all: true`.

### `masterData`
Every dropdown list, the transition map, the active employee list and the upload limits,
in one round trip. The frontend calls this once per session.

---

## Employees

### `listEmployees` — needs `employee.read`
### `saveEmployee` — Admin
`name`, `email`, `role`, optional `department`, `phone`, `password`, `active`.
An existing email updates that person rather than creating a duplicate.

---

## Example: register a complaint with an invoice

```js
const file = document.querySelector('input[type=file]').files[0];
const data = await new Promise(r => {
  const fr = new FileReader();
  fr.onload = () => r(fr.result.split(',')[1]);
  fr.readAsDataURL(file);
});

const res = await fetch(API_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify({
    action: 'createComplaint',
    token,
    customer_name: 'Meera Iyer',
    customer_mobile: '9876543210',
    order_number: 'OAK-ORD-24193',
    purchase_date: '2026-07-14',
    chair_type: 'Office Chair (Ergonomic/Task)',
    purchase_source: 'Third-Party Retailer (Amazon)',
    complaint_type: 'Mechanism Failure',
    description: 'Gas lift sinks within a minute of sitting down.',
    invoice_generated_by: 'Vishu Sales',
    invoice_files: [{ name: file.name, mimeType: file.type, data }]
  })
}).then(r => r.json());

console.log(res.data.complaint_id);   // OAK-CMP-20261008-0007
```
