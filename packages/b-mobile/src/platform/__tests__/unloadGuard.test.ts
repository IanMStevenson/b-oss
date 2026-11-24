// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
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
