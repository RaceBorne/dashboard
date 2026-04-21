#\!/usr/bin/env bash
cd "$(dirname "$0")"
rm -f .git/HEAD.lock .git/index.lock
git commit -F .git/COMMIT_EDITMSG_BACKEND
git push
