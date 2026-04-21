#!/usr/bin/env bash
# Double-click me in Finder to commit + push the Brief->Strategy->Scope flow.
set -e
cd "$(dirname "$0")"
rm -f .git/HEAD.lock .git/index.lock .git/index.lock.stale .git/index.lock.stale3
git add -A
git reset HEAD ship-backend-perf.command ship-play-flow.command 2>/dev/null || true
git commit -F .git/COMMIT_EDITMSG_PLAY_FLOW
git push
echo ""
echo "Shipped. Check https://github.com/ for the commit."
