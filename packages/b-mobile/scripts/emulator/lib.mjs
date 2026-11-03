// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
//
// Helpers for the emulator checks (b-oss#796): adb pinned to the emulator, and the Capacitor
// WebView driven over CDP with Playwright. Never talks to any device but SERIAL.

import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';

export const SERIAL = process.env.EMU_SERIAL ?? `emulator-${process.env.EMU_PORT ?? '5554'}`;
export const PKG = 'uk.co.salientpoint.bmobile.debug';
export const SCHEME = 'bmobile-debug';
const ADB = `${process.env.ANDROID_HOME ?? `${homedir()}/Android/Sdk`}/platform-tools/adb`;

export function adb(...args) {
  return execFileSync(ADB, ['-s', SERIAL, ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });
}
export const sh = (cmd) => adb('shell', cmd).replace(/\r/g, '');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function pid() {
  try {
    return sh(`pidof ${PKG}`).trim().split(/\s+/)[0] || null;
  } catch {
    return null; // pidof exits 1 when the process does not exist
  }
}
export function clearData() {
  adb('shell', 'pm', 'clear', PKG);
}
export function launch() {
  sh(`am start -W -n ${PKG}/uk.co.salientpoint.bmobile.MainActivity`);
}
export function view(url) {
  sh(`am start -W -a android.intent.action.VIEW -d '${url}' ${PKG}`);
}
export const stop = () => sh(`am force-stop ${PKG}`);
export const key = (k) => sh(`input keyevent ${k}`);
export const back = () => key('KEYCODE_BACK');
export const home = () => key('KEYCODE_HOME');
export const grantNothing = () => {};

/** Reads a file inside the app's private data (debug build: run-as works). */
export const appFile = (path) => sh(`run-as ${PKG} cat ${path}`);

/**
 * Connects to the app's WebView page over raw CDP. Playwright's connectOverCDP cannot be used:
 * Android WebView's browser endpoint rejects Browser.setDownloadBehavior / context management.
 * So this is a minimal client (Node's built-in WebSocket) with evaluate/screenshot/console capture.
 */
export async function connect({ port = 9333, timeoutMs = 30000 } = {}) {
  const t0 = Date.now();
  let socket;
  while (Date.now() - t0 < timeoutMs) {
    const p = pid();
    const m = p && sh('cat /proc/net/unix').match(new RegExp(`@(webview_devtools_remote_${p})\\b`));
    if (m) {
      socket = m[1];
      break;
    }
    await sleep(500);
  }
  if (!socket) throw new Error('no webview devtools socket (is the app running?)');
  adb('forward', `tcp:${port}`, `localabstract:${socket}`);
  let target;
  while (Date.now() - t0 < timeoutMs) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (target) break;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  if (!target) throw new Error('no WebView page target');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('cdp ws error')); });
  let n = 0;
  const pending = new Map();
  const errors = [];
  const logs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') {
      errors.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
    } else if (m.method === 'Runtime.consoleAPICalled') {
      const text = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
      logs.push(`${m.params.type}: ${text}`);
      if (m.params.type === 'error') errors.push(`console.error: ${text}`);
    } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      errors.push(`log.error: ${m.params.entry.text} ${m.params.entry.url ?? ''}`);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = ++n;
      const t = setTimeout(() => { pending.delete(id); rej(new Error(`CDP ${method} timed out`)); }, 10000);
      pending.set(id, { res: (v) => { clearTimeout(t); res(v); }, rej: (e) => { clearTimeout(t); rej(e); } });
      ws.send(JSON.stringify({ id, method, params }));
    });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  return {
    send,
    errors,
    logs,
    /** Evaluates an expression (awaits promises) and returns its JSON value. */
    async evaluate(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    /** Polls an expression until it is truthy. */
    async waitFor(expression, { timeout = 40000, label = expression } = {}) {
      const t = Date.now();
      for (;;) {
        try { const v = await this.evaluate(`!!(${expression})`); if (v) return v; } catch { /* page reloading */ }
        if (Date.now() - t > timeout) throw new Error(`timed out waiting for ${label}`);
        await sleep(300);
      }
    },
    text: () => this_text(send),
    async screenshot(path) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      (await import('node:fs')).writeFileSync(path, Buffer.from(data, 'base64'));
    },
    async close() {
      ws.close();
      try { adb('forward', '--remove', `tcp:${port}`); } catch { /* already gone */ }
    },
  };
}
async function this_text(send) {
  const r = await send('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true });
  return r.result.value ?? '';
}
