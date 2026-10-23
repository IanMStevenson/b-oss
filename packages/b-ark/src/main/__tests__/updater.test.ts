// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  autoUpdateEnabled: true,
  autoUpdater: {
    logger: null,
    allowDowngrade: true,
    allowPrerelease: true,
    autoDownload: false,
    autoInstallOnAppQuit: false,
    setFeedURL: vi.fn(),
    checkForUpdatesAndNotify: vi.fn(() => Promise.resolve(null)),
  },
}));
const { autoUpdater } = state;

vi.mock('electron-updater', () => ({ default: { autoUpdater: state.autoUpdater } }));
vi.mock('electron-log', () => ({
  default: { info: vi.fn(), transports: { file: { level: '' } } },
}));
vi.mock('../store.js', () => ({
  store: { get: () => ({ autoUpdateEnabled: state.autoUpdateEnabled }) },
}));

import { setupAutoUpdater, UPDATE_FEED_URL } from '../updater.js';

describe('setupAutoUpdater', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.autoUpdateEnabled = true;
  });

  it('reads updates from the b-ark-latest release, not the repo-wide Latest release', () => {
    setupAutoUpdater();
    expect(autoUpdater.setFeedURL).toHaveBeenCalledWith({
      provider: 'generic',
      url: 'https://github.com/IanMStevenson/b-oss/releases/download/b-ark-latest',
    });
    expect(UPDATE_FEED_URL).toBe(
      'https://github.com/IanMStevenson/b-oss/releases/download/b-ark-latest',
    );
    expect(autoUpdater.checkForUpdatesAndNotify).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the user has turned auto-update off', () => {
    state.autoUpdateEnabled = false;
    setupAutoUpdater();
    expect(autoUpdater.setFeedURL).not.toHaveBeenCalled();
    expect(autoUpdater.checkForUpdatesAndNotify).not.toHaveBeenCalled();
  });
});
