# Evari Dashboard — Wishlist & Build Plan

_Living document. Tick items off, cross out what changes, add new things at the bottom of each section. This is the master plan Craig and Claude work from._

## North star

Evari Speed Bikes should be largely **run from this dashboard** within a 24-hour focused build: SEO, lead gen, conversations, social, and (eventually) the commerce stack — bike builder, quotes, sales orders, purchase orders — all consolidated here. Every feature must either reduce Craig's manual work or directly help sell more bikes. **The system needs to start earning money.**

## Current state (one line)

9 pages + 4 API routes scaffolded, mock data end-to-end, AI Gateway wiring in place, zero persistence, zero live integrations.

## Phase plan

### Phase 1 — Foundations (must happen first)

- [ ] Vercel project linked, AI Gateway live
- [ ] Supabase connected and schema owned
- [ ] Auth chosen and switched on (Vercel Password Protection to start)
- [ ] Dashboard deployed at a stable URL (e.g. `ops.evari.cc`)

### Phase 2 — Revenue loops

- [ ] Lead capture funnel working end-to-end (web form → Supabase → dashboard)
- [ ] Social broadcasting live for at least IG + LinkedIn
- [ ] Conversations → lead conversion path tracked
- [ ] Daily briefing that actually tells Craig what to act on

### Phase 3 — Vertical plays

- [ ] Medical / rehab funnel live (knee-op convalescence angle)
- [ ] Additional verticals added as we learn

### Phase 4 — Commerce consolidation

- [ ] Audit the existing bike builder / quotes / sales orders / purchase orders system
- [ ] Decide merge vs integrate vs parallel
- [ ] Port or connect the best parts into this dashboard

---

## Workstreams

### 1. Data & persistence — Supabase

- [ ] Create Supabase project (or reuse one from the commerce app — decision needed)
- [ ] Add env vars + keys into Vercel
- [ ] Design tables: `leads`, `conversations`, `messages`, `pages`, `keywords`, `social_posts`, `audit_findings`, `integrations_state`, `quotes`, `orders`
- [ ] Generate TypeScript types from Supabase
- [ ] Replace `lib/mock/*` with a real repository layer (one module per table)
- [ ] Row-level security policies
- [ ] Migrations checked into the repo

### 2. Lead generation & funnel

- [ ] Agree lead stages (e.g. `new → qualified → demo booked → quote sent → won/lost`)
- [ ] Source taxonomy (organic, paid, referral, medical partner, event, dealer, etc.)
- [ ] Web forms on evari.cc post to Supabase via an API route here
- [ ] Email capture auto-tagged by source / landing page
- [ ] Nurture sequences — drafted in the Evari voice, scheduled
- [ ] Lead scoring rules (hot / warm / cold) visible on Leads page
- [ ] "Leads we are losing" weekly report
- [ ] One-click "convert lead → quote" handoff to the commerce side

### 3. Vertical — medical / rehab (knee-op)

- [ ] Define the audience clearly: surgeons, physios, rehab clinics, patients
- [ ] Source & enrich an outreach list of knee-op specialists (UK first)
- [ ] Build the content angle: "ebike rehab protocol" — shareable PDF or landing page
- [ ] Partnership kit: what we offer a clinic (referral scheme, demo bike, co-branded content)
- [ ] Dedicated landing page `/rehab` on evari.cc with medical-specific CTA
- [ ] Track this funnel separately in the dashboard (filter / saved view)
- [ ] Pilot with 3 clinics in 90 days

### 4. Social media

- [ ] Channel priority order (IG, LinkedIn, TikTok, YouTube?)
- [ ] Posting cadence per channel
- [ ] AI drafts reviewed in dashboard, one-click publish
- [ ] Content pillars locked: product, customer stories, rides, medical/rehab, behind-the-scenes
- [ ] DM / comment triage workflow (routes into Conversations?)
- [ ] Per-post performance feeds back into what to post next
- [ ] Weekly "what worked" summary

### 5. SEO & content

- [ ] Fix the evari.cc sitemap 500 (already flagged)
- [ ] Keyword tracker live with weekly deltas (GSC → Supabase)
- [ ] Page inventory with primary keyword + actionable issues
- [ ] Content calendar tied to keyword gaps
- [ ] Schema markup on product pages (Shopify)
- [ ] Internal linking audit
- [ ] Dedicated vertical landing pages (one per funnel)

### 6. Conversations (email / DMs)

