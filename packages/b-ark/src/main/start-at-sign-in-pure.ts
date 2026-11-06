// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type {
  StartupSettingsLocation,
  StartupTaskInfo,
  StartupTaskState,
} from '@b-oss/b-ark-ui-electron';

// "Start at sign-in" is the platform's job, and each platform does it differently:
//   - an ordinary Electron login item (Windows installer, macOS, Linux), and
//   - a Microsoft Store (MSIX) install, which ignores the login-item registry key and instead owns
//     a manifest startup task that only the WinRT API can read and change (native add-on).
// Everything outside this file talks to the StartAtSignIn interface and the neutral states only.

/** Must match TaskId in msix/startup-task-extension.xml. */
export const STARTUP_TASK_ID = 'BArkStartup';

export interface StartAtSignInSettings extends StartupSettingsLocation {
  open: () => Promise<void>;
}

export interface StartAtSignIn {
  /** Current state; never rejects (a failed read is `unknown`). */
  getState: () => Promise<StartupTaskState>;
  /**
   * Make the platform match `wanted` as far as an app is allowed to; resolves to the state
   * afterwards. States the user or an administrator control come back unchanged. Never rejects.
   */
  set: (wanted: boolean) => Promise<StartupTaskState>;
  /**
   * Where the user can fix it by hand. Null means this platform reports no state to the UI (only
   * set() is used).
   */
  settingsLocation: StartAtSignInSettings | null;
  /**
   * True when, with Scheduled off at launch, the platform should be left alone (the Store
   * manifest starts the task disabled, so there is nothing to undo and no reason to ask).
   */
  idleWhenNotWanted: boolean;
}

// ---- Electron login item (Windows installer, macOS, Linux) ----

/** The slice of Electron's app login-item API we use (`app.getLoginItemSettings` etc.). */
export interface LoginItemApi {
  get: () => { openAtLogin: boolean; status?: string };
  set: (openAtLogin: boolean) => void;
}

/** macOS 13+ `getLoginItemSettings().status`. UNVERIFIED on a real Mac. */
export function mapMacLoginItemStatus(
  status: string | undefined,
  openAtLogin: boolean,
): StartupTaskState {
  switch (status) {
    case 'enabled':
      return 'on';
    case 'requires-approval':
      return 'needs-user-action';
    case 'not-registered':
      return 'off';
    case 'not-found':
      return 'unknown';
    default:
      return openAtLogin ? 'on' : 'off';
  }
}

export interface LoginItemDeps {
  platform: NodeJS.Platform;
  /** Dev builds must not register themselves to start at sign-in. */
  isPackaged: boolean;
  api: LoginItemApi;
  openExternal: (url: string) => Promise<void>;
  onError?: (message: string, err: unknown) => void;
}

export function createLoginItemStartAtSignIn(deps: LoginItemDeps): StartAtSignIn {
  const mac = deps.platform === 'darwin';
  const read = (): StartupTaskState => {
    const s = deps.api.get();
    return mac ? mapMacLoginItemStatus(s.status, s.openAtLogin) : s.openAtLogin ? 'on' : 'off';
  };
  const safeRead = (): StartupTaskState => {
    try {
      return read();
    } catch (err) {
      deps.onError?.('Reading the login item failed', err);
      return 'unknown';
    }
  };
  return {
    getState: () => Promise.resolve(safeRead()),
    set: (wanted) => {
      if (!deps.isPackaged) return Promise.resolve(safeRead());
      try {
        deps.api.set(wanted);
      } catch (err) {
        deps.onError?.('Setting the login item failed', err);
        return Promise.resolve('unknown');
      }
      return Promise.resolve(safeRead());
    },
    // Only macOS reports a state to the UI (it can be "waiting for approval"). On the Windows
    // installer and Linux the flag is ours to set and nothing else changes it.
    settingsLocation: mac
      ? {
          path: 'System Settings → General → Login Items',
          openLabel: 'Open Login Items settings',
          // UNVERIFIED: the Login Items pane URL for macOS 13+.
          open: () =>
            deps.openExternal('x-apple.systempreferences:com.apple.LoginItems-Settings.extension'),
        }
      : null,
    idleWhenNotWanted: false,
  };
}

// ---- Microsoft Store startup task (native add-on) ----

/** The native add-on's surface (packages/b-win-startup); each resolves to a StartupTaskState name. */
export interface StartupTaskAddon {
  getState: (taskId: string) => Promise<string>;
  enable: (taskId: string) => Promise<string>;
  disable: (taskId: string) => Promise<string>;
}

/** Windows.ApplicationModel.StartupTaskState names. */
const STATE_BY_NAME: Record<string, StartupTaskState> = {
  Enabled: 'on',
  EnabledByPolicy: 'on',
  Disabled: 'off',
  DisabledByUser: 'needs-user-action',
  DisabledByPolicy: 'blocked-by-policy',
};

export function mapStartupTaskStateName(name: string): StartupTaskState {
  return STATE_BY_NAME[name] ?? 'unknown';
}

/**
 * Load the add-on through `load` (a typed dynamic require in production). A missing file, a failed
 * load or a module of the wrong shape is non-fatal: it returns null and the state is `unknown`.
 */
