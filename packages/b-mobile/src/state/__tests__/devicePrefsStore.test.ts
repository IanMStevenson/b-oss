// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Phase 8's three new devicePrefsStore fields (SCR-25 Misc/Notifications, SCR-29's link-handling
// toggle). Existing fields (confirmAccountBeforeReaction, reminders) already have coverage via
// flows/reminderFlow.test.ts and useAccountConfirmGate's own consumers.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDevicePrefsStore } from '../devicePrefsStore.js';

vi.mock('../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  useDevicePrefsStore.setState({
    confirmAccountBeforeReaction: false,
    reminders: {},
    uploadFullSize: true,
    openBlipfotoLinksInApp: false,
    notificationPollingIntervalMinutes: 5,
    seenFirstRunExplainer: false,
    hydrated: true,
  });
});

describe('devicePrefsStore — shipped defaults', () => {
  it('starts with no thumbnail margins and the account confirm on', async () => {
    vi.resetModules();
    const { useDevicePrefsStore: fresh } = await import('../devicePrefsStore.js');
    expect(fresh.getState().thumbnailMargins).toBe('none');
    expect(fresh.getState().confirmAccountBeforeReaction).toBe(true);
  });
});

describe('devicePrefsStore — Phase 8 fields', () => {
  it('defaults uploadFullSize to true (current behaviour: nothing downscales)', () => {
    expect(useDevicePrefsStore.getState().uploadFullSize).toBe(true);
  });

  it('setUploadFullSize toggles and persists it', () => {
    useDevicePrefsStore.getState().setUploadFullSize(false);
    expect(useDevicePrefsStore.getState().uploadFullSize).toBe(false);
  });

  it('defaults openBlipfotoLinksInApp to off (BEHAVIOUR.md: opt-in, never silently claimed)', () => {
    expect(useDevicePrefsStore.getState().openBlipfotoLinksInApp).toBe(false);
  });

  it('setOpenBlipfotoLinksInApp toggles it', () => {
    useDevicePrefsStore.getState().setOpenBlipfotoLinksInApp(true);
    expect(useDevicePrefsStore.getState().openBlipfotoLinksInApp).toBe(true);
  });

  it('defaults notificationPollingIntervalMinutes to the 5-minute floor', () => {
    expect(useDevicePrefsStore.getState().notificationPollingIntervalMinutes).toBe(5);
  });

  it('setNotificationPollingIntervalMinutes accepts a value above the floor', () => {
    useDevicePrefsStore.getState().setNotificationPollingIntervalMinutes(15);
    expect(useDevicePrefsStore.getState().notificationPollingIntervalMinutes).toBe(15);
  });

  it('setNotificationPollingIntervalMinutes clamps below the floor up to 5', () => {
    useDevicePrefsStore.getState().setNotificationPollingIntervalMinutes(1);
    expect(useDevicePrefsStore.getState().notificationPollingIntervalMinutes).toBe(5);
  });

  it('setNotificationPollingIntervalMinutes rounds a fractional value', () => {
    useDevicePrefsStore.getState().setNotificationPollingIntervalMinutes(7.6);
    expect(useDevicePrefsStore.getState().notificationPollingIntervalMinutes).toBe(8);
  });

  it('defaults seenFirstRunExplainer to false (Phase 12.1 — shown once, on first hydrated visit)', () => {
    expect(useDevicePrefsStore.getState().seenFirstRunExplainer).toBe(false);
  });

  it('setSeenFirstRunExplainer marks it seen and persists it', () => {
    useDevicePrefsStore.getState().setSeenFirstRunExplainer(true);
    expect(useDevicePrefsStore.getState().seenFirstRunExplainer).toBe(true);
  });
});

