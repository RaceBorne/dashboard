#\\!/bin/bash
# Double-click this file (Finder → right-click → Open) OR run from Terminal:
#   bash ship-phase0.command
#
# It cleans up stale git lock files in the evari-dashboard repo, commits
# the pending Phase-0 (Settings senders) work, and pushes to origin/main.
# Vercel auto-deploys on push.

set -e
cd "/Users/craigmcdonald/Dropbox (Personal)/Evari Speed Bikes/10 Software/evari-dashboard"

echo "→ Removing stale git lock files (safe — they're zero-byte leftovers)…"
rm -f .git/index.lock .git/HEAD.lock .git/HEAD.lock.stale .git/refs/heads/main.lock

echo "→ Staging everything…"
git add -A

echo "→ Committing…"
git -c user.email="craig@raceborne.com" -c user.name="Craig McDonald" commit -m "feat: outreach senders management in Settings (Phase 0)

Adds multi-sender management so outreach can go from any named Evari
mailbox. New in Settings: add/edit/delete senders with display name,
email, role, signature HTML, and logo upload. Default-sender flag with
single-default enforcement; active/paused toggle; OAuth-connected flag
(queues drafts until Gmail auth is wired in Phase 3). Signature live
preview with token substitution.

Data:
- dashboard_outreach_senders + dashboard_suppressions tables (JSONB
  payload pattern, RLS on; suppressions carry a generated lower(email)
  index)
- migration 20260424120000_outreach_senders_suppressions.sql
- repository gains listSenders/getSender/upsertSender/deleteSender and
  listSuppressions/isSuppressed/addSuppression
- seeded default sender: craig.mcdonald@evari.cc

API:
- POST/GET /api/senders
- GET/PATCH/DELETE /api/senders/:id

UI:
- components/settings/SendersSection.tsx slotted into /settings between
  Appearance and Connections

Types:
- OutreachSender, SuppressionEntry, OutreachCadence, OutreachTemplate,
  ScrapeBrief, PlayStrategy; Play gains optional strategy/scrapeBrief/
  senderId/cadence/emailTemplate"

echo "→ Pushing to origin/main (Vercel will auto-deploy)…"
git push origin main

echo ""
echo "✅ Done. Vercel deploy is building now:"
echo "   https://vercel.com/raceborne/dashboard"
echo ""
echo "In ~90s, open:"
echo "   https://dashboard-raceborne.vercel.app/settings"
