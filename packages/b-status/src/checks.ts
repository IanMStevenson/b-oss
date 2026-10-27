// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The probe's checks (b-oss#476 "Proposed probe"; packages/b-status/docs/probe-findings.md for
// what has and hasn't been verified). Every request is anonymous and read-only. Checks run in
// sequence because later ones need ids/URLs from earlier ones; a check whose input is missing is
// `skipped`, not failed. All I/O goes through the injected `fetch` so tests need no network.

import type { CheckResult } from './types.js';

export interface ProbeConfig {
  siteBase: string; // e.g. https://www.blipfoto.com
  apiBase: string; // e.g. https://api.blipfoto.com/4
  /** Null = API checks are skipped (monitor app not registered yet). */
  clientId: string | null;
  userAgent: string;
  /** Hard per-request timeout. */
  timeoutMs: number;
  /** A passing response slower than this still counts as a failure ("works" means usable). */
  slowMs: number;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ProbeDeps {
  fetch: FetchLike;
  now: () => number;
}

interface Timed {
  res: Response | null;
  ms: number;
  error?: string;
}

async function timed(
  deps: ProbeDeps,
  cfg: ProbeConfig,
  url: string,
  method: 'GET' | 'HEAD',
  extraHeaders: Record<string, string> = {},
): Promise<Timed> {
  const start = deps.now();
  try {
    const res = await deps.fetch(url, {
      method,
      headers: { 'User-Agent': cfg.userAgent, Accept: '*/*', ...extraHeaders },
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
    return { res, ms: deps.now() - start };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    return { res: null, ms: deps.now() - start, error: timedOut ? 'timeout' : 'network error' };
  }
}

const skipped = (id: CheckResult['id'], detail: string): CheckResult => ({
  id,
  status: 'skipped',
  ms: 0,
  detail,
});
const fail = (id: CheckResult['id'], ms: number, detail: string): CheckResult => ({
  id,
  status: 'fail',
  ms,
  detail,
});
const pass = (id: CheckResult['id'], ms: number): CheckResult => ({ id, status: 'pass', ms });

/** A parsed `{version, error, data}` API envelope, or null when the body isn't one. */
function parseEnvelope(text: string): { error: unknown; data: unknown } | null {
  try {
    const v: unknown = JSON.parse(text);
    if (typeof v !== 'object' || v === null || !('error' in v)) return null;
    return { error: v.error, data: (v as { data?: unknown }).data };
  } catch {
    return null;
  }
}

function apiUrl(cfg: ProbeConfig, path: string, params: Record<string, string>): string {
  return `${cfg.apiBase}/${path}?${new URLSearchParams(params).toString()}`;
}

/** The monitor app's credentials, sent the way the API expects for app-level (no user) access: the
 * client id as a bearer token. A `client_id` query parameter is NOT accepted (it answers 52, "The
 * client is invalid"). Verified against the live API (b-oss#482). */
function apiAuth(cfg: ProbeConfig): Record<string, string> {
  return { Authorization: `Bearer ${cfg.clientId ?? ''}` };
}

/** "API error 52: The client is invalid." for an envelope error, so a failing check says why. */
function describeApiError(error: unknown): string {
  const e = error as { code?: unknown; message?: unknown } | null;
  const code = typeof e?.code === 'number' ? e.code : null;
  const msg = typeof e?.message === 'string' ? e.message.slice(0, 80) : '';
  return code === null ? 'API returned an error' : `API error ${code}${msg ? `: ${msg}` : ''}`;
}

/** Envelope codes that say the monitor was refused, not that the service is unwell: rate-limited
 * (11) and auth/client rejected (50, 51, 52; b-api/src/errors.ts). Any other error stays a failure. */
const REFUSAL_CODES: readonly number[] = [11, 50, 51, 52];

export const REFUSED_PREFIX = 'monitor refused: ';

function isRefusal(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'number' && REFUSAL_CODES.includes(code);
}

/** An API check's envelope error as a result: a refusal is `skipped` (it says nothing about the
 * service, so the component derives Unknown), anything else a fail. */
function apiErrorResult(id: CheckResult['id'], ms: number, error: unknown): CheckResult {
  return isRefusal(error)
    ? skipped(id, `${REFUSED_PREFIX}${describeApiError(error)}`)
    : fail(id, ms, describeApiError(error));
}

export async function runChecks(cfg: ProbeConfig, deps: ProbeDeps): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  let entryId: string | null = null;
  let photoUrl: string | null = null;

  // 1. Website: the browse page renders and links to entries.
  {
    const t = await timed(deps, cfg, `${cfg.siteBase}/browse`, 'GET');
    if (!t.res) out.push(fail('website_browse', t.ms, t.error ?? 'no response'));
    else if (t.res.status !== 200) out.push(fail('website_browse', t.ms, `HTTP ${t.res.status}`));
    else {
      const html = await t.res.text();
      const m = /\/entry\/(\d{6,})/.exec(html);
      if (!m) out.push(fail('website_browse', t.ms, 'no entry links'));
      else if (t.ms > cfg.slowMs) out.push(fail('website_browse', t.ms, 'too slow'));
      else {
        entryId = m[1] ?? null;
        out.push(pass('website_browse', t.ms));
      }
    }
  }

  // 2. Website: an entry page (id taken from check 1, never hard-coded) has a title and a photo.
  if (!entryId) out.push(skipped('website_entry', 'no entry id from browse'));
  else {
    const t = await timed(deps, cfg, `${cfg.siteBase}/entry/${entryId}`, 'GET');
    if (!t.res) out.push(fail('website_entry', t.ms, t.error ?? 'no response'));
    else if (t.res.status !== 200) out.push(fail('website_entry', t.ms, `HTTP ${t.res.status}`));
    else {
      const html = await t.res.text();
      const hasTitle = /<title>[^<]+<\/title>/.test(html);
      const img = /property="og:image"\s+content="([^"]+)"/.exec(html);
      if (!hasTitle || !img) out.push(fail('website_entry', t.ms, 'entry content missing'));
      else if (t.ms > cfg.slowMs) out.push(fail('website_entry', t.ms, 'too slow'));
      else {
        photoUrl = img[1] ?? null;
        out.push(pass('website_entry', t.ms));
      }
    }
  }

