# Setup Guide — Savon Customer Request System (v1.1)

A single-page customer request form, an admin portal, and per-store dashboards.
Backend = free Google Sheet + Apps Script. No server, no monthly fees.

## What's in this repo

| File              | Purpose                                                     |
|-------------------|-------------------------------------------------------------|
| `index.html`      | The whole front-end. Host this anywhere static.             |
| `apps_script.gs`  | Paste into your Google Sheet's Apps Script editor.          |
| `logo.png`        | **You add this.** Transparent-background logo, dropped next to `index.html`. |
| `SETUP.md`        | This file.                                                  |
| `CHANGELOG.md`    | Version history.                                            |
| `README.md`       | Project overview.                                           |

---

## Demo mode (zero setup)

Just open `index.html` in a browser. It runs in **Demo mode** — data is saved to your browser's `localStorage`. The form, admin login (`admin123`), store login (default password = lowercase store name), add/edit/delete stores, status updates, and admin Notification Emails all work. The "Send" email buttons show a friendly notice that they're demo-only.

This is great for confirming you like the UI before doing the 10-minute backend setup.

---

## Live mode (~10 minutes)

### Step 1 — Create the Google Sheet

1. Go to <https://sheets.new> and name the sheet `Savon Requests`.
2. You don't need to create the tabs manually — the script auto-creates `Requests`, `Stores`, `AdminEmails`, and `AuditLog` and seeds them on first run.

### Step 2 — Paste the Apps Script

