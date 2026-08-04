import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Mirror the build-time defines the chrome packages rely on (normally injected by their
  // vite config) so their modules can be imported directly in tests.
  define: {
    __RELEASE__: 'false',
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
  },
  test: {
    passWithNoTests: true,
    exclude: ['**/node_modules/**', '**/dist/**'],
    // jsdom has no scroll implementation; Ionic components (b-mobile only, so far) that scroll
    // their active item into view throw without this. Guarded so it's a no-op for every other
    // package's test files, which don't touch the DOM at all.
    setupFiles: ['./packages/b-mobile/src/test-setup.ts'],
  },
});
