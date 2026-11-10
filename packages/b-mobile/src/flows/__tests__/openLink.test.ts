// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../data/users.js', () => ({ fetchAuthorAvatar: vi.fn() }));
vi.mock('../../platform/browser.js', () => ({ openUrl: vi.fn() }));

import { openLink } from '../openLink.js';

function setup(probe: () => Promise<unknown> = () => Promise.resolve(null)) {
  const push = vi.fn();
  const open = vi.fn(() => Promise.resolve());
  const probeProfile = vi.fn(probe);
  return {
    push,
    open,
    probeProfile,
    run: (href: string) => openLink(href, push, { probeProfile, open }),
  };
}

describe('openLink', () => {
  it('routes a blipfoto.com entry link in the app without a probe', async () => {
    const s = setup();
    await s.run('https://www.blipfoto.com/entry/123456');
    expect(s.push).toHaveBeenCalledWith('/entry/123456');
    expect(s.open).not.toHaveBeenCalled();
    expect(s.probeProfile).not.toHaveBeenCalled();
  });

  it('accepts a relative entry path and the bare domain', async () => {
    const s = setup();
    await s.run('/entry/9');
    await s.run('http://blipfoto.com/entry/10');
    expect(s.push).toHaveBeenNthCalledWith(1, '/entry/9');
    expect(s.push).toHaveBeenNthCalledWith(2, '/entry/10');
  });

  it('routes the follow-request path in the app', async () => {
    const s = setup();
    await s.run('https://www.blipfoto.com/me/followers/requests');
    expect(s.push).toHaveBeenCalledWith('/me/requests');
  });

  it('opens a single-segment link as a profile when the user exists', async () => {
    const s = setup();
    await s.run('https://www.blipfoto.com/ian');
    expect(s.probeProfile).toHaveBeenCalledWith('ian');
    expect(s.push).toHaveBeenCalledWith('/user/ian');
    expect(s.open).not.toHaveBeenCalled();
  });

  it('falls back to the browser when the profile lookup fails', async () => {
    const s = setup(() => Promise.reject(new Error('103')));
    await s.run('https://www.blipfoto.com/somepage');
    expect(s.open).toHaveBeenCalledWith('https://www.blipfoto.com/somepage');
    expect(s.push).not.toHaveBeenCalled();
  });

  it('sends reserved/other blipfoto paths and other hosts to the browser', async () => {
    const s = setup();
    await s.run('https://www.blipfoto.com/store/thing');
    await s.run('https://example.com/entry/5');
    await s.run('https://evilblipfoto.com/entry/5');
    await s.run('//blipfoto.com/entry/5');
    await s.run('mailto:a@b.c');
    expect(s.push).not.toHaveBeenCalled();
    expect(s.open).toHaveBeenCalledTimes(5);
    expect(s.probeProfile).not.toHaveBeenCalled();
  });
});
