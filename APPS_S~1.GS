/**
 * CUSTOMER REQUEST SYSTEM — Backend (Google Apps Script)
 *  Version 1.2 — White-label edition
 *
 * Paste this entire file into your Google Sheet's Apps Script editor:
 *   Extensions → Apps Script → delete starter code → paste this → Save → Deploy → Manage deployments → New version
 *
 * v1.2 changelog (vs 1.1):
 *   • White-label: edit the BRAND block below to rebrand the whole system for a different
 *     retailer (store name, short name, primary color, footer attribution) — see BRANDING.md
 *
 * v1.1 changelog (vs 1.0):
 *   • Customer form now collects customerEmail AND customerPhone as separate required fields
 *   • Store manager email + admin emails are CC'd INSTANTLY when a customer submits a new request
 *   • Admin emails get an INSTANT notification on every status change (in addition to the weekly digest)
 *   • Store email field now accepts multiple addresses separated by ";" or "," or whitespace
 *     e.g. "manager@store.com;owner@store.com" — both get the emails
 *   • Stale-pending threshold lowered from 14 days to 7 days
 *
 * v1.0 changelog (vs 0.0):
 *   • New status: not_available (required reason, emails customer with the reason)
 *   • Ordered status now collects expected-available date and emails the customer
 *   • Fulfilled status emails the customer that the item is in stock
 *   • New sheet AdminEmails — receives master change log and stale alerts
 *   • New sheet AuditLog — every status change written here for traceability
 *
 * Sheets (auto-created on first run; run firstTimeSetup() once to seed):
 *   Requests      — id, timestamp, type, store, itemName, bottleSize, container,
 *                   packSize, customerName, customerContact, customerEmail,
 *                   customerPhone, notes, status, managerComment, expectedDate, lastUpdated
 *   Stores        — name, email, password
 *   AdminEmails   — email, label
 *   AuditLog      — timestamp, requestId, store, itemName, oldStatus, newStatus,
 *                   changedBy, managerComment, expectedDate
 */

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const APP_VERSION = '1.2';

// ---------------------------------------------------------------------------
// BRAND — edit this block to white-label the backend.
// MUST match the BRAND block in index.html. See BRANDING.md.
// ---------------------------------------------------------------------------
const BRAND = {
  storeName:    'Savon Liquor & Wine',
  shortName:    'Savon',                       // appears in email subject prefix, e.g. "[Savon ...] "
  builtBy:      'Savon Nexo LLC',
  builtByUrl:   'https://www.savonnexo.com',
  primaryColor: '#dc2626',                     // hex — used in email accent strips
};
const BRAND_DOMAIN = BRAND.builtByUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

const SHEET_REQUESTS     = 'Requests';
const SHEET_STORES       = 'Stores';
const SHEET_ADMIN_EMAILS = 'AdminEmails';
const SHEET_AUDIT        = 'AuditLog';

const REQUEST_HEADERS = [
  'id', 'timestamp', 'type', 'store', 'itemName', 'bottleSize',
  'container', 'packSize', 'customerName', 'customerContact',
  'customerEmail', 'customerPhone',
  'notes', 'status', 'managerComment', 'expectedDate', 'lastUpdated'
];
const STORE_HEADERS       = ['name', 'email', 'password'];
const ADMIN_EMAIL_HEADERS = ['email', 'label'];
const AUDIT_HEADERS       = ['timestamp', 'requestId', 'store', 'itemName',
                             'oldStatus', 'newStatus', 'changedBy',
                             'managerComment', 'expectedDate'];

const STALE_PENDING_DAYS = 7; // v1.1: was 14

// ---------------------------------------------------------------------------
// HTTP HANDLERS
// ---------------------------------------------------------------------------
function doGet(e)  { return handle(e.parameter.action, e.parameter); }
function doPost(e) {
  let params = {};
  try { params = JSON.parse(e.postData.contents); }
  catch (_) { params = e.parameter || {}; }
  return handle(params.action, params);
}

