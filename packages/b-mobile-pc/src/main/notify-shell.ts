// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Electron wiring for desktop notifications (b-oss#610): the OS notification, the tray icon, the
// hide-to-tray behaviour and launch at login. The decisions live in notify-poller.ts and the other
// pure modules; this file only connects them to Electron, so it is covered by the e2e harness, not
// unit tests. The tray is copied in small from b-ark's rather than shared: two consumers.

import { app, dialog, Menu, nativeImage, Notification, Tray, type BrowserWindow } from 'electron';
import { CHANNELS } from '../shared/bridge.js';
import type { NotifyPayload } from '../shared/notify.js';
import { notificationText } from './notify-text.js';
import type { ToShow } from './notify-poller.js';
import { safeSend } from './safe-ipc.js';
import { TapQueue } from './tap-queue.js';
import { appIconPath, trayIconPath } from './tray-icon.js';
import { loginItemWanted, requestExit, shouldHideOnClose } from './tray-policy.js';

/** Argument added to the login item so a start at login goes straight to the tray. */
export const HIDDEN_ARG = '--hidden';

export const startedHidden = (): boolean => process.argv.includes(HIDDEN_ARG);

/** Where notifications go. Production uses Electron's `Notification`; a test hook swaps it. */
export interface Presenter {
  show(item: ToShow, onClick: () => void): Promise<void>;
}

export const electronPresenter: Presenter = (() => {
  // A shown Notification is garbage-collected (and its click lost) unless something holds it.
  const live = new Set<Notification>();
  return {
    show(item, onClick) {
      if (!Notification.isSupported()) {
        return Promise.reject(new Error('OS notifications are not supported here'));
      }
      const { title, body } = notificationText(item.payload, item.count);
      const n = new Notification({ title, body });
      live.add(n);
      n.on('click', onClick);
      n.on('close', () => live.delete(n));
      n.show();
      return Promise.resolve();
    },
  };
})();

export class NotifyShell {
  private tray: Tray | null = null;
  private quitting = false;
  private readonly taps = new TapQueue();

  constructor(
    private readonly getWindow: () => BrowserWindow | null,
    private readonly presenter: Presenter,
    private readonly watchedAccounts: () => number,
    private readonly openLogFolder: () => void,
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
    safeSend(this.getWindow(), CHANNELS.notifyReceived, item.payload);
  };

  private clicked(payload: NotifyPayload): void {
    this.reveal();
    this.taps.tap(payload, (p) => void safeSend(this.getWindow(), CHANNELS.notifyTapped, p));
  }

  /** The page asked for any click that arrived before it was listening. */
  tappedReady(): void {
    this.taps.ready((p) => void safeSend(this.getWindow(), CHANNELS.notifyTapped, p));
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
    if (active && !this.tray) this.createTray();
    if (!active && this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
    setLoginItem(loginItemWanted(this.watchedAccounts()));
  }

  /** b-mobile's own tray icon; if it cannot be loaded, the app icon; null if neither can (the tray is
   * then skipped rather than drawn blank). */
  private trayIcon(): Electron.NativeImage | null {
    const paths = {
      packaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      mainDir: __dirname,
    };
    const path = trayIconPath(paths);
    const image = nativeImage.createFromPath(path);
    if (!image.isEmpty()) return image;
    const fallback = nativeImage.createFromPath(appIconPath(paths));
    console.error(
      `[tray] icon not loaded from ${path}; ${fallback.isEmpty() ? 'no fallback either, no tray' : 'using the app icon'}`,
    );
    return fallback.isEmpty() ? null : fallback.resize({ width: 32, height: 32 });
  }

  private createTray(): void {
    const icon = this.trayIcon();
    if (!icon) return;
    const tray = new Tray(icon);
    this.tray = tray;
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
function setLoginItem(wanted: boolean): void {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: wanted, args: [HIDDEN_ARG] });
}
