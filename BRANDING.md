# White-label Branding Guide

This system is **white-label ready**. Any liquor, wine, or beverage retailer can rebrand the whole thing — front-end, customer emails, store-manager emails, admin emails, even the digest plain-text — by editing **one block** in each of the two source files.

Total time to fully rebrand: **about 5 minutes**.

---

## What you can customise

| What                                  | Where                          | Edit?       |
|---------------------------------------|--------------------------------|-------------|
| Store name everywhere                 | `BRAND.storeName`              | Yes — text  |
| Short name (for email subject prefix) | `BRAND.shortName`              | Yes — text  |
| Hero headline + subtitle              | `BRAND.heroTitle`, `BRAND.heroSubtitle` | Yes — text  |
| Page title in browser tab             | Built from `storeName`         | Auto        |
| Primary accent colour (buttons, etc.) | `BRAND.primaryColor`           | Yes — hex   |
| Secondary gold accent                 | `BRAND.goldColor`              | Yes — hex   |
| Page background colour                | `BRAND.darkBg`                 | Yes — hex   |
| Logo image                            | replace `logo.png` next to `index.html` | Yes — file  |
| Footer attribution                    | `BRAND.builtBy`, `BRAND.builtByUrl` | Yes — text  |
| Email sender display name             | Built from `storeName`         | Auto        |
| Email subjects                        | Built from `shortName`         | Auto        |
| Customer email copy (ordered, fulfilled, not available) | Built from `storeName` + `shortName` | Auto        |

---

## Step-by-step (5 minutes)

### 1. Open `index.html` and find the `BRAND` block near the top of the `<script>` section

```js
const BRAND = {
  storeName:      'Savon Liquor & Wine',
  shortName:      'Savon',
  storeWebsite:   'https://customerrequestform.netlify.app',
  heroEyebrow:    "Couldn't Find What You Wanted?",
  heroTitle:      "Request It — We'll Order It In",
  heroSubtitle:   "Tell us the spirit, wine, or beer ...",
  pageTitleSuffix: '— Customer Request',
  primaryColor:   '#dc2626',
  goldColor:      '#d4a574',
  darkBg:         '#0a0a0f',
  logoFile:       'logo.png',
  builtBy:        'Savon Nexo LLC',
  builtByUrl:     'https://www.savonnexo.com',
  builtByTagline: '...',
};
```

Change every line to match your retailer.

### 2. Open `apps_script.gs` and find the `BRAND` block near the top

```js
const BRAND = {
  storeName:    'Savon Liquor & Wine',
  shortName:    'Savon',
  builtBy:      'Savon Nexo LLC',
  builtByUrl:   'https://www.savonnexo.com',
  primaryColor: '#dc2626',
};
```

Make these match the values in `index.html`. The Apps Script block is a subset — only the fields needed for emails.

> **Important:** the two `BRAND` blocks need to stay in sync. If you change `storeName` in one, change it in the other too.

### 3. Replace `logo.png`

Drop your transparent-background PNG (or SVG renamed `.png`) over the existing `logo.png` in the repo root. Sizing is automatic — anything around 500×500 to 2000×800 works well.

If you don't have a logo yet, leave `logo.png` blank and a stylized text fallback (built from `BRAND.storeName`) will render in its place.

### 4. Pick brand colours

Three colour variables drive the whole visual identity:

| Variable           | What it controls                                  | Default       |
|--------------------|---------------------------------------------------|---------------|
| `primaryColor`     | All primary buttons, status badges, dots, glow     | `#dc2626` red |
| `goldColor`        | Hero title gradient, decorative accents           | `#d4a574` gold |
| `darkBg`           | Page background                                   | `#0a0a0f` near-black |

All three accept any standard CSS hex (`#aabbcc`). The button hover state and the soft glow under buttons are derived automatically from `primaryColor` — you don't need to set them yourself.

**Example presets:**
```js
// Blue & navy (wine-bar feel)
primaryColor: '#1d4ed8', goldColor: '#fbbf24', darkBg: '#0c1426',

// Emerald & charcoal (eco / craft)
primaryColor: '#059669', goldColor: '#facc15', darkBg: '#0a1410',

// Deep purple & rose (boutique)
primaryColor: '#7c3aed', goldColor: '#f472b6', darkBg: '#0d0a16',
```

### 5. Test in your browser

Open `index.html` directly in Chrome / Safari / Firefox. You should see:
- The page title in the browser tab reads `{your storeName} — Customer Request`
- The header logo is your new logo (or styled fallback)
- The hero text is yours
- The footer attribution is yours
- All buttons / accents use your `primaryColor`

The form runs in Demo mode (data in `localStorage`) until you wire up the backend — that's enough to confirm the rebrand looks right.

### 6. Wire up your own backend

Follow [SETUP.md](SETUP.md) from Step 1. Each customer/retailer gets their own Google Sheet, their own Apps Script deployment, and their own Web App URL.

### 7. Deploy

Drop `index.html`, `apps_script.gs`, and `logo.png` into any static host (Netlify, Vercel, GitHub Pages, S3, Cloudflare Pages).

---

## What is NOT brandable (yet)

These would require code edits, not just config:

- **Item categories** — currently locked to *Spirits / Wine* and *Beer* with their specific size/container options. Suitable for any liquor/wine/beer retailer; would need code changes to fit (say) a deli or hardware store.
- **Field labels and dropdown options** inside the form (bottle sizes, container types).
- **The status workflow** — Pending → Ordered / Fulfilled / Not Available — is hardcoded.

If a buyer needs any of the above changed, treat it as a customization project, not a config tweak.

---

## Verifying the rebrand

A quick checklist before going live:

- [ ] Browser tab title shows new store name
- [ ] Header logo shows your image (or your fallback text)
- [ ] Hero headline / subtitle reads as you wrote it
- [ ] Submit the form once — confirm the disclaimer mentions your store name
- [ ] Open the admin portal — confirm the footer credits you
- [ ] Trigger a status change in admin — open the customer notification email and confirm the header banner, body text, and footer all reflect your brand
- [ ] Send the manual master change log — confirm the subject line is `[YourShortName] ...`

---

## Selling this to other retailers

If you (the reseller, e.g. **Savon Nexo LLC**) are deploying this for paying customers:

1. **Keep the source private** — fork this repo into a private repo so paying customers don't get free access to the source.
2. **Per-customer config files** — keep one `BRAND` block per customer somewhere (e.g. `brands/acme-wine.js`) and apply the right one at build time, or maintain one branch per customer.
3. **Host the backend on the customer's Google account** — that way they own their data, you're not in the email-quota chain, and you don't pay any hosting cost for them.
4. **Charge setup + monthly support** — typical small-business range is **$1,500–$4,000 setup** and **$50–$200/month** for hosting/support/changes. The Apps Script + Sheets + Netlify stack costs you **$0**, so margin is essentially 100%.
5. **Brand the footer attribution to YOU** — keep `BRAND.builtBy: 'Savon Nexo LLC'` and `BRAND.builtByUrl: 'https://www.savonnexo.com'` in every deployment. Free marketing on every email and every page.
