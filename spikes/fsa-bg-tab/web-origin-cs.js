// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Web-origin counterpart to the extension-page test. Injected on blipfoto.com, this runs
// in the PAGE origin (https://www.blipfoto.com) — the same kind of origin where VHA's
// content script writes on amazon.co.uk. It stores the handle in the page-origin IndexedDB
// and re-requests on a later visit, which is the documented trigger for the persistent
// "Allow on every visit" three-way prompt. Compare its behaviour to the extension page.
//
// (IndexedDB helpers are inlined because classic content scripts can't ES-import.)

(function () {
  const DB = 'fsa-spike-web-db';
  const STORE = 'config';
  const KEY = 'dir';

  function openDb() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function putHandle(h) {
    const db = await openDb();
    await new Promise((res, rej) => {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).put(h, KEY);
      t.oncomplete = res;
      t.onerror = () => rej(t.error);
    });
    db.close();
  }
  async function getHandle() {
    const db = await openDb();
    const h = await new Promise((res, rej) => {
      const t = db.transaction(STORE, 'readonly');
      const q = t.objectStore(STORE).get(KEY);
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
    db.close();
    return h || null;
  }

  const panel = document.createElement('div');
  panel.style.cssText =
    'position:fixed;bottom:12px;right:12px;z-index:2147483647;background:#fff;color:#111;' +
    'border:1px solid #888;border-radius:8px;padding:8px;font:12px/1.4 system-ui,sans-serif;' +
    'box-shadow:0 2px 8px rgba(0,0,0,.25);max-width:340px';
  panel.innerHTML =
    `<b>FSA web-origin spike</b> (${location.origin})<br>` +
    '<button id="fsa-pick">Pick &amp; store</button> ' +
    '<button id="fsa-write">Check / write</button>' +
    '<pre id="fsa-log" style="white-space:pre-wrap;max-height:170px;overflow:auto;' +
    'background:#f4f4f4;padding:4px;margin:6px 0 0"></pre>';
  document.documentElement.appendChild(panel);

  const logEl = panel.querySelector('#fsa-log');
  const log = (m) => {
    logEl.textContent += `${new Date().toISOString()}  ${m}\n`;
  };

  panel.querySelector('#fsa-pick').addEventListener('click', async () => {
    let dir;
    try {
      dir = await window.showDirectoryPicker({ mode: 'readwrite' });
    } catch (e) {
      if (e.name !== 'AbortError') log(`picker error: ${e.name}`);
      return;
    }
    await putHandle(dir);
    log(`stored "${dir.name}" at web origin. Now RESTART Chrome, revisit, and click Check / write.`);
  });

  panel.querySelector('#fsa-write').addEventListener('click', async () => {
    const dir = await getHandle();
    if (!dir) {
      log('no stored handle — click Pick & store first');
      return;
    }
    let before;
    try {
      before = await dir.queryPermission({ mode: 'readwrite' });
    } catch (e) {
      log(`queryPermission threw: ${e.name} (stale handle)`);
      return;
    }
    log(`queryPermission(before) = ${before}`);
    let after = before;
    if (before !== 'granted') {
      try {
        after = await dir.requestPermission({ mode: 'readwrite' });
      } catch (e) {
        log(`requestPermission threw: ${e.name}`);
        return;
      }
      log(`requestPermission(after) = ${after} — did you see "Allow on every visit"?`);
    }
    if (after !== 'granted') {
      log(`NOT granted (${after}) — cannot write`);
      return;
    }
    try {
      const fh = await dir.getFileHandle(`fsa-web-${Date.now()}.txt`, { create: true });
      const w = await fh.createWritable();
      await w.write(`written from ${location.origin} content script at ${new Date().toISOString()}\n`);
      await w.close();
      log('SUCCESS: wrote from web-origin content script.');
    } catch (e) {
      log(`write threw: ${e.name}`);
    }
  });
})();
