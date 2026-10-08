// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// b-oss#330 item 3 — runs the real extension page entry (src/backup-page.tsx) with BrowserBackend
// swapped for a fake, so the shell wiring (feature detection, #root mount, BackupPage from
// b-ark-ui-chrome and the shared kit) is exercised without chrome.* or the File System Access API.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, cleanup, waitFor, act } from '@testing-library/react';
import type { Root } from 'react-dom/client';
import type { BackendContext, BootState } from '@b-oss/b-ark-ui-components';

const chooseBackupFolder = vi.fn().mockResolvedValue(null);
let boot: BootState = { stage: 'pick-folder' };
let constructed = 0;
const roots: Root[] = [];

// backup-page.tsx creates its React root at import time and never exposes it; record it so each
// test can unmount, otherwise queued renders outlive the jsdom environment.
vi.mock('react-dom/client', async () => {
  const actual = await vi.importActual<typeof import('react-dom/client')>('react-dom/client');
  return {
    ...actual,
    createRoot: (...args: Parameters<typeof actual.createRoot>) => {
      const root = actual.createRoot(...args);
      roots.push(root);
      return root;
    },
  };
});

vi.mock('@b-oss/b-ark-ui-chrome', async () => {
  const actual =
    await vi.importActual<typeof import('@b-oss/b-ark-ui-chrome')>('@b-oss/b-ark-ui-chrome');
  class FakeBackend implements Partial<BackendContext> {
    appVersion = '0.0.0-test';
    constructor() {
      constructed++;
    }
    chooseBackupFolder = chooseBackupFolder;
    getBootState = () => Promise.resolve(boot);
    getStore = () => Promise.reject(new Error('not used before ready'));
    getLogs = () => Promise.resolve([]);
    getAccountAvatar = () => Promise.resolve(null);
    subscribe = () => () => {};
    notifyRendererReady = () => {};
  }
  return { ...actual, BrowserBackend: FakeBackend };
});

/** Just the chrome.* surface BackupPage touches on mount: storage.local + onChanged, tabs.getCurrent. */
function stubChrome(): void {
  const storage = {
    local: {
      get: (_key: unknown, cb?: (r: Record<string, unknown>) => void) => {
        if (cb) cb({});
        return Promise.resolve({});
      },
      set: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    },
    onChanged: { addListener: () => {}, removeListener: () => {} },
  };
  vi.stubGlobal('chrome', {
    storage,
    tabs: { getCurrent: () => Promise.resolve({ id: 1 }) },
    runtime: { sendMessage: () => Promise.resolve(), onMessage: storage.onChanged },
  });
}

beforeEach(() => {
  stubChrome();
  vi.resetModules();
  constructed = 0;
  document.body.innerHTML = '<div id="root"></div>';
});
afterEach(() => {
  act(() => roots.splice(0).forEach((r) => r.unmount()));
  vi.unstubAllGlobals();
  cleanup();
  document.body.innerHTML = '';
  delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  boot = { stage: 'pick-folder' };
});

describe('b-ark-chrome backup page shell', () => {
  it('mounts BackupPage on the fake backend and shows the folder step', async () => {
    (window as unknown as { showDirectoryPicker: () => void }).showDirectoryPicker = () => {};
    await import('../backup-page.js');

    expect(await screen.findByText('Choose backup folder')).toBeDefined();
    expect(constructed).toBe(1);
    screen.getByText('Choose backup folder').click();
    await waitFor(() => expect(chooseBackupFolder).toHaveBeenCalledOnce());
  });

  it('shows the sign-in step once a folder is chosen but no account is connected', async () => {
    boot = { stage: 'first-account' };
    (window as unknown as { showDirectoryPicker: () => void }).showDirectoryPicker = () => {};
    await import('../backup-page.js');

    expect(await screen.findByText('Sign in to Blipfoto')).toBeDefined();
  });

  it('shows the unsupported-browser message, and never builds the backend, without the File System Access API', async () => {
    await import('../backup-page.js');

    expect(await screen.findByText(/This browser isn.t supported/)).toBeDefined();
    expect(constructed).toBe(0);
    expect(screen.queryByText('Choose backup folder')).toBeNull();
  });

  it('throws a clear error if the page has no #root element', async () => {
    document.body.innerHTML = '';
    await expect(import('../backup-page.js')).rejects.toThrow('#root element not found');
  });
});
