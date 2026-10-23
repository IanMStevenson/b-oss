// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import { runChecks } from '../checks.js';
import { API_ENTRY, API_RECENT, CFG, fakeFetch, healthy, type Stub } from './fixtures.js';

const run = (stubs: Record<string, Stub>, cfg = CFG, calls: string[] = []) =>
  runChecks(cfg, { fetch: fakeFetch(stubs, calls), now: () => 0 });
const status = (results: Awaited<ReturnType<typeof run>>) =>
  Object.fromEntries(results.map((x) => [x.id, x.status]));

describe('runChecks', () => {
  it('passes all five against a healthy site and API', async () => {
    const calls: string[] = [];
    const results = await run(healthy(), CFG, calls);
    expect(status(results)).toEqual({
      website_browse: 'pass',
      website_entry: 'pass',
      photo: 'pass',
      api_recent: 'pass',
      api_entry: 'pass',
    });
    expect(calls).toHaveLength(5);
    expect(calls[2]).toBe('https://img.test/p.jpg');
  });

  it('uses the entry id from browse, never a hard-coded one', async () => {
    const calls: string[] = [];
    await run(healthy(), CFG, calls);
    expect(calls).toContain('https://site.test/entry/123456789');
    expect(calls.some((c) => c.includes('entry_id=987654321'))).toBe(true);
  });

  it('browse fails when no entry link is present, and downstream site checks are skipped', async () => {
    const s = status(await run({ ...healthy(), 'https://site.test/browse': { body: '<html/>' } }));
    expect(s.website_browse).toBe('fail');
    expect(s.website_entry).toBe('skipped');
    expect(s.photo).toBe('skipped');
    expect(s.api_recent).toBe('pass'); // independent of the website
  });

  it('a non-200 browse page fails', async () => {
    const s = status(await run({ ...healthy(), 'https://site.test/browse': { status: 404 } }));
    expect(s.website_browse).toBe('fail');
  });

  it('a photo that is not an image fails the photo check only', async () => {
    const s = status(
      await run({
        ...healthy(),
        'https://img.test/p.jpg': { headers: { 'content-type': 'text/html' } },
      }),
    );
    expect(s.photo).toBe('fail');
    expect(s.website_entry).toBe('pass');
  });

  it('judges the API by the envelope error, not the HTTP status', async () => {
    const bad = JSON.stringify({ version: '4', error: { code: 52, message: 'x' }, data: null });
    const s = status(
      await run({ ...healthy(), 'https://api.test/4/entries/recent': { status: 200, body: bad } }),
    );
    expect(s.api_recent).toBe('fail');
    expect(s.api_entry).toBe('skipped');
  });

  it('treats a non-JSON API response (an HTML error page) as failed', async () => {
    const s = status(
      await run({
        ...healthy(),
        'https://api.test/4/entries/recent': { status: 404, body: '<html>Not Found</html>' },
      }),
    );
    expect(s.api_recent).toBe('fail');
  });

  it('fails api_entry when the returned id does not match', async () => {
    const wrong = API_ENTRY.replace('987654321', '1');
    const s = status(await run({ ...healthy(), 'https://api.test/4/entry': { body: wrong } }));
    expect(s.api_entry).toBe('fail');
    expect(API_RECENT).toContain('987654321');
  });

  it('skips the API checks entirely without a monitor client id', async () => {
    const calls: string[] = [];
    const s = status(await run(healthy(), { ...CFG, clientId: null }, calls));
    expect(s.api_recent).toBe('skipped');
    expect(s.api_entry).toBe('skipped');
    expect(calls.some((c) => c.includes('api.test'))).toBe(false);
  });

  it('a network error or timeout is a failure with a plain reason', async () => {
    const e = new Error('boom');
    e.name = 'TimeoutError';
    const results = await run({ ...healthy(), 'https://site.test/browse': { throws: e } });
    const browse = results.find((x) => x.id === 'website_browse');
    expect(browse).toMatchObject({ status: 'fail', detail: 'timeout' });
  });

  it('a slow but correct response counts as failed', async () => {
    let t = 0;
    const results = await runChecks(CFG, {
      fetch: fakeFetch(healthy()),
      now: () => (t += 1000), // every request "takes" 1000 ms > slowMs
    });
    expect(results.find((x) => x.id === 'website_browse')?.detail).toBe('too slow');
  });
});
