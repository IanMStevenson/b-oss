// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Chrome backup page: self-contained React shell + inline state management.
// AppProvider + reducer are Chrome-specific (no electron deps).

import {
  Component,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import type { Dispatch, ErrorInfo, ReactNode } from 'react';
import { Loader2, Settings, FileText, FolderOpen } from 'lucide-react';
import type {
  AccountConfig,
  AppStore,
  BackendContext,
  BackupPhase,
  BackupProgress,
  BootState,
  LogEntry,
  Toast,
} from '@b-oss/b-ark-ui-components';
import {
  Avatar,
  AuthErrorBanner,
  BackupBanner,
  InfoBadge,
  StatusBar,
  ToastHost,
} from '@b-oss/b-ark-ui-components';
import { ThumbnailGrid, EntryDetail } from '@b-oss/b-view';
import type { BlipEntry } from '@b-oss/b-view';
import { loadHandle, queryFsaPermission, requestFsaPermission } from './fsa-persistence.js';
import { clearError } from './status-storage.js';
import { useFsaJournal, useFsaAssets, useFsaEntry, readFileText } from './useFsaJournal.js';
import { SettingsOverlay } from './SettingsOverlay.js';
import { LogOverlay } from './LogOverlay.js';

// ── Types ─────────────────────────────────────────────────────────────────────

type BootStage = 'loading' | 'pick-folder' | 'first-account' | 'ready';

interface AppState {
  bootStage: BootStage;
  store: AppStore | null;
  panel: null | 'settings' | 'log';
  selectedEntryId: string | null;
  thumbnailSizePercent: number;
  showInfoOverlay: boolean;
  backupProgress: Record<string, BackupProgress>;
  logBuffer: Record<string, LogEntry[]>;
  toasts: Toast[];
}

type AppAction =
  | { type: 'boot:resolved'; state: BootState }
  | { type: 'store:changed'; store: AppStore }
  | { type: 'panel:open'; panel: 'settings' | 'log' }
  | { type: 'panel:close' }
  | { type: 'entry:select'; entryId: string | null }
  | { type: 'thumbnail:resize'; percent: number }
  | { type: 'ui:set-overlay'; showOverlay: boolean }
  | { type: 'backup:started'; account_id: string; total: number; kind: 'first' | 'routine' }
  | {
      type: 'backup:progress';
      account_id: string;
      done: number;
      total: number;
      current_date: string;
      total_archived: number;
      phase?: BackupPhase;
    }
  | { type: 'backup:rate_limited'; account_id: string; seconds: number }
  | { type: 'backup:completed'; account_id: string }
  | { type: 'backup:failed'; account_id: string }
  | { type: 'backup:cancelled'; account_id: string }
  | { type: 'log:entry'; account_id: string; entry: LogEntry }
  | { type: 'toast:show'; toast: Toast }
  | { type: 'toast:dismiss'; id: string };

// ── Reducer ───────────────────────────────────────────────────────────────────

const LOG_BUFFER_MAX = 500;

const initialState: AppState = {
  bootStage: 'loading',
  store: null,
  panel: null,
  selectedEntryId: null,
  thumbnailSizePercent: 100,
  showInfoOverlay: true,
  backupProgress: {},
  logBuffer: {},
  toasts: [],
};

function stageFromStore(store: AppStore): BootStage {
  const hasAccount = store.accounts.length > 0;
  const hasFolder = hasAccount && (store.accounts[0]?.backup_folder ?? '') !== '';
  if (!hasAccount) return 'first-account';
  if (!hasFolder) return 'pick-folder';
  return 'ready';
}

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'boot:resolved': {
      if (action.state.stage === 'ready') {
        const store = action.state.store;
        return {
          ...state,
          bootStage: 'ready',
          store,
          thumbnailSizePercent: store.ui.thumbnailSizePercent,
          showInfoOverlay: store.ui.showInfoOverlay,
        };
      }
      return { ...state, bootStage: action.state.stage };
    }

    case 'store:changed': {
      return {
        ...state,
        bootStage: stageFromStore(action.store),
        store: action.store,
        thumbnailSizePercent: action.store.ui.thumbnailSizePercent,
        showInfoOverlay: action.store.ui.showInfoOverlay,
      };
    }

    case 'panel:open':
      return { ...state, panel: action.panel };
    case 'panel:close':
      return { ...state, panel: null };
    case 'entry:select':
      return { ...state, selectedEntryId: action.entryId };
    case 'thumbnail:resize':
      return { ...state, thumbnailSizePercent: Math.min(200, Math.max(30, action.percent)) };
    case 'ui:set-overlay':
      return { ...state, showInfoOverlay: action.showOverlay };

    case 'backup:started':
      return {
        ...state,
        backupProgress: {
          ...state.backupProgress,
          [action.account_id]: {
            running: true,
            kind: action.kind,
            phase: null,
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
            ...(existing ?? { running: true, kind: null, rate_limited_seconds: null }),
            running: true,
            phase: action.phase ?? null,
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
              kind: null,
              phase: null,
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

    case 'backup:cancelled': {
      const next = { ...state.backupProgress };
      delete next[action.account_id];
      return { ...state, backupProgress: next };
    }

    case 'log:entry': {
      const current = state.logBuffer[action.account_id] ?? [];
      return {
        ...state,
        logBuffer: {
          ...state.logBuffer,
          [action.account_id]: [...current, action.entry].slice(-LOG_BUFFER_MAX),
        },
      };
    }

    case 'toast:show':
      return { ...state, toasts: [...state.toasts, action.toast] };
    case 'toast:dismiss':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };

    default:
      return state;
  }
}

// ── Error boundary ────────────────────────────────────────────────────────────

class RenderErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[b-ark] BackupPage render error:', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: '#b03030', fontSize: 13, fontFamily: 'monospace' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>b-ark-chrome failed to load</div>
          <div>{this.state.error.message}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Chrome app context ────────────────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  dispatch: Dispatch<AppAction>;
  backend: BackendContext;
}

