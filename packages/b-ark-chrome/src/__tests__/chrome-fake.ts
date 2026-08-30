// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// A minimal in-memory fake of the chrome.* surface sw.ts touches (storage.local, tabs,
// windows, runtime, action), so its exported functions — and its module-level listener
// registrations, which run at import time — can execute under vitest without a real browser.

interface FakeTab {
  id: number;
  windowId?: number;
  url?: string;
  active?: boolean;
}

interface GlobalWithChrome {
  chrome?: unknown;
}

export interface FakeChrome {
  storage: Map<string, unknown>;
  tabs: Map<number, FakeTab>;
  windowUpdates: Array<{ windowId: number; focused: boolean }>;
  /** Simulate a tab closing outside of sw.ts's own tabs.remove calls (e.g. the user closed it) — deletes it and fires onRemoved, same as a real tab closing. */
  removeTab(tabId: number): void;
  dispatchMessage(msg: unknown): void;
  clickAction(): void;
  /**
   * Clear storage/tabs/windowUpdates between tests without re-registering listeners — sw.ts's
   * module-level `addListener` calls only run once, at import time, against whichever fake was
   * installed then. Call this from `beforeEach` (after installing once in `beforeAll`) instead
   * of calling `installChromeFake()` again, or listener-driven behaviour (e.g. `onRemoved`)
   * would silently stop being exercised.
   */
  reset(): void;
  uninstall(): void;
}

/** Install a fresh fake chrome global; call `.uninstall()` (e.g. in `afterAll`) to restore. */
export function installChromeFake(): FakeChrome {
  const storage = new Map<string, unknown>();
  const tabs = new Map<number, FakeTab>();
  const windowUpdates: Array<{ windowId: number; focused: boolean }> = [];
  const removedListeners: Array<(tabId: number) => void> = [];
  const messageListeners: Array<(msg: unknown) => void> = [];
  const actionClickListeners: Array<() => void> = [];
  let nextTabId = 1;

  function removeTabAndNotify(tabId: number): void {
    tabs.delete(tabId);
    for (const fn of removedListeners) fn(tabId);
  }

  const fakeChrome = {
    storage: {
      local: {
        get(keys?: string | string[] | null): Promise<Record<string, unknown>> {
          if (keys === undefined || keys === null) {
            return Promise.resolve(Object.fromEntries(storage));
          }
          const arr = Array.isArray(keys) ? keys : [keys];
          const out: Record<string, unknown> = {};
          for (const k of arr) if (storage.has(k)) out[k] = storage.get(k);
          return Promise.resolve(out);
        },
        set(items: Record<string, unknown>): Promise<void> {
          for (const [k, v] of Object.entries(items)) storage.set(k, v);
          return Promise.resolve();
        },
        remove(keys: string | string[]): Promise<void> {
          const arr = Array.isArray(keys) ? keys : [keys];
          for (const k of arr) storage.delete(k);
          return Promise.resolve();
        },
      },
    },
    tabs: {
      get(tabId: number): Promise<FakeTab> {
        const tab = tabs.get(tabId);
        if (!tab) return Promise.reject(new Error(`No tab with id: ${tabId}`));
        return Promise.resolve(tab);
      },
      create(props: { url?: string; active?: boolean }): Promise<FakeTab> {
        const id = nextTabId++;
        const tab: FakeTab = { id, windowId: id, url: props.url, active: props.active };
        tabs.set(id, tab);
        return Promise.resolve(tab);
      },
      update(tabId: number, props: Partial<FakeTab>): Promise<FakeTab> {
        const tab = tabs.get(tabId);
        if (!tab) return Promise.reject(new Error(`No tab with id: ${tabId}`));
        Object.assign(tab, props);
        return Promise.resolve(tab);
      },
      remove(tabId: number): Promise<void> {
        if (!tabs.has(tabId)) return Promise.reject(new Error(`No tab with id: ${tabId}`));
        removeTabAndNotify(tabId);
        return Promise.resolve();
      },
      onRemoved: {
        addListener(fn: (tabId: number) => void): void {
          removedListeners.push(fn);
        },
      },
    },
    windows: {
      update(windowId: number, props: { focused: boolean }): Promise<void> {
        windowUpdates.push({ windowId, focused: props.focused });
        return Promise.resolve();
      },
    },
    runtime: {
      getURL(path: string): string {
        return `chrome-extension://fake-id/${path}`;
      },
      onMessage: {
        addListener(fn: (msg: unknown) => void): void {
          messageListeners.push(fn);
        },
      },
    },
    action: {
      onClicked: {
        addListener(fn: () => void): void {
          actionClickListeners.push(fn);
        },
      },
    },
  };

  const g = globalThis as GlobalWithChrome;
  const prior = g.chrome;
  g.chrome = fakeChrome;

  return {
    storage,
    tabs,
    windowUpdates,
    removeTab: removeTabAndNotify,
    dispatchMessage(msg: unknown) {
      for (const fn of messageListeners) fn(msg);
    },
    clickAction() {
      for (const fn of actionClickListeners) fn();
    },
    reset() {
      storage.clear();
      tabs.clear();
      windowUpdates.length = 0;
      nextTabId = 1;
    },
    uninstall() {
      g.chrome = prior;
    },
  };
}
