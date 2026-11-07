// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// What the web app may ask the sign-in window to open. The renderer is trusted code, but the page
// it asks us to show is not, so only the sign-in host may be loaded, and the redirect it must be
// stopped at has to be a custom-scheme URL (never http(s), never the app's own scheme).

import { APP_SCHEME } from './app-protocol.js';

export const DEFAULT_AUTH_HOSTS: readonly string[] = ['www.blipfoto.com'];

export class AuthRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthRequestError';
  }
}

export function validateAuthRequest(
  url: unknown,
  redirectPrefix: unknown,
  allowedHosts: readonly string[] = DEFAULT_AUTH_HOSTS,
  allowInsecureHttp = false,
): { url: string; redirectPrefix: string } {
  if (typeof url !== 'string' || typeof redirectPrefix !== 'string') {
    throw new AuthRequestError('Sign-in needs a URL and a redirect prefix');
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AuthRequestError('Sign-in URL is not a valid URL');
  }
  const schemeOk =
    parsed.protocol === 'https:' || (allowInsecureHttp && parsed.protocol === 'http:');
  if (!schemeOk || !allowedHosts.includes(parsed.host)) {
    throw new AuthRequestError('Sign-in URL is not on an allowed host');
  }
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(redirectPrefix)?.[1]?.toLowerCase();
  if (scheme === undefined || ['http', 'https', 'file', APP_SCHEME].includes(scheme)) {
    throw new AuthRequestError('Redirect prefix must be a custom-scheme URL');
  }
  return { url: parsed.toString(), redirectPrefix };
}

/** In the sign-in window, which navigations other than the final redirect are allowed: https
 * (plain http only when a test asks for it). */
export function isAllowedNavigation(target: string, allowInsecureHttp = false): boolean {
  try {
    const { protocol } = new URL(target);
    return protocol === 'https:' || (allowInsecureHttp && protocol === 'http:');
  } catch {
    return false;
  }
}

/** Test hook: the same sign-in page path and query on another origin (a fake authorize server).
 * Only index.ts's non-packaged test mode calls this. */
export function withOrigin(url: string, origin: string): string {
  const source = new URL(url);
  return new URL(source.pathname + source.search, origin).toString();
}

export function reachedRedirect(target: string, redirectPrefix: string): boolean {
  return target.toLowerCase().startsWith(redirectPrefix.toLowerCase());
}