// Override-only persistence and the migration from the original full-object format (b-oss#634).
describe('devicePrefsStore — override-only persistence', () => {
  async function fresh(stored: string | null) {
    vi.resetModules();
    const prefs = await import('../../platform/prefs.js');
    vi.mocked(prefs.getPref).mockResolvedValue(stored);
    vi.mocked(prefs.setPref).mockClear();
    const { useDevicePrefsStore: store } = await import('../devicePrefsStore.js');
    return { store, setPref: vi.mocked(prefs.setPref) };
  }
  const lastSaved = (setPref: { mock: { calls: unknown[][] } }): unknown =>
    JSON.parse(setPref.mock.calls.at(-1)?.[1] as string);

  it('persists only the key the user changed', async () => {
    const { store, setPref } = await fresh(null);
    await store.getState().hydrate();
    store.getState().setPhotoFit('capped');
    expect(lastSaved(setPref)).toEqual({ schema: 2, overrides: { photoFit: 'capped' } });
    expect(store.getState().photoFit).toBe('capped');
    expect(store.getState().thumbnailMargins).toBe('none');
  });

  it('keeps earlier overrides when another key changes', async () => {
    const { store, setPref } = await fresh(null);
    await store.getState().hydrate();
    store.getState().setPhotoFit('capped');
    store.getState().setReminder('a', { enabled: true, hour: 8, minute: 0 });
    expect(lastSaved(setPref)).toEqual({
      schema: 2,
      overrides: { photoFit: 'capped', reminders: { a: { enabled: true, hour: 8, minute: 0 } } },
    });
  });

  it('migrates a full legacy object to overrides that differ from the handheld defaults', async () => {
    const legacy = {
      confirmAccountBeforeReaction: true,
      reminders: {},
      uploadFullSize: false,
      openBlipfotoLinksInApp: false,
      notificationPollingIntervalMinutes: 5,
      seenFirstRunExplainer: true,
      showZoomBar: true,
      showPagination: true,
      thumbnailMargins: 'none',
      thumbnailZoomPercent: 130,
      photoFit: 'full-width',
      accountAvatarStyle: 'picture',
      theme: 'dark',
    };
    const { store, setPref } = await fresh(JSON.stringify(legacy));
    await store.getState().hydrate();
    const s = store.getState();
    expect(s.uploadFullSize).toBe(false);
    expect(s.seenFirstRunExplainer).toBe(true);
    expect(s.thumbnailZoomPercent).toBe(130);
    expect(s.theme).toBe('dark');
    expect(s.photoFit).toBe('full-width');
    expect(s.overrides).toEqual({
      uploadFullSize: false,
      seenFirstRunExplainer: true,
      thumbnailZoomPercent: 130,
      theme: 'dark',
    });
    // rewritten once in the new format
    expect(lastSaved(setPref)).toEqual({ schema: 2, overrides: s.overrides });
  });

  it('migrates a partial legacy object and fills the rest from the profile', async () => {
    const { store } = await fresh(JSON.stringify({ photoFit: 'capped' }));
    await store.getState().hydrate();
    expect(store.getState().photoFit).toBe('capped');
    expect(store.getState().showZoomBar).toBe(true);
  });

  it('drops legacy keys it does not know and an invalid theme', async () => {
    const { store } = await fresh(JSON.stringify({ theme: 'purple', bogus: 1 }));
    await store.getState().hydrate();
    expect(store.getState().theme).toBe('system');
    expect(store.getState().overrides).toEqual({});
  });

  it('reads the new format as-is, without rewriting it', async () => {
    const { store, setPref } = await fresh(
      JSON.stringify({ schema: 2, overrides: { thumbnailMargins: 'normal' } }),
    );
    await store.getState().hydrate();
    expect(store.getState().thumbnailMargins).toBe('normal');
    expect(setPref).not.toHaveBeenCalled();
  });

  it('falls back to defaults for corrupt or empty storage', async () => {
    for (const stored of ['{not json', '42', 'null', '[]', null]) {
      const { store, setPref } = await fresh(stored);
      await store.getState().hydrate();
      expect(store.getState().hydrated).toBe(true);
      expect(store.getState().thumbnailMargins).toBe('none');
      expect(store.getState().overrides).toEqual({});
      expect(setPref).not.toHaveBeenCalled();
    }
  });
});