- [ ] Gmail connected (OAuth refresh token)
- [ ] Inbox triage categories: sales / support / partner / noise
- [ ] AI reply suggestions in Evari voice (scaffolded, need live model)
- [ ] Every conversation linkable to a lead record
- [ ] SLA on first response set and tracked

### 7. Commerce consolidation (bike builder, quotes, orders)

- [ ] Audit the existing system — what's worth porting vs keeping separate
- [ ] Decide integration model: single app, shared DB, or API bridge
- [ ] Every quote creates / updates a lead
- [ ] Sales orders visible here (revenue today + pipeline value on Briefing)
- [ ] Purchase orders drive stock-aware product availability on the website
- [ ] Margin visibility per bike / per configuration

### 8. AI & automation

- [ ] Daily briefing rewritten to be genuinely useful (what changed, what needs action)
- [ ] Weekly email digest to Craig
- [ ] "Suggest next best action" on every lead
- [ ] Social draft → scheduled post without manual copy-paste
- [ ] Auto-tag conversations by intent
- [ ] Evari voice applied consistently (via the `evari-copy` skill)

### 9. Infra & auth

- [ ] `vercel link`, `vercel env pull`, `vercel --prod`
- [ ] Vercel Password Protection on
- [ ] Cron running daily at 06:00 UTC
- [ ] Error tracking (Sentry or similar)
- [ ] Custom domain for the dashboard
- [ ] Backup / export strategy for Supabase

### 10. Shopify — deep integration

_Goal: turn evari.cc into an AI-maintained storefront. The dashboard mirrors every Shopify resource, scores it for SEO/CX hygiene, and writes approved fixes back through the Admin API. Sequenced so each phase stands on the previous one._

**Phase A — Plumbing (unlocks everything else)**

- [ ] Create Shopify custom app (Admin API) with scopes: `read/write_products`, `read/write_content`, `read/write_themes`, `read/write_metaobjects`, `read/write_metaobject_definitions`, `read/write_online_store_pages`, `read_locales`, `read_customers`, `read_orders`
- [ ] Store `SHOPIFY_ADMIN_ACCESS_TOKEN` + `SHOPIFY_STORE_DOMAIN` in Vercel
- [ ] Switch `lib/integrations/shopify.ts` from mock to live mode
- [ ] Design mirror tables in Supabase: `shopify_products`, `shopify_collections`, `shopify_pages`, `shopify_articles`, `shopify_blogs`, `shopify_redirects`, `shopify_images`, `shopify_metaobjects`
- [ ] Initial full sync — pull every resource into Supabase
- [ ] Nightly delta sync (webhooks preferred, cron as fallback)
- [ ] Audit-log table: every write we make back to Shopify, who approved, what changed

**Phase B — Audit & fast wins**

- [ ] Fix the evari.cc sitemap 500 (already flagged on SEO page)
- [ ] Pages page becomes the live audit surface, backed by the mirror
- [ ] Detect: missing meta titles, weak/missing meta descriptions, missing alt text, thin content, duplicate titles, redirect chains, orphan pages
- [ ] Hygiene score per page (0-100) with reasons
- [ ] Bulk "write back" flow: select N pages → AI drafts fixes → Craig approves → one-click push

**Phase C — Structured data**

- [ ] Product schema on every product (including price, availability, GTIN if set)
- [ ] BreadcrumbList across the site
- [ ] Organization + LocalBusiness on the home page
- [ ] FAQ schema generated from metafields
- [ ] HowTo schema for guide content
- [ ] Review schema (after review collection is live)

**Phase D — Intelligence layer**

- [ ] Cross-reference GSC queries against mirrored pages — find every "ranks page 2 but keyword isn't in H1" opportunity
- [ ] AI-drafted meta titles / descriptions in the Evari voice, approved in-dashboard
- [ ] AI-drafted alt text (autopilot — safe enough to run without approval)
- [ ] Internal linking suggestions (autopilot for obvious matches; suggest-only for judgement calls)
- [ ] "What changed on the site this week" — diff view of Shopify writes

**Phase E — Content engine**

- [ ] New article drafting from keyword gaps, in Evari voice, with schema baked in
- [ ] Publish direct to Shopify blog from the dashboard (draft → review → publish)
- [ ] Tag / collection suggestions for new products based on keyword data

**Phase F — CX & conversion**

- [ ] Metaobjects modelled for: rehab protocols, fit guides, range calculators, FAQs
- [ ] Personalised product recommendations (behaviour-driven, not generic)
- [ ] Customer segmentation in Shopify: rehab / commuter / enthusiast / fleet — wired into nurture flows
- [ ] Review request automation with review schema
- [ ] Abandoned cart recovery rewritten in Evari voice
- [ ] Bike builder creates Shopify draft orders (single source of truth for quotes)

