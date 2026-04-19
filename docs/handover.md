# Evari Dashboard — handover

Internal Next.js app for Evari Speed Bikes: briefing, pipeline (plays, prospects, leads, conversations), website analytics/SEO views, operational to-dos, Shopify admin surfaces, and AI-assisted flows. Styling is dashboard-first (dark-friendly) with Geist and custom Evari tokens.

---

## Stack

| Layer | Choice |
|--------|--------|
| Framework | Next.js 16 (App Router), React 19 |
| Styling | Tailwind CSS, shadcn-style primitives under `components/ui/` |
| Data (app state) | **Supabase** (Postgres + PostgREST via `@supabase/supabase-js`) |
| AI | Vercel AI SDK / AI Gateway (`@ai-sdk/gateway`, `lib/ai/gateway.ts`) |
| Commerce API | Shopify Admin GraphQL (`lib/integrations/shopify.ts`, `shopify-client.ts`) |

---

## Repository map (high level)

| Path | Role |
|------|------|
| `app/(dashboard)/` | Page routes (briefing, tasks, leads, plays, Shopify section, etc.) |
| `app/api/` | Route handlers (assistant, briefing, Shopify proxies, SEO tools, `tasks`, `dashboard/nav-counts`) |
| `components/` | Feature UIs (`shopify/`, `leads/`, `tasks/`, `sidebar/`, …) |
| `lib/dashboard/` | **`repository.ts`** — reads `dashboard_*` tables; **`briefing.ts`** — builds briefing payload from DB |
| `lib/tasks/` | Task list repository + categories |
| `lib/supabase/admin.ts` | Server-only Supabase client (**service role**; never expose to browser) |
| `lib/integrations/` | Google, Shopify, social adapters; **`status.ts`** — connection list from wireframe + env |
| `lib/wireframe.ts` | System diagram nodes / env var expectations (single source for “what to wire”) |
| `lib/mock/` | **Seed fixtures only** — consumed by `scripts/seed-dashboard.ts`, not runtime pages |
| `supabase/migrations/` | SQL to create tasks + dashboard tables |
| `scripts/seed-dashboard.ts` | Applies migrations (when using Postgres) and upserts fixture JSON |

---

## Supabase data model

Apply **both** SQL files in order (Supabase SQL editor, or any Postgres client with sufficient permissions):

1. `supabase/migrations/20260219120000_tasks.sql` — `task_lists`, `tasks` (operational to-do list)  
2. `supabase/migrations/20260220100000_dashboard.sql` — `dashboard_leads`, `dashboard_threads`, `dashboard_plays`, `dashboard_prospects`, `dashboard_traffic_days`, `dashboard_traffic_sources`, `dashboard_landing_pages`, `dashboard_seo_keywords`, `dashboard_seo_pages`, `dashboard_audit_findings`, `dashboard_social_posts`, `dashboard_users`

Most `dashboard_*` tables store a **`payload jsonb`** document keyed by `id` (or `path` for landing pages). RLS is enabled; the **service role** bypasses RLS (used only on the server).

---

## Environment variables

Copy `.env.example` → `.env.local` and fill in values. For Vercel-linked work:

```bash
vercel env pull
```

**Critical for Supabase-backed UI**

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only; required for `createSupabaseAdmin()` so API routes and server components can read/write tasks + dashboard tables |

Without the **service role**, the app falls back to empty lists where data comes from Supabase. The **anon** key alone is not sufficient for the current server-side admin client.

**Optional: seeding without service role**

`npm run db:seed` can use **`DATABASE_URL`** (direct Postgres URI) with the `pg` driver to run migrations and insert data, **if** the URI is valid for your Supabase database (correct host, user, password, SSL). If you see **`Tenant or user not found`**, the pooler/connection string is wrong or expired—replace it from Supabase **Database → Connection string** (or add `SUPABASE_SERVICE_ROLE_KEY` and use the Supabase JS path).

**Other integrations** (see `.env.example` and `docs/shopify-setup.md`)

- AI: `AI_GATEWAY_API_KEY` or Vercel OIDC via `vercel env pull`  
- Shopify: `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_ACCESS_TOKEN`  
- Google: `GOOGLE_*`, `GSC_*`, `GA4_*`, `GMAIL_*` as needed  

**Integration list UI** (`getIntegrationStatuses` in `lib/integrations/status.ts`) is **not** stored in the DB—it is derived from wireframe nodes + `process.env` (and optional synthetic markers like `__GITHUB_LIVE` where used).

---

## Commands

| Command | Meaning |
|---------|---------|
| `npm run dev` | Local dev server |
| `npm run build` / `npm run start` | Production build / run |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:seed` | Seed tasks + dashboard tables from `lib/mock/*` fixtures (see script header for precedence: service role vs `DATABASE_URL`) |

---

## Operational checklist for a new environment

1. Create/link Supabase project; run both migrations.  
2. Add `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` to Vercel (or `.env.local`).  
3. `vercel env pull` (if using Vercel).  
4. `npm run db:seed` once (or apply seed SQL manually if you prefer).  
5. Verify `/` (briefing), `/tasks`, `/leads`, `/shopify` with and without Shopify credentials.  

---

## Known issues / tech debt (snapshot)

- **Production build (`yauzl` / `fs` in client):** addressed — see **`docs/handover-build-fix.md`**.  
- `lib/mock/` remains for **seeding only**; runtime pages should use `lib/dashboard/repository.ts` and `lib/tasks/repository.ts`.  

---

## Related docs

- **`docs/handover-build-fix.md`** — why the SEO Health client broke `next build` and how it was fixed  
- `docs/shopify-setup.md` — Shopify custom app and scopes  
- `docs/shopify-install-handoff.md` — OAuth/install flow notes (if present)  

---

## Support

For Supabase connection errors, verify project is not paused, keys are current, and **service role** is never exposed in client bundles or public env vars.
