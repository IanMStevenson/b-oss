// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// b-oss#639. Off the desktop shell nothing may be logged or shown (Android/web unchanged); on it the
// bridge receives redacted entries.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildErrorDetails,
  hasErrorDiagnostics,
  installGlobalErrorLogging,
  logError,
  redact,
  toErrorInfo,
} from '../diagnostics.js';

// A copy of packages/b-mobile-pc/src/shared/redact-cases.ts: keep the two in step.
const REDACTION_CASES: readonly {
  name: string;
  input: string;
  mustNotContain: readonly string[];
}[] = [
  {
    name: 'Authorization header',
    input: 'request failed {"headers":{"Authorization":"Bearer tok_Abc123xyz789"}}',
    mustNotContain: ['tok_Abc123xyz789'],
  },
  {
    name: 'bare bearer in a stack',
    input: 'Error: 401 for Bearer abcDEF123456.ghi-jkl',
    mustNotContain: ['abcDEF123456'],
  },
  {
    name: 'access_token in a URL fragment',
    input: 'redirect b-mobile://oauth#access_token=SECRETVALUE9&token_type=bearer',
    mustNotContain: ['SECRETVALUE9'],
  },
  {
    name: 'token in a query string',
    input: 'GET https://api.example/4/user?token=hunter2hunter2&x=1 failed',
    mustNotContain: ['hunter2hunter2'],
  },
  {
    name: 'JSON access_token',
    input: '{"access_token":"qwertyuiop12","expires":3600}',
    mustNotContain: ['qwertyuiop12'],
  },
  {
    name: 'OAuth code in a URL',
    input: 'callback https://x.test/cb?state=1&code=abc123def456 failed',
    mustNotContain: ['abc123def456'],
  },
  {
    name: 'long opaque string',
    input: 'unexpected value 0123456789abcdef0123456789abcdef0123 in response',
    mustNotContain: ['0123456789abcdef0123456789abcdef0123'],
  },
];

function stubBridge() {
  const diagnostics = {
    logError: vi.fn<(entry: { source: string }) => Promise<void>>().mockResolvedValue(undefined),
    openLogFolder: vi.fn().mockResolvedValue(undefined),
    copyText: vi.fn().mockResolvedValue(undefined),
  };
  vi.stubGlobal('bMobileDesktop', { version: 1, diagnostics });
  return diagnostics;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('redact', () => {
  for (const { name, input, mustNotContain } of REDACTION_CASES) {
    it(`removes the secret: ${name}`, () => {
      const out = redact(input);
      for (const secret of mustNotContain) expect(out).not.toContain(secret);
      expect(out).toContain('[redacted]');
    });
  }

  it('leaves ordinary diagnostics alone', () => {
    const text =
      "TypeError: Cannot read properties of undefined (reading 'coords') at app://b-mobile/assets/index.js:1:20";
    expect(redact(text)).toBe(text);
  });
});

describe('off the desktop shell (Android, iOS, web)', () => {
  it('offers no diagnostics UI, logs nothing and installs no handlers', () => {
    expect(hasErrorDiagnostics()).toBe(false);
    const add = vi.spyOn(window, 'addEventListener');
    expect(() => logError({ source: 'boundary', message: 'x' })).not.toThrow();
    installGlobalErrorLogging()();
    expect(add).not.toHaveBeenCalled();
    add.mockRestore();
  });
});

describe('on the desktop shell', () => {
  it('sends redacted entries through the bridge', () => {
    const diagnostics = stubBridge();
    logError({
      source: 'boundary',
      message: 'GET /x?access_token=SECRETVALUE9 failed',
      stack: 'at f (https://a/b?token=hunter2hunter2)',
    });
    const sent = JSON.stringify(diagnostics.logError.mock.calls);
    expect(sent).not.toContain('SECRETVALUE9');
    expect(sent).not.toContain('hunter2hunter2');
    expect(diagnostics.logError).toHaveBeenCalledOnce();
  });

  it('never throws if the bridge call fails synchronously or asynchronously', async () => {
    const diagnostics = stubBridge();
    diagnostics.logError.mockRejectedValueOnce(new Error('ipc'));
    expect(() => logError({ source: 's', message: 'm' })).not.toThrow();
    diagnostics.logError.mockImplementationOnce(() => {
      throw new Error('sync');
    });
    expect(() => logError({ source: 's', message: 'm' })).not.toThrow();
    await Promise.resolve();
  });

  it('logs window errors and unhandled rejections until removed', () => {
    const diagnostics = stubBridge();
    const remove = installGlobalErrorLogging();
    window.dispatchEvent(new ErrorEvent('error', { error: new TypeError('bad'), message: 'bad' }));
    const rejection = new Event('unhandledrejection') as PromiseRejectionEvent;
    Object.assign(rejection, { reason: new Error('nope') });
    window.dispatchEvent(rejection);
    expect(diagnostics.logError.mock.calls.map(([e]) => e.source)).toEqual([
      'window-error',
      'unhandled-rejection',
    ]);
    const removed = vi.spyOn(window, 'removeEventListener');
    remove();
    expect(removed.mock.calls.map(([type]) => type)).toEqual(['error', 'unhandledrejection']);
    removed.mockRestore();
  });

  it('builds copyable details: message, stack, version, platform, time, and no secrets', () => {
    const info = toErrorInfo(
      'boundary',
      new Error('failed with access_token=SECRETVALUE9'),
      'in <App>',
    );
    const text = buildErrorDetails(info, new Date('2026-10-30T12:00:00.000Z'));
    expect(text).toContain('b-mobile ');
    expect(text).toContain('Platform: ');
    expect(text).toContain('Time: 2026-10-30T12:00:00.000Z');
    expect(text).toContain('Error: failed with access_token=[redacted]');
    expect(text).toContain('in <App>');
    expect(text).not.toContain('SECRETVALUE9');
  });
});
