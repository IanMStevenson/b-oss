#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Ian Stevenson

# Keeps the long-running integration/b-mobile-pc branch close to main (b-oss#606).
#
#   scripts/integration-sync.sh status [--check]   how far the branch is behind main
#   scripts/integration-sync.sh prepare            merge main into a fresh sync branch (a worktree)
#
# `status` prints how many commits main has that the branch lacks, the oldest of them, and which of
# those touch b-mobile / android (the ones most likely to matter). With --check it exits 1 when the
# branch is behind by more than MAX_BEHIND commits or the oldest unmerged commit is older than
# MAX_AGE_DAYS, so a reminder job can use it.
#
# `prepare` creates .claude/worktrees/sync-main-<date> on a new branch from the integration branch
# and merges origin/main into it. It never pushes and never opens or merges a PR: main goes into the
# integration branch by PR like everything else (open it with --base integration/b-mobile-pc).
# On a conflict it stops in the worktree for you to resolve.

set -euo pipefail
cd "$(dirname "$0")/.."

BRANCH="${INTEGRATION_BRANCH:-integration/b-mobile-pc}"
MAX_BEHIND="${MAX_BEHIND:-25}"
MAX_AGE_DAYS="${MAX_AGE_DAYS:-7}"

git fetch -q origin main "$BRANCH"

behind=$(git rev-list --count "origin/$BRANCH..origin/main")
ahead=$(git rev-list --count "origin/main..origin/$BRANCH")

status() {
  echo "origin/$BRANCH is $behind commit(s) behind origin/main and $ahead ahead."
  if [[ "$behind" -eq 0 ]]; then
    echo "Nothing to merge."
    return 0
  fi
  oldest_ts=$(git log --format=%ct "origin/$BRANCH..origin/main" | tail -1)
  age_days=$(( ( $(date +%s) - oldest_ts ) / 86400 ))
  echo "Oldest unmerged commit on main is ${age_days} day(s) old."
  echo
  echo "Commits on main not yet in the branch (newest first, max 30):"
  git log --oneline -30 "origin/$BRANCH..origin/main"
  echo
  echo "Of those, touching packages/b-mobile or android:"
  git log --oneline "origin/$BRANCH..origin/main" -- packages/b-mobile packages/b-api packages/b-view packages/b-visual || true
  if [[ "${1:-}" == "--check" ]]; then
    if [[ "$behind" -gt "$MAX_BEHIND" || "$age_days" -gt "$MAX_AGE_DAYS" ]]; then
      echo
      echo "DRIFT: behind by $behind (max $MAX_BEHIND) / oldest $age_days day(s) (max $MAX_AGE_DAYS)." >&2
      return 1
    fi
  fi
}

prepare() {
  if [[ "$behind" -eq 0 ]]; then
    echo "origin/$BRANCH already contains origin/main; nothing to prepare."
    return 0
  fi
  stamp=$(date +%Y%m%d)
  name="sync-main-$stamp"
  wt=".claude/worktrees/$name"
  git worktree add "$wt" -b "sync/main-into-b-mobile-pc-$stamp" "origin/$BRANCH"
  cd "$wt"
  if git merge --no-ff origin/main -m "Merge main into $BRANCH"; then
    echo
    echo "Merged cleanly in $wt. Run the checks, then push and open a PR:"
  else
    echo
    echo "Conflicts in $wt. Resolve them, 'git commit', run the checks, then push and open a PR:"
  fi
  echo "  node scripts/ci-scope.mjs run typecheck --packages all && npm test"
  echo "  git push -u origin HEAD && gh pr create --base $BRANCH --title 'Merge main into $BRANCH'"
}

case "${1:-}" in
  status) status "${2:-}" ;;
  prepare) prepare ;;
  *) echo "Usage: $0 status [--check] | prepare" >&2; exit 2 ;;
esac
