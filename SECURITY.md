# Security policy

## Reporting a vulnerability

Please **do not open a public GitHub issue** for security bugs.

Preferred channel: open a [private security advisory](https://github.com/ianstevenson/b-oss/security/advisories/new)
against the `ianstevenson/b-oss` repository. This routes the report straight to
the maintainer and lets us collaborate on a fix before public disclosure.

If a private advisory isn't possible, email **ian.stevenson@cyclops-online.co.uk**
with the subject line `b-oss security`.

We aim to acknowledge reports within 7 days and to ship a fix or a clear
mitigation plan within 90 days, sooner where feasible. Reporters will be
credited in the changelog unless they ask to remain anonymous.

## Scope

In scope:

- The b-ark Electron desktop application
- The `backup-engine`, `b-api`, `b-ark-ui-components`, `b-ark-ui-electron`, and `b-view` packages
- The release artefacts published on the
  [b-oss GitHub releases page](https://github.com/ianstevenson/b-oss/releases)
- The auto-update channel

Out of scope (please report to the upstream owner):

- Blipfoto.com itself
- The user's operating system, browser, or third-party software
- GitHub, the npm registry, or the OS keychain implementation

## Trust model

A b-ark install grants execution rights to several actors. Be aware of all of
them when deciding whether to install:

- **The maintainer** — controls source, builds, and the GitHub release feed.
- **The npm dependency tree at build time** — Electron, React,
  electron-updater, electron-store, electron-log, serve-handler, and their
  transitive dependencies. Lockfile pinning + Dependabot reduce but do not
  eliminate supply-chain risk.
- **Blipfoto.com** — b-ark calls `api.blipfoto.com` for journal data and
  downloads image URLs returned by that API.
- **GitHub** — hosts the source repository and the auto-updater channel
  (provider: `github`, owner: `ianstevenson`, repo: `b-oss`).

Network egress is limited to Blipfoto, GitHub (for updates), and localhost
(the bundled b-view static server). The app contains **no telemetry, no
analytics, and no third-party CDN**.

Tokens are stored encrypted via Electron's `safeStorage`, which on Windows is
DPAPI keyed to the local user account. A copy of the config file on another
machine cannot be decrypted.

## Verifying a download

Until Authenticode signing is in place (see "Roadmap" below), Windows users
will see a SmartScreen warning when running the installer. To verify the
installer is the one we published:

- Each GitHub release includes a `latest.yml` file containing the SHA-512 of
  the published installer.
- Compute the hash of your downloaded `.exe` and compare:

  **Windows (PowerShell):**

  ```powershell
  Get-FileHash -Algorithm SHA512 .\b-ark-Setup-X.Y.Z.exe
  ```

  **macOS / Linux:**

  ```bash
  shasum -a 512 b-ark-Setup-X.Y.Z.exe
  ```

If the hashes match, the installer is the one published on the release page.

## Hardening status

Implemented:

- State-based OAuth CSRF protection (`state` parameter validated on callback)
- Electron `contextIsolation: true`, `nodeIntegration: false`, and renderer
  `sandbox: true`
- Strict production Content-Security-Policy: `default-src 'self'; script-src 'self'`
- Narrow `contextBridge` preload surface (no raw `ipcRenderer` passthrough)
- OAuth tokens encrypted with Electron `safeStorage` (OS keychain)
- Tokens never logged and never sent to the renderer process
- Atomic file writes (`.tmp` + rename) for all journal data
- `setWindowOpenHandler`, `will-navigate`, and `will-redirect` guards on the
  main window — external URLs open in the OS browser, never in-app
- Path validation on user-supplied backup-folder paths
- Pinned auto-updater config (`allowDowngrade: false`, `allowPrerelease: false`),
  user-toggleable in settings
- Default-deny TLS validation (Node.js / Electron defaults), single hardcoded
  API base URL
- Single-instance lock and protocol-handler routing for the `b-ark://` OAuth
  callback
- Dependabot watching the npm and GitHub Actions ecosystems

## Roadmap (known gaps)

- **Authenticode code signing.** Windows installers are currently unsigned;
  SmartScreen will warn users on first run. Code signing is deferred until
  there is sustained user demand or specific friction that makes the cost
  worthwhile. Until then, verify the SHA-512 as described above.

- **OAuth PKCE.** Blipfoto's authorisation server does not currently support
  PKCE. State-based CSRF protection per RFC 6749 §10.12 is in place. We will
  enable PKCE on this end as soon as Blipfoto offers it.

## Disclosure policy

We follow a standard 90-day disclosure window from the date of acknowledged
report. We are happy to negotiate an extension if a fix is genuinely
in-flight. Reporters will be credited in `CHANGELOG.md` and the release notes
of the fix.
