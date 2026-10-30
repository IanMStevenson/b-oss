import { describe, expect, it } from 'vitest';
import { affectedPackages, loadGraph, typecheckSteps } from './ci-scope.mjs';

const graph = loadGraph();
const all = [...graph.keys()].sort();
const affected = (...files) => affectedPackages(files, graph);

describe('affectedPackages', () => {
  it('scopes a leaf package to itself', () => {
    expect(affected('packages/b-status/src/index.ts')).toEqual(['b-status']);
  });

  it('does not let b-view match b-view-backup by prefix', () => {
    expect(affected('packages/b-view-backup/src/x.ts')).not.toContain('b-view');
  });

  it('expands to transitive dependents', () => {
    const hit = affected('packages/b-api/src/client.ts');
    for (const p of ['b-api', 'backup-engine', 'b-mobile', 'b-push', 'b-ark', 'b-ark-chrome']) {
      expect(hit).toContain(p);
    }
    expect(hit).not.toContain('b-status');
    expect(hit).not.toContain('b-visual');
  });

  it('keeps a b-status change away from the Electron and Capacitor apps', () => {
    const hit = affected('packages/b-status/src/index.ts');
    expect(hit).not.toContain('b-ark');
    expect(hit).not.toContain('b-mobile');
  });

  it.each([
    'package.json',
    'package-lock.json',
    'tsconfig.base.json',
    'eslint.config.cjs',
    'vitest.config.ts',
    'types/globals.d.ts',
    'scripts/ci-scope.mjs',
    '.github/workflows/ci.yml',
    '.nvmrc',
    'packages/b-mobile/src/test-setup.ts',
    'packages/not-a-package/x.ts',
  ])('selects everything for %s', (file) => {
    expect(affected(file)).toEqual(all);
  });

  it.each([
    'README.md',
    'assets/icons/icon.ico',
    '.github/workflows/release-win.yml',
    '.claude/settings.json',
  ])('ignores inert file %s', (file) => {
    expect(affected(file)).toEqual([]);
  });

  it('is empty for no changes', () => {
    expect(affected()).toEqual([]);
  });
});

describe('typecheckSteps', () => {
  it('reproduces the full root typecheck for all packages', () => {
    expect(typecheckSteps(all, graph)).toEqual([
      [
        '--build',
        'packages/b-api',
        'packages/b-notify-core',
        'packages/backup-engine',
        'packages/b-ark-ui-components',
        'packages/b-ark-ui-electron',
        'packages/b-ark',
        'packages/b-ark-ui-chrome',
      ],
      ['-p', 'packages/b-visual', '--noEmit'],
      ['-p', 'packages/b-view', '--noEmit'],
      ['-p', 'packages/b-view-backup', '--noEmit'],
      ['-p', 'packages/b-ark-chrome', '--noEmit'],
      ['-p', 'packages/b-mobile-pc', '--noEmit'],
      ['-p', 'packages/b-mobile-pc/e2e', '--noEmit'],
      ['-p', 'packages/b-mobile', '--noEmit'],
      ['-p', 'packages/b-mobile/tsconfig.node.json', '--noEmit'],
      ['-p', 'packages/b-push', '--noEmit'],
      ['-p', 'packages/b-status', '--noEmit'],
    ]);
  });

  it('builds only the upstream packages a scoped package needs', () => {
    expect(typecheckSteps(['b-push'], graph)).toEqual([
      ['--build', 'packages/b-api'],
      ['-p', 'packages/b-push', '--noEmit'],
    ]);
    expect(typecheckSteps(['b-status'], graph)).toEqual([['-p', 'packages/b-status', '--noEmit']]);
  });
});
