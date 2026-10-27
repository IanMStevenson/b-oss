// Entry for the standalone status-page preview (scripts/status-preview.mjs). Bundles the real page
// script with the fixtures so the result opens straight from disk (file://) with no network. It is
// NOT part of the site: the production build never imports this file or the fixtures.

import * as fixtures from '../src/status/fixtures';
import { start } from '../src/status/main';
import type { Component } from '../src/status/types';

const name = document.documentElement.dataset.fixture ?? 'all-good';

// Stand in for the two endpoints: the first share is counted (201 with the updated aggregates, as
// the real endpoint returns), and a second one in the same visit gets the "already shared" answer.
let snapshot = fixtures.makeFixture(
  fixtures.FIXTURE_NAMES.find((n) => n === name) ?? 'all-good',
  Date.now(),
);
let shared = false;
const realFetch = window.fetch.bind(window);
const offline = new URLSearchParams(location.search).has('offline');
window.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  // Refresh: answer from the embedded fixture (so nothing leaves the page); `?offline` shows the
  // "couldn't load" state instead.
  if (url.endsWith('/v1/status')) {
    return offline
      ? Promise.reject(new TypeError('offline (preview)'))
      : Promise.resolve(
          new Response(JSON.stringify(snapshot), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
  }
  if (!url.endsWith('/v1/shares')) return realFetch(input, init);
  if (shared) return Promise.resolve(new Response('{"error":"already_shared"}', { status: 429 }));
  shared = true;
  const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as {
    component?: Component;
  };
  const res = fixtures.shareResponse(snapshot, body.component ?? 'site', Date.now());
  snapshot = { ...snapshot, shares: res.shares };
  return Promise.resolve(
    new Response(JSON.stringify(res), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
};

start({
  statusUrl: '',
  turnstileKey: '',
  fixture: name,
  // Hand the page the very snapshot the stand-in endpoint serves, so a Refresh sees "no change".
  loadFixtures: () =>
    Promise.resolve({
      ...fixtures,
      makeFixture: (n: Parameters<typeof fixtures.makeFixture>[0], t: number) =>
        n === name ? snapshot : fixtures.makeFixture(n, t),
    }),
});
