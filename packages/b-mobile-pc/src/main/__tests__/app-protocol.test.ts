// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import {
  buildCsp,
  inlineScriptHashes,
  isTrustedSender,
  looksLikeAsset,
  mimeFor,
  planAppRequest,
  sanitiseRequestHeaders,
  sanitiseResponseHeaders,
} from '../app-protocol.js';

const dist = resolve('/srv/web');

describe('planAppRequest: static files', () => {
  it('serves the index for the root and treats extension-less paths as SPA routes', () => {
    expect(planAppRequest('app://b-mobile/', dist)).toEqual({
      kind: 'static',
      file: resolve(dist, 'index.html'),
      spaFallback: false,
    });
    expect(planAppRequest('app://b-mobile/accounts', dist)).toEqual({
      kind: 'static',
      file: resolve(dist, 'accounts'),
      spaFallback: true,
    });
  });

  it('does not fall back to the SPA shell for a missing asset', () => {
    const plan = planAppRequest('app://b-mobile/assets/index-abc123.js', dist);
    expect(plan).toEqual({
      kind: 'static',
      file: resolve(dist, 'assets/index-abc123.js'),
      spaFallback: false,
    });
  });

  it('treats a dot in a route as part of a name, not an extension (b-oss#695)', () => {
    for (const path of ['/profile/john.smith', '/u/jane.doe.2', '/profile/a.b/entries', '/v1.2']) {
      const plan = planAppRequest(`app://b-mobile${path}`, dist);
      expect(plan, path).toMatchObject({ kind: 'static', spaFallback: true });
    }
  });

  it('keeps every known static extension an asset, in any case', () => {
    for (const name of [
      'a.js',
      'a.css',
      'x/y.PNG',
      'f.woff2',
      'a.js.map',
      'm.webmanifest',
      'i.svg',
    ]) {
      expect(looksLikeAsset(name), name).toBe(true);
    }
    for (const name of ['john.smith', 'accounts', '.hidden', 'a.', 'dir/']) {
      expect(looksLikeAsset(name), name).toBe(false);
    }
  });

  it('refuses paths that climb out of the web build', () => {
    for (const path of [
      '/../secret.txt',
      '/%2e%2e/secret.txt',
      '/assets/../../secret.txt',
      '/..%2f..%2fetc/passwd',
    ]) {
      const plan = planAppRequest(`app://b-mobile${path}`, dist);
      expect(plan.kind === 'reject' || (plan.kind === 'static' && plan.file.startsWith(dist))).toBe(
        true,
      );
    }
    expect(planAppRequest('app://b-mobile/%2e%2e/%2e%2e/etc/passwd', dist).kind).not.toBe('api');
  });

  it('rejects a NUL byte, bad encoding and other hosts or schemes', () => {
    expect(planAppRequest('app://b-mobile/%00', dist)).toEqual({ kind: 'reject', status: 400 });
    expect(planAppRequest('app://b-mobile/%E0%A4%A', dist)).toEqual({
      kind: 'reject',
      status: 400,
    });
    expect(planAppRequest('app://other/', dist)).toEqual({ kind: 'reject', status: 403 });
    expect(planAppRequest('https://b-mobile/', dist)).toEqual({ kind: 'reject', status: 403 });
    expect(planAppRequest('not a url', dist)).toEqual({ kind: 'reject', status: 400 });
  });
});

describe('planAppRequest: API proxy', () => {
  it('forwards the path and query to the API origin', () => {
    expect(
      planAppRequest('app://b-mobile/api/blipfoto/4/entries/recent.json?page_size=100', dist),
    ).toEqual({
      kind: 'api',
      target: 'https://api.blipfoto.com/4/entries/recent.json?page_size=100',
    });
  });

  it('can target a stub API origin (tests)', () => {
    expect(
      planAppRequest('app://b-mobile/api/blipfoto/4/x', dist, 'http://127.0.0.1:5192'),
    ).toEqual({
      kind: 'api',
      target: 'http://127.0.0.1:5192/4/x',
    });
  });

  it('never lets the request choose the host', () => {
    for (const path of [
      '/api/blipfoto//evil.example/x',
      '/api/blipfoto/@evil.example/x',
      '/api/blipfoto/..%2f..%2f@evil.example/',
      '/api/blipfoto/\\evil.example/x',
    ]) {
      const plan = planAppRequest(`app://b-mobile${path}`, dist);
      if (plan.kind === 'api') expect(new URL(plan.target).origin).toBe('https://api.blipfoto.com');
      else expect(plan.kind).toBe('reject');
    }
  });

  it('does not treat a lookalike prefix as the API', () => {
    expect(planAppRequest('app://b-mobile/api/blipfotox/4/x', dist).kind).toBe('static');
  });
});

describe('header sanitising', () => {
  it('drops origin, referer, host and cookies from requests', () => {
    const out = sanitiseRequestHeaders(
      new Headers({
        origin: 'app://b-mobile',
        referer: 'app://b-mobile/',
        cookie: 'a=b',
        authorization: 'Bearer t',
        'content-type': 'multipart/form-data; boundary=x',
      }),
    );
    expect([...out.keys()].sort()).toEqual(['authorization', 'content-type']);
  });

  it('drops encoding, length and cookies from responses', () => {
    const out = sanitiseResponseHeaders(
      new Headers({
        'content-encoding': 'gzip',
        'content-length': '10',
        'set-cookie': 'a=b',
        'content-type': 'application/json',
        'x-ratelimit-remaining': '99',
      }),
    );
    expect([...out.keys()].sort()).toEqual(['content-type', 'x-ratelimit-remaining']);
  });
});

describe('mimeFor', () => {
  it('knows the web build file types and defaults to octet-stream', () => {
    expect(mimeFor('/a/index.html')).toContain('text/html');
    expect(mimeFor('/a/x.JS')).toContain('text/javascript');
    expect(mimeFor('/a/f.woff2')).toBe('font/woff2');
    expect(mimeFor('/a/noext')).toBe('application/octet-stream');
  });
});

describe('Content-Security-Policy', () => {
  const script =
    "(function () { document.documentElement.setAttribute('data-theme', 'light'); })();";
  const html = `<html><head><script>${script}</script><script type="module" src="/assets/x.js"></script></head></html>`;

  it('allows the inline script by hash and not the external one by hash', () => {
    const hash = createHash('sha256').update(script, 'utf8').digest('base64');
    expect(inlineScriptHashes(html)).toEqual([hash]);
    expect(buildCsp(html)).toContain(`script-src 'self' 'sha256-${hash}'`);
  });

  it('never allows unsafe-inline scripts or eval, and locks down objects, base and framing', () => {
    const csp = buildCsp(html);
    expect(csp).not.toMatch(/script-src[^;]*unsafe/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('has just "self" for scripts when the page has no inline script', () => {
    expect(buildCsp('<html></html>')).toContain("script-src 'self';");
  });
});

describe('isTrustedSender', () => {
  it('trusts only the app origin', () => {
    expect(isTrustedSender('app://b-mobile/')).toBe(true);
    expect(isTrustedSender('app://b-mobile/accounts')).toBe(true);
    expect(isTrustedSender('https://www.blipfoto.com/')).toBe(false);
    expect(isTrustedSender('app://evil/')).toBe(false);
    expect(isTrustedSender(undefined)).toBe(false);
    expect(isTrustedSender('garbage')).toBe(false);
  });
});
