# CLAUDE.md — Evari Dashboard project notes

Rules and conventions for AI-assisted work in this repo. Keep this short; add to it only when a rule has already been violated at least once.

## Writing style — for anything a human will read

These apply to every piece of copy the AI generates in this codebase: email drafts, Spitball replies, brand briefs, UI copy, placeholder text, commit messages, README snippets, this file.

**Never use em-dashes (—) or en-dashes (–) in any human-facing text.** They are a known AI tell and look off when Craig or a lead reads them. Use commas, colons, semicolons, full stops, or parentheses instead. Restructure the sentence if you have to.

Bad: `Saw the 856 at Richmond — really impressed.`
Good: `Saw the 856 at Richmond, really impressed.`
Good: `Saw the 856 at Richmond. Really impressed.`

This rule applies to:
- Every email body the system drafts or sends
- Every AI-generated Spitball / Strategy / Discover response
- Every seeded fixture, sample, or placeholder in code or the DB
- Every prompt instruction that might encourage em-dash output — explicitly ban them in the system prompt

The `×` character (as in "Evari × Raceborne") is fine, it is a multiplication sign, not a dash.

## The stack

- Next.js 16 App Router, React 19, TypeScript strict.
- Tailwind with the `evari-*` colour tokens. Chart palette is teal, not gold.
- Supabase for persistence. Every domain row is `{ id, payload: jsonb }` — fields read via `payload->>'foo'`.
- Dashboard model: Venture (`dashboard_plays`) contains prospects + leads (`dashboard_leads`, tier field) which may carry a conversation thread (`dashboard_threads`).
- Gmail send via `sendGmailMessage()` using the shared OAuth refresh token. Signature rendered server-side from the default `OutreachSender` row via `renderSignature()`.

## Layout / UI conventions

- Every stage page (Ventures, Strategy, Discovery, Prospects, Leads, Conversations) wraps its content in one of the three constants in `lib/layout/stageWrapper.ts`. Never inline that className; update the constant if you need to change it.
- FunnelRibbon height is pinned to 52px with belt and braces (`h-[52px] min-h-[52px] style={{ height: 52, minHeight: 52 }}`). There is a dev-mode runtime assertion that warns if it ever renders at a different height. Do not remove any of those three pins.
- Folder names for prospects come from `play.title` (via `play.category ?? play.title` fallback). There is no user-facing FUNNEL / FOLDER field on the venture detail page.

## Data hygiene

- Deleting a venture cascades to all prospects / leads whose `payload.playId` matches. See `DELETE /api/plays/[id]` in `app/api/plays/[id]/route.ts`.
- Standalone prospects (NULL playId) survive venture deletes; they are treated as a shared library.

## Testing conventions

- `npm run typecheck` before every commit.
- Vercel deploys from `main` automatically on push. No separate deploy step.
- Production env lives in Vercel dashboard. `.env.local` is for local dev only and is gitignored.

## Email sending

- The Gmail account connected via OAuth is `craig@evari.cc` (per `.env.local` `GMAIL_USER_EMAIL`). The From header on every outbound matches this.
- Refresh token must carry the `gmail.send` scope. If a send fails with 403, re-mint the token via OAuth Playground with all four scopes: `analytics.readonly`, `webmasters.readonly`, `gmail.modify`, `gmail.send`.
- Signature rendering pulls from the default `OutreachSender` row in `dashboard_outreach_senders` (currently `sender_craig_mcd`). Keep the signatureHtml template in that row, not inline in code.
