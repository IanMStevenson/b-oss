// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import http from 'node:http';
import handler from 'serve-handler';

const servers = new Map<string, { server: http.Server; port: number }>();

export async function startServer(accountId: string, backupFolder: string): Promise<number> {
  stopServer(accountId);

  const port = await getFreePort();
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    void handler(req, res, { public: backupFolder });
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => resolve());
    server.on('error', reject);
  });

  servers.set(accountId, { server, port });
  return port;
}

export function stopServer(accountId: string): void {
  const existing = servers.get(accountId);
  if (existing) {
    existing.server.close();
    servers.delete(accountId);
  }
}

export function stopAllServers(): void {
  for (const id of [...servers.keys()]) stopServer(id);
}

export function getServerPort(accountId: string): number | null {
  return servers.get(accountId)?.port ?? null;
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr === null || typeof addr === 'string') {
        srv.close();
        reject(new Error('Could not determine free port'));
        return;
      }
      const { port } = addr;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}
