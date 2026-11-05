// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import {
  MISSING_PAGE_CSP,
  MissingLogGate,
  OPEN_LOG_PATH,
  buildMissingWebPage,
  describeReadFailure,
  isOpenLogFolderRequest,
} from '../missing-web.js';

const info = {
  distDir: 'D:\\Dev\\b-mobile\\resources\\web',
  distDirExists: true,
  indexExists: false,
  version: '1.0.2.0.22',
  requestedUrl: 'app://b-mobile/',
  reason: 'ENOENT',
};

describe('buildMissingWebPage', () => {
  const html = buildMissingWebPage(info);
  it('says what is wrong and every fact needed to tell why', () => {
    expect(html).toContain('b-mobile could not find its web files');
    expect(html).toContain('D:\\Dev\\b-mobile\\resources\\web');
    expect(html).toMatch(/Folder exists<\/th><td>yes/);
    expect(html).toMatch(/index\.html exists<\/th><td>no/);
    expect(html).toContain('1.0.2.0.22');
    expect(html).toContain('ENOENT');
    expect(html).toContain('wait for the sync to finish and relaunch');
    expect(html).toContain('Open log folder');
  });
  it('reports a missing folder', () => {
    expect(buildMissingWebPage({ ...info, distDirExists: false })).toMatch(
      /Folder exists<\/th><td>no/,
    );
  });
  it('escapes everything it was given and carries no script', () => {
    const evil = buildMissingWebPage({
      ...info,
      distDir: '<script>alert(1)</script>',
      requestedUrl: 'app://b-mobile/"onload="x',
    });
    expect(evil).not.toContain('<script');
    expect(evil).toContain('&#60;script&#62;');
    expect(evil).not.toContain('"onload="x');
    expect(html).not.toContain('<script');
    expect(MISSING_PAGE_CSP).not.toContain('script-src');
    expect(MISSING_PAGE_CSP).toContain("default-src 'none'");
  });
  it('posts to the open-log-folder path', () => {
    expect(html).toContain(`method="post" action="${OPEN_LOG_PATH}"`);
  });
});

describe('isOpenLogFolderRequest', () => {
  it('is a POST to the reserved path only', () => {
    expect(isOpenLogFolderRequest(`app://b-mobile${OPEN_LOG_PATH}`, 'POST')).toBe(true);
    expect(isOpenLogFolderRequest(`app://b-mobile${OPEN_LOG_PATH}`, 'GET')).toBe(false);
    expect(isOpenLogFolderRequest('app://b-mobile/other', 'POST')).toBe(false);
    expect(isOpenLogFolderRequest('not a url', 'POST')).toBe(false);
  });
});

describe('describeReadFailure', () => {
  it('uses the error code, and nothing else from the error', () => {
    expect(describeReadFailure(Object.assign(new Error('x'), { code: 'ENOENT' }))).toBe('ENOENT');
    expect(describeReadFailure(Object.assign(new Error('x'), { code: 'EISDIR' }))).toBe('EISDIR');
    expect(describeReadFailure(new Error('C:\\secret path'))).toBe('read error');
    expect(describeReadFailure(null)).toBe('read error');
  });
});

describe('MissingLogGate', () => {
  it('logs the first of each key only', () => {
    const gate = new MissingLogGate();
    expect(gate.shouldLog('a.js', 0, false)).toBe(true);
    expect(gate.shouldLog('a.js', 1000, false)).toBe(false);
    expect(gate.shouldLog('b.js', 1000, false)).toBe(true);
  });
  it('lets a missing document log again after a minute, not before', () => {
    const gate = new MissingLogGate();
    expect(gate.shouldLog('doc', 0, true)).toBe(true);
    expect(gate.shouldLog('doc', 59_999, true)).toBe(false);
    expect(gate.shouldLog('doc', 60_000, true)).toBe(true);
  });
  it('stops at a hard cap, so a flood of different missing files cannot fill the log', () => {
    const gate = new MissingLogGate(3);
    const results = [0, 1, 2, 3, 4].map((i) => gate.shouldLog(`f${i}`, 0, false));
    expect(results).toEqual([true, true, true, false, false]);
  });
});