const AppContext = createContext<AppContextValue>(null!);

function useApp(): AppContextValue {
  return useContext(AppContext);
}

function AppProvider({ backend, children }: { backend: BackendContext; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    backend
      .getBootState()
      .then((bs) => dispatch({ type: 'boot:resolved', state: bs }))
      .catch(() => {});

    backend.notifyRendererReady();

    const unsub = backend.subscribe((event) => {
      if (event.type === 'store:changed') {
        dispatch({ type: 'store:changed', store: event.store });
      }
      if (event.type === 'backup:event') {
        const e = event.event;
        if (e.type === 'started') {
          dispatch({
            type: 'backup:started',
            account_id: e.account_id,
            total: e.total_to_fetch,
            kind: e.kind,
          });
        }
        if (e.type === 'progress') {
          dispatch({
            type: 'backup:progress',
            account_id: e.account_id,
            done: e.done,
            total: e.total,
            current_date: e.current_date,
            total_archived: e.total_archived,
            phase: e.phase,
          });
        }
        if (e.type === 'rate_limited') {
          dispatch({
            type: 'backup:rate_limited',
            account_id: e.account_id,
            seconds: e.resume_in_seconds,
          });
        }
        if (e.type === 'completed') {
          dispatch({ type: 'backup:completed', account_id: e.account_id });
        }
        if (e.type === 'failed') {
          dispatch({ type: 'backup:failed', account_id: e.account_id });
        }
        if (e.type === 'cancelled') {
          dispatch({ type: 'backup:cancelled', account_id: e.account_id });
        }
      }
      if (event.type === 'log:entry') {
        dispatch({ type: 'log:entry', account_id: event.account_id, entry: event.entry });
      }
      if (event.type === 'toast') {
        dispatch({ type: 'toast:show', toast: event.toast });
      }
    });

    return unsub;
  }, [backend]);

  return <AppContext.Provider value={{ state, dispatch, backend }}>{children}</AppContext.Provider>;
}

// ── Green product header ──────────────────────────────────────────────────────

