import { describe, expect, it } from 'vitest';
import { impact } from './release-impact.mjs';

const needed = (...files) =>
  Object.fromEntries(
    impact(files).map((r) => [r.family, { needed: r.needed, products: r.products }]),
  );

describe('impact', () => {
  it('a b-api change needs both families, all four products', () => {
    const r = needed('packages/b-api/src/client.ts');
    expect(r['b-mobile'].products).toEqual(['b-mobile', 'b-mobile-pc']);
    expect(r['b-ark'].products).toEqual(['b-ark', 'b-ark-chrome']);
  });

  it('a b-mobile change also needs the b-mobile-pc build, and not b-ark', () => {
    const r = needed('packages/b-mobile/src/App.tsx');
    expect(r['b-mobile'].products).toEqual(['b-mobile', 'b-mobile-pc']);
    expect(r['b-ark'].needed).toBe(false);
  });

  it('a b-mobile-pc change needs only the b-mobile family', () => {
    const r = needed('packages/b-mobile-pc/src/main.ts');
    expect(r['b-mobile'].needed).toBe(true);
    expect(r['b-ark'].needed).toBe(false);
  });

  it('the shared native add-on reaches b-ark and b-mobile-pc', () => {
    const r = needed('packages/b-win-startup/src/lib.rs');
    expect(r['b-ark'].needed).toBe(true);
    expect(r['b-mobile'].products).toEqual(['b-mobile-pc']);
  });

  it('b-ark changes stay out of the b-mobile family', () => {
    const r = needed('packages/b-ark/src/main/index.ts');
    expect(r['b-ark'].needed).toBe(true);
    expect(r['b-mobile'].needed).toBe(false);
  });

  it('services and docs need no tag', () => {
    for (const f of [
      'packages/b-push/src/index.ts',
      'packages/b-status/src/index.ts',
      'packages/b-site/src/x.astro',
      'README.md',
    ]) {
      const r = needed(f);
      expect(r['b-mobile'].needed).toBe(false);
      expect(r['b-ark'].needed).toBe(false);
    }
  });

  it('a root dependency change needs everything', () => {
    const r = needed('package-lock.json');
    expect(r['b-mobile'].needed && r['b-ark'].needed).toBe(true);
  });
});
