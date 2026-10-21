// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Sanity checks on the committed licences file and on the dependency walk. Whether the file is
// current with package-lock.json is a release-time check (`npm run licences:check`), not a
// per-PR one: the list only matters for a distributed build, and `npm run build` regenerates it.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { OUT_PATH, productionPackages } from './licences.mjs';

const generated = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));

describe('licences.generated.json', () => {
  it('gives every package at least one licence text', () => {
    for (const p of generated.packages) {
      expect(p.texts.length, `${p.name}@${p.version}`).toBeGreaterThan(0);
      for (const i of p.texts) expect(typeof generated.texts[i]).toBe('string');
    }
  });

  it('includes runtime dependencies and leaves out dev-only tooling and our own packages', () => {
    const names = new Set(generated.packages.map((p) => p.name));
    for (const name of ['react', 'maplibre-gl', '@ionic/react', '@capacitor/core', 'zustand']) {
      expect(names.has(name), name).toBe(true);
    }
    for (const name of ['vite', 'vitest', '@capacitor/cli', '@b-oss/b-api', '@types/react']) {
      expect(names.has(name), name).toBe(false);
    }
  });
});

describe('productionPackages', () => {
  const lock = {
    packages: {
      'packages/b-mobile': {
        dependencies: { a: '*', '@b-oss/w': '*' },
        devDependencies: { dev: '*' },
      },
      'node_modules/@b-oss/w': { link: true, resolved: 'packages/w' },
      'packages/w': { dependencies: { b: '*' } },
      'node_modules/a': {
        version: '1.0.0',
        license: 'MIT',
        dependencies: { b: '*' },
        optionalDependencies: { bin: '*' },
      },
      'node_modules/a/node_modules/b': { version: '2.0.0', license: 'ISC' },
      'node_modules/b': {
        version: '1.0.0',
        license: 'MIT',
        peerDependencies: { p: '*', q: '*' },
        peerDependenciesMeta: { q: { optional: true } },
      },
      'node_modules/p': { version: '3.0.0', license: 'MIT' },
      'node_modules/bin': { version: '1.0.0', license: 'MIT', optional: true },
      'node_modules/dev': { version: '1.0.0', license: 'MIT', dev: true },
    },
  };

  it('resolves nested copies first, follows workspace links and required peers, and skips dev and optional deps', () => {
    expect(productionPackages(lock).map((p) => `${p.name}@${p.version}`)).toEqual([
      'a@1.0.0',
      'b@1.0.0',
      'b@2.0.0',
      'p@3.0.0',
    ]);
  });

  it('fails loudly when a required dependency is missing from the lockfile', () => {
    const broken = { packages: { ...lock.packages, 'node_modules/p': undefined } };
    expect(() => productionPackages(broken)).toThrow(/Cannot resolve p/);
  });
});
