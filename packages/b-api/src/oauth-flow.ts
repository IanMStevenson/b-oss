// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

const AUTHORIZE_BASE = 'https://www.blipfoto.com/oauth/authorize';

/** Build the Blipfoto implicit-grant (distributed-app) authorisation URL. */
export function buildImplicitGrantUrl(params: {
  clientId: string;
  redirectUri: string;
  scope: 'read' | 'read,write';
  state: string;
  /** Defaults to the live Blipfoto authorise endpoint. Override in tests. */
  baseUrl?: string;
}): string {
  const url = new URL(params.baseUrl ?? AUTHORIZE_BASE);
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', params.scope);
  url.searchParams.set('state', params.state);
  return url.toString();
}

/** Thrown when Blipfoto returns an OAuth error in the callback URI. */
export class OAuthCallbackError extends Error {
  constructor(
    public readonly errorCode: string,
    message: string,
  ) {
    super(message);
    this.name = 'OAuthCallbackError';
  }

  get isAccessDenied(): boolean {
    return this.errorCode === 'access_denied';
  }
}

/**
 * Parse a Blipfoto implicit-grant callback URI and extract the access token
 * and state. Hash fragment takes precedence over query string (as per spec).
 *
 * Throws `OAuthCallbackError` when Blipfoto returns an OAuth error response.
 * The caller is responsible for verifying the returned `state` against the
 * expected value before trusting `accessToken`.
 */
export function parseImplicitGrantCallback(uri: string): {
  accessToken: string;
  state: string;
} {
  const queryIndex = uri.indexOf('?');
  const hashIndex = uri.indexOf('#');
  const query =
    queryIndex !== -1
      ? new URLSearchParams(uri.slice(queryIndex + 1, hashIndex === -1 ? undefined : hashIndex))
      : new URLSearchParams();
  const fragment =
    hashIndex !== -1 ? new URLSearchParams(uri.slice(hashIndex + 1)) : new URLSearchParams();
  // Merge — hash fragment wins on collision.
  const params = new URLSearchParams();
  for (const [k, v] of query) params.set(k, v);
  for (const [k, v] of fragment) params.set(k, v);

  const errorCode = params.get('error');
  if (errorCode !== null) {
    const description = params.get('error_description') ?? errorCode;
    throw new OAuthCallbackError(errorCode, `Blipfoto sign-in failed: ${description}`);
  }

  const state = params.get('state');
  if (state === null) throw new Error('No state in OAuth callback');

  const accessToken = params.get('access_token');
  if (!accessToken) throw new Error('No access_token in OAuth callback');

  return { accessToken, state };
}
