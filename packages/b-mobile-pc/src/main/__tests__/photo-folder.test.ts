// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

/* eslint-disable @typescript-eslint/require-await -- the fakes implement async interfaces */
import { describe, it, expect } from 'vitest';
import { parseFolderMap, pickPhotoForAccount, type PhotoFolderDeps } from '../photo-folder.js';

function fakeDeps(
  opts: {
    file?: string | null;
    existing?: string[];
    chosen?: string | null;
    failWrite?: boolean;
  } = {},
) {
  const state = { file: opts.file ?? null, startedAt: 'unset' as string | undefined };
  const deps: PhotoFolderDeps = {
    readFile: async () => state.file,
    writeFile: async (c) => {
      if (opts.failWrite) throw new Error('disk full');
      state.file = c;
    },
    folderExists: async (p) => (opts.existing ?? []).includes(p),
    openDialog: async (start) => {
      state.startedAt = start;
      return opts.chosen === undefined ? null : opts.chosen;
    },
  };
  return { deps, state };
}

describe('parseFolderMap', () => {
  it('tolerates missing, corrupt and wrongly shaped files', () => {
    expect(parseFolderMap(null)).toEqual({});
    expect(parseFolderMap('not json')).toEqual({});
    expect(parseFolderMap('[1]')).toEqual({});
    expect(parseFolderMap('{"a":"/x","b":3,"c":""}')).toEqual({ a: '/x' });
  });
});

describe('pickPhotoForAccount', () => {
  it('starts nowhere in particular for an account with no history', async () => {
    const { deps, state } = fakeDeps({ chosen: '/p/a/one.jpg' });
    expect(await pickPhotoForAccount('A', deps)).toBe('/p/a/one.jpg');
    expect(state.startedAt).toBeUndefined();
  });

  it('remembers the folder of the chosen file per account', async () => {
    const { deps, state } = fakeDeps({ chosen: '/p/a/one.jpg', existing: ['/p/a', '/p/b'] });
    await pickPhotoForAccount('A', deps);
    const second = fakeDeps({
      file: state.file,
      chosen: '/p/b/two.jpg',
      existing: ['/p/a', '/p/b'],
    });
    await pickPhotoForAccount('B', second.deps);
    expect(second.state.startedAt).toBeUndefined(); // B has no history of its own
    const third = fakeDeps({ file: second.state.file, chosen: null, existing: ['/p/a', '/p/b'] });
    await pickPhotoForAccount('A', third.deps);
    expect(third.state.startedAt).toBe('/p/a');
    const fourth = fakeDeps({ file: second.state.file, chosen: null, existing: ['/p/a', '/p/b'] });
    await pickPhotoForAccount('B', fourth.deps);
    expect(fourth.state.startedAt).toBe('/p/b');
  });

  it('falls back when the remembered folder is gone', async () => {
    const { deps, state } = fakeDeps({ file: '{"A":"/gone"}', chosen: null, existing: [] });
    expect(await pickPhotoForAccount('A', deps)).toBeNull();
    expect(state.startedAt).toBeUndefined();
  });

  it('does not change the memory on cancel', async () => {
    const { deps, state } = fakeDeps({ file: '{"A":"/p/a"}', chosen: null, existing: ['/p/a'] });
    await pickPhotoForAccount('A', deps);
    expect(state.file).toBe('{"A":"/p/a"}');
  });

  it('still returns the pick if remembering it fails', async () => {
    const { deps } = fakeDeps({ chosen: '/p/a/one.jpg', failWrite: true });
    expect(await pickPhotoForAccount('A', deps)).toBe('/p/a/one.jpg');
  });
});