**Phase G — Theme & infra hygiene**

- [ ] Core Web Vitals dashboard per page (LCP, CLS, INP)
- [ ] Open Graph / Twitter card coverage audit
- [ ] Image optimisation: WebP conversion, correct dimensions, lazy loading
- [ ] Redirect manager with 404-catch automation
- [ ] Canonical tag audit
- [ ] `hreflang` support if/when we go multi-region

### 11. SEO moat — the path to #1

_Beyond hygiene and on-page fixes. The capabilities below are what separate "good SEO" from "dominant in your niche." Prioritised roughly by leverage per hour of effort._

**A. SERP intelligence (foundation for everything else)**

- [ ] For every tracked keyword, cache the current top-10 URLs weekly: word count, H-tag structure, schema present, estimated authority
- [ ] Capture People Also Ask + featured snippet status per keyword
- [ ] "Keywords where the snippet is weakly held" — a prioritised steal list
- [ ] Competitor content diff: new pages, updated pages, ranking shifts

**B. Topic authority & content briefs**

- [ ] Define pillar topics (ebikes, rehab cycling, speed commuting, bike builder guide)
- [ ] Pillar page + 10-30 cluster articles per pillar, internally linked
- [ ] Auto-generated content brief per target keyword: target length, required subtopics, PAA coverage, unique angle
- [ ] Content decay monitor — flag pages whose rankings have dropped, diagnose, suggest refresh

**C. E-E-A-T for the rehab / medical vertical**

- [ ] Author profiles with real credentials on Evari bylines
- [ ] Physio / surgeon reviewer named on every rehab page
- [ ] Original research: "Evari rehab outcomes study" or similar first-party data
- [ ] About / team / credentials page that reads like a real business
- [ ] Medical citations formatted with proper schema
- [ ] Transparent business signals (address, company number, memberships)

**D. Entity SEO & Knowledge Graph**

- [ ] Wikidata entry for Evari Speed Bikes
- [ ] Crunchbase, LinkedIn company page audited for consistency
- [ ] Google Business Profile claimed + optimised
- [ ] NAP (name, address, phone) consistent across every citation
- [ ] Dashboard tracks Knowledge Graph properties and flags inconsistencies
- [ ] Author entities for Craig + any content contributors

**E. AI search / GEO (Generative Engine Optimisation)**

- [ ] `llms.txt` published with site summary
- [ ] Definitive 40-60 word answers at the top of every key page
- [ ] FAQ + HowTo schema everywhere it's honest
- [ ] Citation monitor: is Evari being cited by Perplexity / ChatGPT / Claude / Google AI Overviews for our target queries?
- [ ] robots.txt policy for GPTBot / Claude-Web / PerplexityBot (allow, block, or fine-grained)

**F. Review velocity**

- [ ] Post-purchase review request flow (tied to order status)
- [ ] Review schema on product pages so stars show in SERPs
- [ ] Review diversification: Google, Trustpilot, product-specific
- [ ] Review monitoring: respond to every review within 24h

**G. Featured snippet & PAA targeting**

- [ ] For every target keyword, identify snippet format (paragraph / list / table)
- [ ] Write answer blocks designed to win the snippet
- [ ] Answer PAA questions explicitly in H2s on the relevant page
- [ ] Track snippet ownership week over week

**H. Local & geo**

- [ ] Google Business Profile fully populated + posts weekly
- [ ] Geo-landing pages per major UK city (rehab + commute angles)
- [ ] Local citations (Yell, Thomson, niche cycling directories)
- [ ] Dealer / partner pages with local schema when partnerships exist

**I. Video & YouTube**

- [ ] YouTube channel strategy (reviews, rides, rehab demos, build walkthroughs)
- [ ] Video schema on embedded videos
- [ ] Transcripts published with every video
- [ ] YouTube Shorts for social + search surface

**J. Community & brand mentions**

- [ ] Reddit monitoring (r/ebikes, r/cycling, r/bikecommuting, r/physicaltherapy, UK subs)
- [ ] Unlinked brand mention tracker → outreach to convert to links
- [ ] Forum / Discord consideration for long-tail ownership

**K. CTR optimisation**

- [ ] Per-keyword CTR visible on Keywords page (from GSC)
- [ ] Split-test titles/metas on pages ranking 4-10 (biggest CTR lift available)
- [ ] Before/after tracker for every SEO change we push

