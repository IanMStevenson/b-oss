// @ts-check
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const reactHooksPlugin = require('eslint-plugin-react-hooks');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.js', '**/*.cjs', '**/*.mjs', '**/electron.vite.config.ts', '**/vite.config.ts', '**/capacitor.config.ts'],
  },
  {
    files: ['packages/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { project: true },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      ...tsPlugin.configs['recommended-type-checked'].rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Enforce architecture boundaries
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['electron'], message: 'Only packages/b-ark may import from electron.' },
          { group: ['@capacitor/*'], message: 'Only packages/b-mobile/src/platform/** may import from @capacitor/*.' },
          { group: ['react-router', 'react-router-dom'], message: 'Only packages/b-mobile/src/app/routes/** may import react-router — screens use useAppNavigate() instead (app-architecture.md §5).' }
        ]
      }],
    },
  },
  {
    // packages/b-ark is the Electron shell — it may import from electron.
    files: ['packages/b-ark/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    // The Capacitor platform boundary (app-architecture.md §4): @capacitor/* imports live only
    // here, so screens/flows/state/components stay testable in jsdom with platform mocked.
    files: ['packages/b-mobile/src/platform/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['react-router', 'react-router-dom'], message: 'Only packages/b-mobile/src/app/routes/** may import react-router.' }
        ]
      }],
    },
  },
  {
    // react-router is confined to the route table (app-architecture.md §5) so an eventual
    // Ionic 9 / React Router 6 migration touches one directory instead of every screen.
    // AppShell.tsx is the one exception outside routes/: it sets up IonReactRouter itself,
    // the router provider every screen's wrapped navigation depends on existing at all.
    files: ['packages/b-mobile/src/app/routes/**/*.{ts,tsx}', 'packages/b-mobile/src/app/AppShell.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@capacitor/*'], message: 'Only packages/b-mobile/src/platform/** may import from @capacitor/*.' }
        ]
      }],
    },
  },
];