function handle(action, params) {
  try {
    let result;
    switch (action) {
      case 'listStores':                 result = listStores(); break;
      case 'listRequests':               result = listRequests(params.store); break;
      case 'createRequest':              result = createRequest(params); break;
      case 'addStore':                   result = addStore(params); break;
      case 'updateStore':                result = updateStore(params); break;
      case 'deleteStore':                result = deleteStore(params.name); break;
      case 'updateStatus':               result = updateStatus(params); break;
      case 'listAdminEmails':            result = listAdminEmails(); break;
      case 'addAdminEmail':              result = addAdminEmail(params); break;
      case 'deleteAdminEmail':           result = deleteAdminEmail(params.email); break;
      case 'sendWeeklyEmailNow':         result = sendWeeklyDigestImpl(); break;
      case 'sendMasterChangeLogNow':     result = sendMasterChangeLogImpl(); break;
      case 'sendStalePendingAlertNow':   result = sendStalePendingImpl(); break;
      default:                           result = { ok: false, error: 'Unknown action: ' + action };
    }
    return jsonOut(result);
  } catch (err) {
    return jsonOut({ ok: false, error: err.toString() });
  }
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------------
// EMAIL ADDRESS HELPERS — v1.1
//
// MailApp.sendEmail expects comma-separated addresses. The store email field
// and the admin emails sheet may contain ";"-separated entries (or even
// whitespace-separated). Normalize to comma-separated and de-dupe.
// ---------------------------------------------------------------------------
function normalizeEmails(s) {
  if (!s) return '';
  return String(s)
    .split(/[;,\s]+/)
    .map(x => x.trim())
    .filter(x => x.length > 0 && x.indexOf('@') > 0)
    .filter((v, i, a) => a.indexOf(v) === i) // de-dupe (case-sensitive ok for emails)
    .join(',');
}

function allAdminEmailsAsString() {
  const admins = readAll(SHEET_ADMIN_EMAILS, ADMIN_EMAIL_HEADERS);
  return admins.map(a => a.email).join(',');
}

function countRecipients(str) {
  if (!str) return 0;
  return str.split(',').filter(x => x.trim().length > 0).length;
}

// ---------------------------------------------------------------------------
// SHEET HELPERS
// ---------------------------------------------------------------------------
function sh(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    if (name === SHEET_REQUESTS)      s.appendRow(REQUEST_HEADERS);
    if (name === SHEET_STORES)        s.appendRow(STORE_HEADERS);
    if (name === SHEET_ADMIN_EMAILS)  s.appendRow(ADMIN_EMAIL_HEADERS);
    if (name === SHEET_AUDIT)         s.appendRow(AUDIT_HEADERS);
  }
  return s;
}

function readAll(sheetName, headers) {
  const s = sh(sheetName);
  const data = s.getDataRange().getValues();
  if (data.length < 2) return [];
  ensureHeaders(s, headers);
  const fresh = s.getDataRange().getValues();
  return fresh.slice(1).filter(r => r.some(c => c !== '')).map(r => {
    const o = {};
    headers.forEach((h, i) => { o[h] = r[i] !== undefined ? r[i] : ''; });
    return o;
  });
}

function ensureHeaders(s, expected) {
  const lastCol = Math.max(1, s.getLastColumn());
  const current = s.getRange(1, 1, 1, lastCol).getValues()[0];
  let changed = false;
  for (let i = 0; i < expected.length; i++) {
    if (current[i] !== expected[i]) {
      s.getRange(1, i + 1).setValue(expected[i]);
      changed = true;
    }
  }
  return changed;
}

// ---------------------------------------------------------------------------
// STORES
// ---------------------------------------------------------------------------
function listStores() {
  return { ok: true, stores: readAll(SHEET_STORES, STORE_HEADERS) };
}
function addStore(params) {
  if (!params.name || !params.email) return { ok: false, error: 'Name and email required' };
  const existing = readAll(SHEET_STORES, STORE_HEADERS);
  if (existing.find(x => String(x.name).toLowerCase() === String(params.name).toLowerCase())) {
    return { ok: false, error: 'Store already exists' };
  }
  const password = params.password || String(params.name).toLowerCase();
  sh(SHEET_STORES).appendRow([params.name, params.email, password]);
  return { ok: true };
}
function updateStore(params) {
  const s = sh(SHEET_STORES);
  const data = s.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === params.original) {
      const password = params.password || data[i][2] || String(params.name).toLowerCase();
      s.getRange(i + 1, 1, 1, 3).setValues([[params.name, params.email, password]]);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Store not found' };
}
function deleteStore(name) {
  const s = sh(SHEET_STORES);
  const data = s.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === name) { s.deleteRow(i + 1); return { ok: true }; }
  }
  return { ok: false, error: 'Not found' };
}

// ---------------------------------------------------------------------------
// ADMIN NOTIFICATION EMAILS
// ---------------------------------------------------------------------------
function listAdminEmails() {
  return { ok: true, emails: readAll(SHEET_ADMIN_EMAILS, ADMIN_EMAIL_HEADERS) };
}
function addAdminEmail(params) {
  if (!params.email) return { ok: false, error: 'Email required' };
  const existing = readAll(SHEET_ADMIN_EMAILS, ADMIN_EMAIL_HEADERS);
  if (existing.find(x => String(x.email).toLowerCase() === String(params.email).toLowerCase())) {
    return { ok: false, error: 'Email already in the list' };
  }
  sh(SHEET_ADMIN_EMAILS).appendRow([params.email, params.label || '']);
  return { ok: true };
}
function deleteAdminEmail(email) {
  const s = sh(SHEET_ADMIN_EMAILS);
  const data = s.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === email) { s.deleteRow(i + 1); return { ok: true }; }
  }
  return { ok: false, error: 'Not found' };
}

// ---------------------------------------------------------------------------
// REQUESTS
// ---------------------------------------------------------------------------
function listRequests(storeFilter) {
  let rows = readAll(SHEET_REQUESTS, REQUEST_HEADERS);
  if (storeFilter) rows = rows.filter(r => r.store === storeFilter);
  rows.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return { ok: true, requests: rows };
}