export function loadStartupAddon(
  load: () => unknown,
  onError: (message: string, err: unknown) => void = () => undefined,
): StartupTaskAddon | null {
  try {
    const m = load() as Partial<StartupTaskAddon> | null;
    if (
      m &&
      typeof m.getState === 'function' &&
      typeof m.enable === 'function' &&
      typeof m.disable === 'function'
    ) {
      return m as StartupTaskAddon;
    }
    onError('Startup-task add-on has an unexpected shape', m);
  } catch (err) {
    onError('Startup-task add-on failed to load', err);
  }
  return null;
}

export interface StoreDeps {
  /** Returns the add-on or null; called lazily, at most once. */
  getAddon: () => StartupTaskAddon | null;
  openExternal: (url: string) => Promise<void>;
  onError?: (message: string, err: unknown) => void;
}

export function createStoreStartAtSignIn(deps: StoreDeps): StartAtSignIn {
  let addon: StartupTaskAddon | null | undefined;
  const getAddon = (): StartupTaskAddon | null =>
    addon === undefined ? (addon = deps.getAddon()) : addon;
  async function call(
    what: string,
    fn: (a: StartupTaskAddon) => Promise<string>,
  ): Promise<StartupTaskState> {
    const a = getAddon();
    if (!a) return 'unknown';
    try {
      return mapStartupTaskStateName(await fn(a));
    } catch (err) {
      deps.onError?.(`Startup task ${what} failed`, err);
      return 'unknown';
    }
  }
  return {
    getState: () => call('read', (a) => a.getState(STARTUP_TASK_ID)),
    // One call each: the add-on itself enables only a plain Disabled task and disables only an
    // Enabled one, so blocked states come back unchanged for the UI to explain.
    set: (wanted) =>
      wanted
        ? call('enable', (a) => a.enable(STARTUP_TASK_ID))
        : call('disable', (a) => a.disable(STARTUP_TASK_ID)),
    settingsLocation: {
      path: 'Windows Settings → Apps → Startup',
      openLabel: 'Open Windows Startup settings',
      open: () => deps.openExternal('ms-settings:startupapps'),
    },
    idleWhenNotWanted: true,
  };
}

/** Chosen once at startup. */
export function selectStartAtSignIn(deps: {
  windowsStore: boolean;
  login: LoginItemDeps;
  store: StoreDeps;
}): StartAtSignIn {
  return deps.windowsStore
    ? createStoreStartAtSignIn(deps.store)
    : createLoginItemStartAtSignIn(deps.login);
}

// ---- Service: Scheduled gating, in-flight sharing, short cache ----

export interface StartAtSignInService {
  /** Make the platform match Scheduled (`wanted`). */
  apply: (wanted: boolean) => Promise<void>;
  /** At launch: reconcile unless the platform asks to be left alone while Scheduled is off. Fire and forget. */
  reconcileOnLaunch: (wanted: boolean) => void;
  /** State for the banner, or null when not reported or `scheduled` is off. Waits for the launch reconcile. */
  getInfo: (scheduled: boolean) => Promise<StartupTaskInfo | null>;
  /** Ask the platform to switch it on (the banner's `enable` action). */
  enable: () => Promise<StartupTaskInfo | null>;
  openSettings: () => Promise<void>;
}

export function createStartAtSignInService(
  impl: StartAtSignIn,
  opts: { now?: () => number; cacheMs?: number; onInfo?: (message: string) => void } = {},
): StartAtSignInService {
  const now = opts.now ?? Date.now;
  const cacheMs = opts.cacheMs ?? 5_000;
  const loc = impl.settingsLocation;
  const toInfo = (state: StartupTaskState): StartupTaskInfo | null =>
    loc ? { state, settings: { path: loc.path, openLabel: loc.openLabel } } : null;

  let cached: { state: StartupTaskState; at: number } | null = null;
  let inflight: Promise<StartupTaskState> | null = null;
  let launchReconcile: Promise<unknown> = Promise.resolve();

  const remember = (state: StartupTaskState): StartupTaskState => {
    cached = { state, at: now() };
    return state;
  };
  const readState = (): Promise<StartupTaskState> => {
    if (cached && now() - cached.at < cacheMs) return Promise.resolve(cached.state);
    inflight ??= impl
      .getState()
      .then(remember)
      .finally(() => (inflight = null));
    return inflight;
  };

  const apply = async (wanted: boolean): Promise<void> => {
    const state = remember(await impl.set(wanted));
    opts.onInfo?.(`Start at sign-in after applying scheduled=${wanted}: ${state}`);
  };

  return {
    apply,
    reconcileOnLaunch: (wanted) => {
      if (impl.idleWhenNotWanted && !wanted) return;
      launchReconcile = apply(wanted).catch(() => undefined);
    },
    getInfo: async (scheduled) => {
      if (!loc || !scheduled) return null;
      await launchReconcile;
      return toInfo(await readState());
    },
    enable: async () => (loc ? toInfo(remember(await impl.set(true))) : null),
    openSettings: async () => {
      await loc?.open();
    },
  };
}
