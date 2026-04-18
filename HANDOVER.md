# Handover — Evari Dashboard

You said "go ahead and build". This is what was built and where to pick it up.

## What you can do right now

```bash
cd "/Users/craigmcdonald/Dropbox (Personal)/Evari Speed Bikes/10 Software/evari-dashboard"
npm install
npm run dev
```

Open <http://localhost:3000> and click through every nav item — every page works
end-to-end on mock data. Total of **9 dashboard pages + 4 API routes**, all
type-checked, all built green via `next build`.

The AI panels (Briefing card, Conversations "AI suggest", Social "Generate
draft") fall back to a static placeholder until the AI Gateway is wired. The
moment you run `vercel link` and `vercel env pull`, OIDC auth provisions and
the AI calls go live.

## What's done

- Next.js 16 + Tailwind + shadcn/ui scaffold (dark, Evari brand palette)
- Sidebar nav with Briefing / Leads / Conversations / Traffic / SEO Health / Pages / Keywords / Social / Settings
- Mock data for everything — leads with activity timelines, threads with messages, GA4 30-day series, GSC keywords, audit findings (incl. the real evari.cc sitemap 500), Shopify pages, social posts across IG/LinkedIn/TikTok
- Vercel AI Gateway integration via OIDC (`@ai-sdk/gateway`), with the `evari-copy.skill` loaded as a system prompt
- 4 API routes: `/api/briefing`, `/api/conversations/[id]/suggest-reply`, `/api/social/draft`, `/api/cron/daily`
- Adapter stubs for Shopify, Google (GSC/GA4/Gmail), LinkedIn, Instagram, TikTok, PageSpeed — all return mocks until env vars are set
- `vercel.json` with daily cron, `.env.example` documenting every credential

## What needs you (and only you)

These steps require interactive auth or paid app review — they couldn't be done
while you were out:

1. **Vercel project** — `vercel link` (interactive) → `vercel env pull` → done. AI Gateway is then live.
2. **Shopify Admin API token** — generate a custom-app token with the scopes listed in `.env.example`, paste into `SHOPIFY_ADMIN_ACCESS_TOKEN`.
3. **Google APIs (GSC + GA4 + Gmail)** — single OAuth client, three refresh tokens (one per service). Easiest via the OAuth Playground once the redirect URI is set on the deployed URL.
4. **LinkedIn / Meta / TikTok** — these have app-review flows that take 2-4 weeks. Submit the apps once the dashboard URL is stable.
5. **Neon Postgres** — install via Vercel Marketplace; `DATABASE_URL` auto-injects. Schema is not yet created — when you want persistence beyond mocks, design the tables and I'll generate migrations.
6. **Auth** — currently open. Either turn on Vercel Password Protection (one toggle) or wire Clerk via Marketplace. Recommend Password Protection for now, Clerk if you ever need a second user.

## Going to production

```bash
cd "/Users/craigmcdonald/Dropbox (Personal)/Evari Speed Bikes/10 Software/evari-dashboard"
git init && git add -A && git commit -m "Evari Dashboard — initial scaffold"
gh repo create evari-dashboard --private --source=. --push  # if gh installed
vercel --prod
```

(or via the Vercel dashboard — import the repo, set env vars, ship)

## Files to read first

- `README.md` — the public-facing doc
- `app/(dashboard)/page.tsx` — the Briefing page, simplest example
- `lib/ai/gateway.ts` — how AI is wired
- `lib/integrations/google.ts` — adapter pattern for going live

## Known cosmetic to-dos

- The `next.config.ts` has `experimental.typedRoutes` — Next 16 wants it at top-level. Cosmetic warning only.
- A Turbopack NFT trace warning fires from `lib/ai/skill.ts` because it does dynamic file reads to find the skill bundle. Build still passes.
- Lead detail / page detail drill-downs exist but the Pages and Keywords pages don't yet have detail pages — let me know if you want those.
