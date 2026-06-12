// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Vanilla, zero-build proof. Mirrors what BrowserPlatformIO + b-api will do, using raw
// fetch + raw FSA so there is no bundler in the way — the point is to confirm the
// CORS-bypass fetch and the FSA write co-exist in one extension-page context.

const API_BASE = 'https://api.blipfoto.com/4/';

const logEl = document.getElementById('log');
const tokenEl = document.getElementById('token');
let dirHandle = null;

function log(msg) {
  logEl.textContent += `${new Date().toISOString()}  ${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

// Keep the pasted token across reloads for convenience; sessionStorage is in-memory and
// is never committed anywhere.
tokenEl.value = sessionStorage.getItem('optionc_token') ?? '';
tokenEl.addEventListener('change', () => sessionStorage.setItem('optionc_token', tokenEl.value));

async function api(path, params, token) {
  const url = new URL(`${path}.json`, API_BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  log(`GET ${path} → ${resp.status} (X-RateLimit-Remaining: ${resp.headers.get('X-RateLimit-Remaining') ?? '?'})`);
  const json = await resp.json();
  if (json.error) throw new Error(`API error ${json.error.code}: ${json.error.message}`);
  return json.data;
}

async function writeFile(dir, name, data) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}

document.getElementById('pick').addEventListener('click', async () => {
  try {
    dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    log(`folder picked: "${dirHandle.name}"`);
  } catch (e) {
    if (e.name !== 'AbortError') log(`picker error: ${e.name}`);
  }
});

document.getElementById('run').addEventListener('click', async () => {
  const token = tokenEl.value.trim();
  if (!token) {
    log('paste an access token first');
    return;
  }
  if (!dirHandle) {
    log('pick a backup folder first (button 1)');
    return;
  }
  try {
    // 1 — CORS-bypass proof: real authenticated API call from the extension page.
    const profile = await api('user/profile', { return_details: 1 }, token);
    const username = profile.user.username;
    log(`authenticated as "${username}", entry_total=${profile.details?.entry_total ?? '?'}`);

    // 2 — first journal entry (stub).
    const list = await api('entries/journal', { username, page_index: 0, page_size: 1 }, token);
    const stub = list.entries?.[0];
    if (!stub) {
      log('account has no journal entries — JSON/image write step skipped, but the CORS fetch already succeeded.');
      return;
    }
    log(`first entry ${stub.entry_id_str} dated ${stub.date}`);

    // 3 — full entry detail incl. image URLs.
    const detail = await api(
      'entry',
      { entry_id: stub.entry_id_str, return_image_urls: 1, return_details: 1 },
      token,
    );

    // 4 — FSA write proof: real entries/YYYY/ layout, atomic-style write of the JSON.
    const year = stub.date.slice(0, 4);
    const entriesDir = await dirHandle.getDirectoryHandle('entries', { create: true });
    const yearDir = await entriesDir.getDirectoryHandle(year, { create: true });
    await writeFile(yearDir, `${stub.date}.json`, JSON.stringify(detail, null, 2));
    log(`wrote entries/${year}/${stub.date}.json`);

    // 5 — combined proof: download an image (cross-origin) and write its bytes to disk.
    const imgUrl =
      detail.image_urls?.original ||
      detail.image_urls?.hires ||
      detail.image_urls?.stdres ||
      stub.image_url;
    if (imgUrl) {
      const host = new URL(imgUrl).host;
      log(`downloading image from CDN host: ${host}`);
      const imgResp = await fetch(imgUrl);
      log(`image GET → ${imgResp.status}`);
      const bytes = new Uint8Array(await imgResp.arrayBuffer());
      await writeFile(yearDir, `${stub.date}-o.jpg`, bytes);
      log(`wrote entries/${year}/${stub.date}-o.jpg (${bytes.length} bytes)`);
      log(`>>> IMAGE CDN HOST to pin in host_permissions: ${host}`);
    } else {
      log('no image URL on this entry — image step skipped');
    }

    log('SUCCESS ✓  fetched API + wrote JSON + downloaded image to disk, all in one extension page.');
  } catch (e) {
    log(`FAILED: ${e.name ?? ''} ${e.message ?? e}`);
  }
});
