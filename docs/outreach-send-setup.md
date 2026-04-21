# Outreach Gmail send — one-time setup

This is what's needed to turn on live Gmail sending for outreach senders
(the "Send test" button in Settings → Outreach, and later the Phase-3
approval-queue send pipeline).

The dashboard already has Google OAuth wired up for GSC + GA4 + Gmail
ingest. This just extends the existing refresh token to also cover
`gmail.send`, so outreach uses the same plumbing as everything else.

## 1. Re-run the OAuth refresh script

The scope list in `scripts/google-oauth-refresh.ts` now includes
`https://www.googleapis.com/auth/gmail.send`. You need a fresh refresh
token that's been granted that scope — Google won't upgrade an existing
one silently.

```sh
npx tsx scripts/google-oauth-refresh.ts
```

Sign in as **craig@evari.cc** (the sender mailbox). Approve every scope
on the consent screen. The script prints a new refresh token when
Google redirects back.

If Google says "this app is blocked" or skips the consent screen without
issuing a new token, go to https://myaccount.google.com/permissions,
revoke the Evari dashboard app, and re-run.

## 2. Update the refresh token

Paste the new token into two places:

1. `.env.local` → `GOOGLE_REFRESH_TOKEN=<new token>` (for local dev)
2. Vercel project → Environment Variables → `GOOGLE_REFRESH_TOKEN`
   (Production + Preview). Redeploy once saved.

The old refresh token is now invalid — any env where you don't update
it will break read-only Gmail ingest too.

## 3. (Optional) Pin the test recipient

By default the "Send test" button sends to the sender's own address
(e.g. a test from craig@evari.cc lands in craig@evari.cc's inbox). If
you'd rather route tests somewhere else — e.g. your personal Gmail
while debugging — set `OUTREACH_TEST_RECIPIENT` in `.env.local` and
Vercel:

```
OUTREACH_TEST_RECIPIENT=craig@raceborne.com
```

## 4. Click Send test

In the dashboard → Settings → Outreach → Email senders, each row now
has a Send icon. Click it. You should see a green toast within ~2s:

> Sent — check craig@evari.cc in a few seconds.

Check Gmail. If the signature renders correctly (logo, name in the
system font, phone / website / confidentiality block laid out), the
sender is good to go for the live send pipeline.

If it errors:

- `Gmail send failed: 403 insufficientPermissions` → refresh token
  wasn't re-issued with `gmail.send`. Re-run step 1, then step 2.
- `Gmail send failed: 401` → refresh token was revoked or doesn't match
  the sender's email. Re-run step 1 signed in as the sender.
- `Supabase not configured` → `SUPABASE_SERVICE_ROLE_KEY` or
  `NEXT_PUBLIC_SUPABASE_URL` isn't set for that environment.

## 5. What this does and does not do

Does:

- Sends a real Gmail-delivered email From: the sender's address,
  rendered HTML signature included.
- Works identically in local dev and in production — the API route is
  plain Next.js server code, not a cron.

Does not:

- Rate-limit. Don't hammer the button — Gmail caps send quota per
  account (see https://support.google.com/a/answer/166852).
- Send via a different account. The refresh token is bound to whichever
  Google account you signed in with in step 1. If you want to send from
  multiple sender addresses later, each one needs its own refresh
  token stored per-sender (this is the Phase-3 work).