1. In the sheet, click **Extensions → Apps Script**.
2. Delete the boilerplate `function myFunction() {}`.
3. Open `apps_script.gs` from this folder, copy the **entire** contents, paste into the editor.
4. Click **Save** (disk icon). Name the project `Savon Requests`.
5. From the function dropdown at the top of the editor, select `firstTimeSetup` and click **Run**. Authorize when prompted (Google will warn the script is "unverified" — click *Advanced → Go to Savon Requests (unsafe) → Allow*. This warning appears because **you** are the developer, not Google; it's safe).
6. Switch back to your sheet — you'll now see the four tabs with your three stores already seeded.

### Step 3 — Deploy as a Web App

1. In the Apps Script editor, click **Deploy → New deployment**.
2. Click the gear icon ⚙ next to "Select type" → choose **Web app**.
3. Settings:
   - **Description:** Savon Requests API
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**.
5. Copy the **Web app URL** it shows you (starts with `https://script.google.com/macros/s/...`).

### Step 4 — Wire the URL into the HTML

1. Open `index.html` in any text editor.
2. Find this line near the top of the `<script>` block:
   ```js
   WEB_APP_URL: 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE',
   ```
3. Replace the placeholder with the URL from Step 3. Save the file.

### Step 5 — Schedule the three weekly jobs

In the Apps Script editor, click the **clock icon** (Triggers) on the left, then **+ Add Trigger** three times — once for each:

**Trigger 1 — Per-store weekly digest**
- Function: `sendWeeklyDigest`
- Event source: **Time-driven**
- Type: **Week timer**
- Day: **Every Sunday**, Time: **8pm – 9pm**

**Trigger 2 — Master change log (to admin emails)**
- Function: `sendMasterChangeLog`
- Event source: **Time-driven**
- Type: **Week timer**
- Day: **Every Sunday**, Time: **9pm – 10pm**

**Trigger 3 — Stale-pending alert (to admin emails)**
- Function: `checkStalePending`
- Event source: **Time-driven**
- Type: **Week timer**
- Day: **Every Monday**, Time: **7am – 8am**

After this, every status change made in the past week reaches admin emails on Sunday night, each store gets their pending list at 8pm Sunday, and any request stuck in Pending 7+ days surfaces on Monday morning.

### Step 6 — Host the HTML

Pick any free static host:

- **Netlify Drop** — drag your folder onto <https://app.netlify.com/drop>. Done in 30 seconds.
- **GitHub Pages** — push the repo, enable Pages in Settings → Pages.
- **Vercel** / **Cloudflare Pages** — connect to a GitHub repo.

Once hosted, that URL is the link to put behind your store's "Request an Item" button.

### Step 7 — Lock down passwords

1. Open `index.html`, change `ADMIN_PASSWORD: 'admin123'` to something strong. Re-deploy.
2. Log into the admin portal → **Stores** tab → for each store click **Edit** and set a real password.
3. Log into the admin portal → **Notification Emails** tab → add the addresses that should receive the weekly master change log and stale-pending alerts.

---

## Updating from v1.0 → v1.1

You don't need to redo any of the setup above. Just:

1. Paste the new `apps_script.gs` over the old one, **Save**.
2. **Deploy → Manage deployments → pencil icon → Version: New version → Deploy.** The Web App URL stays the same so `index.html` doesn't need to change.
3. Replace `index.html` on your host (Netlify drag-replace, or `git push` if on GitHub Pages).
4. No new triggers needed — the v1.1 instant-notification emails fire from `createRequest` and `updateStatus` directly.

---

## Admin walkthrough

- **Sign in** via the **🔐 Admin** button (top-right). Password from `CONFIG.ADMIN_PASSWORD` in `index.html`.
- **Requests tab** — every request across every store, filterable by store / type / status / search. Change a request's status from the dropdown in the row. For `Ordered` / `Not Available` a modal pops up requiring the extra info (date or reason); the customer is emailed automatically when you save.
- **Stores tab** — add a new store with name + email + login password. The email field accepts multiple addresses separated by `;` or `,`, e.g. `manager@x.com;owner@y.com`.
- **Notification Emails tab** — manage the master list of addresses that receive the weekly change log, the stale-pending alert, the instant CC on new requests, and the instant status-change notifications.
- **Weekly Email tab** — manual "send digest now" button + info about the scheduled jobs.

## Store walkthrough

- Each store manager signs in via **🏪 Store Login** with their store name and password (admin sets these on the Stores tab).
- They see only their store's requests with the same filters and status controls.
- Marking statuses works the same as in admin: customer notifications fire automatically.

---

## Customising

- **Colours:** edit the `:root` CSS variables in `index.html`. Accent (red) = `--accent: #dc2626;`.
- **Stale-pending threshold:** edit `STALE_PENDING_DAYS` in `apps_script.gs` (default 7).
- **Initial stores:** edit `CONFIG.INITIAL_STORES` in `index.html` (used in demo mode) and `firstTimeSetup` in `apps_script.gs` (used for backend seeding).
- **Logo:** drop a transparent PNG named `logo.png` next to `index.html`.

---

## Troubleshooting

**"Could not load stores" toast.** The `WEB_APP_URL` is wrong, the deploy isn't live, or you re-deployed and got a new URL. Confirm the URL in `index.html` matches the latest Apps Script deployment.

**Form submits but nothing in the sheet.** Open Apps Script → **Executions** (left sidebar) → look at the latest run for the error.

**"Authorization required" error.** Re-deploy the Web App with **Who has access: Anyone**. If you change the script, you also need to **Deploy → Manage deployments → pencil → New version**.

**Weekly email didn't send.** Apps Script → **Triggers** to confirm the trigger exists. Apps Script → **Executions** to see if the run fired and look at any errors. Common gotcha: the Gmail account hit its daily send quota (free tier = 100/day, plenty for this).

**Multiple-email store address didn't work.** Make sure you're on v1.1 of the Apps Script — the `normalizeEmails` helper (which converts `;` to `,`) only exists from v1.1 onwards.

**Customer didn't get the status-change email.** Verify the customer's `customerEmail` field looks like an email (contains `@`). If they only entered a phone number, emails are skipped.

**Passwords feel insecure.** They are — store passwords are plaintext in the sheet and the admin password is hardcoded in JS. This is appropriate for a small-business internal tool, but don't treat the system as enterprise-grade auth.
