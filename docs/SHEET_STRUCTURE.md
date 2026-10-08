# Google Sheet structure

Seven tabs. Column order **is** the schema — `00_Config.gs` reads positions from it, so
never reorder an existing column. New fields go on the end, after which you re-run
`Setup_initialiseSystem()` to extend the headers.

Row 1 is always the header, frozen and styled by setup.

---

## `COMPLAINTS` — one row per complaint

| # | Column | Type | Notes |
|---|---|---|---|
| 1 | `complaint_id` | text | `OAK-CMP-YYYYMMDD-NNNN`, unique, never reused |
| 2 | `created_at` | ISO datetime | Registration timestamp |
| 3 | `created_by` | email | Who registered it |
| 4 | `updated_at` | ISO datetime | Last write of any kind |
| 5 | `updated_by` | email | |
| 6 | `customer_name` | text | |
| 7 | `customer_mobile` | text | Normalised to 10 digits; stored as text so leading digits survive |
| 8 | `order_number` | text | Upper-cased |
| 9 | `purchase_date` | date | `YYYY-MM-DD` |
| 10 | `chair_type` | enum | One of the six chair types |
| 11 | `purchase_source` | enum | Website / Retail / Amazon / Flipkart / Other |
| 12 | `complaint_type` | enum | One of the seven issue types |
| 13 | `description` | text | Up to 4000 characters |
| 14 | `invoice_generated_by` | enum | Vishu Sales / Naman Packaging / Kanha Creation / Capital Sales |
| 15 | `invoice_files` | JSON | `[{id,name,url,size,type}]` of Drive files |
| 16 | `evidence_files` | JSON | Same shape |
| 17 | `status` | enum | Current workflow state |
| 18 | `priority` | enum | Low / Medium / High / Critical — drives the SLA clock |
| 19 | `assigned_to` | email | Blank means unassigned |
| 20 | `department` | enum | |
| 21 | `warranty_status` | enum | Pending Verification / Under Warranty / Out of Warranty |
| 22 | `warranty_verified_by` | email | |
| 23 | `warranty_verified_at` | ISO datetime | |
| 24 | `warranty_remarks` | text | What the invoice showed |
| 25 | `payment_required` | TRUE/FALSE | |
| 26 | `payment_status` | enum | Not Required / Pending / Collected / Verified / Failed / Refunded |
| 27 | `payment_amount` | number | What was quoted to the customer |
| 28 | `payment_collected` | number | Running total actually received |
| 29 | `action_taken` | text | What the team did |
| 30 | `resolution` | text | Outcome described to the customer |
| 31 | `resolution_date` | ISO datetime | Stamped when first Resolved or Closed |
| 32 | `tat_hours` | number | `resolution_date − created_at`, one decimal |
| 33 | `customer_confirmed` | TRUE/FALSE | |
| 34 | `closed_at` | ISO datetime | Cleared if the complaint is reopened |
| 35 | `reopened_count` | number | |
| 36 | `is_deleted` | TRUE/FALSE | Soft delete; filtered from every query |

## `COMPLAINT_HISTORY` — append-only audit trail

| # | Column | Notes |
|---|---|---|
| 1 | `history_id` | `HIS-…` |
| 2 | `complaint_id` | Foreign key |
| 3 | `timestamp` | ISO datetime |
| 4 | `actor` | Email of whoever acted |
| 5 | `actor_role` | Their role at the time |
| 6 | `action` | e.g. *Warranty Verified*, *Payment Recorded*, *Status Changed* |
| 7 | `field` | Which column changed |
| 8 | `from_value` | |
| 9 | `to_value` | |
| 10 | `remarks` | Free text |

Nothing in this tab is ever updated or deleted. One change, one row.

## `PAYMENTS` — one row per receipt