function createRequest(p) {
  if (!p.store || !p.itemName) return { ok: false, error: 'Store and item required' };
  const id = 'r_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const timestamp = new Date().toISOString();
  const customerEmail = p.customerEmail || '';
  const customerPhone = p.customerPhone || '';
  // Keep legacy customerContact populated for backward compat / search
  const customerContact = p.customerContact || customerEmail || customerPhone || '';

  sh(SHEET_REQUESTS).appendRow([
    id, timestamp, p.type || '', p.store, p.itemName,
    p.bottleSize || '', p.container || '', p.packSize || '',
    p.customerName || '', customerContact,
    customerEmail, customerPhone,
    p.notes || '', 'pending', '', '', ''
  ]);

  // v1.1: instantly notify store + CC admins about the new request
  try {
    const req = Object.assign({}, p, {
      id: id,
      timestamp: timestamp,
      customerEmail: customerEmail,
      customerPhone: customerPhone,
      customerContact: customerContact,
      status: 'pending'
    });
    sendNewRequestNotification(req);
  } catch (err) {
    Logger.log('New-request notification failed: ' + err);
  }

  return { ok: true, id: id };
}

function updateStatus(params) {
  const id = params.id;
  const newStatus = params.status;
  const managerComment = params.managerComment || '';
  const expectedDate = params.expectedDate || '';
  const changedBy = params.changedBy || 'unknown';

  const s = sh(SHEET_REQUESTS);
  const data = s.getDataRange().getValues();
  const idxOf = h => REQUEST_HEADERS.indexOf(h) + 1;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      const oldStatus = data[i][idxOf('status') - 1];
      const row = i + 1;
      s.getRange(row, idxOf('status')).setValue(newStatus);
      if (managerComment) s.getRange(row, idxOf('managerComment')).setValue(managerComment);
      if (expectedDate)   s.getRange(row, idxOf('expectedDate')).setValue(expectedDate);
      s.getRange(row, idxOf('lastUpdated')).setValue(new Date().toISOString());

      // Reconstruct request object for emails
      const req = {};
      REQUEST_HEADERS.forEach((h, j) => req[h] = data[i][j]);
      req.status = newStatus;
      if (managerComment) req.managerComment = managerComment;
      if (expectedDate)   req.expectedDate = expectedDate;

      // Audit log
      sh(SHEET_AUDIT).appendRow([
        new Date().toISOString(), id, req.store, req.itemName,
        oldStatus, newStatus, changedBy, managerComment, expectedDate
      ]);

      // Customer email
      try { maybeEmailCustomer(req, oldStatus); }
      catch (err) { Logger.log('Customer email failed: ' + err); }

      // v1.1: instant admin notification on every status change
      try { sendStatusChangeAdminNotification(req, oldStatus, changedBy); }
      catch (err) { Logger.log('Admin status notification failed: ' + err); }

      return { ok: true };
    }
  }
  return { ok: false, error: 'Request not found' };
}

// ---------------------------------------------------------------------------
// NEW REQUEST NOTIFICATION — v1.1
// Fires instantly when a customer submits a request.
// Sends to the store's manager email(s), CC's all admin emails.
// ---------------------------------------------------------------------------
function sendNewRequestNotification(req) {
  // Find the store record so we know which email(s) to notify
  const stores = readAll(SHEET_STORES, STORE_HEADERS);
  const store = stores.find(s => s.name === req.store);
  if (!store || !store.email) {
    Logger.log('No store email configured for ' + req.store + ' — skipping new-request notification.');
    return;
  }

  const toList = normalizeEmails(store.email);
  if (!toList) {
    Logger.log('Store email could not be normalized for ' + req.store);
    return;
  }

  const ccList = normalizeEmails(allAdminEmailsAsString());

  const itemDesc = describeItem(req);
  const customerName = req.customerName || 'A customer';
  const subject = '[' + BRAND.shortName + ' ' + req.store + '] New customer request from ' + customerName + ': ' + req.itemName;

  const text = customerName + ' has submitted a new customer request at ' + req.store + '.\n\n'
             + 'Item: ' + req.itemName + ' (' + req.type + ')\n'
             + 'Details: ' + itemDesc + '\n'
             + (req.notes ? 'Notes: ' + req.notes + '\n' : '')
             + '\nCustomer contact:\n'
             + '  Name:  ' + customerName + '\n'
             + (req.customerEmail ? '  Email: ' + req.customerEmail + '\n' : '')
             + (req.customerPhone ? '  Phone: ' + req.customerPhone + '\n' : '')
             + '\nSign in to your store portal to mark this as Ordered, Fulfilled, or Not Available.\n';

  const html = newRequestEmailHtml(req, customerName, itemDesc);

  const opts = {
    htmlBody: html,
    name: BRAND.storeName + ' — Customer Requests'
  };
  if (ccList) opts.cc = ccList;

  MailApp.sendEmail(toList, subject, text, opts);
}

