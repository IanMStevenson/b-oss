// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// b-oss#696: the shell/web build comparison. Off the desktop shell nothing happens (Android and web
// unchanged).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildErrorDetails } from '../diagnostics.js';
import {
  OLDER_SHELL,
  checkShellBuild,
  compareBuilds,
  knownShellBuild,
  mismatchLogLine,
  resetShellBuildForTests,
} from '../shellBuild.js';

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).bMobileDesktop;
  resetShellBuildForTests();
  vi.unstubAllGlobals();
});

describe('compareBuilds', () => {
  it('matches equal ids', () => {
    expect(compareBuilds('1.0.2.0.22', '1.0.2.0.22').kind).toBe('match');
  });
  it('flags different ids and keeps both', () => {
    expect(compareBuilds('1.0.2.0.20', '1.0.2.0.22')).toEqual({
      kind: 'mismatch',
      shell: '1.0.2.0.20',
      web: '1.0.2.0.22',
    });
  });
  it('treats a shell that reported nothing (an older shell) as a mismatch', () => {
    expect(compareBuilds(undefined, '1.0.2.0.22')).toEqual({
      kind: 'mismatch',
      shell: OLDER_SHELL,
      web: '1.0.2.0.22',
    });
    expect(compareBuilds('', '1.0.2.0.22').kind).toBe('mismatch');
  });
  it('names both versions in the log line', () => {
    const line = mismatchLogLine(compareBuilds('1.0.2.0.20', '1.0.2.0.22'));
    expect(line).toContain('1.0.2.0.20');
    expect(line).toContain('1.0.2.0.22');
  });
});

describe('checkShellBuild', () => {
  const web = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown';
  const install = (shell: unknown): void => {
    (window as unknown as Record<string, unknown>).bMobileDesktop = { version: 1, shell };
  };

  it('does nothing off the desktop shell', async () => {
    expect(await checkShellBuild()).toBeNull();
    expect(knownShellBuild()).toBeNull();
  });

  it('matches when the shell reports this web build', async () => {
    install({ info: () => Promise.resolve({ build: web }) });
    expect((await checkShellBuild())?.kind).toBe('match');
  });

  it('is a mismatch for a different build, and for a shell with no shell member', async () => {
    install({ info: () => Promise.resolve({ build: 'older' }) });
    expect((await checkShellBuild())?.kind).toBe('mismatch');
    install(undefined);
    expect((await checkShellBuild())?.shell).toBe(OLDER_SHELL);
  });

  it('survives a shell whose info() rejects', async () => {
    install({ info: () => Promise.reject(new Error('boom')) });
    expect((await checkShellBuild())?.kind).toBe('mismatch');
  });

  it('puts the shell build in Copy details only once it is known', async () => {
    const info = { source: 'boundary', message: 'x' };
    expect(buildErrorDetails(info)).not.toContain('Shell:');
    install({ info: () => Promise.resolve({ build: 'older' }) });
    await checkShellBuild();
    expect(buildErrorDetails(info)).toContain('Shell: older (does not match the web build)');
  });
});