| # | Column | Notes |
|---|---|---|
| 1 | `payment_id` | `PAY-…` |
| 2 | `complaint_id` | |
| 3 | `amount` | number |
| 4 | `payment_date` | date |
| 5 | `payment_mode` | UPI / Cash / Bank Transfer / Card / Cheque / Razorpay / Other |
| 6 | `reference_id` | Transaction reference; must be unique across the tab |
| 7 | `proof_file` | JSON array of Drive files |
| 8 | `collected_by` | email |
| 9 | `verified_by` | email |
| 10 | `verification_status` | Pending / Verified / Failed / Refunded |
| 11 | `remarks` | |
| 12 | `created_at` | ISO datetime |

Collection and verification are deliberately separate: the person who takes the money is
not the person who signs it off.

## `EMPLOYEES` — users and access

| # | Column | Notes |
|---|---|---|
| 1 | `employee_id` | `EMP-…` |
| 2 | `name` | |
| 3 | `email` | The login; unique, case-insensitive |
| 4 | `password_hash` | SHA-256 of `salt::password`, hex |
| 5 | `salt` | Per user |
| 6 | `role` | Admin / Manager / Complaint Executive / Technician / Viewer |
| 7 | `department` | |
| 8 | `phone` | |
| 9 | `active` | `FALSE` blocks sign-in without losing the history |
| 10 | `created_at` | |
| 11 | `last_login` | |

Never type a password into this tab directly — it is hashed, so a plain value there can
never match. Use the Team screen, or `Setup_resetPassword()`.

## `MASTER_DATA` — dropdown values

| # | Column | Notes |
|---|---|---|
| 1 | `category` | `chair_type`, `purchase_source`, `complaint_type`, `invoice_entity`, `status`, `warranty_status`, `payment_status`, `payment_mode`, `priority`, `department`, `role` |
| 2 | `value` | Stored value |
| 3 | `label` | Display value |
| 4 | `sort_order` | |
| 5 | `active` | |

This tab documents the vocabulary. The enforced lists live in `00_Config.gs`; if you add
a chair type here, add it there too, or validation will reject it.

## `DASHBOARD_DATA` — optional KPI snapshot

| # | Column |
|---|---|
| 1 | `metric_key` |
| 2 | `metric_label` |
| 3 | `metric_value` |
| 4 | `computed_at` |

Only written if you schedule `Cron_snapshotDashboard`. The app's own dashboard computes
live and does not read this tab.

## `SETTINGS` — configuration

| Key | Default | What it does |
|---|---|---|
| `company_name` | OakCraft | Shown in the app and exports |
| `complaint_id_prefix` | OAK-CMP | Change it and new IDs follow |
| `timezone` | Asia/Kolkata | All timestamps |
| `drive_root_folder_name` | Complaint Management | |
| `drive_root_folder_id` | *(auto)* | Filled in on first upload |
| `sla_hours_critical` | 24 | |
| `sla_hours_high` | 48 | |
| `sla_hours_default` | 72 | |
| `currency_symbol` | ₹ | |
| `support_email` | support@oakcraft.in | |

---

## Google Drive layout

```
Complaint Management/
├── Invoices/
│   └── OAK-CMP-20261008-0001/
│       └── OAK-CMP-20261008-0001_Invoices_1_invoice.pdf
├── Complaint Evidence/
│   └── OAK-CMP-20261008-0001/
│       ├── …_ComplaintEvidence_1_crack.jpg
│       └── …_ComplaintEvidence_2_wobble.mp4
└── Payment Proof/
    └── OAK-CMP-20261008-0001/
        └── …_PaymentProof_1_upi.png
```

Filenames are prefixed with the complaint ID and category, so a file is identifiable even
after someone drags it out of its folder. Each file's Drive description also names the
complaint.

---

## Adding a field

1. Append the column name to the right array in `SCHEMA` (`00_Config.gs`).
2. Set it when the record is created, in `03_Complaints.gs`.
3. Add it to `EDITABLE_FIELDS` if staff should be able to change it.
4. Re-run `Setup_initialiseSystem()` to write the new header.
5. Deploy a new version of the Web App.

Existing rows read the new column as blank, which is harmless.
