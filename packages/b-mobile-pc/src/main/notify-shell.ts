// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Electron wiring for desktop notifications (b-oss#610): the OS notification, the tray icon, the
// hide-to-tray behaviour and launch at login. The decisions live in notify-poller.ts and the other
// pure modules; this file only connects them to Electron, so it is covered by the e2e harness, not
// unit tests. The tray is copied in small from b-ark's rather than shared: two consumers.

import { app, Menu, nativeImage, Notification, Tray, type BrowserWindow } from 'electron';
import { join } from 'node:path';
import { CHANNELS } from '../shared/bridge.js';
import type { NotifyPayload } from '../shared/notify.js';
import { notificationText } from './notify-text.js';
import type { ToShow } from './notify-poller.js';
import { TapQueue } from './tap-queue.js';

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

  private clicked(payload: NotifyPayload): void {
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

  /** Closing the window hides it while something is being polled for; Exit in the tray quits.
   * Returns true when the close was turned into a hide. */
  shouldHideInsteadOfClose(active: boolean): boolean {
    return active && !this.quitting;
  }

  /** The tray exists exactly while there is something to poll for. */
  setActive(active: boolean): void {
    if (active && !this.tray) this.createTray();
    if (!active && this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }

  private trayIcon(): Electron.NativeImage {
    const path = app.isPackaged
      ? join(process.resourcesPath, 'tray-icon.png')
      : join(__dirname, '../../../../assets/icons/tray-icon.png');
    const image = nativeImage.createFromPath(path);
    return image.isEmpty() ? nativeImage.createEmpty() : image;
  }

  private createTray(): void {
    const tray = new Tray(this.trayIcon());
    this.tray = tray;
    tray.setToolTip('b-mobile');
    const build = (): void => {
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: 'Open b-mobile', click: () => this.reveal() },
          { type: 'separator' },
          {
            label: 'Start at login',
            type: 'checkbox',
            checked: getLaunchAtLogin().enabled,
            enabled: getLaunchAtLogin().supported,
            click: (item) => {
              setLaunchAtLogin(item.checked);
              build();
            },
          },
          { type: 'separator' },
          { label: 'Exit', click: () => app.quit() },
        ]),
      );
    };
    build();
    tray.on('click', () => this.reveal());
    tray.on('double-click', () => this.reveal());
  }
}

/** Off unless the user turns it on. Unpackaged, a login item would launch bare Electron. */
export function getLaunchAtLogin(): { supported: boolean; enabled: boolean } {
  if (!app.isPackaged) return { supported: false, enabled: false };
  return {
    supported: true,
    enabled: app.getLoginItemSettings({ args: [HIDDEN_ARG] }).openAtLogin,
  };
}

export function setLaunchAtLogin(enabled: boolean): void {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: enabled, args: [HIDDEN_ARG] });
}
