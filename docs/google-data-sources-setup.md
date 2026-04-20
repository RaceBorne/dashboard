# Connecting Google data sources

Practical, click-by-click setup for the three Google data sources the
dashboard will use. You can do them in any order; each one lights up a
different surface in the cockpit.

| Source | Lights up | Time | Cost |
|---|---|---|---|
| PageSpeed Insights (PSI) | Performance page · Core Web Vitals per URL | 2 min | free, API key only |
| Google Search Console (GSC) | Keywords page · Pages impressions/clicks/position | 15 min | free, OAuth |
| Google Analytics 4 (GA4) | Traffic page · sessions, sources, geography, devices | 15 min | free, OAuth |

Do PSI first — it's the fastest and it lights up the Performance column
on `/pages` with zero friction. Do GSC second; it unlocks the biggest
marketing decision surface (which queries we already rank for, what's
close to page 1). GA4 is last because it adds geography and audience
colour on top of an already-useful cockpit.

---

## 1. PageSpeed Insights (PSI) — 2 minutes

PSI tells you how fast each URL loads on mobile and desktop, broken out
by Core Web Vitals (LCP, CLS, INP). The dashboard uses it to score every
product page and highlight pages that Google is quietly downranking for
being slow.

PSI works without a key at low volume but caps you at about 25 requests
per day. A free key lifts that to thousands per day — more than enough
for nightly scans of the whole store.

### Steps

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Top-left, click the project dropdown → **New Project**.
   - Name: `evari-dashboard`
   - Click **Create**.
3. Make sure the new project is selected in the top-left dropdown.
4. Go to **APIs & Services → Library**.
5. Search **PageSpeed Insights API** → click the result → **Enable**.
6. Go to **APIs & Services → Credentials → Create Credentials → API key**.
7. Copy the key. Close the dialog.
8. Click the pencil next to the key → **API restrictions** → **Restrict
   key** → tick **PageSpeed Insights API** only → **Save**. (This means
   if the key ever leaks, it can only run PSI queries.)

### Tell the dashboard

Paste the key into your `.env.local`:

```
PAGESPEED_API_KEY=AIza...
```

Redeploy. The Performance page will pick it up automatically.

---

## 2. Google Search Console (GSC) — ~15 minutes

GSC tells you what search queries people typed to find evari.cc, which
of those queries drove clicks, and your average ranking position for
each one. It's the single highest-leverage data source for SEO work —
you can't optimise what you can't see.

You need GSC set up for evari.cc **before** the dashboard can connect
(that's Google's data, not ours). If you've never set it up, do the
verification steps first.

### One-time: verify the site in GSC

1. Open [search.google.com/search-console](https://search.google.com/search-console).
2. Click **Add property** → **URL prefix** → enter `https://evari.cc`.
3. Choose a verification method. Easiest:
   - **HTML tag** — Google gives you a `<meta name="google-site-verification" ...>` tag.
   - Paste it into your Shopify theme's `theme.liquid` inside `<head>`.
   - Come back to GSC → **Verify**.
4. If you already verified evari.cc before, skip steps 1–3.

Google needs **a few days** of organic search data before queries show
up in the API. If evari.cc is brand-new to GSC, the dashboard will
connect fine but will show empty tables until Google has enough data to
share. You can click around in the GSC UI itself to see when data
starts landing.

### Enable the GSC API + OAuth

If you already did the PSI steps, you can skip creating a new project —
use the same `evari-dashboard` project.

1. [Google Cloud Console](https://console.cloud.google.com/) → pick the
   `evari-dashboard` project.
2. **APIs & Services → Library** → search **Google Search Console API**
   → **Enable**.
3. **APIs & Services → OAuth consent screen**.
   - User type: **External**. Click **Create**.
   - App name: `Evari Dashboard`
   - User support email: `craig@raceborne.com`
   - Developer contact: `craig@raceborne.com`
   - **Save and continue** through Scopes (add none — we pick per-feature scopes in the next step)
   - Test users: **Add users** → add your own Google account (the one that owns the GSC property).
   - **Save and continue**.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - Application type: **Web application**
   - Name: `Evari Dashboard`
   - Authorised redirect URIs: add both
     ```
     http://localhost:3000/api/integrations/google/callback
     https://evari.vercel.app/api/integrations/google/callback
     ```
     (Replace with your actual deployed URL if different.)
   - **Create**.
5. Download the JSON or copy the **Client ID** and **Client secret**.

### Tell the dashboard

Paste into `.env.local`:

```
GOOGLE_OAUTH_CLIENT_ID=123-abc.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-...
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/integrations/google/callback
```

Then visit `/settings/integrations/google` in the dashboard and click
**Connect Google**. It'll send you through Google's consent screen, you
approve GSC access, and the tokens land in the Supabase
`dashboard_google_oauth` table. The Keywords page and the GSC columns
on `/pages` will start filling in on the next nightly ingest.

---

## 3. Google Analytics 4 (GA4) — ~15 minutes

GA4 tells you where your traffic comes from — country, city, device,
source, landing page, conversions. It powers the Traffic page,
including the world and UK maps.

### One-time: set up GA4 on evari.cc

If you already have GA4 running on evari.cc, skip this.

1. [analytics.google.com](https://analytics.google.com/).
2. **Admin → Create → Property**.
   - Property name: `Evari`
   - Time zone + currency
   - **Next**.
3. **Business details** → fill in → **Next** → **Create**.
4. Choose **Web** platform.
   - Website URL: `https://evari.cc`
   - Stream name: `Evari storefront`
   - **Create stream**.
5. Copy the **Measurement ID** (looks like `G-XXXXXXXX`).
6. In Shopify Admin → **Online Store → Preferences → Google Analytics**
   → paste the Measurement ID. Save.
7. Wait 24–48 hours for GA4 to start collecting data.

### Enable the GA4 Data API

Back in the same `evari-dashboard` Cloud project:

1. **APIs & Services → Library** → **Google Analytics Data API** → **Enable**.
2. The OAuth client you made for GSC also works for GA4 — no extra
   credentials needed. The scope is added at consent time.

### Tell the dashboard

You also need your GA4 **property ID** (a number, different from the
Measurement ID). Find it in GA4 under **Admin → Property settings**.

Add to `.env.local`:

```
GA4_PROPERTY_ID=123456789
```

Re-connect Google from `/settings/integrations/google` so the consent
flow asks for GA4 scope on top of GSC. The Traffic page will start
filling in on the next nightly ingest.

---

## Verifying it all

Once everything is connected, `/settings/integrations` should show:

- Shopify — Live
- PageSpeed Insights — Connected (API key set)
- Google Search Console — Connected as craig@raceborne.com
- Google Analytics 4 — Connected as craig@raceborne.com

And in the cockpit:

- `/pages` — the three GSC columns (Impr, Clicks, Avg pos) start showing numbers
- `/keywords` — fills with real query data
- `/traffic` — world map + sources table go live
- `/shopify/performance` (new) — CWV scores per URL

---

## Safety notes

- **Never commit `.env.local`.** It's already in `.gitignore`; keep it
  that way.
- The OAuth tokens land in Supabase encrypted at rest; only the
  dashboard's service role can read them.
- PSI + GSC + GA4 are all free tiers. You will not be billed by Google
  for any of this.
- Your OAuth app starts in **Testing** mode, which limits it to the
  test users you added (including yourself). That's fine and expected
  for an internal tool — leave it in Testing mode. You'd only ever
  submit it for verification if you wanted to let non-test users
  connect their own Google accounts.
