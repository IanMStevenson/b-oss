// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { beforeEach, describe, expect, it, vi } from 'vitest';

const siteRunPage = vi.fn();
const signOut = vi.fn(() => Promise.resolve());
let available = true;
vi.mock('../../platform/siteSession.js', () => ({
  siteRunPage: (run: unknown): Promise<unknown> => siteRunPage(run) as Promise<unknown>,
  siteSessionAvailable: () => available,
  siteSignIn: vi.fn(),
  siteSignOut: () => signOut(),
}));

import { addExtras, currentSiteUser, forgetSiteSession, isSameMember } from '../extrasFlow.js';

const photo = { webPath: 'blob:x', mimeType: 'image/jpeg' };
const reply = (o: unknown) => ({ finalUrl: '', result: JSON.stringify(o) });

beforeEach(() => {
  siteRunPage.mockReset();
  signOut.mockClear();
  available = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ blob: () => Promise.resolve(new Blob(['abc'])) })),
  );
});

describe('addExtras', () => {
  it('is unavailable where there is no site session', async () => {
    available = false;
    const out = await addExtras('1', 'ian', [photo]);
    expect(out).toMatchObject({ kind: 'manual', reason: 'unavailable' });
    expect(siteRunPage).not.toHaveBeenCalled();
  });

  it('asks for sign-in when the edit page sends the member to the sign-in page', async () => {
    siteRunPage.mockResolvedValueOnce(reply({ status: 'needs-login' }));
    expect(await addExtras('1', 'ian', [photo])).toMatchObject({
      kind: 'manual',
      reason: 'not-signed-in',
    });
  });

  it('stops before sending anything when the site is signed in as someone else', async () => {
    siteRunPage.mockResolvedValueOnce(reply({ status: 'ok', user: 'other', count: 0 }));
    expect(await addExtras('1', 'ian', [photo])).toMatchObject({
      kind: 'manual',
      reason: 'wrong-account',
    });
    expect(siteRunPage).toHaveBeenCalledTimes(1);
  });

  it('reports no membership when the page has no uploader', async () => {
    siteRunPage.mockResolvedValueOnce(reply({ status: 'no-uploader' }));
    expect(await addExtras('1', 'ian', [photo])).toMatchObject({ reason: 'no-membership' });
  });

  it('is done when the read-back shows every photo kept', async () => {
    siteRunPage
      .mockResolvedValueOnce(reply({ status: 'ok', user: 'Ian', count: 1 }))
      .mockResolvedValueOnce(reply({ status: 'submitted', user: 'Ian', remainingBefore: 99 }))
      .mockResolvedValueOnce(reply({ status: 'ok', user: 'Ian', count: 3 }));
    expect(await addExtras('1', 'ian', [photo, photo])).toEqual({ kind: 'done', added: 2 });
    expect(siteRunPage.mock.calls[1]?.[0]).toMatchObject({ waitForNavigation: true });
  });

  it('reports a partial result when only some were kept', async () => {
    siteRunPage
      .mockResolvedValueOnce(reply({ status: 'ok', user: 'ian', count: 0 }))
      .mockResolvedValueOnce(reply({ status: 'submitted', user: 'ian', remainingBefore: 100 }))
      .mockResolvedValueOnce(reply({ status: 'ok', user: 'ian', count: 1 }));
    expect(await addExtras('1', 'ian', [photo, photo])).toMatchObject({
      kind: 'partial',
      added: 1,
      total: 2,
    });
  });

  it('does not trust the save: nothing in the read-back means not kept', async () => {
    siteRunPage
      .mockResolvedValueOnce(reply({ status: 'ok', user: 'ian', count: 0 }))
      .mockResolvedValueOnce(reply({ status: 'submitted', user: 'ian', remainingBefore: 100 }))
      .mockResolvedValueOnce(reply({ status: 'ok', user: 'ian', count: 0 }));
    expect(await addExtras('1', 'ian', [photo])).toMatchObject({
      kind: 'manual',
      reason: 'not-kept',
    });
  });

  it('turns a throw into the manual screen, with the edit page address', async () => {
    siteRunPage.mockRejectedValueOnce(new Error('boom'));
    expect(await addExtras('42', 'ian', [photo])).toEqual({
      kind: 'manual',
      reason: 'error',
      total: 1,
      editUrl: 'https://www.blipfoto.com/entry/42/edit',
    });
  });
});

describe('currentSiteUser / isSameMember', () => {
  it('is null when not signed in, the name when signed in', async () => {
    siteRunPage.mockResolvedValueOnce(reply({ status: 'needs-login' }));
    expect(await currentSiteUser()).toBeNull();
    siteRunPage.mockResolvedValueOnce(reply({ status: 'ok', user: 'ian' }));
    expect(await currentSiteUser()).toBe('ian');
  });

  it('compares names without case and accepts an unnamed session', () => {
    expect(isSameMember('Ian', 'ian')).toBe(true);
    expect(isSameMember('', 'ian')).toBe(true);
    expect(isSameMember(null, 'ian')).toBe(false);
    expect(isSameMember('x', 'ian')).toBe(false);
  });
});

describe('forgetSiteSession', () => {
  it('deletes the session when it is the removed member own', async () => {
    siteRunPage.mockResolvedValueOnce(reply({ status: 'ok', user: 'Ian' }));
    await forgetSiteSession('ian');
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('leaves another member session, and a signed-out one, alone', async () => {
    siteRunPage.mockResolvedValueOnce(reply({ status: 'ok', user: 'other' }));
    await forgetSiteSession('ian');
    siteRunPage.mockResolvedValueOnce(reply({ status: 'needs-login' }));
    await forgetSiteSession('ian');
    expect(signOut).not.toHaveBeenCalled();
  });

  it('never throws', async () => {
    siteRunPage.mockRejectedValueOnce(new Error('boom'));
    await expect(forgetSiteSession('ian')).resolves.toBeUndefined();
  });
});
