// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// b-oss#417: shareLink() hands the link to the system share sheet on native, falls back to the
// Web Share API in a browser, and treats the user dismissing the sheet as a non-event.

import { afterEach, describe, expect, it, vi } from 'vitest';

let isNative = true;
const share = vi.fn<(o: unknown) => Promise<unknown>>();

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => isNative } }));
const desktopBridge = vi.fn<() => unknown>(() => undefined);
const copyErrorDetails = vi.fn<(t: string) => Promise<void>>();
vi.mock('../desktop.js', () => ({ desktopBridge: () => desktopBridge() }));
vi.mock('../diagnostics.js', () => ({ copyErrorDetails: (t: string) => copyErrorDetails(t) }));
vi.mock('@capacitor/share', () => ({ Share: { share: (o: unknown) => share(o) } }));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  isNative = true;
  desktopBridge.mockReturnValue(undefined);
});

describe('shareLink', () => {
  it('passes the options straight to the native share sheet', async () => {
    share.mockResolvedValue({});
    const { shareLink } = await import('../share.js');
    const options = { url: 'https://www.blipfoto.com/alice', text: 'x', dialogTitle: 'Share' };
    await shareLink(options);
    expect(share).toHaveBeenCalledWith(options);
  });

  it('swallows the user closing the sheet', async () => {
    share.mockRejectedValue(new Error('Share canceled'));
    const { shareLink } = await import('../share.js');
    await expect(shareLink({ url: 'u' })).resolves.toBe('shared');
  });

  it('rethrows any other failure', async () => {
    share.mockRejectedValue(new Error('no activity found'));
    const { shareLink } = await import('../share.js');
    await expect(shareLink({ url: 'u' })).rejects.toThrow('no activity found');
  });

  it('off native, uses navigator.share when the browser has it', async () => {
    isNative = false;
    const webShare = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share: webShare });
    const { shareLink } = await import('../share.js');
    await shareLink({ url: 'u', text: 't' });
    expect(webShare).toHaveBeenCalledWith({ url: 'u', text: 't', title: undefined });
    expect(share).not.toHaveBeenCalled();
  });

  it('off native with no Web Share API and no desktop shell, does nothing', async () => {
    isNative = false;
    vi.stubGlobal('navigator', {});
    const { shareLink } = await import('../share.js');
    await expect(shareLink({ url: 'u' })).resolves.toBe('shared');
    expect(share).not.toHaveBeenCalled();
    expect(copyErrorDetails).not.toHaveBeenCalled();
  });

  it('in the desktop shell with no Web Share API, copies the link', async () => {
    isNative = false;
    vi.stubGlobal('navigator', {});
    desktopBridge.mockReturnValue({});
    copyErrorDetails.mockResolvedValue(undefined);
    const { shareLink } = await import('../share.js');
    await expect(shareLink({ url: 'https://www.blipfoto.com/entry/1' })).resolves.toBe('copied');
    expect(copyErrorDetails).toHaveBeenCalledWith('https://www.blipfoto.com/entry/1');
  });
});
