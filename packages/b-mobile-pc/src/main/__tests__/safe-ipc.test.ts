// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it, vi } from 'vitest';
import { isTrustedEvent, safeSend, type SendableWindow } from '../safe-ipc.js';
import {
  REJECTION_SOURCE,
  createRejectionReporter,
  describeRejection,
  rejectionEntry,
} from '../unhandled.js';
import { formatLine, type ErrorEntry } from '../error-log.js';

const DISPOSED = 'Render frame was disposed before WebFrameMain could be accessed';

function win(over: Partial<{ winGone: boolean; wcGone: boolean; send: () => void }> = {}) {
  const send = vi.fn(over.send ?? (() => undefined));
  const w: SendableWindow = {
    isDestroyed: () => over.winGone ?? false,
    webContents: { isDestroyed: () => over.wcGone ?? false, send },
  };
  return { w, send };
}

describe('safeSend', () => {
  it('sends to a live window', () => {
    const { w, send } = win();
    expect(safeSend(w, 'c', 1, 2)).toBe(true);
    expect(send).toHaveBeenCalledWith('c', 1, 2);
  });

  it('does nothing for no window, a destroyed window or destroyed contents', () => {
    expect(safeSend(null, 'c')).toBe(false);
    expect(safeSend(undefined, 'c')).toBe(false);
    for (const over of [{ winGone: true }, { wcGone: true }]) {
      const { w, send } = win(over);
      expect(safeSend(w, 'c')).toBe(false);
      expect(send).not.toHaveBeenCalled();
    }
  });

  it('swallows the disposed-frame error thrown by send', () => {
    const { w } = win({
      send: () => {
        throw new Error(DISPOSED);
      },
    });
    expect(() => safeSend(w, 'c')).not.toThrow();
    expect(safeSend(w, 'c')).toBe(false);
  });

  it('swallows a throw from the liveness checks themselves', () => {
    const w: SendableWindow = {
      isDestroyed: () => {
        throw new Error(DISPOSED);
      },
      webContents: { isDestroyed: () => false, send: vi.fn() },
    };
    expect(safeSend(w, 'c')).toBe(false);
  });
});

describe('isTrustedEvent', () => {
  it('trusts our page and nobody else', () => {
    expect(isTrustedEvent({ senderFrame: { url: 'app://b-mobile/' } })).toBe(true);
    expect(isTrustedEvent({ senderFrame: { url: 'https://evil.example/' } })).toBe(false);
    expect(isTrustedEvent({ senderFrame: null })).toBe(false);
    expect(isTrustedEvent({})).toBe(false);
  });

  it('treats a senderFrame that throws (frame disposed) as untrusted, without throwing', () => {
    const event = {
      get senderFrame(): never {
        throw new Error(DISPOSED);
      },
    };
    expect(() => isTrustedEvent(event)).not.toThrow();
    expect(isTrustedEvent(event)).toBe(false);
  });
});

describe('describeRejection', () => {
  it('describes errors and other values, scrubbing credentials and capping length', () => {
    expect(describeRejection(new Error(DISPOSED))).toContain(DISPOSED);
    expect(describeRejection('plain')).toBe('plain');
    const out = describeRejection(
      new Error('failed: access_token=SECRETVALUE9 Bearer abcDEF123456'),
    );
    expect(out).not.toContain('SECRETVALUE9');
    expect(out).not.toContain('abcDEF123456');
    expect(describeRejection('x '.repeat(5_000)).length).toBeLessThan(2_100);
  });
});

describe('rejectionEntry (b-oss#687)', () => {
  it('names the rejection and trims the stack', () => {
    const err = new TypeError('boom');
    err.stack = `TypeError: boom\n${Array.from({ length: 40 }, (_, i) => `    at frame${i}`).join('\n')}`;
    const entry = rejectionEntry(err);
    expect(entry.source).toBe(REJECTION_SOURCE);
    expect(entry.message).toBe('TypeError: boom');
    expect(entry.stack?.split('\n')).toHaveLength(12);
  });

  it('copes with non-errors', () => {
    expect(rejectionEntry('plain').message).toBe('non-error rejection: plain');
    expect(rejectionEntry(undefined).stack).toBeUndefined();
  });

  it('is redacted by the log line it ends up in', () => {
    const line = formatLine(
      rejectionEntry(new Error('failed: access_token=SECRETVALUE9 Bearer abcDEF123456xyz')),
      new Date('2026-10-31T10:00:00Z'),
    );
    expect(line).not.toContain('SECRETVALUE9');
    expect(line).toContain('"source":"main-unhandled-rejection"');
    expect(line).not.toContain('\n');
  });
});

describe('createRejectionReporter (b-oss#687)', () => {
  it('writes up to the cap per window, then one summary line when the next window opens', () => {
    const written: ErrorEntry[] = [];
    let t = 0;
    const report = createRejectionReporter(
      (e) => written.push(e),
      () => t,
      3,
      1000,
    );
    for (let i = 0; i < 100; i++) report(new Error(`loop ${i}`));
    expect(written).toHaveLength(3);
    t = 1500;
    report(new Error('later'));
    expect(written).toHaveLength(5);
    expect(written[3]?.message).toMatch(/^97 further unhandled rejection\(s\) were not logged/);
    expect(written[4]?.message).toBe('Error: later');
  });

  it('a quiet period writes no summary', () => {
    const written: ErrorEntry[] = [];
    let t = 0;
    const report = createRejectionReporter(
      (e) => written.push(e),
      () => t,
      3,
      1000,
    );
    report(new Error('a'));
    t = 5000;
    report(new Error('b'));
    expect(written.map((e) => e.message)).toEqual(['Error: a', 'Error: b']);
  });
});