**L. Revenue attribution (Evari's real funnel)**

_We don't sell through Shopify checkout — customers phone, have a consultation, get invoiced, pay by bank transfer. Attribution has to follow that path._

- [ ] Tag every inbound phone call / consultation / contact form with first-touch source + landing page (localStorage session stitching → Supabase on form submit or call log)
- [ ] Call tracking numbers per channel (e.g. dedicated numbers for organic, paid, rehab, referral) — cheap service like CallRail or Aircall
- [ ] Link each consultation record to the original session and the eventual invoice / bank-transfer amount
- [ ] "Revenue per keyword" report built from: organic session → consultation → invoice paid
- [ ] Double down on keywords with real consultation intent; deprioritise traffic vanity

### 12. The Evari to-do list — tasks & calendar

_Every suggestion / fix / plan coming out of our discussions gets captured here, categorised into a folder, and dropped on a date. This is the execution layer — WISHLIST is the strategy, tasks are what actually gets done._

**Phase A — v1 in-dashboard (shipped)**

- [x] `/tasks` page live with mock state
- [x] Categories (folders): SEO, Shopify, Lead gen, Social, Content, Medical/rehab, Conversations, Commerce, Infra, AI/automation, General
- [x] Task fields: title, description, category, status, priority, due date, source, wishlist-ref
- [x] Statuses: proposed → planned → in-progress → done, plus blocked
- [x] Inline add-task form
- [x] Grouped-by-date view: Overdue / Today / Tomorrow / This week / Next week / Later / Unscheduled
- [x] Seed tasks from everything we've discussed so far

**Phase B — persistence**

- [ ] Supabase `tasks` table with the same schema
- [ ] API routes: list / create / update / delete
- [ ] Replace client-side state with server-backed data
- [ ] Audit trail: who changed what, when

**Phase C — real calendar view**

- [ ] Month-grid view with task density per day
- [ ] Drag-and-drop to reschedule
- [ ] Recurring tasks (e.g. "weekly outreach", "monthly SEO audit")
- [ ] iCal feed so tasks appear in Craig's own calendar app

**Phase D — intelligence**

- [ ] "Auto-capture from discussion" — a chat transcript → tasks pipeline so items from our conversations land in the right folder automatically
- [ ] Daily briefing surfaces today's / overdue tasks first
- [ ] AI "what should I do next" — picks the highest-leverage task given current state
- [ ] Natural-language task entry ("remind me to call John about the rehab pilot next Tuesday")
- [ ] Email-to-task: forward anything to `tasks@ops.evari.cc` and it lands in the inbox folder

**Phase E — tying to the wishlist**

- [ ] Every task has an optional `wishlistRef` (e.g. `11.C` or `10.A`) that links back to WISHLIST.md
- [ ] Completing a task with a ref auto-updates the matching `[ ]` → `[x]` in WISHLIST.md
- [ ] Per-wishlist-section completion percentage visible in the task folder

### 13. Klaviyo integration (email + SMS)

_Klaviyo stays the email engine — its visual builder, deliverability and flow canvas are where we keep it. This dashboard becomes the command centre: scheduling, triggering, reading performance, and wiring Klaviyo into the lead lifecycle. The rule: keep Craig out of Klaviyo 80% of the time, only dip in for the visual editor._

**Phase A — Plumbing**

- [ ] Generate Klaviyo API keys (private + public) and paste into the Connections card
- [ ] Flip `lib/integrations/klaviyo.ts` adapter from mock to live
- [ ] Pull a sample campaigns + flows list to confirm auth works
- [ ] Register `evari-copy` skill when drafting newsletter copy

**Phase B — Lead ↔ profile sync (biggest leverage)**

- [ ] On new lead creation (web form / phone / in-person) → upsert Klaviyo profile with email + phone
- [ ] Source mapping: `organic`, `paid`, `referral`, `medical_partner`, `dealer`, `fleet` → matching Klaviyo list
- [ ] Lead stage → Klaviyo profile property (`$evari_stage`) so Klaviyo segments can target them
- [ ] Two-way sync: if a subscriber unsubscribes in Klaviyo, mark the lead `unsubscribed` in our DB
- [ ] Consent fields captured at form submit and written through

**Phase C — Lifecycle events**

- [ ] Fire `consultation_booked` when a consultation is logged
- [ ] Fire `quote_sent` when a quote document goes out (once commerce app wires up)
- [ ] Fire `invoice_paid` when a bank transfer is reconciled
- [ ] Fire `demo_ride_booked` on test-ride scheduling
- [ ] Each event includes revenue / product properties so flows can branch

**Phase D — Visibility inside the dashboard**

- [ ] Pull scheduled + sent campaigns → render as events on Social & Blogs calendar (`Newsletter` tone)
- [ ] Pull flow performance (welcome, abandoned cart, post-purchase) into the Briefing editorial line
- [ ] Subscriber counts per list / segment on the Leads page summary
- [ ] Klaviyo attribution on Leads — "opened welcome flow, clicked Tour page, booked consultation"

**Phase E — Newsletter composer → Klaviyo draft**

- [ ] `/social/new` → Newsletter flow: list/segment picker fetched from Klaviyo
- [ ] Template picker with preview fetched from Klaviyo
- [ ] Subject + body composed in the dashboard (Evari voice), AI draft button
- [ ] On submit, create a draft campaign in Klaviyo via API
- [ ] "Open in Klaviyo to finalise" deep-link to the Klaviyo campaign editor

**Phase F — Vertical: medical / rehab**

- [ ] Dedicated Klaviyo list: `evari-medical-partners`
- [ ] Dedicated Klaviyo list: `evari-rehab-patients`
- [ ] Welcome flow for clinic partners (built once in Klaviyo, triggered from dashboard)
- [ ] Quarterly "rehab outcomes" newsletter to partners — drafted in dashboard, sent in Klaviyo

**Explicitly NOT built here**

- Visual email editor — use Klaviyo's
- Flow canvas — use Klaviyo's
- Template designer — use Klaviyo's
- Deliverability / DKIM / domain auth — use Klaviyo's

### 14. Off-site SEO & backlinks

_Shopify can't help here. This is a separate discipline the dashboard hosts as a CRM-style pipeline._

**Phase A — Data source**

- [ ] Decide on SEO data tool: Ahrefs vs Semrush vs Moz (~£80-150/month) — or manual to start
- [ ] If subscribed: connect the API, mirror our backlink profile + top competitors
- [ ] If not: seed a manual prospect list

**Phase B — Prospect pipeline**

- [ ] Supabase table: `link_prospects` (name, domain, category, contact, authority, stage, last_touched)
- [ ] Seed categories: cycling media (BikeRadar, road.cc, Cycling Weekly, ElectricBike.com), UK knee-op specialists, rehab clinics, physios, cycling clubs, local press, dealer partners
- [ ] Stages: `identified → contacted → replied → negotiating → linked → monitoring`
- [ ] AI enrichment — find decision-maker + email for each domain

**Phase C — Outreach**

- [ ] Outreach templates in Evari voice (first-touch, follow-up, partnership offer, medical-angle)
- [ ] Tracked through the existing Conversations UI
- [ ] Reply detection auto-advances the stage
- [ ] Weekly "outreach this week" cadence target

**Phase D — Link health**

- [ ] Weekly cron: check every earned link is still live
- [ ] Flag dropped links for re-outreach
- [ ] Anchor text + authority tracking over time

**Phase E — Digital PR**

- [ ] Data-led pieces ("UK ebike rehab data 2026", "commute cost calculator")
- [ ] Interactive tools that earn links naturally (rehab protocol builder, range calculator)
- [ ] Journalist monitoring (Featured.com / Qwoted / HARO successor)
- [ ] Press release generator with embargo tracking

---

## Open decisions (need Craig's call)

1. **Dashboard domain** — `ops.evari.cc`? Something else?
2. **Supabase** — new project, or reuse one from the commerce app?
3. **Commerce app** — merge into this, integrate via API, or run parallel?
4. **First vertical** — medical/rehab confirmed as #1 priority?
5. **Regions** — UK only first, or UK + EU?
6. **Budget** — is there a pot for paid ads / outreach tools / enrichment?
7. **Team** — is Craig the only user for now, or do others need access soon?
8. **Shopify write-back model** — "suggest + approve" for customer-visible copy, "autopilot" for hygiene (alt text, schema, internal links)? Or approve-everything to start?
9. **SEO tool** — Ahrefs / Semrush / Moz subscription, or stay manual until the dashboard is earning?

---

## How we'll work

- Update this file as we go — `[ ]` → `[x]`, and add new items to the bottom of each section
- If we change direction, cross out rather than delete, so the thread of the thinking stays visible
- Anything urgent: Craig flags it, we jump straight to it
- When a section grows past one page, we split it into its own file and link from here
