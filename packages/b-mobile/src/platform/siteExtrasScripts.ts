// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The page scripts that add extra photos to an entry through Blipfoto's own website (b-oss#1037).
// The API has no extras upload for our app type, so the app drives the site's edit page the way a
// person would: it hands the page's own uploader the photos and presses its own Save button, so the
// page supplies its own tokens and headers. Nothing here replays a cookie or calls an undocumented
// endpoint. The host (an Android WebView or an Electron window; platform/siteSession.ts) loads the
// page and runs the script; the script reports through `window.__bmx` (a JSON string) because a
// WebView cannot await a promise.
//
// Failure is always one of the statuses below, never a throw, so the caller can show the
// "finish it in your browser" screen with the reason.

export const SITE_ORIGIN = 'https://www.blipfoto.com';

export function editPageUrl(entryId: string): string {
  return `${SITE_ORIGIN}/entry/${encodeURIComponent(entryId)}/edit`;
}

export const SIGN_IN_URL = `${SITE_ORIGIN}/account/signin`;

/** One photo handed to the page, as base64 (the page builds a File from it). */
export interface ExtraFile {
  name: string;
  mimeType: string;
  base64: string;
}

export type AddScriptResult =
  | { status: 'submitted'; user: string | null; remainingBefore: number; missing: string[] }
  | { status: 'needs-login' }
  | { status: 'unexpected-page'; path: string }
  | { status: 'no-uploader' }
  | { status: 'timeout' }
  | { status: 'error'; error: string };

/** One extra the edit page lists for an entry: its id on the site and its thumbnail address. */
export interface ExtraItem {
  id: string;
  thumbnail: string;
}

export interface ReadBackResult {
  status: 'ok' | 'needs-login' | 'unexpected-page' | 'no-uploader';
  /** For the app log when the page was not what was expected. */
  detail?: unknown;
  error?: string;
  user?: string | null;
  /** The extras the edit page lists, in order. */
  items?: ExtraItem[];
  /** Extras the edit page lists for the entry. */
  count?: number;
  /** The page's "N remaining" figure. */
  remaining?: number;
}

/** Shared by both scripts: finding the signed-in member's name from the header's profile link. */
const USER_HELPER = `
  function bmxUser() {
    var links = document.querySelectorAll('a');
    for (var i = 0; i < links.length; i++) {
      if (links[i].textContent.trim() === 'My profile') {
        return (links[i].getAttribute('href') || '').replace(/^\\//, '').split('/')[0] || null;
      }
    }
    return null;
  }
  // What the page looked like, for the app log when it was not what was expected.
  function bmxDetail() {
    var forms = [];
    for (var i = 0; i < document.forms.length; i++) forms.push(document.forms[i].id || '?');
    return {
      path: location.pathname + location.search,
      title: document.title.slice(0, 80),
      user: bmxUser(),
      forms: forms,
      hasUploader: !!document.getElementById('photo-uploader'),
      hasRemaining: !!document.getElementById('photo-uploader-remaining'),
      hasQueue: !!document.getElementById('photo-queue'),
    };
  }
  function bmxSleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function bmxFindUploader() {
    var input = null;
    for (var i = 0; i < 60; i++) {
      input = document.getElementById('photo-uploader');
      // The page's own script binds the change handler; wait for it rather than a fixed delay.
      if (input && window.jQuery && window.jQuery._data(input, 'events')) return input;
      await bmxSleep(250);
    }
    return input;
  }
`;

/** Removes the extras `removeIds` names and adds `files` on whatever edit page is loaded, then presses
 * Save once the page's uploader has finished. Resolves (via window.__bmx) with an AddScriptResult.
 * Removing uses the page's own remove link on each thumbnail, so the page records the deletions
 * itself. Submitting navigates the page, so the host must wait for that navigation before it closes
 * the window. */
export function buildAddExtrasScript(files: ExtraFile[], removeIds: string[] = []): string {
  return `(function () {
  window.__bmx = undefined;
  var FILES = ${JSON.stringify(files)};
  var REMOVE = ${JSON.stringify(removeIds)};
  var done = function (o) { window.__bmx = JSON.stringify(o); };
  ${USER_HELPER}
  (async function () {
    try {
      var path = location.pathname;
      if (/^\\/account\\/signin/.test(path)) return done({ status: 'needs-login' });
      if (!/^\\/entry\\/\\d+\\/edit\\/?$/.test(path)) return done({ status: 'unexpected-page', path: path });
      var input = await bmxFindUploader();
      if (!input) return done({ status: 'no-uploader' });
      var remEl = document.getElementById('photo-uploader-remaining');
      var missing = [];
      REMOVE.forEach(function (id) {
        var link = document.querySelector('#photo-queue a[data-upload-id="' + id + '"]');
        if (link) link.click(); else missing.push(id);
      });
      if (REMOVE.length) await bmxSleep(400);
      var rem0 = Number(remEl && remEl.textContent);
      var dt = new DataTransfer();
      FILES.forEach(function (f) {
        var bin = atob(f.base64);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        dt.items.add(new File([bytes], f.name, { type: f.mimeType }));
      });
      if (FILES.length) {
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      var save = document.getElementById('publish');
      var stable = 0;
      for (var t = 0; t < 480; t++) {
        await bmxSleep(250);
        var now = Number(remEl.textContent);
        // The count drops as photos are queued; Save re-enables once every upload has finished.
        // With only removals there is nothing to queue, so Save being enabled is enough.
        var queued = FILES.length === 0 || now < rem0;
        if (queued && !save.disabled) { stable++; if (stable >= 4) break; } else { stable = 0; }
      }
      if (stable < 4) return done({ status: 'timeout' });
      done({ status: 'submitted', user: bmxUser(), remainingBefore: rem0, missing: missing });
      // Saving unloads the page, so give the host time to read the result above first.
      await bmxSleep(1500);
      save.click();
    } catch (e) {
      done({ status: 'error', error: String((e && e.message) || e) });
    }
  })();
})();`;
}

