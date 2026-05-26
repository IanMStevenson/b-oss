// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { AppStore, BootState, LogEntry } from '../backend.js';

export interface BackupProgress {
  running: boolean;
  done: number;
  total: number;
  current_date: string;
  rate_limited_seconds: number | null;
  total_archived: number | null;
}

export interface Toast {
  id: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export type BootStage = 'loading' | 'pick-folder' | 'first-account' | 'ready';

export interface AppState {
  bootStage: BootStage;
  store: AppStore | null;
  selectedAccountId: string | null;
  panel: null | 'settings' | 'log';
  selectedEntryId: string | null;
  thumbnailSizePercent: number;
  backupProgress: Record<string, BackupProgress>;
  logBuffer: Record<string, LogEntry[]>;
  justConnected: string | null;
  toasts: Toast[];
}

export type AppAction =
  | { type: 'boot:resolved'; state: BootState }
  | { type: 'store:loaded'; store: AppStore }
  | { type: 'store:changed'; store: AppStore }
  | { type: 'account:select'; id: string }
  | { type: 'panel:open'; panel: 'settings' | 'log' }
  | { type: 'panel:close' }
  | { type: 'entry:select'; entryId: string | null }
  | { type: 'thumbnail:resize'; percent: number }
  | { type: 'backup:started'; account_id: string; total: number }
  | {
      type: 'backup:progress';
      account_id: string;
      done: number;
      total: number;
      current_date: string;
      total_archived: number;
    }
  | { type: 'backup:rate_limited'; account_id: string; seconds: number }
  | { type: 'backup:completed'; account_id: string }
  | { type: 'backup:failed'; account_id: string }
  | { type: 'log:entry'; account_id: string; entry: LogEntry }
  | { type: 'just_connected:clear' }
  | { type: 'toast:show'; toast: Toast }
  | { type: 'toast:dismiss'; id: string };

const LOG_BUFFER_MAX = 500;

export const initialState: AppState = {
  bootStage: 'loading',
  store: null,
  selectedAccountId: null,
  panel: null,
  selectedEntryId: null,
  thumbnailSizePercent: 100,
  backupProgress: {},
  logBuffer: {},
  justConnected: null,
  toasts: [],
};

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'boot:resolved': {
      if (action.state.stage === 'ready') {
        const store = action.state.store;
        const firstId = store.ui.accountOrder[0] ?? store.accounts[0]?.id ?? null;
        return {
          ...state,
          bootStage: 'ready',
          store,
          selectedAccountId: state.selectedAccountId ?? firstId,
          thumbnailSizePercent: store.ui.thumbnailSizePercent,
        };
      }
      return { ...state, bootStage: action.state.stage };
    }

    case 'store:loaded': {
      const firstId = action.store.ui.accountOrder[0] ?? action.store.accounts[0]?.id ?? null;
      return {
        ...state,
        bootStage: 'ready',
        store: action.store,
        selectedAccountId: state.selectedAccountId ?? firstId,
        thumbnailSizePercent: action.store.ui.thumbnailSizePercent,
      };
    }

    case 'store:changed': {
      const newAccountIds = action.store.accounts.map((a) => a.id);
      const prevAccountIds = state.store?.accounts.map((a) => a.id) ?? [];
      const addedId = newAccountIds.find((id) => !prevAccountIds.includes(id)) ?? null;
      // Once a store update flows in (e.g. a folder was just picked and the
      // first account hasn't been added yet), advance bootStage if needed.
      let nextBootStage = state.bootStage;
      if (state.bootStage !== 'ready') {
        if (action.store.accounts.length > 0) nextBootStage = 'ready';
        else if (state.bootStage !== 'first-account' && state.bootStage !== 'pick-folder') {
          nextBootStage = action.store.accounts.length === 0 ? 'first-account' : 'ready';
        }
      }
      return {
        ...state,
        bootStage: nextBootStage,
        store: action.store,
        selectedAccountId: addedId ?? state.selectedAccountId,
        justConnected: addedId ?? state.justConnected,
      };
    }

    case 'account:select':
      return {
        ...state,
        selectedAccountId: action.id,
        panel: null,
        selectedEntryId: null,
      };

    case 'panel:open':
      return { ...state, panel: action.panel };

    case 'panel:close':
      return { ...state, panel: null };

    case 'entry:select':
      return { ...state, selectedEntryId: action.entryId };

    case 'thumbnail:resize':
      return { ...state, thumbnailSizePercent: Math.min(200, Math.max(30, action.percent)) };

    case 'backup:started':
      return {
        ...state,
        backupProgress: {
          ...state.backupProgress,
          [action.account_id]: {
            running: true,
            done: 0,
            total: action.total,
            current_date: '',
            rate_limited_seconds: null,
            total_archived: null,
          },
        },
      };

    case 'backup:progress': {
      const existing = state.backupProgress[action.account_id];
      return {
        ...state,
        backupProgress: {
          ...state.backupProgress,
          [action.account_id]: {
            ...(existing ?? { running: true, rate_limited_seconds: null }),
            running: true,
            done: action.done,
            total: action.total,
            current_date: action.current_date,
            rate_limited_seconds: null,
            total_archived: action.total_archived,
          },
        },
      };
    }

    case 'backup:rate_limited': {
      const existing = state.backupProgress[action.account_id];
      return {
        ...state,
        backupProgress: {
          ...state.backupProgress,
          [action.account_id]: {
            ...(existing ?? {
              running: true,
              done: 0,
              total: 0,
              current_date: '',
              total_archived: null,
            }),
            running: true,
            rate_limited_seconds: action.seconds,
          },
        },
      };
    }

    case 'backup:completed': {
      const next = { ...state.backupProgress };
      delete next[action.account_id];
      return { ...state, backupProgress: next };
    }

    case 'backup:failed': {
      const next = { ...state.backupProgress };
      delete next[action.account_id];
      return { ...state, backupProgress: next };
    }

    case 'log:entry': {
      const current = state.logBuffer[action.account_id] ?? [];
      const updated = [...current, action.entry].slice(-LOG_BUFFER_MAX);
      return {
        ...state,
        logBuffer: { ...state.logBuffer, [action.account_id]: updated },
      };
    }

    case 'just_connected:clear':
      return { ...state, justConnected: null };

    case 'toast:show':
      return { ...state, toasts: [...state.toasts, action.toast] };

    case 'toast:dismiss':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };

    default:
      return state;
  }
}