  // 3. Photo: the image host serves the entry's picture (HEAD, so no image bytes are fetched).
  if (!photoUrl) out.push(skipped('photo', 'no photo url from entry page'));
  else {
    const t = await timed(deps, cfg, photoUrl, 'HEAD');
    if (!t.res) out.push(fail('photo', t.ms, t.error ?? 'no response'));
    else if (t.res.status !== 200) out.push(fail('photo', t.ms, `HTTP ${t.res.status}`));
    else if (!(t.res.headers.get('content-type') ?? '').startsWith('image/'))
      out.push(fail('photo', t.ms, 'not an image'));
    else if (t.ms > cfg.slowMs) out.push(fail('photo', t.ms, 'too slow'));
    else out.push(pass('photo', t.ms));
  }

  // 4 + 5. API. The envelope's `error` field decides, not the HTTP status (the API answers 200
  // with the failure in the body). Auth and response shapes verified against the live API.
  let apiEntryId: string | null = null;
  if (cfg.clientId === null) {
    out.push(skipped('api_recent', 'no monitor client id'));
  } else {
    const t = await timed(
      deps,
      cfg,
      apiUrl(cfg, 'entries/recent', { page_size: '10' }),
      'GET',
      apiAuth(cfg),
    );
    if (!t.res) out.push(fail('api_recent', t.ms, t.error ?? 'no response'));
    else {
      const env = parseEnvelope(await t.res.text());
      const entries = (env?.data as { entries?: { entry_id_str?: string }[] } | null | undefined)
        ?.entries;
      if (!env) out.push(fail('api_recent', t.ms, `not an API response (HTTP ${t.res.status})`));
      else if (env.error !== null) out.push(apiErrorResult('api_recent', t.ms, env.error));
      else if (!entries || entries.length === 0 || !entries[0]?.entry_id_str)
        out.push(fail('api_recent', t.ms, 'no entries'));
      else if (t.ms > cfg.slowMs) out.push(fail('api_recent', t.ms, 'too slow'));
      else {
        apiEntryId = entries[0].entry_id_str;
        out.push(pass('api_recent', t.ms));
      }
    }
  }
  if (!apiEntryId) out.push(skipped('api_entry', 'no entry id from api_recent'));
  else {
    const t = await timed(
      deps,
      cfg,
      apiUrl(cfg, 'entry', { entry_id: apiEntryId }),
      'GET',
      apiAuth(cfg),
    );
    if (!t.res) out.push(fail('api_entry', t.ms, t.error ?? 'no response'));
    else {
      const env = parseEnvelope(await t.res.text());
      const got = (env?.data as { entry?: { entry_id_str?: string } } | null | undefined)?.entry
        ?.entry_id_str;
      if (!env) out.push(fail('api_entry', t.ms, `not an API response (HTTP ${t.res.status})`));
      else if (env.error !== null) out.push(apiErrorResult('api_entry', t.ms, env.error));
      else if (got !== apiEntryId) out.push(fail('api_entry', t.ms, 'wrong entry returned'));
      else if (t.ms > cfg.slowMs) out.push(fail('api_entry', t.ms, 'too slow'));
      else out.push(pass('api_entry', t.ms));
    }
  }
  return out;
}
