// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Electron wiring for desktop notifications (b-oss#610): the OS notification, the tray icon, the
// hide-to-tray behaviour and launch at login. The decisions live in notify-poller.ts and the other
// pure modules; this file only connects them to Electron, so it is covered by the e2e harness, not
// unit tests. The tray is copied in small from b-ark's rather than shared: two consumers.

import { app, dialog, Menu, nativeImage, Notification, Tray, type BrowserWindow } from 'electron';
import { join } from 'node:path';
import { CHANNELS } from '../shared/bridge.js';
import type { NotifyPayload, TestNotifyResult } from '../shared/notify.js';
import { notificationText } from './notify-text.js';
import type { ToShow } from './notify-poller.js';
import { TapQueue } from './tap-queue.js';
import { loginItemWanted, requestExit, shouldHideOnClose } from './tray-policy.js';

/** Argument added to the login item so a start at login goes straight to the tray. */
export const HIDDEN_ARG = '--hidden';

export const startedHidden = (): boolean => process.argv.includes(HIDDEN_ARG);

/** Where notifications go. Production uses Electron's `Notification`; a test hook swaps it. */
export interface Presenter {
  show(item: ToShow, onClick: () => void): Promise<void>;
  /** The "Send a test notification" toast: no payload, no API. Reports what the OS did. */
  showTest(onClick: () => void): Promise<TestNotifyResult>;
}

export const TEST_TITLE = 'b-mobile test notification';
export const TEST_BODY = 'If you can read this, Windows is showing b-mobile notifications.';

/** How long to wait for Electron's `show` / `failed` event before carrying on. */
const EVENT_WAIT_MS = 5_000;

/** The OS notification, with every event Electron emits written to the app log (b-oss#677). A
 * toast whose `show` never arrives is not treated as a failure (it may simply be slow), only an
 * explicit `failed` is. */
