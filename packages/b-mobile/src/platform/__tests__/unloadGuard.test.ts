// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { installUnloadGuard } from '../unloadGuard.js';
import { useComposeDraftStore } from '../../state/composeDraftStore.js';
import type { ComposeDraft } from '../../state/composeDraftStore.js';

const DRAFT: ComposeDraft = {
  mode: 'publish',
  accountId: 'a1',
  photo: null,
  title: '',
  tags: '',
  description: '',
  date: '2026-01-01',
  location: null,
  displayLocation: false,
  thumbnailCrop: null,
  dirty: false,
};

/** Fires beforeunload the way a closing or reloading page does; true when the page objected. */
function tryUnload(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

let off: (() => void) | undefined;
afterEach(() => {
  off?.();
  delete (window as unknown as Record<string, unknown>).bMobileDesktop;
  useComposeDraftStore.setState({ draft: null });
});

describe('unload guard (b-oss#1059)', () => {
  it('lets the page go when there is no draft or it is clean', () => {
    off = installUnloadGuard();
    expect(tryUnload()).toBe(false);
    useComposeDraftStore.setState({ draft: DRAFT });
    expect(tryUnload()).toBe(false);
  });

  it('objects while the draft has unsaved changes, and stops once it is gone', () => {
    off = installUnloadGuard();
    useComposeDraftStore.setState({ draft: { ...DRAFT, dirty: true } });
    expect(tryUnload()).toBe(true);
    useComposeDraftStore.getState().clearDraft();
    expect(tryUnload()).toBe(false);
  });

  it('objects at once when installed with a draft already dirty; uninstalling removes it', () => {
    useComposeDraftStore.setState({ draft: { ...DRAFT, dirty: true } });
    off = installUnloadGuard();
    expect(tryUnload()).toBe(true);
    off();
    expect(tryUnload()).toBe(false);
  });
});

describe('the desktop shell is told the flag (b-oss#1059)', () => {
  it('reports unsaved changes as they start and stop, and does nothing on a shell without the member', () => {
    const set = vi.fn(() => Promise.resolve());
    (window as unknown as Record<string, unknown>).bMobileDesktop = {
      version: 1,
      unsaved: { set },
    };
    off = installUnloadGuard();
    expect(set).not.toHaveBeenCalled(); // nothing unsaved at start
    useComposeDraftStore.setState({ draft: { ...DRAFT, dirty: true } });
    expect(set).toHaveBeenLastCalledWith(true);
    useComposeDraftStore.setState({ draft: { ...DRAFT, dirty: true, title: 'x' } });
    expect(set).toHaveBeenCalledTimes(1); // no repeat while it stays dirty
    useComposeDraftStore.getState().clearDraft();
    expect(set).toHaveBeenLastCalledWith(false);

    (window as unknown as Record<string, unknown>).bMobileDesktop = { version: 1 }; // an older shell
    useComposeDraftStore.setState({ draft: { ...DRAFT, dirty: true } });
    expect(set).toHaveBeenCalledTimes(2);
  });
});
