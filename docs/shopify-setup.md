# Shopify Admin API — custom app setup

This is the one-off setup to let the Evari Dashboard talk to Shopify.
Takes about 5 minutes. You'll end up with two values pasted into
`.env.local` (or directly into the Wireframe page's inline editor):

```
SHOPIFY_STORE_DOMAIN="evari-bikes.myshopify.com"
SHOPIFY_ADMIN_ACCESS_TOKEN="shpat_xxxxxxxxxxxxxxxxxxxxxxxx"
```

---

## 1. Find your store's `.myshopify.com` domain

Shopify always gives your store a permanent internal domain even if you've
pointed a custom one like `evari.cc` at it. That internal domain is what
the Admin API needs.

- Log in at <https://admin.shopify.com>
- **Settings → Domains** — look at the list; the one ending in
  `.myshopify.com` is the permanent one. Copy it.
- Typical format: `evari-bikes.myshopify.com`

That goes in `SHOPIFY_STORE_DOMAIN`.

---

## 2. Enable custom app development (once per store)

- **Settings → Apps and sales channels → Develop apps**
- If it's your first time, click **Allow custom app development**,
  read the warning, confirm.

## 3. Create the custom app

- Same page → **Create an app**
- Name it: **Evari Dashboard**
- App developer: your email (craig@raceborne.com)
- Click **Create app**

## 4. Grant the API scopes

On the app's page, click **Configuration → Admin API integration → Configure**.

Tick the scopes below. Copy-paste into the search box to find each one
quickly — Shopify's UI lists them grouped by resource.

| Scope | Why we need it |
|---|---|
| `read_products`, `write_products` | Edit product titles, descriptions, SEO meta, images, variants. |
| `read_content`, `write_content` | Edit Pages and Blog articles — including SEO meta — from the dashboard. |
| `read_themes` | Read theme assets for SEO audits (JSON-LD, robots.txt, schema). Add `write_themes` later if you want the dashboard to push theme edits. |
| `read_customers` | Customer list for LTV + attribution on the briefing. |
| `read_orders` | Orders feed for revenue tiles. |
| `read_draft_orders`, `write_draft_orders` | Bike builder quotes — dashboard creates draft orders. |
| `read_checkouts` | Abandoned checkouts → Leads. |
| `read_online_store_pages` | Included automatically with `read_content` on some API versions; tick it if offered. |
| `read_translations` | Optional — only if you add non-English locales later. |

Optional extras — tick if you know you want them:

- `read_inventory`, `write_inventory` — only if the dashboard will manage stock levels (we don't by default; Shopify stays master for variants + stock).
- `read_redirects`, `write_redirects` — 301 redirect manager for SEO hygiene.
- `read_metaobjects`, `write_metaobjects` — structured content blocks (journal articles, rider stories, etc).

Click **Save** at the top right.

## 5. Install + reveal the token

- Top of the same page → **Install app** → confirm.
- After install, a new tab appears: **API credentials**.
- Under **Admin API access token**, click **Reveal token once**.
- Copy the token — it starts with `shpat_`.
- You can only reveal this **once**. Paste it somewhere safe
  (or straight into the dashboard — see below).

That goes in `SHOPIFY_ADMIN_ACCESS_TOKEN`.

---

## 6. Paste into the dashboard

Two options, pick one:

### Option A — Wireframe inline editor (fastest)

- Open `/wireframe` in the dashboard.
- Click the **Shopify** box.
- In the right panel, under **Credentials**, find
  `SHOPIFY_STORE_DOMAIN` → click **add token** → paste domain.
- Same for `SHOPIFY_ADMIN_ACCESS_TOKEN`.
- Restart the dev server (`Ctrl+C`, then `npm run dev`) so Next.js
  picks up the new `.env.local`.

### Option B — Edit `.env.local` directly

```
SHOPIFY_STORE_DOMAIN="evari-bikes.myshopify.com"
SHOPIFY_ADMIN_ACCESS_TOKEN="shpat_xxxxxxxxxxxxxxxxxxxxxxxx"
SHOPIFY_API_VERSION="2025-01"
```

`SHOPIFY_API_VERSION` is optional — we default to `2025-01` which is stable
until July 2026. Bump it later to keep access to newer fields.

---

## 7. Verify

With the server running, hit:

```
curl http://localhost:3000/api/shopify/status
```

You should see:

```json
{
  "connected": true,
  "shop": { "name": "Evari Speed Bikes", "primaryDomain": "evari.cc" },
  "scopes": ["read_products", "write_products", ...]
}
```

If it returns `{ "connected": false, "error": "..." }`, the error message
will tell you what's missing — usually a scope you forgot to tick.

---

## Rotating the token

If the token ever leaks (or you want to cycle it after a contractor
had access):

- Shopify admin → **Apps and sales channels → Develop apps → Evari Dashboard → API credentials**
- Click **Generate new token**
- Replace `SHOPIFY_ADMIN_ACCESS_TOKEN` in `.env.local` (and in Vercel → Settings → Environment Variables for prod)
- Restart the dev server / redeploy

## Production (Vercel)

When you're ready to deploy:

```
vercel env add SHOPIFY_STORE_DOMAIN production
vercel env add SHOPIFY_ADMIN_ACCESS_TOKEN production
vercel env add SHOPIFY_API_VERSION production
```

Or paste them into the Vercel dashboard under
**dashboard → Settings → Environment Variables**.
