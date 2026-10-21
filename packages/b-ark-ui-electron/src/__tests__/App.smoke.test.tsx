// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// b-oss#330 item 3 — mounts the real desktop shell (App → AppProvider → screens) on a fake
// BackendContext, so a breaking change in the shared b-ark-ui-components kit or the backend
// contract fails here instead of only in the Electron app.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import type {
  AccountConfig,
  AppStore,
  BackendContext,
  BootState,
  MainEvent,
} from '@b-oss/b-ark-ui-components';
import App from '../App.js';

afterEach(cleanup);

function account(overrides: Partial<AccountConfig> = {}): AccountConfig {
  return {
    id: 'acc1',
    username: 'smokeuser',
    journal_title: 'Smoke Journal',
    avatar_url: '',
    access_token: '',
    backup_folder: '/backups',
    schedule: { enabled: false, next_run: '', hour: 3, interval: 'daily' },
    gap_check_days: 30,
    redo_count: 0,
    api_delay_ms: 500,
    last_backup_at: null,
    total_archived: 0,
    journal_entry_total: 0,
    rag_state: 'green',
    error_message: null,
    account_added_at: null,
    ...overrides,
  };
}

function storeWith(accounts: AccountConfig[]): AppStore {
  return {
    accounts,
    ui: {
      thumbnailSizePercent: 50,
      accountOrder: accounts.map((a) => a.id),
      showInfoOverlay: true,
    },
    app: { startWithWindows: false, autoUpdateEnabled: false },
  };
}

function fakeBackend(boot: BootState) {
  let handler: ((e: MainEvent) => void) | null = null;
  const getBootState = vi.fn<() => Promise<BootState>>().mockResolvedValue(boot);
  const notifyRendererReady = vi.fn<() => void>();
  const backend: BackendContext = {
    appVersion: '0.0.0-test',
    addAccount: vi.fn().mockResolvedValue(undefined),
    addAccountFresh: vi.fn().mockResolvedValue(undefined),
    removeAccount: vi.fn().mockResolvedValue(undefined),
    reauthoriseAccount: vi.fn().mockResolvedValue(undefined),
    reauthoriseAccountFresh: vi.fn().mockResolvedValue(undefined),
    startBackup: vi.fn().mockResolvedValue(undefined),
    cancelBackup: vi.fn().mockResolvedValue(undefined),
    openViewer: vi.fn().mockResolvedValue(undefined),
    getViewerUrl: vi.fn().mockResolvedValue('about:blank'),
    pickFolder: vi.fn().mockResolvedValue(null),
    chooseBackupFolder: vi.fn().mockResolvedValue(null),
    moveBackupFolder: vi.fn().mockResolvedValue(undefined),
    updateSettings: vi.fn().mockResolvedValue(undefined),
    updateAccountSettings: vi.fn().mockResolvedValue(undefined),
    getStore: vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(boot.stage === 'ready' ? boot.store : storeWith([])),
      ),
    getAccountAvatar: vi.fn().mockResolvedValue(null),
    getBootState,
    getLogs: vi.fn().mockResolvedValue([]),
    exportLogsCsv: vi.fn().mockResolvedValue(null),
    subscribe: vi.fn().mockImplementation((h: (e: MainEvent) => void) => {
      handler = h;
      return () => {
        handler = null;
      };
    }),
    notifyRendererReady,
  };
  return { backend, getBootState, notifyRendererReady, emit: (e: MainEvent) => handler?.(e) };
}

describe('desktop shell smoke', () => {
  it('shows the choose-folder screen on first boot, and tells the backend the renderer is ready', async () => {
    const { backend, notifyRendererReady } = fakeBackend({ stage: 'pick-folder' });
    render(<App backend={backend} />);
    expect(await screen.findByText(/b-ark-settings\.json already exists/)).toBeDefined();
    expect(notifyRendererReady).toHaveBeenCalledOnce();
  });

  it('shows the welcome screen when a folder is chosen but no account exists', async () => {
    const { backend } = fakeBackend({ stage: 'first-account' });
    render(<App backend={backend} />);
    expect(await screen.findByText('Welcome to b-ark')).toBeDefined();
  });

  it('renders the account in the sidebar once ready, and reacts to a store:changed event', async () => {
    const { backend, emit } = fakeBackend({
      stage: 'ready',
      store: storeWith([account({ total_archived: 12, journal_entry_total: 12 })]),
    });
    render(<App backend={backend} />);
    expect((await screen.findAllByText('Smoke Journal')).length).toBeGreaterThan(0);

    act(() =>
      emit({
        type: 'store:changed',
        store: storeWith([
          account({ total_archived: 12, journal_entry_total: 12 }),
          account({ id: 'acc2', username: 'second', journal_title: 'Second Journal' }),
        ]),
      }),
    );
    await waitFor(() => expect(screen.getAllByText('Second Journal').length).toBeGreaterThan(0));
  });

  it('stays on the loading spinner (no crash) if the boot state cannot be read', async () => {
    const { backend, getBootState } = fakeBackend({ stage: 'pick-folder' });
    getBootState.mockRejectedValue(new Error('ipc down'));
    render(<App backend={backend} />);
    await waitFor(() => expect(getBootState).toHaveBeenCalled());
    expect(screen.queryByText('Welcome to b-ark')).toBeNull();
  });
});
