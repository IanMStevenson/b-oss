// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Test hook for the e2e harness (b-oss#614, #610), used only when the shell is not packaged and
// BMPC_TEST_NOTIFY_PORT is set: instead of showing OS notifications, record them, and serve them on
// a local port so the host-side test can read what was shown and simulate a click. A container has
// no notification daemon to show anything to. Never reachable in a packaged app.

import { createServer, type Server } from 'node:http';
import type { ToShow } from './notify-poller.js';
import { TEST_BODY, TEST_TITLE, type Presenter } from './notify-shell.js';
import type { TestNotifyResult } from '../shared/notify.js';
import { notificationText } from './notify-text.js';

export interface RecordedNotification {
  title: string;
  body: string;
  /** null for the "Send a test notification" toast. */
  payload: ToShow['payload'] | null;
  count: number;
}

export class RecordingPresenter implements Presenter {
  readonly shown: RecordedNotification[] = [];
  private readonly clicks: (() => void)[] = [];

  show(item: ToShow, onClick: () => void): Promise<void> {
    this.shown.push({ ...notificationText(item.payload, item.count), ...item });
    this.clicks.push(onClick);
    return Promise.resolve();
  }

  showTest(onClick: () => void): Promise<TestNotifyResult> {
    this.shown.push({ title: TEST_TITLE, body: TEST_BODY, payload: null, count: 0 });
    this.clicks.push(onClick);
    return Promise.resolve({ ok: true, detail: 'Recorded by the test presenter.' });
  }

  /** What a user's click on the nth notification does. False if there is no such notification. */
  click(index: number): boolean {
    const click = this.clicks[index];
    if (!click) return false;
    click();
    return true;
  }
}

/** `GET /shown` lists what was shown; `POST /click/<n>` clicks the nth. Loopback only. */
export function serveRecordingPresenter(presenter: RecordingPresenter, port: number): Server {
  const server = createServer((req, res) => {
    const click = /^\/click\/(\d+)$/.exec(req.url ?? '');
    if (req.method === 'GET' && req.url === '/shown') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(presenter.shown));
    } else if (req.method === 'POST' && click) {
      res.writeHead(presenter.click(Number(click[1])) ? 200 : 404).end();
    } else {
      res.writeHead(404).end();
    }
  });
  server.listen(port, '127.0.0.1');
  return server;
}
