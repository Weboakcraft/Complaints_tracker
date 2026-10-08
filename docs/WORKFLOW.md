# Lifecycle, rules and dashboard formulas

## The complaint lifecycle

```
                        Registered
                             │
                      Under Verification
                             │
                       Warranty Check
                      ╱              ╲
         Under Warranty                Out of Warranty
                │                     ╱              ╲
                │        (chargeable)                 (free repair)
                │                │                          │
                │        Awaiting Payment                    │
                │                │                           │
                │        Payment Verification                │
                 ╲               │                          ╱
                  ╰───────── Assigned ──────────────────────╯
                                 │
                           In Progress
                                 │
                             Resolved
                                 │
                 Awaiting Customer Confirmation
                                 │
                              Closed
```

`Rejected` is reachable from any pre-resolution state and returns to
`Under Verification`. `Closed` and `Resolved` can go back to `In Progress`, which
increments `reopened_count` and clears `closed_at`.

### Allowed transitions

| From | To |
|---|---|
| Registered | Under Verification, Warranty Check, Assigned, Rejected |
| Under Verification | Warranty Check, Assigned, Rejected |
| Warranty Check | Awaiting Payment, Assigned, Rejected |
| Awaiting Payment | Payment Verification, Assigned, Rejected |
| Payment Verification | Assigned, In Progress, Rejected |
| Assigned | In Progress, Resolved, Rejected |
| In Progress | Resolved, Awaiting Customer Confirmation, Rejected |
| Resolved | Awaiting Customer Confirmation, Closed, In Progress |
| Awaiting Customer Confirmation | Closed, In Progress |
| Closed | In Progress |
| Rejected | Under Verification |

Admins may move a complaint anywhere; everyone else is held to this table. The rule is
enforced in `04_Workflow.gs`, not in the browser.

### Hard rules

- A complaint with `payment_status = Pending` cannot be marked Resolved or Closed.
  Collect and verify first.
- Marking Out of Warranty with an amount always routes through `Awaiting Payment`.
- Collecting and verifying a payment are separate actions needing different permissions.
- `resolution_date` and `tat_hours` are stamped once, the first time a complaint reaches
  Resolved or Closed, and are not overwritten if it is reopened and closed again.
- A second complaint for the same order + issue + mobile inside 24 hours is refused
  unless the operator explicitly confirms it.

---

## A worked example

An Amazon customer reports a jammed recliner lever on a 14-month-old dining chair.

| When | Event | Recorded as |
|---|---|---|
| 08/10 10:32 | Executive registers it | `Complaint Registered` → status Registered, ID `OAK-CMP-20261008-0007` |
| 08/10 11:05 | Opens the invoice from Drive | — |
| 08/10 11:22 | Marks it out of warranty, quotes ₹750 | `Warranty Verified` (Pending → Out of Warranty), `Payment Required` (→ ₹750), status Awaiting Payment |
| 08/10 11:35 | Customer pays by UPI, screenshot attached | `Payment Recorded` (0 → 750), status Payment Verification |
| 08/10 12:05 | Manager checks the bank and verifies | `Payment Verified` (Collected → Verified), status In Progress |
| 09/10 15:15 | Technician replaces the lever | `Status Changed` (In Progress → Resolved), TAT stamped at 28.7 h |
| 09/10 16:00 | Customer confirms over the phone | `Customer Confirmed Resolution`, `Complaint Closed` |

Seven timeline rows, each with the actor's email, their role and the exact timestamp.
None of them can be edited afterwards.

---

## Dashboard formulas

Every figure below is computed in one pass over the complaint rows that match the
selected date range and the viewer's scope.

### Counts

```
total            = complaints in range (excluding soft-deleted)
resolved         = status in (Resolved, Closed)
open             = everything else
today            = created_at falls on today's date
warranty         = warranty_status = "Under Warranty"
non_warranty     = warranty_status = "Out of Warranty"
warranty_pending = warranty_status = "Pending Verification"
paid_service     = payment_required = TRUE
payment_pending  = payment_status = "Pending"
reopened         = reopened_count > 0
```

### Percentages

```
Resolution %   = resolved      ÷ total × 100
Pending %      = open          ÷ total × 100      (= 100 − Resolution %)
Warranty %     = warranty      ÷ total × 100
Non-warranty % = non_warranty  ÷ total × 100
Paid service % = paid_service  ÷ total × 100
```

All rounded to one decimal. A zero denominator returns 0, never an error.

### Turnaround

```
tat_hours            = (resolution_date − created_at) in hours, one decimal
avg_resolution_hours = mean of tat_hours over complaints that have one
avg_resolution_days  = avg_resolution_hours ÷ 24
age_hours            = (now − created_at) for open complaints
```

Open complaints are excluded from the average — including them would make the number
drift upward every hour without anything actually changing.

### Money

```
amount_collected = Σ payment_collected
amount_pending   = Σ payment_amount where payment_status = "Pending"
```

### SLA and overdue

```
target  = SLA_HOURS[priority]        Critical 24 · High 48 · Medium 72 · Low 120
overdue = is_open AND age_hours > target
```

Overdue rows carry a red rail in the register and an "over SLA" note on the TAT cell.

### Breakdowns

For each of source, chair type, issue type, status, priority and assignee:

```
total           = complaints in that bucket
resolved        = of those, how many are Resolved or Closed
pending         = total − resolved
resolution_pct  = resolved ÷ total × 100
share_pct       = total ÷ grand total × 100
```

Employee rows add `avg_tat_hours`, the mean TAT over that person's closed complaints.

### Headlines

```
most_complained_product = chair type with the highest total
most_common_issue       = issue type with the highest total
top_source              = purchase source with the highest total
oldest_pending          = open complaint with the earliest created_at
```

### Trend

Complaints grouped by `created_at` date, last 30 days present in the data, each with
`total`, `resolved` and `pending`. Days with no complaints do not appear — the chart
connects the days that exist rather than inventing zeroes.

---

## How to read the numbers

**Resolution % is a lagging measure.** Narrow the date range and it rises, because recent
complaints have not had time to close. Compare like ranges rather than a short range
against a long one.

**Watch average TAT against the oldest pending complaint.** A healthy average with a
60-day-old open complaint means one job is stuck and the average is hiding it. That is
why the oldest pending record gets its own tile.

**Source share follows sales volume.** Amazon producing the most complaints is only
meaningful next to Amazon's share of units sold; the resolution rate per source is the
more honest comparison, because it is a rate rather than a count.

**Reopened complaints are the quality signal.** A complaint that closes and comes back
cost more than one that stayed open, and points at a fix that did not hold.