function newRequestEmailHtml(req, customerName, itemDesc) {
  const rows = [
    ['Store',    req.store],
    ['Item',     req.itemName],
    ['Type',     req.type],
    ['Details',  itemDesc],
    ['Notes',    req.notes || '—'],
    ['Customer', customerName],
    ['Email',    req.customerEmail || '—'],
    ['Phone',    req.customerPhone || '—'],
  ];
  const rowsHtml = rows.map(([k, v]) => `
    <tr>
      <td style="padding:8px 0;width:130px;color:#888;font-size:13px;">${escape(k)}</td>
      <td style="padding:8px 0;color:#222;font-weight:500;">${escape(v || '—')}</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f7f7f9;">
    <div style="max-width:600px;margin:0 auto;background:#fff;">
      <div style="background:#0a0a0f;color:#fff;padding:28px;text-align:center;">
        <div style="font-size:22px;font-weight:700;letter-spacing:0.05em;">${escape(BRAND.storeName.toUpperCase())}</div>
        <div style="font-size:12px;color:#a8a8b3;margin-top:4px;letter-spacing:0.2em;">NEW CUSTOMER REQUEST</div>
      </div>
      <div style="padding:32px;border-top:3px solid #d4a574;">
        <h2 style="margin:0 0 8px;color:#222;font-size:22px;">${escape(customerName)} would like an item</h2>
        <p style="color:#555;margin:0 0 20px;">A new request just came in for the <strong>${escape(req.store)}</strong> location.</p>
        <table style="width:100%;border-collapse:collapse;">${rowsHtml}</table>
        <div style="margin-top:20px;padding:14px;background:#f7f7f9;border-radius:6px;color:#555;font-size:13px;line-height:1.5;">
          Sign in to your store portal to mark this request as <strong>Ordered</strong>, <strong>Fulfilled</strong>, or <strong>Not Available</strong>. The customer will be emailed automatically when you do.
        </div>
      </div>
      <div style="background:#f0f0f3;padding:14px;text-align:center;color:#888;font-size:12px;">
        ${escape(BRAND.storeName)} · Customer Request System v${APP_VERSION}<br>
        Built by ${escape(BRAND.builtBy)} — <a href="${BRAND.builtByUrl}" style="color:#888;">${BRAND_DOMAIN}</a>
      </div>
    </div>
  </body></html>`;
}

// ---------------------------------------------------------------------------
// STATUS CHANGE ADMIN NOTIFICATION — v1.1
// Fires instantly when a store manager (or admin) updates a request's status.
// Sends to all admin emails.
// ---------------------------------------------------------------------------
function sendStatusChangeAdminNotification(req, oldStatus, changedBy) {
  const toList = normalizeEmails(allAdminEmailsAsString());
  if (!toList) {
    Logger.log('No admin emails configured — skipping status-change admin notification.');
    return;
  }

  const newStatusLabel = String(req.status || '').replace('_', ' ').toUpperCase();
  const subject = '[' + BRAND.shortName + ' ' + req.store + '] Status changed: ' + req.itemName + ' → ' + newStatusLabel;

  const text = changedBy + ' changed the status of a customer request at ' + req.store + '.\n\n'
             + 'Item: ' + req.itemName + '\n'
             + 'Status: ' + (oldStatus || '—') + ' → ' + req.status + '\n'
             + (req.managerComment ? 'Manager comment: ' + req.managerComment + '\n' : '')
             + (req.expectedDate ? 'Expected available: ' + req.expectedDate + '\n' : '')
             + '\nCustomer:\n'
             + '  Name:  ' + (req.customerName || '—') + '\n'
             + (req.customerEmail ? '  Email: ' + req.customerEmail + '\n' : '')
             + (req.customerPhone ? '  Phone: ' + req.customerPhone + '\n' : '');

  const html = statusChangeEmailHtml(req, oldStatus, changedBy);

  MailApp.sendEmail(toList, subject, text, {
    htmlBody: html,
    name: BRAND.storeName + ' — Activity'
  });
}

function statusChangeEmailHtml(req, oldStatus, changedBy) {
  const rows = [
    ['Store',        req.store],
    ['Item',         req.itemName],
    ['Old status',   oldStatus || '—'],
    ['New status',   req.status],
    ['Changed by',   changedBy],
  ];
  if (req.managerComment) rows.push(['Comment',     req.managerComment]);
  if (req.expectedDate)   rows.push(['Expected by', req.expectedDate]);
  rows.push(['Customer', req.customerName || '—']);
  if (req.customerEmail) rows.push(['Email',       req.customerEmail]);
  if (req.customerPhone) rows.push(['Phone',       req.customerPhone]);

  const rowsHtml = rows.map(([k, v]) => `
    <tr>
      <td style="padding:8px 0;width:140px;color:#888;font-size:13px;">${escape(k)}</td>
      <td style="padding:8px 0;color:#222;font-weight:500;">${escape(v || '—')}</td>
    </tr>`).join('');

  const accent = statusColor(req.status);

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f7f7f9;">
    <div style="max-width:600px;margin:0 auto;background:#fff;">
      <div style="background:#0a0a0f;color:#fff;padding:28px;text-align:center;">
        <div style="font-size:22px;font-weight:700;letter-spacing:0.05em;">${escape(BRAND.storeName.toUpperCase())}</div>
        <div style="font-size:12px;color:#a8a8b3;margin-top:4px;letter-spacing:0.2em;">STATUS UPDATE</div>
      </div>
      <div style="padding:32px;border-top:3px solid ${accent};">
        <h2 style="margin:0 0 8px;color:#222;font-size:22px;">${escape(req.itemName)} → ${escape(String(req.status).replace('_',' '))}</h2>
        <p style="color:#555;margin:0 0 20px;"><strong>${escape(changedBy)}</strong> updated this request at <strong>${escape(req.store)}</strong>.</p>
        <table style="width:100%;border-collapse:collapse;">${rowsHtml}</table>
      </div>
      <div style="background:#f0f0f3;padding:14px;text-align:center;color:#888;font-size:12px;">
        ${escape(BRAND.storeName)} · v${APP_VERSION} · Built by ${escape(BRAND.builtBy)}
      </div>
    </div>
  </body></html>`;
}

// ---------------------------------------------------------------------------
// CUSTOMER NOTIFICATION EMAILS
// ---------------------------------------------------------------------------
function maybeEmailCustomer(req, oldStatus) {
  // v1.1: prefer customerEmail field; fall back to legacy customerContact
  const candidate = req.customerEmail || req.customerContact || '';
  const contact = String(candidate).trim();
  if (!contact || contact.indexOf('@') < 0) return; // not an email, skip

  const itemDesc = describeItem(req);
  let subject, html, text;

  if (req.status === 'ordered') {
    subject = 'Update on your ' + BRAND.shortName + ' request: ' + req.itemName + ' has been ordered';
    text = 'Hi ' + (req.customerName || 'there') + ',\n\n'
         + 'Good news — your request for "' + req.itemName + '" (' + itemDesc + ') at our '
         + req.store + ' location has been ORDERED. It is expected to be available around '
         + formatDateOnly(req.expectedDate) + '.\n\n'
         + 'Please note: this date is not confirmed. If our distributor is out of stock or for any '
         + 'reason the item does not arrive, ' + BRAND.storeName + ' cannot be held responsible. We will '
         + 'reach out again once the item is on our shelves.\n\nThank you for choosing ' + BRAND.shortName + '!\n';
    html = customerEmailHtml({
      title: 'Your request has been ordered',
      accent: '#3b82f6',
      lead: 'We\'ve placed an order for the item you asked about.',
      rows: [
        ['Item',          req.itemName],
        ['Details',       itemDesc],
        ['Store',         req.store],
        ['Expected by',   formatDateOnly(req.expectedDate)],
      ],
      footnote: 'Please note: this date is not confirmed. If our distributor is out of stock or for any reason the item does not arrive, ' + escape(BRAND.storeName) + ' cannot be held responsible. We\'ll reach out again once the item is on our shelves.'
    });
  }
  else if (req.status === 'fulfilled') {
    subject = 'Your ' + BRAND.shortName + ' request is in stock: ' + req.itemName;
    text = 'Hi ' + (req.customerName || 'there') + ',\n\n'
         + 'Great news — "' + req.itemName + '" (' + itemDesc + ') is now IN STOCK at our '
         + req.store + ' location and ready for pickup.\n\nThanks for choosing ' + BRAND.shortName + '!\n';
    html = customerEmailHtml({
      title: 'It\'s here — your item is in stock',
      accent: '#10b981',
      lead: 'The item you requested is now available at the store.',
      rows: [
        ['Item',    req.itemName],
        ['Details', itemDesc],
        ['Store',   req.store],
      ],
      footnote: 'Come by whenever you\'re ready. Holds are not guaranteed — first come, first served.'
    });
  }
  else if (req.status === 'not_available') {
    subject = 'Update on your ' + BRAND.shortName + ' request: ' + req.itemName + ' is not available';
    text = 'Hi ' + (req.customerName || 'there') + ',\n\n'
         + 'Thank you for your request for "' + req.itemName + '" (' + itemDesc + ') at our '
         + req.store + ' location.\n\n'
         + 'Unfortunately, we are unable to fulfill this request at this time. Reason from the store manager:\n\n'
         + '"' + (req.managerComment || 'Item not currently available.') + '"\n\n'
         + '' + BRAND.storeName + ' reserves the right to decline requests when items are not available through our distributors. '
         + 'We appreciate your understanding, and hope you\'ll consider asking us about other items.\n';
    html = customerEmailHtml({
      title: 'We weren\'t able to fulfill this request',
      accent: '#dc2626',
      lead: 'Unfortunately we won\'t be able to bring this item in.',
      rows: [
        ['Item',          req.itemName],
        ['Details',       itemDesc],
        ['Store',         req.store],
        ['Reason',        req.managerComment || '—'],
      ],
      footnote: '' + escape(BRAND.storeName) + ' reserves the right to decline requests when items are not available through our distributors. We appreciate your understanding, and hope you\'ll consider asking us about other items.'
    });
  }
  else {
    return;
  }

  MailApp.sendEmail({
    to: contact,
    subject: subject,
    body: text,
    htmlBody: html,
    name: BRAND.storeName
  });
}

function describeItem(r) {
  if (r.type === 'beer')    return (r.container || '') + ' · ' + (r.packSize || '');
  if (r.type === 'spirits') return r.bottleSize || '';
  return '';
}

function customerEmailHtml(opts) {
  const rowsHtml = opts.rows.map(([k, v]) => `
    <tr>
      <td style="padding:8px 0;width:130px;color:#888;font-size:13px;">${escape(k)}</td>
      <td style="padding:8px 0;color:#222;font-weight:500;">${escape(v || '—')}</td>
    </tr>`).join('');
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f7f7f9;">
    <div style="max-width:600px;margin:0 auto;background:#fff;">
      <div style="background:#0a0a0f;color:#fff;padding:28px;text-align:center;">
        <div style="font-size:22px;font-weight:700;letter-spacing:0.05em;">${escape(BRAND.storeName.toUpperCase())}</div>
      </div>
      <div style="padding:32px;border-top:3px solid ${opts.accent};">
        <h2 style="margin:0 0 8px;color:#222;font-size:22px;">${escape(opts.title)}</h2>
        <p style="color:#555;margin:0 0 20px;">${escape(opts.lead)}</p>
        <table style="width:100%;border-collapse:collapse;">${rowsHtml}</table>
        <div style="margin-top:20px;padding:14px;background:#f7f7f9;border-radius:6px;color:#555;font-size:13px;line-height:1.5;">
          ${opts.footnote}
        </div>
      </div>
      <div style="background:#f0f0f3;padding:14px;text-align:center;color:#888;font-size:12px;">
        ${escape(BRAND.storeName)} · Customer Request System v${APP_VERSION}<br>
        Built by ${escape(BRAND.builtBy)} — <a href="${BRAND.builtByUrl}" style="color:#888;">${BRAND_DOMAIN}</a>
      </div>
    </div>
  </body></html>`;
}

// ---------------------------------------------------------------------------
// WEEKLY DIGEST (PER STORE)
// ---------------------------------------------------------------------------
function sendWeeklyDigest() { sendWeeklyDigestImpl(); }

function sendWeeklyDigestImpl() {
  const stores = readAll(SHEET_STORES, STORE_HEADERS);
  const all = readAll(SHEET_REQUESTS, REQUEST_HEADERS);
  const weekAgo = Date.now() - 7 * 86400000;

  let sent = 0;
  stores.forEach(store => {
    const reqs = all.filter(r =>
      r.store === store.name &&
      r.status === 'pending' &&
      new Date(r.timestamp).getTime() >= weekAgo
    );
    if (reqs.length === 0) return;

    const recipients = normalizeEmails(store.email);
    if (!recipients) return;

    const subject = '[' + BRAND.shortName + ' Requests] Weekly digest for ' + store.name + ' — ' + reqs.length + ' item(s) to review';
    MailApp.sendEmail(recipients, subject, buildDigestText(store.name, reqs), {
      htmlBody: buildDigestHtml(store.name, reqs),
      name: BRAND.storeName + ' — Customer Requests'
    });
    sent++;
  });
  return { ok: true, sent: sent };
}

function buildDigestHtml(storeName, reqs) {
  const rows = reqs.map(r => `<tr>
      <td style="padding:10px;border-bottom:1px solid #eee;font-size:13px;color:#666;">${formatPrettyDate(r.timestamp)}</td>
      <td style="padding:10px;border-bottom:1px solid #eee;"><span style="display:inline-block;padding:2px 8px;background:#fff3cd;color:#856404;border-radius:4px;font-size:11px;text-transform:uppercase;font-weight:600;">${escape(r.type)}</span></td>
      <td style="padding:10px;border-bottom:1px solid #eee;"><strong>${escape(r.itemName)}</strong>${r.notes ? '<br><span style="font-size:12px;color:#888;">' + escape(r.notes) + '</span>' : ''}</td>
      <td style="padding:10px;border-bottom:1px solid #eee;font-size:13px;">${escape(describeItem(r))}</td>
      <td style="padding:10px;border-bottom:1px solid #eee;font-size:13px;color:#555;">${escape(r.customerName || '')}${r.customerEmail ? '<br><span style="font-size:12px;">' + escape(r.customerEmail) + '</span>' : ''}${r.customerPhone ? '<br><span style="font-size:12px;">' + escape(r.customerPhone) + '</span>' : ''}</td>
    </tr>`).join('');
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f7f7f9;">
    <div style="max-width:680px;margin:0 auto;background:#fff;">
      <div style="background:#0a0a0f;color:#fff;padding:32px;text-align:center;">
        <div style="font-size:24px;font-weight:700;letter-spacing:0.05em;">${escape(BRAND.storeName.toUpperCase())}</div>
        <div style="font-size:13px;color:#a8a8b3;margin-top:6px;letter-spacing:0.2em;">CUSTOMER REQUEST DIGEST</div>
      </div>
      <div style="padding:32px;">
        <h2 style="margin:0 0 8px 0;color:#222;">${escape(storeName)} — Weekly Order List</h2>
        <p style="color:#666;margin:0 0 24px 0;">${reqs.length} pending customer request${reqs.length === 1 ? '' : 's'} from the past 7 days. Please review and order.</p>
        <table style="width:100%;border-collapse:collapse;background:#fafafa;border:1px solid #eee;border-radius:8px;overflow:hidden;">
          <thead><tr style="background:#f0f0f3;">
            <th style="padding:10px;text-align:left;font-size:11px;text-transform:uppercase;color:#888;">Date</th>
            <th style="padding:10px;text-align:left;font-size:11px;text-transform:uppercase;color:#888;">Type</th>
            <th style="padding:10px;text-align:left;font-size:11px;text-transform:uppercase;color:#888;">Item</th>
            <th style="padding:10px;text-align:left;font-size:11px;text-transform:uppercase;color:#888;">Details</th>
            <th style="padding:10px;text-align:left;font-size:11px;text-transform:uppercase;color:#888;">Customer</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="color:#888;font-size:12px;margin-top:24px;">Sign in at the store portal to mark items as ordered, fulfilled, or not available.</p>
      </div>
      <div style="background:#f0f0f3;padding:16px;text-align:center;color:#888;font-size:12px;">
        ${escape(BRAND.storeName)} · Customer Request System v${APP_VERSION} · Built by ${escape(BRAND.builtBy)}
      </div>
    </div>
  </body></html>`;
}

function buildDigestText(storeName, reqs) {
  let s = BRAND.storeName.toUpperCase() + ' — Weekly Customer Request Digest\n';
  s += '======================================================\n\n';
  s += storeName + ' — ' + reqs.length + ' pending request(s) from the past 7 days:\n\n';
  reqs.forEach((r, i) => {
    s += (i + 1) + '. ' + r.itemName + ' (' + r.type + ')\n';
    s += '   ' + describeItem(r) + '\n';
    if (r.customerName) s += '   Customer: ' + r.customerName + '\n';
    if (r.customerEmail) s += '   Email: ' + r.customerEmail + '\n';
    if (r.customerPhone) s += '   Phone: ' + r.customerPhone + '\n';
    if (r.notes)        s += '   Notes: ' + r.notes + '\n';
    s += '   Submitted: ' + formatPrettyDate(r.timestamp) + '\n\n';
  });
  return s;
}

// ---------------------------------------------------------------------------
// MASTER CHANGE LOG (weekly, to admin emails)
// ---------------------------------------------------------------------------
function sendMasterChangeLog() { sendMasterChangeLogImpl(); }

function sendMasterChangeLogImpl() {
  const recipients = normalizeEmails(allAdminEmailsAsString());
  if (!recipients) return { ok: true, sent: 0, note: 'No admin emails configured.' };

  const audit = readAll(SHEET_AUDIT, AUDIT_HEADERS);
  const weekAgo = Date.now() - 7 * 86400000;
  const recent = audit
    .filter(a => new Date(a.timestamp).getTime() >= weekAgo)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (recent.length === 0) return { ok: true, sent: 0, note: 'No changes in the last 7 days.' };

  const counts = {};
  recent.forEach(a => counts[a.changedBy] = (counts[a.changedBy] || 0) + 1);

  const rowsHtml = recent.map(a => `<tr>
      <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px;color:#666;">${formatPrettyDate(a.timestamp)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;font-size:13px;">${escape(a.store)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;font-size:13px;"><strong>${escape(a.itemName)}</strong></td>
      <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px;color:#888;">${escape(a.oldStatus || '—')} → <strong style="color:${statusColor(a.newStatus)}">${escape((a.newStatus || '').replace('_', ' '))}</strong></td>
      <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px;">${escape(a.changedBy)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px;color:#666;">${escape(a.managerComment || a.expectedDate || '')}</td>
    </tr>`).join('');

  const countsHtml = Object.entries(counts).map(([who, n]) =>
    `<span style="display:inline-block;padding:4px 10px;background:#f0f0f3;border-radius:100px;margin:2px;font-size:12px;color:#555;"><strong>${escape(who)}</strong>: ${n} change${n === 1 ? '' : 's'}</span>`
  ).join('');

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f7f7f9;">
    <div style="max-width:760px;margin:0 auto;background:#fff;">
      <div style="background:#0a0a0f;color:#fff;padding:32px;text-align:center;">
        <div style="font-size:24px;font-weight:700;letter-spacing:0.05em;">${escape(BRAND.storeName.toUpperCase())}</div>
        <div style="font-size:13px;color:#a8a8b3;margin-top:6px;letter-spacing:0.2em;">MASTER CHANGE LOG</div>
      </div>
      <div style="padding:32px;">
        <h2 style="margin:0 0 8px;color:#222;">${recent.length} status change${recent.length === 1 ? '' : 's'} in the past week</h2>
        <p style="color:#666;margin:0 0 16px;">Tracking every action taken by store managers across all locations.</p>
        <div style="margin-bottom:20px;">${countsHtml}</div>
        <table style="width:100%;border-collapse:collapse;background:#fafafa;border:1px solid #eee;border-radius:8px;overflow:hidden;">
          <thead><tr style="background:#f0f0f3;">
            <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;color:#888;">When</th>
            <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;color:#888;">Store</th>
            <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;color:#888;">Item</th>
            <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;color:#888;">Change</th>
            <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;color:#888;">By</th>
            <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;color:#888;">Notes</th>
          </tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
      <div style="background:#f0f0f3;padding:16px;text-align:center;color:#888;font-size:12px;">
        ${escape(BRAND.storeName)} · v${APP_VERSION} · Built by ${escape(BRAND.builtBy)}
      </div>
    </div>
  </body></html>`;

  const subject = '[' + BRAND.shortName + '] Weekly Master Change Log — ' + recent.length + ' change(s)';
  MailApp.sendEmail(recipients, subject,
    'See HTML version. ' + recent.length + ' changes in the past week.',
    { htmlBody: html, name: BRAND.storeName + ' — Master Log' });
  return { ok: true, sent: countRecipients(recipients) };
}

function statusColor(status) {
  switch (status) {
    case 'ordered':       return '#3b82f6';
    case 'fulfilled':     return '#10b981';
    case 'not_available': return '#dc2626';
    default:              return '#666';
  }
}

// ---------------------------------------------------------------------------
// STALE-PENDING ALERT — v1.1: threshold is now 7 days
// ---------------------------------------------------------------------------
function checkStalePending() { sendStalePendingImpl(); }

function sendStalePendingImpl() {
  const recipients = normalizeEmails(allAdminEmailsAsString());
  if (!recipients) return { ok: true, sent: 0, note: 'No admin emails configured.' };

  const all = readAll(SHEET_REQUESTS, REQUEST_HEADERS);
  const cutoff = Date.now() - STALE_PENDING_DAYS * 86400000;
  const stale = all
    .filter(r => r.status === 'pending' && new Date(r.timestamp).getTime() < cutoff)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  if (stale.length === 0) return { ok: true, sent: 0, note: 'No stale pending requests — great work!' };

  const rowsHtml = stale.map(r => {
    const ageDays = Math.floor((Date.now() - new Date(r.timestamp).getTime()) / 86400000);
    return `<tr>
      <td style="padding:8px;border-bottom:1px solid #eee;font-size:13px;"><strong style="color:#dc2626;">${ageDays}d</strong></td>
      <td style="padding:8px;border-bottom:1px solid #eee;font-size:13px;">${escape(r.store)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;font-size:13px;"><strong>${escape(r.itemName)}</strong></td>
      <td style="padding:8px;border-bottom:1px solid #eee;font-size:13px;">${escape(describeItem(r))}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px;color:#555;">${escape(r.customerName || '')}${r.customerEmail ? '<br>' + escape(r.customerEmail) : ''}${r.customerPhone ? '<br>' + escape(r.customerPhone) : ''}</td>
    </tr>`;
  }).join('');

  const counts = {};
  stale.forEach(r => counts[r.store] = (counts[r.store] || 0) + 1);
  const countsHtml = Object.entries(counts).map(([store, n]) =>
    `<span style="display:inline-block;padding:4px 10px;background:#fee2e2;color:#991b1b;border-radius:100px;margin:2px;font-size:12px;"><strong>${escape(store)}</strong>: ${n}</span>`
  ).join('');

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f7f7f9;">
    <div style="max-width:760px;margin:0 auto;background:#fff;">
      <div style="background:#0a0a0f;color:#fff;padding:32px;text-align:center;border-bottom:4px solid #dc2626;">
        <div style="font-size:24px;font-weight:700;letter-spacing:0.05em;">${escape(BRAND.storeName.toUpperCase())}</div>
        <div style="font-size:13px;color:#fca5a5;margin-top:6px;letter-spacing:0.2em;">⚠ STALE-PENDING ALERT</div>
      </div>
      <div style="padding:32px;">
        <h2 style="margin:0 0 8px;color:#dc2626;">${stale.length} request${stale.length === 1 ? ' has' : 's have'} been sitting in Pending for ${STALE_PENDING_DAYS}+ days</h2>
        <p style="color:#666;margin:0 0 16px;">These customer requests have not been actioned. Please review with the relevant store manager.</p>
        <div style="margin-bottom:20px;">${countsHtml}</div>
        <table style="width:100%;border-collapse:collapse;background:#fafafa;border:1px solid #eee;border-radius:8px;overflow:hidden;">
          <thead><tr style="background:#f0f0f3;">
            <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;color:#888;">Age</th>
            <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;color:#888;">Store</th>
            <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;color:#888;">Item</th>
            <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;color:#888;">Details</th>
            <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;color:#888;">Customer</th>
          </tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
      <div style="background:#f0f0f3;padding:16px;text-align:center;color:#888;font-size:12px;">
        ${escape(BRAND.storeName)} · v${APP_VERSION} · Built by ${escape(BRAND.builtBy)}
      </div>
    </div>
  </body></html>`;

  const subject = '[' + BRAND.shortName + '] ⚠ Stale-Pending Alert — ' + stale.length + ' request(s) need attention';
  MailApp.sendEmail(recipients, subject,
    stale.length + ' customer requests have been pending for ' + STALE_PENDING_DAYS + '+ days. See HTML version for details.',
    { htmlBody: html, name: BRAND.storeName + ' — Alerts' });
  return { ok: true, sent: countRecipients(recipients) };
}

// ---------------------------------------------------------------------------
// UTILS
// ---------------------------------------------------------------------------
function formatPrettyDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'MMM d, h:mm a');
}
function formatDateOnly(ts) {
  if (!ts) return 'TBD';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'MMM d, yyyy');
}
function escape(s) {
  if (s === undefined || s === null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// FIRST-TIME SETUP
// ---------------------------------------------------------------------------
function firstTimeSetup() {
  sh(SHEET_REQUESTS);
  sh(SHEET_STORES);
  sh(SHEET_ADMIN_EMAILS);
  sh(SHEET_AUDIT);

  const existingStores = readAll(SHEET_STORES, STORE_HEADERS);
  if (existingStores.length === 0) {
    // EDIT THESE for your own stores before running firstTimeSetup, or just
    // add your stores via the admin portal after deploying.
    sh(SHEET_STORES).getRange(2, 1, 3, 3).setValues([
      ['Store 1', 'store1@example.com', 'store1'],
      ['Store 2', 'store2@example.com', 'store2'],
      ['Store 3', 'store3@example.com', 'store3'],
    ]);
  }
  Logger.log('Setup complete (v' + APP_VERSION + '). Sheets ready.');
}
