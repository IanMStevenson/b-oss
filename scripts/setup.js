#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
import { execSync } from 'child_process';
import { existsSync, copyFileSync } from 'fs';
import { join } from 'path';

const root = new URL('..', import.meta.url).pathname;

console.log('🔧 b-oss setup\n');

// Check Node version
const major = parseInt(process.versions.node.split('.')[0], 10);
if (major < 20) {
  console.error(`❌ Node 20+ required. Current: ${process.versions.node}`);
  process.exit(1);
}
console.log(`✓ Node ${process.versions.node}`);

// Install dependencies
console.log('📦 Installing dependencies...');
execSync('npm install', { cwd: root, stdio: 'inherit' });

// Copy .env.example → .env.local if not present
const envLocal = join(root, '.env.local');
const envExample = join(root, '.env.example');
if (!existsSync(envLocal)) {
  copyFileSync(envExample, envLocal);
  console.log('✓ Created .env.local (copy of .env.example)');
}

// Typecheck
console.log('🔍 Type-checking...');
execSync('npm run typecheck', { cwd: root, stdio: 'inherit' });

console.log('\n✅ Setup complete!');
console.log('👉 Edit .env.local and add your VITE_BLIPFOTO_CLIENT_ID');
console.log('   (Register at https://www.blipfoto.com/developer/apps)');
console.log('   App type: distributed | Redirect URI: b-ark://oauth/callback');
