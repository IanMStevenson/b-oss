// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function serveFile(req: http.IncomingMessage, res: http.ServerResponse, filePath: string): void {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  if (!stat.isFile()) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] ?? 'application/octet-stream';
  const fileSize = stat.size;
  const rangeHeader = req.headers['range'];

  if (rangeHeader) {
    const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
    const start = match?.[1] ? parseInt(match[1], 10) : 0;
    const end = match?.[2] ? parseInt(match[2], 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    const stream = fs.createReadStream(filePath, { start, end });
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
    });
    stream.pipe(res);
  } else {
    res.writeHead(200, {
      'Accept-Ranges': 'bytes',
      'Content-Length': fileSize,
      'Content-Type': contentType,
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

const servers = new Map<string, { server: http.Server; port: number }>();

export async function startServer(accountId: string, backupFolder: string): Promise<number> {
  stopServer(accountId);

  const port = await getFreePort();
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
    // Prevent path traversal
    const resolved = path.resolve(backupFolder, '.' + urlPath);
    if (!resolved.startsWith(path.resolve(backupFolder))) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    serveFile(req, res, resolved);
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
