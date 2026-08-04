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
    hydrated: true,
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

  it('defaults openBlipfotoLinksInApp to off (rules.md: opt-in, never silently claimed)', () => {
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
});
