// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import {
  buildAddExtrasScript,
  buildPageHtmlScript,
  buildReadBackScript,
  buildRemainingScript,
  buildWhoAmIScript,
} from '../pages.js';

describe('page scripts', () => {
  it('are syntactically valid JavaScript', () => {
    const files = [{ name: 'a.jpg', mimeType: 'image/jpeg', base64: 'QUJD' }];
    for (const script of [
      buildAddExtrasScript('ian', files),
      buildAddExtrasScript('ian', [], ['1', '2']),
      buildReadBackScript('ian'),
      buildWhoAmIScript(),
      buildRemainingScript('ian'),
    ]) {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      expect(() => new Function(script)).not.toThrow();
    }
  });

  it('carry the photos as data, not as code', () => {
    const script = buildAddExtrasScript('ian', [
      { name: '"; alert(1); "', mimeType: 'image/jpeg', base64: 'QUJD' },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    expect(() => new Function(script)).not.toThrow();
    expect(script).toContain(JSON.stringify('"; alert(1); "'));
  });
});

/** Runs a page script against a made-up page whose header says `user` is signed in (or no one). */
function runOnPage(
  script: string,
  user: string | null,
  path = '/entry/1/edit',
): Record<string, unknown> {
  document.body.innerHTML = user === null ? '' : `<a href="/${user}">My profile</a>`;
  window.history.pushState({}, '', path);
  (window as unknown as { __bmx?: string }).__bmx = undefined;

  (0, eval)(script);
  return JSON.parse((window as unknown as { __bmx?: string }).__bmx ?? 'null') as Record<
    string,
    unknown
  >;
}

describe('the member guard in every page script', () => {
  const scripts: [string, string][] = [
    ['add', buildAddExtrasScript('ian', [], [])],
    ['read back', buildReadBackScript('ian')],
    ['page html', buildPageHtmlScript('ian')],
    ['remaining', buildRemainingScript('ian')],
  ];

  it.each(scripts)('%s refuses a page signed in as another member', (_name, script) => {
    expect(runOnPage(script, 'cyclops')).toEqual({ status: 'wrong-account', user: 'cyclops' });
  });

  it.each(scripts)('%s treats a signed-out page as needing sign-in', (_name, script) => {
    expect(runOnPage(script, null)).toEqual({ status: 'needs-login' });
  });

  it('page html: signed out is needs-login, another member is wrong-account and gives no html', () => {
    expect(runOnPage(buildPageHtmlScript('ian'), null, '/entry/1')).toEqual({
      status: 'needs-login',
    });
    const other = runOnPage(buildPageHtmlScript('ian'), 'cyclops', '/entry/1');
    expect(other).toEqual({ status: 'wrong-account', user: 'cyclops' });
    expect(other.html).toBeUndefined();
  });

  it('page html: the expected member (any case) gets the page', () => {
    const own = runOnPage(buildPageHtmlScript('Ian'), 'ian', '/entry/1');
    expect(own.status).toBe('ok');
    expect(typeof own.html).toBe('string');
  });
});
