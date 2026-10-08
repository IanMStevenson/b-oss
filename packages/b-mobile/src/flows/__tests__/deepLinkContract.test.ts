// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Contract table (b-oss#330): every VIEW intent filter declared in AndroidManifest.xml must be
// understood by flows/deepLinkResolver.ts, and the resolver must stay safe for URLs another app
// can put in an intent. The manifest is read from disk, so adding a filter without teaching the
// resolver about it fails here rather than on a device.

import { describe, expect, it } from 'vitest';
import { resolveDeepLink, routeDeepLink } from '../deepLinkResolver.js';
import type { DeepLinkTarget } from '../deepLinkResolver.js';
import manifest from '../../../android/app/src/main/AndroidManifest.xml?raw';

interface ViewFilter {
  scheme: string;
  host?: string;
}

function viewFilters(xml: string): ViewFilter[] {
  const filters: ViewFilter[] = [];
  for (const [, body] of xml.matchAll(/<intent-filter[^>]*>([\s\S]*?)<\/intent-filter>/g)) {
    if (!body.includes('android.intent.action.VIEW')) continue;
    for (const [, attrs] of body.matchAll(/<data\s+([^>]*?)\/>/g)) {
      const scheme = /android:scheme="([^"]+)"/.exec(attrs)?.[1];
      if (!scheme) continue;
      filters.push({ scheme, host: /android:host="([^"]+)"/.exec(attrs)?.[1] });
    }
  }
  return filters;
}

function pushed(url: string): string[] {
  const calls: string[] = [];
  routeDeepLink(resolveDeepLink(url), (p) => calls.push(p));
  return calls;
}

describe('AndroidManifest VIEW intent filters', () => {
  const filters = viewFilters(manifest);

  it('declares exactly the bmobile:// and https://www.blipfoto.com filters the resolver knows about', () => {
    expect(filters).toEqual([
      { scheme: 'bmobile', host: undefined },
      { scheme: 'https', host: 'www.blipfoto.com' },
    ]);
  });

  it.each(filters)('resolver handles URLs reachable through filter %o', ({ scheme, host }) => {
    const base = host ? `${scheme}://${host}` : `${scheme}://`;
    const samples: Array<[string, string[]]> =
      scheme === 'bmobile'
        ? [
            [`${base}entry/42`, ['/entry/42']],
            [`${base}user/alice`, ['/user/alice']],
            [`${base}oauth/#access_token=t&state=s`, []],
          ]
        : [
            [`${base}/entry/42`, ['/entry/42']],
            [`${base}/alice`, ['/user/alice']],
            [`${base}/me/followers/requests`, ['/me/requests']],
          ];
    for (const [url, expectedPush] of samples) expect(pushed(url)).toEqual(expectedPush);
  });
});

describe('resolveDeepLink contract table', () => {
  const rows: Array<[string, string, DeepLinkTarget]> = [
    ['oauth redirect', 'bmobile://oauth/#access_token=a&state=b', { kind: 'oauth' }],
    ['entry', 'bmobile://entry/9007199254740993', { kind: 'entry', entryId: '9007199254740993' }],
    ['user', 'bmobile://user/bob', { kind: 'profile', username: 'bob' }],
    ['web entry', 'https://www.blipfoto.com/entry/77', { kind: 'entry', entryId: '77' }],
    [
      'web entry, query + fragment',
      'https://www.blipfoto.com/entry/77?x=1#y',
      { kind: 'entry', entryId: '77' },
    ],
    ['web profile', 'https://www.blipfoto.com/carol', { kind: 'profile', username: 'carol' }],
    [
      'web follow requests',
      'https://www.blipfoto.com/me/followers/requests',
      { kind: 'follow-request' },
    ],
    ['bare blipfoto.com host', 'https://blipfoto.com/entry/5', { kind: 'entry', entryId: '5' }],
    ['host case-insensitive', 'https://WWW.Blipfoto.COM/entry/5', { kind: 'entry', entryId: '5' }],
  ];
  it.each(rows)('%s', (_name, url, target) => {
    expect(resolveDeepLink(url)).toEqual(target);
  });

  const ignored: Array<[string, string]> = [
    ['empty string', ''],
    ['not a URL', 'not a url'],
    ['javascript: scheme', 'javascript:alert(1)'],
    ['file: scheme', 'file:///etc/passwd'],
    ['content: scheme', 'content://com.evil/x'],
    ['intent: scheme', 'intent://entry/1#Intent;scheme=bmobile;end'],
    ['http (not https) blipfoto', 'http://evil.example/entry/1'],
    ['lookalike host', 'https://www.blipfoto.com.evil.example/entry/1'],
    ['userinfo spoof', 'https://www.blipfoto.com@evil.example/entry/1'],
    ['subdomain spoof', 'https://evilwww.blipfoto.com/entry/1'],
    ['unknown bmobile host', 'bmobile://settings/reset'],
    ['bmobile host-less', 'bmobile:///entry/1'],
    ['bmobile entry without id', 'bmobile://entry'],
    ['oauth lookalike host', 'bmobile://oauth.evil/x'],
    ['reserved web path', 'https://www.blipfoto.com/store'],
    ['web deep unknown path', 'https://www.blipfoto.com/a/b/c'],
  ];
  it.each(ignored)('ignores %s', (_name, url) => {
    expect(resolveDeepLink(url)).toEqual({ kind: 'ignore' });
    expect(pushed(url)).toEqual([]);
  });

  it('does not let a crafted id escape the /entry/ route when re-encoded', () => {
    expect(pushed('bmobile://entry/..%2F..%2Faccounts')).toEqual(['/entry/..%2F..%2Faccounts']);
    expect(pushed('bmobile://user/a%2Fb%3Fc')).toEqual(['/user/a%2Fb%3Fc']);
  });

  // Genuine bug found by this table (reported on b-oss#330): a malformed percent-escape makes
  // decodeURIComponent throw, so resolveDeepLink throws instead of returning `ignore`. Any app
  // can send such a VIEW intent; on cold start the throw is an unhandled rejection in
  // AppShell's DeepLinkListener. Flip `it.fails` to `it` when fixed.
  it.fails('ignores a malformed percent-escape instead of throwing', () => {
    expect(resolveDeepLink('bmobile://entry/%E0%A4%A')).toEqual({ kind: 'ignore' });
    expect(resolveDeepLink('bmobile://user/%')).toEqual({ kind: 'ignore' });
  });
});
