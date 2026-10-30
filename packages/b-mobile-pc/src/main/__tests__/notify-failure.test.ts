// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import { describeFailure } from '../notify-failure.js';
import { formatLine } from '../error-log.js';

const named = (name: string, message: string, extra: object = {}): Error =>
  Object.assign(new Error(message), { name }, extra);

describe('describeFailure', () => {
  it.each([
    ['TokenInvalidError', {}, 'sign-in-needed'],
    ['BlipfotoError', { code: 11 }, 'rate-limited'],
    ['BlipfotoError', { code: 3 }, 'error'],
    ['HttpError', { status: 502 }, 'error'],
    ['NetworkError', { cause: new TypeError('fetch failed') }, 'offline'],
    ['SecureStorageUnavailableError', {}, 'error'],
    ['RangeError', {}, 'error'],
  ])('%s %j -> %s', (name, extra, kind) => {
    expect(describeFailure(named(name, 'm', extra)).result.kind).toBe(kind);
  });

  it('keeps the HTTP status and API code, and the network cause, in the log text', () => {
    expect(describeFailure(named('HttpError', 'm', { status: 502 })).logText).toContain('status=502');
    expect(describeFailure(named('BlipfotoError', 'bad thing', { code: 3 })).logText).toContain(
      'code=3 message=bad thing',
    );
    expect(
      describeFailure(named('NetworkError', 'm', { cause: new TypeError('net::ERR_NAME_NOT_RESOLVED') }))
        .logText,
    ).toContain('net::ERR_NAME_NOT_RESOLVED');
  });

  it('names only an unrecognised error, since its message could carry anything', () => {
    expect(describeFailure(new RangeError('secret-thing')).logText).toBe('RangeError');
  });

  it('what reaches app.log is redacted even if a line did carry a credential', () => {
    const line = formatLine(
      { source: 'notify', message: 'poll failed Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789' },
      new Date(0),
    );
    expect(line).not.toContain('abcdefghijklmnopqrstuvwxyz0123456789');
  });
});
