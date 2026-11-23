// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { beforeEach, describe, expect, it, vi } from 'vitest';

const siteRunPage = vi.fn();
const signOut = vi.fn((_accountId?: string) => Promise.resolve());
let available = true;
vi.mock('../../platform/siteSession.js', () => ({
  siteRunPage: (run: unknown): Promise<unknown> => siteRunPage(run) as Promise<unknown>,
  siteSessionAvailable: () => available,
  siteSignIn: vi.fn(),
  siteSignOut: (id: string) => signOut(id),
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

const acct = { id: 'a1', username: 'ian' };
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
    const out = await addExtras('1', acct, [photo]);
    expect(out).toMatchObject({ kind: 'manual', reason: 'unavailable' });
    expect(siteRunPage).not.toHaveBeenCalled();
  });

  it('asks for sign-in when the edit page sends the member to the sign-in page', async () => {
    siteRunPage.mockResolvedValueOnce(reply({ status: 'needs-login' }));
    expect(await addExtras('1', acct, [photo])).toMatchObject({
      kind: 'manual',
      reason: 'not-signed-in',
    });
  });

  it('stops before sending anything when the site is signed in as someone else', async () => {
    siteRunPage.mockResolvedValueOnce(reply({ status: 'wrong-account', user: 'other' }));
    expect(await addExtras('1', acct, [photo])).toMatchObject({
      kind: 'manual',
      reason: 'wrong-account',
    });
    expect(siteRunPage).toHaveBeenCalledTimes(1);
  });

  it('says wrong account, not no membership, when the other members page has no uploader', async () => {
    siteRunPage.mockResolvedValueOnce(reply({ status: 'wrong-account', user: 'cyclops' }));
    expect(await addExtras('1', acct, [photo])).toMatchObject({
      kind: 'manual',
      reason: 'wrong-account',
    });
  });

  it('reports no membership when the page has no uploader', async () => {
    siteRunPage.mockResolvedValueOnce(reply({ status: 'no-uploader' }));
    expect(await addExtras('1', acct, [photo])).toMatchObject({ reason: 'no-membership' });
  });

  it('is done when the read-back shows every photo kept', async () => {
    siteRunPage
      .mockResolvedValueOnce(reply({ status: 'ok', user: 'Ian', items: [item('a')] }))
      .mockResolvedValueOnce(reply({ status: 'submitted', user: 'Ian', remainingBefore: 99 }))
      .mockResolvedValueOnce(
        reply({ status: 'ok', user: 'Ian', items: [item('a'), item('b'), item('c')] }),
      );
    expect(await addExtras('1', acct, [photo, photo])).toEqual({
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
    expect(await addExtras('1', acct, [photo, photo])).toMatchObject({
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
    expect(await addExtras('1', acct, [photo])).toMatchObject({
      kind: 'manual',
      reason: 'not-kept',
    });
  });

  it('turns a throw into the manual screen, with the edit page address', async () => {
    siteRunPage.mockRejectedValueOnce(new Error('boom'));
    expect(await addExtras('42', acct, [photo])).toEqual({
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
    expect(await currentSiteUser(acct)).toBeNull();
    siteRunPage.mockResolvedValueOnce(reply({ status: 'ok', user: 'ian' }));
    expect(await currentSiteUser(acct)).toBe('ian');
  });

  it('compares names without case, and never accepts a session that names no one', () => {
    expect(isSameMember('Ian', 'ian')).toBe(true);
    expect(isSameMember('', 'ian')).toBe(false);
    expect(isSameMember(undefined, 'ian')).toBe(false);
    expect(isSameMember(null, 'ian')).toBe(false);
    expect(isSameMember('x', 'ian')).toBe(false);
  });
});

describe('forgetSiteSession', () => {
  it('deletes that account session, without asking the website anything', async () => {
    await forgetSiteSession(acct);
    expect(signOut).toHaveBeenCalledWith('a1');
    expect(siteRunPage).not.toHaveBeenCalled();
  });

  it('does nothing where there is no website session, and never throws', async () => {
    available = false;
    await forgetSiteSession(acct);
    expect(signOut).not.toHaveBeenCalled();
    available = true;
    signOut.mockRejectedValueOnce(new Error('boom'));
    await expect(forgetSiteSession(acct)).resolves.toBeUndefined();
  });
});

describe('readExtrasRemaining', () => {
  it('returns the allowance the website shows', async () => {
    siteRunPage.mockResolvedValueOnce(reply({ status: 'ok', remaining: 98 }));
    expect(await readExtrasRemaining(acct)).toBe(98);
    expect(siteRunPage.mock.calls[0]?.[0]).toMatchObject({
      url: 'https://www.blipfoto.com/publish',
    });
  });

  it('is null when it cannot be read: signed out, no uploader, a throw, no session', async () => {
    siteRunPage.mockResolvedValueOnce(reply({ status: 'needs-login' }));
    expect(await readExtrasRemaining(acct)).toBeNull();
    siteRunPage.mockResolvedValueOnce(reply({ status: 'no-uploader' }));
    expect(await readExtrasRemaining(acct)).toBeNull();
    siteRunPage.mockRejectedValueOnce(new Error('boom'));
    expect(await readExtrasRemaining(acct)).toBeNull();
    available = false;
    expect(await readExtrasRemaining(acct)).toBeNull();
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
    expect(await applyExtras('1', acct, [], ['a'])).toEqual({
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
    expect(await applyExtras('1', acct, [photo], ['a'])).toMatchObject({
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
    expect(await applyExtras('1', acct, [], ['gone'])).toMatchObject({ kind: 'done', removed: 1 });
    const run = siteRunPage.mock.calls[1]?.[0] as { script: string };
    expect(run.script).toContain('var REMOVE = [];');
  });
});

describe('loadEditExtras', () => {
  it('returns the extras and the allowance the edit page shows', async () => {
    siteRunPage.mockResolvedValueOnce(
      reply({ status: 'ok', user: 'ian', items: [item('a')], remaining: 97 }),
    );
    expect(await loadEditExtras('1', acct)).toEqual({
      kind: 'ok',
      items: [item('a')],
      remaining: 97,
    });
  });

  it('asks for a sign-in when signed out', async () => {
    siteRunPage.mockResolvedValueOnce(reply({ status: 'needs-login' }));
    expect(await loadEditExtras('1', acct)).toEqual({ kind: 'needs-login' });
  });

  it('names the other member when the website is signed in as someone else', async () => {
    siteRunPage.mockResolvedValueOnce(reply({ status: 'wrong-account', user: 'cyclops' }));
    expect(await loadEditExtras('1', acct)).toEqual({ kind: 'wrong-account', user: 'cyclops' });
  });

  it('is unavailable without an uploader (not a member) or with no session', async () => {
    siteRunPage.mockResolvedValueOnce(reply({ status: 'no-uploader' }));
    expect(await loadEditExtras('1', acct)).toEqual({ kind: 'unavailable' });
    available = false;
    expect(await loadEditExtras('1', acct)).toEqual({ kind: 'unavailable' });
  });

  it('says it failed (so the screen can offer to retry) on a throw, a timeout or an odd page', async () => {
    siteRunPage.mockRejectedValueOnce(new Error('boom'));
    expect(await loadEditExtras('1', acct)).toEqual({ kind: 'failed' });
    siteRunPage.mockResolvedValueOnce({ finalUrl: '', result: null });
    expect(await loadEditExtras('1', acct)).toEqual({ kind: 'failed' });
    siteRunPage.mockResolvedValueOnce(reply({ status: 'unexpected-page' }));
    expect(await loadEditExtras('1', acct)).toEqual({ kind: 'failed' });
  });
});

describe('every website run is for one account and names the member it expects', () => {
  it('passes the account id and puts the expected member in the script', async () => {
    siteRunPage.mockResolvedValue(reply({ status: 'ok', user: 'ian', items: [], remaining: 5 }));
    await loadEditExtras('1', acct);
    await readExtrasRemaining(acct);
    for (const call of siteRunPage.mock.calls) {
      const run = call[0] as { accountId: string; script: string };
      expect(run.accountId).toBe('a1');
      expect(run.script).toContain('"ian"');
    }
  });
});
