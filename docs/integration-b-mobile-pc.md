# The `integration/b-mobile-pc` branch

Tracking epic: [b-oss#605](https://github.com/IanMStevenson/b-oss/issues/605). This is the long-running
branch for running b-mobile on desktop (Windows first). Why it exists: Android b-mobile work carries on
on `main` in parallel and the Play app must not be put at risk by this work.

## Rules

- **Nothing from this branch reaches `main` until everything is built, tested and proven**, and then only
  with Ian's explicit go-ahead. The merge itself is its own issue
  ([b-oss#616](https://github.com/IanMStevenson/b-oss/issues/616)) with a checklist, including Android
  regression evidence.
- Every change for this work is a PR **into this branch**, never into `main`. That includes changes to
  b-mobile's own source that look behaviour-neutral on Android: "neutral" is unproven until tested here.
- `main` is merged **into** this branch regularly (at least weekly, and before each milestone), so the
  eventual merge back is small. The merge goes through a PR like everything else.
- PRs into this branch are merged by Ian, as for `main`.

## CI

`ci.yml` and `ci-docs-only.yml` run for pushes to and PRs into this branch, with the same `ci` status
check as `main`. `scripts/ci-scope.mjs` plans from the PR's base commit, so scoping works unchanged.
`cla.yml` already runs for PRs to any branch. Workflows that deploy or publish (`site.yml`, release
workflows) stay keyed on `main` / tags; the manual release workflows can be run from this branch by
picking it in the Actions UI (they run the workflow and code of the selected branch).

## Keeping it close to `main`

```bash
scripts/integration-sync.sh status            # how far behind main, and which commits touch b-mobile
scripts/integration-sync.sh status --check    # exits 1 past MAX_BEHIND (25) commits / MAX_AGE_DAYS (7) days
scripts/integration-sync.sh prepare           # worktree + branch with main merged in; then push + PR
```

`prepare` creates `.claude/worktrees/sync-main-<date>` on `sync/main-into-b-mobile-pc-<date>`, merges
`origin/main` into it and stops on any conflict for you to resolve. It never pushes or opens a PR. After
it: run `node scripts/ci-scope.mjs run typecheck --packages all` and the tests, push, and open the PR
with `--base integration/b-mobile-pc`.

### Why there is no scheduled drift check in this repo

GitHub only runs `schedule` workflows from the default branch, so a drift check inside this repo would
have to live on `main`, which this work deliberately does not touch until the end. Run
`integration-sync.sh status --check` from a reminder or the daily report instead.

## Branch protection

Not configured by the agent (it needs repo admin). `main` has the `main-protection` ruleset (PR required
with code-owner review, the `ci` status check, no deletion or force-push). A matching ruleset for
`integration/b-mobile-pc` is Ian's call; see b-oss#606.
