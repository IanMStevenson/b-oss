// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// What the web app may ask the website-session windows to open (b-oss#1037). The renderer is
// trusted code but the pages it names are not, and the windows carry the member's signed-in site
// session, so only https pages on the site's own host are ever loaded, whatever is asked.

import { createHash } from 'node:crypto';
import type { SitePageRun } from '../shared/bridge.js';

export const SITE_HOST = 'www.blipfoto.com';
export const MAX_SCRIPT_CHARS = 60_000_000;
export const MAX_TIMEOUT_MS = 5 * 60_000;

export class SiteRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SiteRequestError';
  }
}

/** The account a website session belongs to; the shell keeps one session per account. */
export function validateAccountId(id: unknown): string {
  if (typeof id !== 'string' || id === '' || id.length > 200) {
    throw new SiteRequestError('A valid account is needed');
  }
  return id;
}

/** The Electron partition an account's website session lives in: its id is hashed so any id gives
 * a safe, fixed-length name, and no two accounts share one. */
export function partitionFor(accountId: string): string {
  const key = createHash('sha256').update(accountId).digest('hex').slice(0, 24);
  return `persist:blipfoto-site-${key}`;
}

/** The page URL, normalised; throws unless it is https on the site's own host. */
export function validateSiteUrl(url: unknown, host: string = SITE_HOST): string {
  if (typeof url !== 'string') throw new SiteRequestError('A page address is needed');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SiteRequestError('Not a valid address');
  }
  if (parsed.protocol !== 'https:' || parsed.host !== host) {
    throw new SiteRequestError('Only pages on the Blipfoto website may be opened');
  }
  return parsed.toString();
}

export function validateSiteRun(run: unknown, host: string = SITE_HOST): SitePageRun {
  if (typeof run !== 'object' || run === null) throw new SiteRequestError('Bad page request');
  const r = run as Record<string, unknown>;
  const url = validateSiteUrl(r.url, host);
  const accountId = validateAccountId(r.accountId);
  if (typeof r.script !== 'string' || r.script.length === 0 || r.script.length > MAX_SCRIPT_CHARS) {
    throw new SiteRequestError('Bad script');
  }
  const timeoutMs = typeof r.timeoutMs === 'number' ? r.timeoutMs : NaN;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new SiteRequestError('Bad timeout');
  }
  if (typeof r.waitForNavigation !== 'boolean') throw new SiteRequestError('Bad request');
  return { accountId, url, script: r.script, timeoutMs, waitForNavigation: r.waitForNavigation };
}

/** After sign-in the site sends the member away from /account/…; that is the "signed in" signal. */
export function isSignedInLanding(target: string, host: string = SITE_HOST): boolean {
  try {
    const u = new URL(target);
    return u.protocol === 'https:' && u.host === host && !u.pathname.startsWith('/account/');
  } catch {
    return false;
  }
}