export function createElectronPresenter(log: (message: string) => void): Presenter {
  // A shown Notification is garbage-collected (and its click lost) unless something holds it.
  const live = new Set<Notification>();
  let serial = 0;

  function present(
    title: string,
    body: string,
    label: string,
    onClick: () => void,
  ): Promise<TestNotifyResult> {
    const supported = Notification.isSupported();
    log(`toast ${label}: Notification.isSupported()=${supported}`);
    if (!supported) {
      return Promise.resolve({ ok: false, detail: 'The system says OS notifications are not supported here.' });
    }
    return new Promise((resolve) => {
      const id = ++serial;
      const tag = `${label}#${id}`;
      let settled = false;
      const done = (result: TestNotifyResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      const timer = setTimeout(() => {
        log(`toast ${tag}: no show or failed event within ${EVENT_WAIT_MS / 1000}s`);
        done({ ok: true, detail: 'The system gave no answer within 5 seconds; it may still appear.' });
      }, EVENT_WAIT_MS);
      const n = new Notification({ title, body });
      live.add(n);
      n.on('show', () => {
        log(`toast ${tag}: show event`);
        done({ ok: true, detail: 'Windows accepted the notification.' });
      });
      n.on('failed', (_event, error) => {
        log(`toast ${tag}: failed event: ${String(error)}`);
        done({ ok: false, detail: `Windows could not show it: ${String(error)}` });
      });
      n.on('click', () => {
        log(`toast ${tag}: click event`);
        onClick();
      });
      n.on('close', () => {
        log(`toast ${tag}: close event`);
        live.delete(n);
      });
      log(`toast ${tag}: showing`);
      n.show();
    });
  }

  return {
    async show(item, onClick) {
      const { title, body } = notificationText(item.payload, item.count);
      const result = await present(title, body, item.payload.kind, onClick);
      if (!result.ok) throw new Error(result.detail);
    },
    showTest: (onClick) => present(TEST_TITLE, TEST_BODY, 'test', onClick),
  };
}

export class NotifyShell {
  private tray: Tray | null = null;
  private quitting = false;
  private readonly taps = new TapQueue();

  constructor(
    private readonly getWindow: () => BrowserWindow | null,
    private readonly presenter: Presenter,
    private readonly watchedAccounts: () => number,
    private readonly openLogFolder: () => void,
    private readonly log: (message: string) => void,
  ) {
    app.on('before-quit', () => {
      this.quitting = true;
    });
  }

  /** The OS is ending the session (logoff, shutdown, restart): let windows close for real. */
  markQuitting(): void {
    this.quitting = true;
  }

  /** The poller's `show`: tell the page (so it refreshes its counts) and show the OS notification.
   * Always shown, whether or not the window has focus. */
  show = async (item: ToShow): Promise<void> => {
    await this.presenter.show(item, () => this.clicked(item.payload));
    this.getWindow()?.webContents.send(CHANNELS.notifyReceived, item.payload);
  };

  /** "Send a test notification": a toast now, with no API involved. A click just raises the window. */
  showTest = async (): Promise<TestNotifyResult> => {
    const result = await this.presenter.showTest(() => this.reveal());
    this.log(`test notification: ${result.ok ? 'ok' : 'failed'}: ${result.detail}`);
    return result;
  };

  private clicked(payload: NotifyPayload): void {
    this.log(`notification clicked: ${payload.kind}`);
    this.reveal();
    this.taps.tap(payload, (p) => this.getWindow()?.webContents.send(CHANNELS.notifyTapped, p));
  }

  /** The page asked for any click that arrived before it was listening. */
  tappedReady(): void {
    this.taps.ready((p) => this.getWindow()?.webContents.send(CHANNELS.notifyTapped, p));
  }

  /** Call when the page is (re)loading: it has no listener until it asks again. */
  pageReset(): void {
    this.taps.reset();
  }

  reveal(): void {
    const win = this.getWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }

  /** The window's close button: hide to the tray while notifications are on. */
  shouldHideInsteadOfClose(): boolean {
    return shouldHideOnClose(this.watchedAccounts() > 0, this.quitting);
  }

  /** Notifications on (some account is watched) or off: the tray exists, and the app starts with
   * the user's login, exactly while they are on. */
  setActive(active: boolean): void {
    this.log(`notifications ${active ? 'on' : 'off'}: ${this.watchedAccounts()} account(s) watched`);
    if (active && !this.tray) this.createTray();
    if (!active && this.tray) {
      this.tray.destroy();
      this.tray = null;
      this.log('tray: removed');
    }
    setLoginItem(loginItemWanted(this.watchedAccounts()), this.log);
  }

  private trayIcon(): Electron.NativeImage {
    const path = app.isPackaged
      ? join(process.resourcesPath, 'tray-icon.png')
      : join(__dirname, '../../../../assets/icons/tray-icon.png');
    const image = nativeImage.createFromPath(path);
    return image.isEmpty() ? nativeImage.createEmpty() : image;
  }

  private createTray(): void {
    const icon = this.trayIcon();
    this.log(`tray: creating (icon ${icon.isEmpty() ? 'MISSING, using an empty image' : 'loaded'})`);
    const tray = new Tray(icon);
    this.tray = tray;
    this.log('tray: created');
    tray.setToolTip('b-mobile');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open b-mobile', click: () => this.reveal() },
        { label: 'Open log folder', click: () => this.openLogFolder() },
        { type: 'separator' },
        {
          label: 'Exit',
          // Asks first while notifications are on; the setting itself is not changed.
          click: () =>
            void requestExit(
              this.watchedAccounts() > 0,
              (options) => dialog.showMessageBox({ ...options, buttons: [...options.buttons] }),
              () => app.quit(),
            ),
        },
      ]),
    );
    tray.on('click', () => this.reveal());
    tray.on('double-click', () => this.reveal());
  }
}

/** The login item follows the notifications setting (on while any account is watched). Unpackaged,
 * it would launch bare Electron, so it is left alone. */
function setLoginItem(wanted: boolean, log: (message: string) => void): void {
  if (!app.isPackaged) {
    log(`login item: left alone (not a packaged app); wanted=${wanted}`);
    return;
  }
  try {
    app.setLoginItemSettings({ openAtLogin: wanted, args: [HIDDEN_ARG] });
    const now = app.getLoginItemSettings({ args: [HIDDEN_ARG] });
    log(`login item: wanted=${wanted} openAtLogin=${now.openAtLogin} executableWillLaunchAtLogin=${now.executableWillLaunchAtLogin}`);
  } catch (err) {
    log(`login item: failed to set: ${err instanceof Error ? err.message : 'error'}`);
  }
}
