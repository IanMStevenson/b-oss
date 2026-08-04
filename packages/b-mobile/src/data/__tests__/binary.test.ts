// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import { bytesToBase64, base64ToBytes } from '../binary.js';

describe('bytesToBase64 / base64ToBytes', () => {
  it('round-trips small byte arrays', () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255, 65, 66, 67]);
    const base64 = bytesToBase64(bytes);
    expect(Array.from(base64ToBytes(base64))).toEqual(Array.from(bytes));
  });

  it('round-trips an empty array', () => {
    expect(base64ToBytes(bytesToBase64(new Uint8Array()))).toHaveLength(0);
  });

  it('round-trips a payload larger than the internal chunk size (0x8000)', () => {
    const bytes = new Uint8Array(0x8000 * 2 + 137);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    const base64 = bytesToBase64(bytes);
    expect(Array.from(base64ToBytes(base64))).toEqual(Array.from(bytes));
  });

  it('matches a known base64 encoding', () => {
    const bytes = new TextEncoder().encode('hello world');
    expect(bytesToBase64(bytes)).toBe(btoa('hello world'));
  });
});
