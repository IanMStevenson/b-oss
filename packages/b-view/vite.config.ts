// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  define: mode === 'development' ? { 'process.env.NODE_ENV': '"development"' } : {},
  plugins: [
    react(),
    {
      name: 'file-protocol-compat',
      transformIndexHtml(html: string) {
        return html
          .replace(/<script\s+type="module"/g, '<script defer')
          .replace(/\s+crossorigin(?:="[^"]*")?/g, '');
      },
    },
  ],
  root: 'src/spa',
  base: './',
  build: {
    outDir: '../../dist-app',
    assetsDir: 'b-view',
    emptyOutDir: true,
    minify: mode !== 'development',
    target: 'es2015',
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
      },
    },
  },
}));
