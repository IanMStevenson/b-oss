// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// A web build that cannot be served (b-oss#695). Without this the window showed a bare "Not found", which
// gave no way to tell a missing or half-copied web build from anything else. Pure: the page, the log gate
// and the error classification have no Electron or file system dependency, so they are unit-tested.

/** A POST here (from the page's button; no script needed) opens the log folder and redirects to the root. */
export const OPEN_LOG_PATH = '/__shell/open-log-folder';

export function isOpenLogFolderRequest(rawUrl: string, method: string): boolean {
  if (method !== 'POST') return false;
  try {
    return new URL(rawUrl).pathname === OPEN_LOG_PATH;
  } catch {
    return false;
  }
}

/** The page is styled inline and has a plain form button, so the policy allows no script at all. */
export const MISSING_PAGE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

export interface MissingWebInfo {
  /** The directory the shell looked in. */
  distDir: string;
  distDirExists: boolean;
  indexExists: boolean;
  /** The shell's build id. */
  version: string;
  /** The URL that was requested. */
  requestedUrl: string;
  /** Why the read failed: ENOENT, EISDIR, EACCES... */
  reason: string;
}

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function buildMissingWebPage(info: MissingWebInfo): string {
  const yesNo = (v: boolean): string => (v ? 'yes' : 'no');
  const rows: [string, string][] = [
    ['Looked in', info.distDir],
    ['Folder exists', yesNo(info.distDirExists)],
    ['index.html exists', yesNo(info.indexExists)],
    ['Asked for', info.requestedUrl],
    ['Why it failed', info.reason],
    ['Program version', info.version],
  ];
  const table = rows
    .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`)
    .join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>b-mobile could not find its web files</title>
<style>
body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:32px;background:#f6f3ea;color:#222}
main{max-width:640px;margin:0 auto}
h1{font-size:1.4rem}
table{border-collapse:collapse;width:100%;margin:16px 0}
th{text-align:left;padding:4px 12px 4px 0;white-space:nowrap;vertical-align:top;font-weight:600}
td{padding:4px 0;word-break:break-all;font-family:ui-monospace,monospace;font-size:.85rem}
button{font:inherit;padding:6px 14px}
</style></head><body><main>
<h1>b-mobile could not find its web files</h1>
<p>The app's own pages are missing, so there is nothing to show. If you are running a synced build, wait for the sync to finish and relaunch.</p>
<table>${table}</table>
<form method="post" action="${OPEN_LOG_PATH}"><button type="submit">Open log folder</button></form>
</main></body></html>
`;
}

/** The short reason for a failed file read, for the page and the log. */
export function describeReadFailure(err: unknown): string {
  const code = (err as NodeJS.ErrnoException | null)?.code;
  return typeof code === 'string' && /^[A-Z0-9_]{2,20}$/.test(code) ? code : 'read error';
}

/**
 * Decides whether a missing-file line goes to the log, so one missing asset (asked for again and again)
 * cannot flood it. A given thing is logged once; a missing document is allowed again after a minute (the
 * user reloading after a sync); and there is a hard cap on lines per run.
 */
export class MissingLogGate {
  private readonly seen = new Map<string, number>();
  private lines = 0;
  constructor(
    private readonly maxLines = 50,
    private readonly repeatAfterMs = 60_000,
  ) {}

  shouldLog(key: string, now: number, repeatable: boolean): boolean {
    if (this.lines >= this.maxLines) return false;
    const last = this.seen.get(key);
    if (last !== undefined && !(repeatable && now - last >= this.repeatAfterMs)) return false;
    this.seen.set(key, now);
    this.lines++;
    return true;
  }
}
