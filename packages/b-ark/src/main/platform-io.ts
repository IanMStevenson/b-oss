// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import fs from 'node:fs/promises';
import type { PlatformIO, LogEntry } from '@b-oss/backup-engine';
import { net, type Session } from 'electron';
import { classifyScrapeResponse } from './web-session-pure.js';

/**
 * Thrown by `fetchHtml` when the injected website session is no longer valid
 * (redirect to sign-in, 401/403, or a sign-in-page body). The backup engine
 * swallows it as an image gap; `doRunBackup` uses the `onWebSessionExpired`
 * hook to surface it in the UI.
 */
export class WebSessionExpiredError extends Error {
  constructor(message = 'blipfoto.com web session expired') {
    super(message);
    this.name = 'WebSessionExpiredError';
  }
}

export interface WebScrapeHooks {
  /** Authenticated blipfoto.com session; when absent, `fetchHtml` stays unsupported. */
  webSession?: Session;
  /** Called once when `fetchHtml` detects the session has expired mid-run. */
  onWebSessionExpired?: () => void;
  /** Optional heavier fallback (render in a hidden window) if a plain fetch is blocked. */
  fetchHtmlFallback?: (url: string) => Promise<string>;
}

const TRANSIENT_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RETRY_DELAYS = [100, 200, 400, 800];

// On Windows, AV scanners and OneDrive briefly hold destination files open,
// causing rename to fail transiently. Retry with escalating backoff.
export async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let i = 0; ; i++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (err) {
      if (
        !TRANSIENT_CODES.has((err as NodeJS.ErrnoException).code ?? '') ||
        i >= RETRY_DELAYS.length
      )
        throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[i]));
    }
  }
}

type LogHandler = (entry: LogEntry) => void;

export class ElectronPlatformIO implements PlatformIO {
  private readonly logHandler: LogHandler;
  private readonly web: WebScrapeHooks;

  constructor(logHandler: LogHandler, web: WebScrapeHooks = {}) {
    this.logHandler = logHandler;
    this.web = web;
  }

  async readFile(p: string): Promise<Uint8Array> {
    return fs.readFile(p);
  }

  async writeFile(p: string, data: Uint8Array | string): Promise<void> {
    await fs.writeFile(p, data);
  }

  async appendFile(p: string, data: Uint8Array | string): Promise<void> {
    await fs.appendFile(p, data);
  }

  async ensureDir(p: string): Promise<void> {
    await fs.mkdir(p, { recursive: true });
  }

  async fileExists(p: string): Promise<boolean> {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  }

  async listDir(p: string): Promise<string[]> {
    try {
      return await fs.readdir(p);
    } catch {
      return [];
    }
  }

  async deleteFile(p: string): Promise<void> {
    await fs.unlink(p);
  }

  async atomicWrite(p: string, data: Uint8Array | string): Promise<void> {
    const tmp = `${p}.tmp`;
    await fs.writeFile(tmp, data);
    await renameWithRetry(tmp, p);
  }

  async rename(from: string, to: string): Promise<void> {
    await renameWithRetry(from, to);
  }

  async downloadFile(url: string, destPath: string): Promise<void> {
    // Route through the authenticated website session when we have one, so
    // login-gated original/hires URLs resolve; plain CDN URLs are unaffected by
    // the extra cookies.
    const response = this.web.webSession
      ? await this.web.webSession.fetch(url)
      : await net.fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed ${response.status}: ${url}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(destPath, buffer);
  }

  // Only supported once a blipfoto.com website session has been injected (see
  // WebScrapeHooks). Without one, the engine's enable_web_scrape flag is false
  // and this is never called.
  async fetchHtml(url: string): Promise<string> {
    const sess = this.web.webSession;
    if (!sess) {
      throw new Error('fetchHtml is not supported without a blipfoto.com web session');
    }
    const response = await sess.fetch(url);
    const body = await response.text();
    if (classifyScrapeResponse({ status: response.status, finalUrl: response.url, body }) === 'expired') {
      if (this.web.fetchHtmlFallback) {
        try {
          return await this.web.fetchHtmlFallback(url);
        } catch {
          /* fall through to the expiry signal below */
        }
      }
      this.web.onWebSessionExpired?.();
      throw new WebSessionExpiredError();
    }
    if (!response.ok) {
      throw new Error(`fetchHtml failed ${response.status}: ${url}`);
    }
    return body;
  }

  log(entry: LogEntry): void {
    this.logHandler(entry);
  }
}
