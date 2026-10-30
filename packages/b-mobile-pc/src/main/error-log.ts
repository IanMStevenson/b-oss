// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The desktop error log (b-oss#639): `userData/logs/app.log`, one JSON object per line, rotated at
// 1 MB with two older files kept (app.log.1, app.log.2). Everything is redacted here, in the main
// process, whatever the page already did, and entries are length-capped so a page cannot flood the
// disk. The filesystem is injected so rotation is unit-tested without touching disk.

import { redact } from '../shared/redact.js';

export const LOG_FILE = 'app.log';
export const MAX_LOG_BYTES = 1024 * 1024;
export const KEEP_FILES = 3;

const MAX_SOURCE = 100;
const MAX_MESSAGE = 2_000;
const MAX_STACK = 16_000;

export interface LogFs {
  /** Appends text, creating the directory and file as needed. */
  append(file: string, text: string): Promise<void>;
  /** Size in bytes, or 0 when the file does not exist. */
  size(file: string): Promise<number>;
  /** Moves a file over another; a missing source is not an error. */
  rename(from: string, to: string): Promise<void>;
  /** Removes a file; a missing file is not an error. */
  remove(file: string): Promise<void>;
}

export interface ErrorEntry {
  source: string;
  message: string;
  stack?: string;
}

const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max)}...[truncated]` : text;

/** Validates what the page sent (it is untrusted input) into a clean entry, or null. */
export function parseErrorEntry(raw: unknown): ErrorEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { source, message, stack } = raw as Record<string, unknown>;
  if (typeof source !== 'string' || typeof message !== 'string') return null;
  return {
    source: clip(source, MAX_SOURCE),
    message: clip(message, MAX_MESSAGE),
    ...(typeof stack === 'string' ? { stack: clip(stack, MAX_STACK) } : {}),
  };
}

/** One log line (no trailing newline): redacted, single-line JSON. */
export function formatLine(entry: ErrorEntry, now: Date): string {
  return JSON.stringify({
    time: now.toISOString(),
    source: redact(entry.source),
    message: redact(entry.message),
    ...(entry.stack === undefined ? {} : { stack: redact(entry.stack) }),
  });
}

export class ErrorLog {
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly fs: LogFs,
    /** `join(dir, name)`, injected so tests do not depend on the platform's separator. */
    private readonly pathOf: (name: string) => string,
    private readonly maxBytes: number = MAX_LOG_BYTES,
  ) {}

  /** Queues the write; never rejects (logging must not break the thing being logged). */
  write(entry: ErrorEntry, now: Date = new Date()): Promise<void> {
    const line = `${formatLine(entry, now)}\n`;
    this.chain = this.chain.then(() => this.append(line)).catch(() => undefined);
    return this.chain;
  }

  private async append(line: string): Promise<void> {
    const current = this.pathOf(LOG_FILE);
    if ((await this.fs.size(current)) + line.length > this.maxBytes) await this.rotate();
    await this.fs.append(current, line);
  }

  private async rotate(): Promise<void> {
    const name = (i: number): string => this.pathOf(i === 0 ? LOG_FILE : `${LOG_FILE}.${i}`);
    await this.fs.remove(name(KEEP_FILES - 1));
    for (let i = KEEP_FILES - 2; i >= 0; i--) await this.fs.rename(name(i), name(i + 1));
  }
}
