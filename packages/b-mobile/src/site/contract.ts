// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The contract between common code and a platform for the member's Blipfoto website session
// (b-oss#1050; design in docs/ImplementationSpec/site-session.md). Common code decides what to load
// and what to do with the answer; a platform only provides these three calls and keeps the
// cookies. The desktop shell implements it in packages/b-mobile-pc (a copy of these shapes lives in
// its src/shared/bridge.ts: keep the two in step), Android in SiteSessionPlugin.java, and iOS later.
//
// What a host guarantees:
//   - Only https pages on the site's own host (www.blipfoto.com) are ever loaded, and `accountId`
//     is validated.
//   - Where `capabilities().site.session` is 'per-account', one account's session is never visible
//     to another account; where it is 'single' there is one session shared by all, which common
//     code handles (site/access.ts) and no host needs to know about.
//   - Runs are one at a time, windows are closed gracefully, and every run is bounded by its
//     timeout.
//   - No cookie, password or token is ever handed back to JavaScript; the page script's answer
//     (`window.__bmx`, a JSON string) comes back verbatim.

export interface SitePageRun {
  /** The b-mobile account the run is for: it picks the account's own session where the platform
   * keeps one each. */
  accountId: string;
  /** An https://www.blipfoto.com/ page; the host refuses anything else. */
  url: string;
  /** Run once the page's structure is ready; sets window.__bmx to a JSON string when finished. */
  script: string;
  timeoutMs: number;
  /** After the script reports, keep the window open until the page navigates (a form post). */
  waitForNavigation: boolean;
}

export interface SitePageResult {
  /** Where the window ended up (after a redirect or a form post). */
  finalUrl: string;
  /** The script's window.__bmx, or null if it never reported before the timeout. */
  result: string | null;
}

export interface SiteSessionHost {
  /** Shows the site's own sign-in page in a visible window, starting signed out for this account.
   * Resolves true once the member has signed in, false if they closed it first. */
  signIn(accountId: string, url: string): Promise<boolean>;
  /** Deletes this account's stored session (where sessions are shared, the one session). */
  signOut(accountId: string): Promise<void>;
  /** Loads `run.url` in a hidden page with the account's session and runs the script. */
  runPage(run: SitePageRun): Promise<SitePageResult>;
}
