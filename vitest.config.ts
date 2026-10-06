import { defineConfig } from 'vitest/config';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

// Same alias as packages/b-mobile/vite.config.ts (CI runs vitest from the root, so this config is
// the one that applies there): Ionic 9's React wrappers sit on @lit/react, whose `node` export is
// an SSR build that never sets props/events — Ionic controls would be inert under jsdom. Only
// b-mobile imports Ionic, so nothing else is affected.
function litReactBrowserBuild(): string {
  return resolve(dirname(createRequire(import.meta.url).resolve('@lit/react')), '../index.js');
}

export default defineConfig({
  // Mirror the build-time defines the chrome packages rely on (normally injected by their
  // vite config) so their modules can be imported directly in tests.
  define: {
    __RELEASE__: 'false',
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
  },
  test: {
    passWithNoTests: true,
    // CI runs on windows-latest, where importing Ionic + jsdom per file is slow and a loaded runner
    // starves tests: the 5s default timed out the heavier b-mobile screen tests intermittently
    // (b-oss#221). Generous limits only change when a *hung* test is reported; passing tests aren't
    // slower. Testing Library's own async-util timeout is raised to match in test-setup.ts.
    testTimeout: 20_000,
    hookTimeout: 30_000,
    exclude: ['**/node_modules/**', '**/dist/**'],
    server: { deps: { inline: [/@lit\/react/, /@stencil\/react-output-target/] } },
    alias: { '@lit/react': litReactBrowserBuild() },
    // jsdom has no scroll implementation; Ionic components (b-mobile only, so far) that scroll
    // their active item into view throw without this. Guarded so it's a no-op for every other
    // package's test files, which don't touch the DOM at all.
    setupFiles: ['./packages/b-mobile/src/test-setup.ts'],
  },
});
