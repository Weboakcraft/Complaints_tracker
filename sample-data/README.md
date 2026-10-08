# Sample data

36 complaints spanning about eight weeks, with the payments and timeline events that go
with them. Useful for seeing the dashboard populated before you have real volume.

| File | Rows | Paste into |
|---|---|---|
| `COMPLAINTS.csv` | 36 | `COMPLAINTS` |
| `COMPLAINT_HISTORY.csv` | 152 | `COMPLAINT_HISTORY` |
| `PAYMENTS.csv` | 5 | `PAYMENTS` |
| `EMPLOYEES.csv` | 6 | `EMPLOYEES` |
| `MASTER_DATA.csv` | 63 | `MASTER_DATA` |
| `SETTINGS.csv` | 10 | `SETTINGS` |

## The easy way

Run `Setup_loadSampleData()` from the Apps Script editor instead. It writes the same kind
of data directly, keeps the ID sequence counters in step, and sets real password hashes
for the sample employees. These CSVs exist for when you want to inspect the shape of the
data outside Google, or load it somewhere else.

## If you do import the CSVs

1. **File → Import → Upload**, pick the CSV.
2. Import location: **Replace data at selected cell**, with A2 selected in the matching
   tab. Do not pick "Replace spreadsheet" — it drops the headers.
3. Untick **Convert text to numbers, dates and formulas**, or Sheets will mangle mobile
   numbers and ISO timestamps.
4. `EMPLOYEES.csv` carries placeholder text in `password_hash` and `salt`, so nobody can
   sign in as those users. Set real passwords from the Team screen, or run
   `Setup_resetPassword()`.

## Clearing it out

Select rows 2 to the end in `COMPLAINTS`, `COMPLAINT_HISTORY` and `PAYMENTS`, and delete
them. Leave `MASTER_DATA` and `SETTINGS` alone — the app needs those.
