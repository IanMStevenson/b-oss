# CI protection model and secrets

> **Maintainer-only.** This describes how the maintainer protects `main` and the release builds, using their
> own GitHub settings and credentials.
> Agents: it applies only if `hostname` starts with `ims-dev-` (see [MAINTAINER-ENVIRONMENT.md](MAINTAINER-ENVIRONMENT.md)).
> Otherwise you are a contributor: don't act on it, but feel free to use it as a model.

Decided in [b-oss#498 – Review CODEOWNERS and merge protection](https://github.com/IanMStevenson/b-oss/issues/498),
with the release side in [b-oss#925 – Tidy up the release cycle](https://github.com/IanMStevenson/b-oss/issues/925).
Items marked **planned** are not in place until the PR named beside them has merged.

## 1. What reaches `main`

- **Ruleset `main-protection`:** a PR is required, the `ci` check must pass, and code-owner review is
  required. `required_approving_review_count` is **0 on purpose**: a file with a code owner needs the owner's
  review, and any other file can be merged by the owner or an agent without a second approver. (With count 0 and
  code-owner review on, code-owner review is still enforced; seen on [b-oss#491](https://github.com/IanMStevenson/b-oss/pull/491).)
- The ruleset's bypass list has not been verified here; this document makes no claim about it.
- **CODEOWNERS** (`.github/CODEOWNERS`) lists what must not change without the owner: the protection itself
  (`.github/`), anything that runs with secrets or publishes, anything that deploys from `main` (`b-site`,
  `b-push`, `b-status`), the supply chain (root `package.json`, lockfile, `.npmrc`), store-facing text
  (`packages/*/store/`), release docs and `scripts/`, and the licence, CLA and security policy. Services that
  deploy from `main` are gated by code-owner review.
- **Workflows:** every third-party action is pinned to a commit SHA (with the version in a comment), and
  Dependabot updates the pins monthly (`github-actions` ecosystem in `.github/dependabot.yml`). Every workflow
  sets explicit `permissions:`, read-only unless it needs more.
- Store publication (Play, Microsoft Store, Chrome Web Store) is always a manual upload. CI only builds.

## 2. Environments

Release builds read their values from **GitHub Environments**, one per product family, chosen by the tag that
triggers the build. An Environment is limited to the matching tag pattern, so a branch cannot deploy to it, and
the job waits for the owner's approval.

| Environment | Family | Tag | Builds | Status |
| --- | --- | --- | --- | --- |
| `b-mobile-play-release` | b-mobile | `b-mobile-v*` | Android bundle (`release-android.yml`); b-mobile-pc Store MSIX (`build-msix-b-mobile-pc.yml`) | In place for Android; the MSIX job is in [b-oss#946 – b-mobile family release](https://github.com/IanMStevenson/b-oss/pull/946) |
| `b-ark-release` | b-ark | `b-ark-v*` | b-ark Store MSIX; b-ark-chrome zip | **Planned**, [b-oss#945 – b-ark family release](https://github.com/IanMStevenson/b-oss/issues/945) |

Rules:

- **No manual dispatch from a branch** for a release build; the tag selects the Environment.
- **No repo-level secrets.** Every secret and build variable lives in an Environment. The repo-level items
  that remain are listed in §3 and are not build inputs.
- **A shared value lives in exactly one Environment.** Never copy a secret into a second Environment: two
  copies drift, and rotating one leaves the other live. A family shares its Environment so shared keys exist
  once.
- `b-mobile-play-release` also covers the Windows build of b-mobile-pc. The name is kept because GitHub cannot
  rename an Environment.

## 3. Every CI secret and variable

"Ships" means the value ends up inside the built app, so anyone can extract it from a released build. CI
protection then only stops **pre-release** leakage. There are no provider-side restrictions (referrer, package
or origin limits) on the keys that ship.

### Environment `b-mobile-play-release`

| Name | Kind | Read by | Ships in the app? |
| --- | --- | --- | --- |
| `GOOGLE_SERVICES_JSON` | secret | `release-android.yml` | No (not secret in itself, but gitignored) |
| `UPLOAD_KEYSTORE_BASE64` | secret | `release-android.yml` | No, never |
| `UPLOAD_KEYSTORE_PASSWORD` | secret | `release-android.yml` | No, never |
| `UPLOAD_KEY_PASSWORD` | secret | `release-android.yml` | No, never |
| `VITE_GEOAPIFY_KEY` | secret | `release-android.yml`, `build-msix-b-mobile-pc.yml` | **Yes** |
| `VITE_MAPTILER_KEY` | secret | `release-android.yml`, `build-msix-b-mobile-pc.yml` (the latter in #946) | **Yes** |
| `VITE_NOTIFY_REGISTRATION_SECRET` | secret | `release-android.yml` | **Yes** (the push-service registration secret) |
| `UPLOAD_KEY_ALIAS` | variable | `release-android.yml` | No |
| `VITE_BLIPFOTO_CLIENT_ID` | variable | `release-android.yml`, `build-msix-b-mobile-pc.yml` | **Yes** (client ID) |
| `VITE_NOTIFY_SERVICE_URL` | variable | `release-android.yml` | **Yes** (public URL) |
| `VITE_OAUTH_REDIRECT_URI` | variable | `release-android.yml` | **Yes** (public) |
| `MSIX_IDENTITY_NAME`, `MSIX_PUBLISHER`, `MSIX_PUBLISHER_DISPLAY_NAME` | variables | `build-msix-b-mobile-pc.yml` (in #946) | Yes, in the package manifest; **planned** until #946 merges |

### Environment `b-ark-release` (planned, [b-oss#945](https://github.com/IanMStevenson/b-oss/issues/945))

| Name | Kind | Read by | Ships in the app? |
| --- | --- | --- | --- |
| b-ark Blipfoto client ID | to be set by #945 | b-ark Store MSIX job | **Yes** |
| b-ark-chrome client ID | to be set by #945 | b-ark-chrome zip job | **Yes** |
| `MSIX_*` Partner Center values | variables | b-ark Store MSIX job | Yes, in the package manifest |

The exact names are fixed when #945 merges; update this table then.

### Repo level (exceptions)

| Name | Kind | Read by | Notes |
| --- | --- | --- | --- |
| `BLIPFOTO_CLIENT_ID` | secret | `build-msix.yml`, `build-msix-sideload.yml`, `release-mac.yml`, `release-win.yml` | **Being removed** in #945; it moves to `b-ark-release`. Ships in the app. |
| `PROJECT_TOKEN` | secret | `add-to-project.yml` | Adds issues to the IS-Dev board. Never ships. A personal access token used for repository automation; it should stay narrowly scoped to the project board, with an expiry date. |
| `PAGES_DEPLOY` | variable | `site.yml` | A flag (`true` enables the Pages deploy), not a secret. |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` | secrets | `release-win.yml` | Intentionally unset (the installer ships unsigned). |
| `GITHUB_TOKEN` | automatic | `cla.yml`, `release-mac.yml`, `release-win.yml` | Issued per run; permissions are set in each workflow. |

## 4. Changing this

Adding a secret or variable: put it in the Environment of the family that builds it, add a row to §3 saying
whether it ships, and read it in the workflow with a fail-if-empty check. Check the list against
`grep -rnoE '(secrets|vars)\.[A-Za-z0-9_]+' .github/workflows`.

## Before the next tag (owner, Settings)

Settings steps that cannot be done in a PR are listed in the description of the PR that introduces this file.
