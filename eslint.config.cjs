// @ts-check
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const reactHooksPlugin = require('eslint-plugin-react-hooks');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.js', '**/*.cjs', '**/*.mjs', '**/electron.vite.config.ts', '**/vite.config.ts'],
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
          { group: ['electron'], message: 'Only packages/b-ark may import from electron.' }
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
];