function ProductHeader({ appVersion }: { appVersion: string }) {
  return (
    <div
      style={{
        height: 48,
        background: 'var(--green-800)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 17, fontWeight: 700, color: 'white', letterSpacing: '-0.01em' }}>
        b-ark-chrome
      </span>
      <InfoBadge appVersion={appVersion} productName="b-ark-chrome" />
    </div>
  );
}

// ── BackupPageRoot ────────────────────────────────────────────────────────────

function BackupPageRoot() {
  const { state, dispatch, backend } = useApp();
  const {
    bootStage,
    store,
    panel,
    selectedEntryId,
    thumbnailSizePercent,
    showInfoOverlay,
    backupProgress,
    logBuffer,
    toasts,
  } = state;

  const account: AccountConfig | null = store?.accounts[0] ?? null;

  // Load FSA handle when ready (or when folder changes)
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);

  useEffect(() => {
    if (bootStage !== 'ready') {
      setDirHandle(null);
      return;
    }
    loadHandle()
      .then(setDirHandle)
      .catch(() => setDirHandle(null));
  }, [bootStage, account?.backup_folder]);

  // Increment nonce when backup completes to trigger journal re-read
  const [refreshNonce, setRefreshNonce] = useState(0);
  const lastBackupAtRef = useRef<string | null>(null);
  useEffect(() => {
    if (!account?.last_backup_at) return;
    if (account.last_backup_at !== lastBackupAtRef.current) {
      lastBackupAtRef.current = account.last_backup_at;
      setRefreshNonce((n) => n + 1);
    }
  }, [account?.last_backup_at]);

  const journalState = useFsaJournal(dirHandle, account?.username ?? null, refreshNonce);
  const entries = journalState.status === 'loaded' ? journalState.data.entries : [];

  const resolveEntry = useCallback(
    async (jsonPath: string): Promise<BlipEntry> => {
      if (!dirHandle || !account) throw new Error('No FSA handle');
      const text = await readFileText(dirHandle, `${account.username}/${jsonPath}`);
      return JSON.parse(text) as BlipEntry;
    },
    [dirHandle, account],
  );

  const { resolveAsset } = useFsaAssets(dirHandle, account?.username ?? null);

  // Folder access can lapse (permission resets to "prompt" on browser restart, or the
  // user revokes it). Detect it proactively so we can offer a one-click re-grant — without
  // it, journal/thumbnail reads fail silently and b-view renders nothing.
  const [folderPerm, setFolderPerm] = useState<PermissionState | null>(null);
  useEffect(() => {
    if (!dirHandle) {
      setFolderPerm(null);
      return;
    }
    let cancelled = false;
    queryFsaPermission(dirHandle).then(
      (p) => {
        if (!cancelled) setFolderPerm(p);
      },
      () => {
        if (!cancelled) setFolderPerm(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [dirHandle, refreshNonce]);

  const handleRegrantFolder = useCallback(async () => {
    const handle = dirHandle ?? (await loadHandle());
    if (!handle) return;
    const perm = await requestFsaPermission(handle);
    setFolderPerm(perm);
    if (perm === 'granted') {
      await clearError();
      setRefreshNonce((n) => n + 1); // re-read journal + thumbnails now that we can read
    }
  }, [dirHandle]);

  // Selected entry → detail view (mirrors b-view FolderApp). Index is descending
  // (newest first), so prev = older = idx+1, next = newer = idx-1.
  const selectedIndex = entries.findIndex((e) => e.entry_id === selectedEntryId);
  const prevEntryId =
    selectedIndex >= 0 && selectedIndex < entries.length - 1
      ? entries[selectedIndex + 1].entry_id
      : null;
  const nextEntryId = selectedIndex > 0 ? entries[selectedIndex - 1].entry_id : null;
  const selectedJsonPath = selectedIndex >= 0 ? entries[selectedIndex].json_path : null;
  const selectedEntryState = useFsaEntry(dirHandle, account?.username ?? null, selectedJsonPath);

  // The backup engine caches the avatar to `{username}/avatar.jpg`; read it from the
  // FSA folder (same mechanism as thumbnails) rather than hitting the network.
  const loadAvatar = useCallback(
    () => (dirHandle && account ? resolveAsset('avatar.jpg') : Promise.resolve(null)),
    [resolveAsset, dirHandle, account],
  );

  const progress: BackupProgress | undefined = account ? backupProgress[account.id] : undefined;
  const isBackingUp = progress !== undefined;

  // Track chip_error_kind so we can show the right action on the error banner.
  type ChipErrorKind = 'permission' | 'auth' | 'error' | null;
  const [chipErrorKind, setChipErrorKind] = useState<ChipErrorKind>(null);
  useEffect(() => {
    chrome.storage.local.get('chip_error_kind', (r) => {
      setChipErrorKind((r['chip_error_kind'] as ChipErrorKind) ?? null);
    });
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ): void => {
      if (area === 'local' && 'chip_error_kind' in changes) {
        setChipErrorKind((changes['chip_error_kind']?.newValue as ChipErrorKind) ?? null);
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  // ── Loading ─────────────────────────────────────────────────────────────
  if (bootStage === 'loading') {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
        }}
      >
        <Loader2
          size={32}
          strokeWidth={1.6}
          style={{ animation: 'spin 1s linear infinite', color: 'var(--muted-2)' }}
        />
      </div>
    );
  }

  // ── First account ────────────────────────────────────────────────────────
  if (bootStage === 'first-account') {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 20,
          padding: 32,
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--green-900)' }}>b-ark-chrome</div>
        <div style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 320, textAlign: 'center' }}>
          Back up your Blipfoto journal automatically from your browser.
        </div>
        <button
          onClick={() => {
            void backend.addAccount();
          }}
          style={{
            height: 40,
            padding: '0 28px',
            borderRadius: 8,
            background: 'var(--green-800)',
            color: 'white',
            fontSize: 14,
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Sign in to Blipfoto
        </button>
      </div>
    );
  }

  // ── Pick folder ──────────────────────────────────────────────────────────
  if (bootStage === 'pick-folder') {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 20,
          padding: 32,
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--green-900)' }}>b-ark-chrome</div>
        <div style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 320, textAlign: 'center' }}>
          Choose a folder on your computer where your journal backups will be saved.
        </div>
        <button
          onClick={() => {
            void (async () => {
              const result = await backend.chooseBackupFolder();
              if (result?.existingSettings) {
                dispatch({
                  type: 'toast:show',
                  toast: {
                    id: 'b-ark-conflict',
                    level: 'warn',
                    message:
                      'This folder is already used by b-ark (desktop). Running both at the same time may corrupt your backup — use a different folder, or only keep one active.',
                  },
                });
              }
            })();
          }}
          style={{
            height: 40,
            padding: '0 24px',
            borderRadius: 8,
            background: 'var(--green-800)',
            color: 'white',
            fontSize: 14,
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <FolderOpen size={16} strokeWidth={2} />
          Choose backup folder
        </button>
      </div>
    );
  }

  // ── Ready — guard against null account ───────────────────────────────────
  if (!account || !store) return null;

  // ── Overlays ─────────────────────────────────────────────────────────────
  if (panel === 'settings') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <ProductHeader appVersion={backend.appVersion} />
        <SettingsOverlay
          backend={backend}
          account={account}
          onClose={() => dispatch({ type: 'panel:close' })}
        />
      </div>
    );
  }

  if (panel === 'log') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <ProductHeader appVersion={backend.appVersion} />
        <LogOverlay
          accounts={store.accounts}
          liveLogBuffer={logBuffer}
          backend={backend}
          onClose={() => dispatch({ type: 'panel:close' })}
        />
      </div>
    );
  }

  // ── Main view ─────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <ProductHeader appVersion={backend.appVersion} />

      {/* Account / actions bar */}
      <div
        style={{
          height: 52,
          display: 'flex',
          alignItems: 'center',
          padding: '0 14px',
          gap: 8,
          borderBottom: '1px solid var(--line)',
          flexShrink: 0,
          background: 'var(--bg)',
        }}
      >
        <Avatar
          name={account.username}
          remoteUrl={account.avatar_url}
          refreshKey={account.last_backup_at}
          size={26}
          loadAvatar={loadAvatar}
        />

        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--ink-2)',
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {account.username}
        </span>

        {isBackingUp ? (
          <button
            onClick={() => {
              void backend.cancelBackup(account.id);
            }}
            style={{
              height: 32,
              padding: '0 14px',
              borderRadius: 7,
              background: 'rgba(208,69,69,0.1)',
              color: 'var(--rag-red)',
              fontSize: 13,
              fontWeight: 600,
              border: '1px solid rgba(208,69,69,0.2)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Cancel
          </button>
        ) : (
          <button
            onClick={() => {
              void backend.startBackup(account.id);
            }}
            style={{
              height: 32,
              padding: '0 14px',
              borderRadius: 7,
              background: 'var(--green-800)',
              color: 'white',
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Back up now
          </button>
        )}

        <button
          aria-label="Open settings"
          onClick={() => dispatch({ type: 'panel:open', panel: 'settings' })}
          style={{
            width: 32,
            height: 32,
            borderRadius: 7,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--muted)',
            flexShrink: 0,
          }}
        >
          <Settings size={16} strokeWidth={1.8} />
        </button>

        <button
          aria-label="Open log"
          onClick={() => dispatch({ type: 'panel:open', panel: 'log' })}
          style={{
            width: 32,
            height: 32,
            borderRadius: 7,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--muted)',
            flexShrink: 0,
          }}
        >
          <FileText size={16} strokeWidth={1.8} />
        </button>
      </div>

      {/* Backup progress banner */}
      {progress && (
        <BackupBanner
          journalTitle={account.journal_title}
          backupFolder={account.backup_folder}
          progress={progress}
          countdownSeconds={progress.rate_limited_seconds}
        />
      )}

      {/* Folder access lapsed — always offer a direct one-click re-grant. Takes
          precedence over the auth/error banner so the user is never stranded on an
          OAuth-only "Reauthorise" when the real problem is folder permission. */}
      {folderPerm !== null && folderPerm !== 'granted' && !isBackingUp ? (
        <AuthErrorBanner
          errorMessage="Folder access needs renewing to read and back up your journal."
          highlighted={false}
          actionLabel="Grant folder access"
          onReauthorise={() => {
            void handleRegrantFolder();
          }}
        />
      ) : (
        account.rag_state === 'red' &&
        !isBackingUp && (
          <AuthErrorBanner
            errorMessage={account.error_message}
            highlighted={false}
            actionLabel={chipErrorKind === 'permission' ? 'Open Settings' : 'Reauthorise'}
            onReauthorise={
              chipErrorKind === 'permission'
                ? () => dispatch({ type: 'panel:open', panel: 'settings' })
                : () => {
                    void backend.reauthoriseAccount(account.id);
                  }
            }
          />
        )
      )}

      {/* Journal grid / entry detail */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: selectedEntryId === null ? 'flex' : 'none',
            flex: 1,
            overflow: 'hidden',
            flexDirection: 'column',
          }}
        >
          <ThumbnailGrid
            entries={entries}
            selectedEntryId={selectedEntryId}
            onSelectEntry={(id) => dispatch({ type: 'entry:select', entryId: id })}
            sizePercent={thumbnailSizePercent}
            onSizeChange={(pct) => {
              dispatch({ type: 'thumbnail:resize', percent: pct });
              void backend.updateSettings({ thumbnailSizePercent: pct });
            }}
            showInfoOverlay={showInfoOverlay}
            onShowInfoOverlayChange={(v) => {
              dispatch({ type: 'ui:set-overlay', showOverlay: v });
              void backend.updateSettings({ showInfoOverlay: v });
            }}
            resolveAsset={resolveAsset}
            resolveEntry={resolveEntry}
          />
        </div>
        {selectedEntryId !== null && (
          <EntryDetail
            entryState={selectedEntryState}
            prevEntryId={prevEntryId}
            nextEntryId={nextEntryId}
            onNavigate={(id) => dispatch({ type: 'entry:select', entryId: id })}
            onClose={() => dispatch({ type: 'entry:select', entryId: null })}
            resolveAsset={resolveAsset}
            entries={entries}
          />
        )}
      </div>

      {/* Status bar */}
      <StatusBar
        account={account}
        progress={progress}
        onViewLog={() => dispatch({ type: 'panel:open', panel: 'log' })}
      />

      {/* Toast notifications */}
      <ToastHost toasts={toasts} onDismiss={(id) => dispatch({ type: 'toast:dismiss', id })} />
    </div>
  );
}

// ── Public export ─────────────────────────────────────────────────────────────

export function BackupPage({ backend }: { backend: BackendContext }) {
  return (
    <RenderErrorBoundary>
      <AppProvider backend={backend}>
        <BackupPageRoot />
      </AppProvider>
    </RenderErrorBoundary>
  );
}
