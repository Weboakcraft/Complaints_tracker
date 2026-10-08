# Deployment

Fifteen minutes, all in the browser. Do the parts in order — the frontend needs the
backend URL, and the backend needs the sheet.

---

## 1. Create the spreadsheet

1. Go to [sheets.new](https://sheets.new).
2. Rename it **OakCraft Complaint Database**.
3. Leave it open — the next step runs from inside it.

## 2. Add the Apps Script backend

1. In the spreadsheet: **Extensions → Apps Script**. A new editor tab opens.
2. Delete the contents of the default `Code.gs`.
3. For each file in `apps-script/`, create a script file of the same name and paste its
   contents. Use the **+** beside *Files* → *Script*, and name them exactly:

   ```
   00_Config   01_Utils   02_Auth   03_Complaints   04_Workflow
   05_Files    06_Dashboard   07_Main   08_Setup
   ```

   Apps Script adds the `.gs` extension itself. Order does not matter at runtime, but the
   numbering keeps the editor readable.
4. Show the manifest: **Project Settings → "Show appsscript.json manifest file"**, then
   open `appsscript.json` and replace it with the one from `apps-script/appsscript.json`.
5. Save (Ctrl/Cmd + S).

## 3. Run setup once

1. In the function dropdown at the top, pick **`Setup_initialiseSystem`** and click **Run**.
2. Google asks for authorisation the first time:
   *Review permissions → choose your account → Advanced → Go to (project) → Allow.*
   The scopes are Sheets, Drive and external requests; they are listed in the manifest.
3. When it finishes, check **Execution log**. You should see the spreadsheet URL and the
   default admin credentials.

This creates all seven tabs with headers, seeds `SETTINGS` and `MASTER_DATA`, creates the
Drive folders, and adds the first Admin user:

```
admin@oakcraft.in / OakCraft@2026
```

**Optional:** run **`Setup_loadSampleData`** to add 24 realistic complaints, five
employees, payments and timeline events, so the dashboard has something to show while you
evaluate it. Skip this on a production sheet, or clear the rows afterwards.

## 4. Deploy as a Web App

1. **Deploy → New deployment**.
2. Click the gear beside *Select type* → **Web app**.
3. Fill in:
   - **Description:** `OakCraft CMS v1`
   - **Execute as:** **Me** — so the script uses your Drive and Sheets
   - **Who has access:** **Anyone** — required for the browser to reach it; the app does
     its own authentication
4. **Deploy**, authorise if asked, and copy the **Web app URL**. It ends in `/exec`.

> Every time you change the script you must **Deploy → Manage deployments → edit (pencil)
> → Version: New version → Deploy**. Editing the code alone does not update the live URL.

## 5. Point the frontend at the backend

Open `assets/js/config.js` and paste the URL:

```js
window.CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfy..../exec',
  ...
};
```

Open `index.html` locally. The Settings page should now show **Live** rather than **Demo**.

## 6. Publish the frontend on GitHub Pages

```bash
git init
git add .
git commit -m "OakCraft complaint management system"
git branch -M main
git remote add origin https://github.com/<your-account>/oakcraft-cms.git
git push -u origin main
```

Then in the repository: **Settings → Pages → Source: Deploy from a branch →
Branch: `main`, folder: `/ (root)` → Save**.

Your app appears at `https://<your-account>.github.io/oakcraft-cms/` within a minute or
two. There is no build step; the `.nojekyll` file in the repo stops GitHub from
reprocessing the assets.

> `config.js` holds the backend URL, and anything pushed to a public repo is public.
> For a private deployment, make the repository private and use GitHub Pages on a paid
> plan, or host the folder anywhere else that serves static files.

## 7. Check the Drive folders

In your Drive you should now have:

```
Complaint Management/
├── Invoices/
├── Complaint Evidence/
└── Payment Proof/
```

A subfolder named after the complaint ID is created inside these the first time a file is
attached to that complaint.

---

## First-run checklist

- [ ] Sign in as the admin and change the password (Settings → Your account)
- [ ] Add your real team under **Team**, each with the right role
- [ ] Disable `admin@oakcraft.in` or change its password if you created a personal admin
- [ ] Adjust SLA hours in the `SETTINGS` tab if 24/48/72 does not match your targets
- [ ] Register one real complaint end to end and confirm the Drive files land correctly

---

## Optional: nightly KPI snapshot

If you want the KPIs written into the `DASHBOARD_DATA` tab for sheet-side reporting:

1. In the Apps Script editor, open **Triggers** (clock icon) → **Add trigger**.
2. Function `Cron_snapshotDashboard`, source *Time-driven*, *Day timer*, pick an hour.

The dashboard in the app does not need this — it computes live.

---

## Troubleshooting

**"Could not reach the backend."**
The URL in `config.js` is wrong, or the deployment's access is not set to *Anyone*.
Open the `/exec` URL directly in a browser: you should see a small JSON error about a
missing action, which means the endpoint is alive.

**"The backend did not return JSON."**
Usually the deployment is set to *Only myself*, so Google is returning a sign-in page.
Redeploy with access set to *Anyone*.

**Changes to the script do nothing.**
You edited the code but did not deploy a new version. See the note in step 4.

**"Sheet not found: COMPLAINTS".**
`Setup_initialiseSystem` has not run, or it ran against a different spreadsheet. Run it
again from inside the correct sheet.

**Uploads fail on large videos.**
Apps Script caps a request at roughly 50 MB after base64 encoding. For video evidence
above about 35 MB, ask the customer for a compressed clip, or have staff drop the file
into the Drive folder manually and note the link in the remarks.

**Everything is slow once the sheet is large.**
Past roughly 50,000 complaints, archive closed rows older than a year into a second
spreadsheet. The API reads the whole tab per request by design, which is fast until the
tab gets very large.