/** Reads what the entry's edit page now lists, to confirm a save really kept the extras. */
export function buildReadBackScript(): string {
  return `(function () {
  window.__bmx = undefined;
  var done = function (o) { window.__bmx = JSON.stringify(o); };
  ${USER_HELPER}
  (async function () {
    try {
      var path = location.pathname;
      if (/^\\/account\\/signin/.test(path)) return done({ status: 'needs-login' });
      if (!/^\\/entry\\/\\d+\\/edit\\/?$/.test(path)) return done({ status: 'unexpected-page' });
      var input = await bmxFindUploader();
      if (!input) return done({ status: 'no-uploader', detail: bmxDetail() });
      var nodes = document.querySelectorAll('#photo-queue > li');
      var items = [];
      for (var i = 0; i < nodes.length; i++) {
        var link = nodes[i].querySelector('a[data-upload-id]');
        var img = nodes[i].querySelector('img');
        if (link) items.push({ id: link.getAttribute('data-upload-id'), thumbnail: img ? img.src : '' });
      }
      done({
        status: 'ok',
        user: bmxUser(),
        items: items,
        count: items.length,
        remaining: Number(document.getElementById('photo-uploader-remaining').textContent),
      });
    } catch (e) {
      done({ status: 'no-uploader', detail: bmxDetail(), error: String((e && e.message) || e) });
    }
  })();
})();`;
}

export const WHO_AM_I_URL = `${SITE_ORIGIN}/settings/general`;

export interface WhoAmIResult {
  status: 'ok' | 'needs-login';
  user?: string | null;
}

/** Reports who the stored site session belongs to, or that it is not signed in (the site sends a
 * signed-out visitor to its sign-in page). Run against WHO_AM_I_URL. */
export function buildWhoAmIScript(): string {
  return `(function () {
  window.__bmx = undefined;
  ${USER_HELPER}
  if (/^\\/account\\/signin/.test(location.pathname)) {
    window.__bmx = JSON.stringify({ status: 'needs-login' });
  } else {
    window.__bmx = JSON.stringify({ status: 'ok', user: bmxUser() });
  }
})();`;
}

export interface PageHtmlResult {
  status: 'ok' | 'needs-login';
  html?: string;
}

/** Hands back a signed-in entry page's own HTML (the gallery data is inline in it), so the extras of
 * a protected journal can be read with the same parser as a public page. Run against an entry page.
 * A signed-out visitor sees the protected notice, which the caller recognises as no gallery. */
export function buildPageHtmlScript(): string {
  return `(function () {
  window.__bmx = undefined;
  ${USER_HELPER}
  var signedIn = bmxUser() !== null;
  window.__bmx = JSON.stringify(
    signedIn ? { status: 'ok', html: document.documentElement.outerHTML } : { status: 'needs-login' }
  );
})();`;
}

export const PUBLISH_URL = `${SITE_ORIGIN}/publish`;

export interface RemainingResult {
  status: 'ok' | 'needs-login' | 'no-uploader';
  /** Extra photos the member has left in this year's allowance. */
  remaining?: number;
}

/** Reads the member's remaining extras allowance from the site's own new-entry page, which shows it
 * as "N remaining" beside its extras uploader. Run against PUBLISH_URL. */
export function buildRemainingScript(): string {
  return `(function () {
  window.__bmx = undefined;
  var done = function (o) { window.__bmx = JSON.stringify(o); };
  ${USER_HELPER}
  (async function () {
    if (/^\\/account\\/signin/.test(location.pathname)) return done({ status: 'needs-login' });
    var input = await bmxFindUploader();
    var el = document.getElementById('photo-uploader-remaining');
    var n = el ? Number(el.textContent) : NaN;
    if (!input || !isFinite(n)) return done({ status: 'no-uploader' });
    done({ status: 'ok', remaining: n });
  })();
})();`;
}
