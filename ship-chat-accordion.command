#\!/usr/bin/env bash
# Double-click me in Finder to commit + push the accordion chat change.
set -e
cd "$(dirname "$0")"
rm -f .git/HEAD.lock .git/index.lock .git/index.lock.stale .git/index.lock.stale3
git add -A
git reset HEAD ship-backend-perf.command ship-play-flow.command ship-crm-loop.command ship-brand-grounding.command ship-chat-accordion.command 2>/dev/null || true
git commit -F .git/COMMIT_EDITMSG_CHAT_ACCORDION
git push
echo ""
echo "Shipped. Check https://github.com/RaceBorne/dashboard for the commit."
