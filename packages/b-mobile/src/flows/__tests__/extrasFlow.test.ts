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

import {
  addExtras,
  applyExtras,
  loadEditExtras,
  currentSiteUser,
  forgetSiteSession,
  isSameMember,
  readExtrasRemaining,
} from '../extrasFlow.js';

const photo = { webPath: 'blob:x', mimeType: 'image/jpeg' };
const item = (id: string) => ({ id, thumbnail: `t-${id}` });
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
    siteRunPage.mockResolvedValueOnce(reply({ status: 'ok', user: 'other', items: [] }));
    expect(await addExtras('1', 'ian', [photo])).toMatchObject({
      kind: 'manual',
      reason: 'wrong-account',
    });
    expect(siteRunPage).toHaveBeenCalledTimes(1);
  });

  it('says wrong account, not no membership, when the other members page has no uploader', async () => {
    siteRunPage.mockResolvedValueOnce(reply({ status: 'no-uploader', user: 'cyclops' }));
    expect(await addExtras('1', 'ian', [photo])).toMatchObject({
      kind: 'manual',
      reason: 'wrong-account',
    });
  });

  it('reports no membership when the page has no uploader', async () => {
    siteRunPage.mockResolvedValueOnce(reply({ status: 'no-uploader' }));
    expect(await addExtras('1', 'ian', [photo])).toMatchObject({ reason: 'no-membership' });
  });

  it('is done when the read-back shows every photo kept', async () => {
    siteRunPage
      .mockResolvedValueOnce(reply({ status: 'ok', user: 'Ian', items: [item('a')] }))
      .mockResolvedValueOnce(reply({ status: 'submitted', user: 'Ian', remainingBefore: 99 }))
      .mockResolvedValueOnce(
        reply({ status: 'ok', user: 'Ian', items: [item('a'), item('b'), item('c')] }),
      );
    expect(await addExtras('1', 'ian', [photo, photo])).toEqual({
      kind: 'done',
      added: 2,
      removed: 0,
    });
    expect(siteRunPage.mock.calls[1]?.[0]).toMatchObject({ waitForNavigation: true });
  });

  it('reports a partial result when only some were kept', async () => {
    siteRunPage
      .mockResolvedValueOnce(reply({ status: 'ok', user: 'ian', items: [] }))
      .mockResolvedValueOnce(reply({ status: 'submitted', user: 'ian', remainingBefore: 100 }))
      .mockResolvedValueOnce(reply({ status: 'ok', user: 'ian', items: [item('a')] }));
    expect(await addExtras('1', 'ian', [photo, photo])).toMatchObject({
      kind: 'partial',
      added: 1,
      total: 2,
    });
  });

  it('does not trust the save: nothing in the read-back means not kept', async () => {
    siteRunPage
      .mockResolvedValueOnce(reply({ status: 'ok', user: 'ian', items: [] }))
      .mockResolvedValueOnce(reply({ status: 'submitted', user: 'ian', remainingBefore: 100 }))
      .mockResolvedValueOnce(reply({ status: 'ok', user: 'ian', items: [] }));
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

describe('readExtrasRemaining', () => {
  it('returns the allowance the website shows', async () => {
    siteRunPage.mockResolvedValueOnce(reply({ status: 'ok', remaining: 98 }));
    expect(await readExtrasRemaining()).toBe(98);
    expect(siteRunPage.mock.calls[0]?.[0]).toMatchObject({
      url: 'https://www.blipfoto.com/publish',
    });
  });

  it('is null when it cannot be read: signed out, no uploader, a throw, no session', async () => {
    siteRunPage.mockResolvedValueOnce(reply({ status: 'needs-login' }));
    expect(await readExtrasRemaining()).toBeNull();
    siteRunPage.mockResolvedValueOnce(reply({ status: 'no-uploader' }));
    expect(await readExtrasRemaining()).toBeNull();
    siteRunPage.mockRejectedValueOnce(new Error('boom'));
    expect(await readExtrasRemaining()).toBeNull();
    available = false;
    expect(await readExtrasRemaining()).toBeNull();
  });
});

describe('applyExtras with removals (b-oss#1041)', () => {
  it('removes by id through the page and confirms from the read-back', async () => {
    siteRunPage
      .mockResolvedValueOnce(reply({ status: 'ok', user: 'ian', items: [item('a'), item('b')] }))
      .mockResolvedValueOnce(
        reply({ status: 'submitted', user: 'ian', remainingBefore: 98, missing: [] }),
      )
      .mockResolvedValueOnce(reply({ status: 'ok', user: 'ian', items: [item('b')] }));
    expect(await applyExtras('1', 'ian', [], ['a'])).toEqual({
      kind: 'done',
      added: 0,
      removed: 1,
    });
    const run = siteRunPage.mock.calls[1]?.[0] as { script: string };
    expect(run.script).toContain('["a"]');
  });

  it('does both in one save, and reports a partial result honestly', async () => {
    siteRunPage
      .mockResolvedValueOnce(reply({ status: 'ok', user: 'ian', items: [item('a')] }))
      .mockResolvedValueOnce(
        reply({ status: 'submitted', user: 'ian', remainingBefore: 98, missing: [] }),
      )
      // 'a' is gone, but the new photo did not arrive
      .mockResolvedValueOnce(reply({ status: 'ok', user: 'ian', items: [] }));
    expect(await applyExtras('1', 'ian', [photo], ['a'])).toMatchObject({
      kind: 'partial',
      added: 1,
      total: 2,
    });
  });

  it('treats an id already gone as removed, and never asks the page to remove it', async () => {
    siteRunPage
      .mockResolvedValueOnce(reply({ status: 'ok', user: 'ian', items: [] }))
      .mockResolvedValueOnce(
        reply({ status: 'submitted', user: 'ian', remainingBefore: 98, missing: [] }),
      )
      .mockResolvedValueOnce(reply({ status: 'ok', user: 'ian', items: [] }));
    expect(await applyExtras('1', 'ian', [], ['gone'])).toMatchObject({ kind: 'done', removed: 1 });
    const run = siteRunPage.mock.calls[1]?.[0] as { script: string };
    expect(run.script).toContain('var REMOVE = [];');
  });
});

describe('loadEditExtras', () => {
  it('returns the extras and the allowance the edit page shows', async () => {
    siteRunPage.mockResolvedValueOnce(
      reply({ status: 'ok', user: 'ian', items: [item('a')], remaining: 97 }),
    );
    expect(await loadEditExtras('1', 'ian')).toEqual({
      kind: 'ok',
      items: [item('a')],
      remaining: 97,
    });
  });

  it('asks for a sign-in when signed out', async () => {
    siteRunPage.mockResolvedValueOnce(reply({ status: 'needs-login' }));
    expect(await loadEditExtras('1', 'ian')).toEqual({ kind: 'needs-login' });
  });

  it("names the other member when the website is signed in as someone else, even though that member's page has no uploader", async () => {
    siteRunPage.mockResolvedValueOnce(
      reply({ status: 'no-uploader', user: 'cyclops', detail: {} }),
    );
    expect(await loadEditExtras('1', 'ian')).toEqual({ kind: 'wrong-account', user: 'cyclops' });
    siteRunPage.mockResolvedValueOnce(reply({ status: 'ok', user: 'other', items: [] }));
    expect(await loadEditExtras('1', 'ian')).toEqual({ kind: 'wrong-account', user: 'other' });
  });

  it('is unavailable without an uploader (not a member) or with no session', async () => {
    siteRunPage.mockResolvedValueOnce(reply({ status: 'no-uploader' }));
    expect(await loadEditExtras('1', 'ian')).toEqual({ kind: 'unavailable' });
    available = false;
    expect(await loadEditExtras('1', 'ian')).toEqual({ kind: 'unavailable' });
  });

  it('says it failed (so the screen can offer to retry) on a throw, a timeout or an odd page', async () => {
    siteRunPage.mockRejectedValueOnce(new Error('boom'));
    expect(await loadEditExtras('1', 'ian')).toEqual({ kind: 'failed' });
    siteRunPage.mockResolvedValueOnce({ finalUrl: '', result: null });
    expect(await loadEditExtras('1', 'ian')).toEqual({ kind: 'failed' });
    siteRunPage.mockResolvedValueOnce(reply({ status: 'unexpected-page' }));
    expect(await loadEditExtras('1', 'ian')).toEqual({ kind: 'failed' });
  });
});
