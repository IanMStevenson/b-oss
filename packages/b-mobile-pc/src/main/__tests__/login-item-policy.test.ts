// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import { decideLoginItem, isDevFolder } from '../login-item-policy.js';

const none = (): boolean => false;
const has =
  (...pairs: [string, string][]) =>
  (dir: string, name: string): boolean =>
    pairs.some(([d, n]) => d === dir && n === name);

describe('isDevFolder', () => {
  it('is false for an installed copy', () => {
    expect(
      isDevFolder('C:\\Users\\ian\\AppData\\Local\\Programs\\b-mobile\\b-mobile.exe', none),
    ).toBe(false);
  });

  it('is true for a build output folder, even when the repo root is not there to look at', () => {
    expect(
      isDevFolder(
        'D:\\Dev\\debugging\\b-mobile-pc-build\\packages\\b-mobile-pc\\dist-electron\\win-unpacked\\b-mobile.exe',
        none,
      ),
    ).toBe(true);
  });

  it('is true when node_modules is in the path', () => {
    expect(isDevFolder('C:\\x\\node_modules\\electron\\dist\\electron.exe', none)).toBe(true);
    expect(isDevFolder('/home/a/proj/node_modules/electron/dist/electron', none)).toBe(true);
  });

  it('finds a node_modules or .git entry a few folders up (Windows and POSIX paths)', () => {
    expect(
      isDevFolder('D:\\Dev\\app\\out\\win\\b-mobile.exe', has(['D:\\Dev\\app', 'node_modules'])),
    ).toBe(true);
    expect(isDevFolder('/home/a/proj/out/b-mobile', has(['/home/a/proj', '.git']))).toBe(true);
  });

  it('does not look beyond a handful of folders', () => {
    const deep = 'C:\\a\\b\\c\\d\\e\\f\\g\\h\\b-mobile.exe';
    expect(isDevFolder(deep, has(['C:\\a', '.git']))).toBe(false);
  });

  it('does not treat the drive as a folder', () => {
    const seen: string[] = [];
    isDevFolder('C:\\b-mobile.exe', (dir) => {
      seen.push(dir);
      return false;
    });
    expect([...new Set(seen)]).toEqual(['C:\\']);
  });

  it('matches dev segments case-insensitively', () => {
    expect(isDevFolder('C:\\Dist-Electron\\win-unpacked\\b-mobile.exe', none)).toBe(true);
  });
});

describe('decideLoginItem', () => {
  it('sets it on for a packaged exe outside a dev folder', () => {
    expect(decideLoginItem({ wanted: true, packaged: true, devFolder: false })).toEqual({
      action: 'set',
      openAtLogin: true,
    });
  });

  it('leaves it alone from a dev folder when asked to turn it on', () => {
    const d = decideLoginItem({ wanted: true, packaged: true, devFolder: true });
    expect(d.action).toBe('leave-alone');
  });

  it('still turns it off from a dev folder (the user turned notifications off)', () => {
    expect(decideLoginItem({ wanted: false, packaged: true, devFolder: true })).toEqual({
      action: 'set',
      openAtLogin: false,
    });
  });

  it('leaves it alone when not packaged, as before', () => {
    expect(decideLoginItem({ wanted: true, packaged: false, devFolder: false })).toEqual({
      action: 'leave-alone',
      reason: 'not a packaged app',
    });
  });
});
