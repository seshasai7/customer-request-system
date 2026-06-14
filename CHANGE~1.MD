# Changelog

All notable changes to the Customer Request System are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to a loose form of [Semantic Versioning](https://semver.org/).

---

## [1.2] — current — White-label edition

### Added
- **`BRAND` config block** at the top of `index.html` and `apps_script.gs` — change one block to rebrand the entire system (store name, hero copy, primary colour, secondary accent, background, logo, footer attribution, email subjects, email body copy). Total rebrand time: ~5 minutes.
- `applyBrand()` runs once at page init — injects CSS variables from `BRAND.primaryColor` / `BRAND.goldColor` / `BRAND.darkBg`, sets `document.title`, and rewrites the hero, logo, footer, and inline `<span class="brand-store-name">` placeholders.
- Helper constant `BRAND_DOMAIN` derived from `BRAND.builtByUrl` for clean footer rendering in emails.
- New doc: `BRANDING.md` — step-by-step white-label customisation guide with example colour presets and a reseller pricing rubric.

### Changed
- Every hardcoded "Savon" reference in the front-end and Apps Script (email subjects, email banners, customer body copy, sender display names, plain-text digest header, footers) now reads from `BRAND.storeName` / `BRAND.shortName` / `BRAND.builtBy` at runtime.
- Default `BRAND` values still map 1:1 to Savon Liquor & Wine, so this release is a pure refactor — no behaviour change for the existing live deployment.

### Security / hygiene
- `WEB_APP_URL` set to a placeholder (`PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE`) — real Web App URLs must be filled in per deployment.
- `ADMIN_PASSWORD` set to `CHANGE_ME` so it's obvious the source default must be replaced before going live.
- Initial-store seed addresses in `CONFIG.INITIAL_STORES` and `firstTimeSetup()` replaced with `store1@example.com`-style placeholders.

---

## [1.1]

### Added
- Customer form now collects `customerEmail` AND `customerPhone` as separate required fields.
- **Instant new-request notification** — the moment a customer submits a request, the store's manager email receives a full request summary, and every address in the admin notification email list is **CC'd** on the same email.
- **Instant status-change notification** — admin emails are notified the moment any store manager updates a request's status (in addition to the weekly master change log).
- Store-email field now accepts **multiple addresses** separated by `;`, `,`, or whitespace. Example: `manager@x.com;owner@y.com`. The backend normalises them before sending.

### Changed
- Stale-pending alert threshold lowered from **14 days → 7 days**.
- Admin Notification Emails tab copy updated to reflect the new threshold and instant notifications.

### Backward compatibility
- Existing rows that only have the legacy `customerContact` column still display correctly; the new code falls back to it when `customerEmail` / `customerPhone` are empty.

---

## [1.0]

### Added
- New status: **`not_available`** — store managers can decline a request with a required reason that is forwarded to the customer.
- **`Ordered`** status now collects an expected available date and emails the customer with the date plus a "distributor availability not guaranteed" disclaimer.
- **`Fulfilled`** status now emails the customer that the item is in stock.
- New sheet **`AdminEmails`** — admin-managed list of addresses that receive the master change log and stale-pending alerts.
- New sheet **`AuditLog`** — every status change is recorded with timestamp, old → new status, manager comment, expected date, and who made the change.
- New scheduled job **`sendMasterChangeLog`** — weekly digest of every change made by store managers, sent to all admin emails.
- New scheduled job **`checkStalePending`** — alerts when any request has been sitting in Pending for 14+ days (lowered to 7 in v1.1).
- Admin portal: new **Notification Emails** tab to manage the master email list with instant test-send buttons.
- Footer attributes the system to **Savon Nexo LLC** with link to [savonnexo.com](https://www.savonnexo.com).
- Customer form disclaimer about distributor availability and Savon's right to decline a request.
- Version tag (`v1.0`) shown in the footer and embedded in every system email.

### Removed
- The visible "default password" hint on the store login modal.

---

## [0.0] — initial release

### Added
- Customer request form: spirits/wine vs. beer toggle, store dropdown, item details, customer name + single contact field.
- Admin portal: view all requests across stores, filter by store / type / status / search, add/edit/delete stores, manual weekly digest button.
- Store portal: each store logs in to see only their own requests, with the same filters and status controls.
- Statuses: `pending`, `ordered`, `fulfilled`.
- Google Apps Script backend with `Requests` and `Stores` sheets.
- Scheduled `sendWeeklyDigest` — Sunday evening per-store digest of the past week's pending requests.
- Demo mode — works fully in-browser via `localStorage` before the backend is wired up, useful for previewing the UI.
