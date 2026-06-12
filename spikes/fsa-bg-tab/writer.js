// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Runs inside the UNFOCUSED background tab the service worker opened. It has no
// transient user activation, so it can call queryPermission() (silent) but must NOT
// rely on requestPermission() (needs a gesture). This is the exact position the real
// auto-launched backup tab is in. We report the outcome to chrome.storage so setup.html
// can show it without this tab ever being focused.

import { idbGetHandle } from './idb.js';

const out = document.getElementById('out');

async function report(text) {
  out.textContent = text;
  // eslint-disable-next-line no-console
  console.log('[FSA spike writer]', text);
  await chrome.storage.local.set({ writerResult: `${new Date().toISOString()}  ${text}` });
}

async function run() {
  const handle = await idbGetHandle();
  if (!handle) {
    await report('NO_HANDLE — open the options page and grant a folder first');
    return;
  }

  let perm;
  try {
    perm = await handle.queryPermission({ mode: 'readwrite' });
  } catch (e) {
    await report(`QUERY_THREW: ${e.name} — stale handle (treat as no handle)`);
    return;
  }

  if (perm !== 'granted') {
    await report(
      `BLOCKED: queryPermission="${perm}". An unfocused background tab cannot ` +
        `requestPermission() (no gesture). In the real app this is the RED, ` +
        `surface-the-tab case.`,
    );
    return;
  }

  try {
    const name = `fsa-spike-${Date.now()}.txt`;
    const fh = await handle.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(`written by an unfocused background tab at ${new Date().toISOString()}\n`);
    await w.close();
    await report(
      `SUCCESS: wrote "${name}" to "${handle.name}" from an unfocused background ` +
        `tab with no gesture. Auto-launch model is viable.`,
    );
  } catch (e) {
    await report(`WRITE_THREW: ${e.name} — ${e.message}`);
  }
}

run();
