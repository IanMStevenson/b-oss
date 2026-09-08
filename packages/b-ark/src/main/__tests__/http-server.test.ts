// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { startServer, stopServer } from '../http-server.js';

describe('http-server', () => {
  let tmpDir: string;
  let port: number;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'b-ark-http-server-'));
    await fs.writeFile(path.join(tmpDir, 'index.html'), '<html>viewer</html>');
    await fs.writeFile(path.join(tmpDir, 'app.js'), 'console.log(1)');
    port = await startServer('test-account', tmpDir);
  });

  afterEach(async () => {
    stopServer('test-account');
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function get(urlPath: string): Promise<{ status: number; body: string }> {
    const res = await fetch(`http://127.0.0.1:${port}${urlPath}`);
    return { status: res.status, body: await res.text() };
  }

  it('serves index.html at the root instead of 404ing on the directory', async () => {
    const { status, body } = await get('/');
    expect(status).toBe(200);
    expect(body).toBe('<html>viewer</html>');
  });

  it('serves an existing file directly', async () => {
    const { status, body } = await get('/app.js');
    expect(status).toBe(200);
    expect(body).toBe('console.log(1)');
  });

  it('falls back to index.html for an unmatched client-routed path', async () => {
    const { status, body } = await get('/entries/2026-01-01');
    expect(status).toBe(200);
    expect(body).toBe('<html>viewer</html>');
  });

  it('404s for a missing path with a file extension', async () => {
    const { status } = await get('/does-not-exist.js');
    expect(status).toBe(404);
  });
});
