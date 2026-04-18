# Evari Dashboard

A private operations cockpit for Evari Speed Bikes (evari.cc) — managing SEO,
lead generation, conversations, and social broadcasting from one place.

Built on **Next.js 16 (App Router) + TypeScript + Tailwind + shadcn/ui**. AI is
wired through the **Vercel AI Gateway** with the `evari-copy` skill loaded as a
system prompt so anything generated speaks in Craig's voice.

## What's in here

| Page              | Path                  | Status                                          |
| ----------------- | --------------------- | ----------------------------------------------- |
| Briefing          | `/`                   | Mock data + AI briefing card                    |
| Leads             | `/leads`              | Mock pipeline list + lead detail at `/leads/:id` |
| Conversations     | `/conversations`      | 3-pane email viewer with AI reply suggest      |
| Traffic           | `/traffic`            | GA4 mock — sessions chart, sources, landings   |
| SEO Health        | `/seo`                | Audit findings (incl. real sitemap 500)        |
| Pages             | `/pages`              | Page inventory with primary keyword, issues    |
| Keywords          | `/keywords`           | Tracker — query, position, delta               |
| Social            | `/social`             | Calendar + AI compose for IG / LinkedIn / TikTok |
| Settings          | `/settings`           | Connection status for every integration        |

Every page works today on mock data so the UI can be reviewed end-to-end with
no API access. Each integration is a thin adapter (`lib/integrations/*`) that
returns mock responses until the relevant env vars are populated, at which
point you flip it to live mode.

## Run it

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. No env vars are required for the mock build.

## Going live (when you're ready)

1. **Vercel project**

   ```bash
   vercel link        # link to a new or existing Vercel project
   vercel env pull    # provisions VERCEL_OIDC_TOKEN for the AI Gateway
   ```

2. **AI Gateway** — already works through OIDC the moment you've run `vercel env pull`. Default model is `anthropic/claude-sonnet-4.6`; override with `AI_MODEL` if you want.

3. **Live integrations** — copy `.env.example` to `.env.local` and fill in the credentials you have. Each block in the file lists the scopes / docs URLs. The Settings page shows which env vars are still missing.

4. **Cron** — `vercel.json` already declares a daily 06:00 UTC cron that hits `/api/cron/daily`. Add `CRON_SECRET` in Vercel and the route enforces it.

5. **Deploy** — `vercel --prod`.

## File map

```
app/
  (dashboard)/          all dashboard routes
  api/
    briefing/           AI briefing generation
    conversations/.../suggest-reply  AI email reply
    social/draft/       AI social post composer
    cron/daily/         daily heartbeat (cron)
components/
  briefing/             tiles, anomaly list, briefing card
  conversations/        3-pane viewer client
  leads/                badges + activity timeline
  social/               month calendar + composer
  sidebar/              app nav + top bar
  ui/                   shadcn primitives, customised for Evari
  MessageResponse.tsx   markdown renderer for AI text
lib/
  ai/
    gateway.ts          Vercel AI Gateway wrapper
    prompts.ts          briefing / reply / social prompts
    skill.ts            loads evari-copy.skill (system prompt)
  integrations/
    google.ts shopify.ts social.ts pagespeed.ts  adapter stubs
  mock/                 deterministic mock data per page
  types.ts              shared TS types
  utils.ts              cn, formatters, relativeTime
```

## Notes on the AI voice

`lib/ai/skill.ts` looks for `evari-copy.skill` in (in order):
the workspace root, the parent Marketing folder, or
`~/Library/Application Support/Claude/Skills`. If it can't find one it falls
back to a short embedded brief so the dashboard still works. Briefings,
email replies and social drafts all use this same voice.

## What's deliberately NOT done yet

- Real OAuth flows for Google / LinkedIn / Meta / TikTok (these require app review
  and a public redirect URL — easier once the dashboard is deployed).
- Database persistence — everything reads from in-memory mocks. Hook up Neon via
  the Vercel Marketplace and `DATABASE_URL` becomes auto-injected.
- Auth — there is no login yet. Recommend Vercel Password Protection for
  immediate use, or Clerk if multi-user is needed later.
