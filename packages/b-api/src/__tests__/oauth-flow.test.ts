// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import {
  buildImplicitGrantUrl,
  parseImplicitGrantCallback,
  OAuthCallbackError,
} from '../oauth-flow.js';

describe('buildImplicitGrantUrl', () => {
  it('sets all required OAuth params', () => {
    const raw = buildImplicitGrantUrl({
      clientId: 'client123',
      redirectUri: 'b-ark://oauth/callback',
      scope: 'read',
      state: 'state-abc',
    });
    const url = new URL(raw);
    expect(url.origin + url.pathname).toBe('https://www.blipfoto.com/oauth/authorize');
    expect(url.searchParams.get('response_type')).toBe('token');
    expect(url.searchParams.get('client_id')).toBe('client123');
    expect(url.searchParams.get('redirect_uri')).toBe('b-ark://oauth/callback');
    expect(url.searchParams.get('scope')).toBe('read');
    expect(url.searchParams.get('state')).toBe('state-abc');
  });

  it('accepts read,write scope', () => {
    const raw = buildImplicitGrantUrl({
      clientId: 'c',
      redirectUri: 'r',
      scope: 'read,write',
      state: 's',
    });
    expect(new URL(raw).searchParams.get('scope')).toBe('read,write');
  });

  it('uses custom baseUrl when provided', () => {
    const raw = buildImplicitGrantUrl({
      clientId: 'c',
      redirectUri: 'r',
      scope: 'read',
      state: 's',
      baseUrl: 'https://test.example.com/oauth/authorize',
    });
    expect(new URL(raw).origin).toBe('https://test.example.com');
  });
});

describe('parseImplicitGrantCallback', () => {
  it('extracts accessToken and state from hash fragment', () => {
    const result = parseImplicitGrantCallback(
      'b-ark://oauth/callback#access_token=tok123&state=abc&token_type=bearer',
    );
    expect(result.accessToken).toBe('tok123');
    expect(result.state).toBe('abc');
  });

  it('extracts from query string when there is no hash', () => {
    const result = parseImplicitGrantCallback(
      'b-ark://oauth/callback?access_token=tok456&state=xyz',
    );
    expect(result.accessToken).toBe('tok456');
    expect(result.state).toBe('xyz');
  });

  it('hash fragment wins over query string', () => {
    const result = parseImplicitGrantCallback(
      'b-ark://oauth/callback?access_token=fromquery&state=qs#access_token=fromhash&state=hf',
    );
    expect(result.accessToken).toBe('fromhash');
    expect(result.state).toBe('hf');
  });

  it('throws OAuthCallbackError with isAccessDenied for access_denied', () => {
    let caught: unknown;
    try {
      parseImplicitGrantCallback('b-ark://oauth/callback#error=access_denied&state=s');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(OAuthCallbackError);
    expect((caught as OAuthCallbackError).isAccessDenied).toBe(true);
    expect((caught as OAuthCallbackError).errorCode).toBe('access_denied');
  });

  it('throws OAuthCallbackError for other errors with description', () => {
    let caught: unknown;
    try {
      parseImplicitGrantCallback(
        'b-ark://oauth/callback?error=invalid_scope&error_description=Scope+not+supported&state=s',
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(OAuthCallbackError);
    expect((caught as OAuthCallbackError).isAccessDenied).toBe(false);
    expect((caught as OAuthCallbackError).message).toContain('Scope not supported');
  });

  it('throws when no access_token', () => {
    expect(() => parseImplicitGrantCallback('b-ark://oauth/callback#state=s')).toThrow(
      'No access_token',
    );
  });

  it('throws when no state', () => {
    expect(() => parseImplicitGrantCallback('b-ark://oauth/callback#access_token=tok')).toThrow(
      'No state',
    );
  });
});
