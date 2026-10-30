// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// How the app's own origin is served: static files from b-mobile's web build, plus the Blipfoto API
// proxied on the same origin (as `vite dev` does), so the renderer's plain fetch()/FormData paths
// need no CORS workaround. Pure functions only (no electron import) so they are unit-testable; the
// protocol handler that applies them is in index.ts.

import { createHash } from 'node:crypto';
import { posix, resolve, sep } from 'node:path';

export const APP_SCHEME = 'app';
export const APP_HOST = 'b-mobile';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
export const API_PREFIX = '/api/blipfoto/';
export const DEFAULT_API_ORIGIN = 'https://api.blipfoto.com';

export type AppRequestPlan =
  | { kind: 'api'; target: string }
  | { kind: 'static'; file: string; spaFallback: boolean }
  | { kind: 'reject'; status: 400 | 403 };

/** Decides what an app:// request should do. Never touches the file system. */
export function planAppRequest(
  rawUrl: string,
  distDir: string,
  apiOrigin: string = DEFAULT_API_ORIGIN,
): AppRequestPlan {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { kind: 'reject', status: 400 };
  }
  if (url.protocol !== `${APP_SCHEME}:` || url.host !== APP_HOST) {
    return { kind: 'reject', status: 403 };
  }

  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return { kind: 'reject', status: 400 };
  }
  if (pathname.includes('\0')) return { kind: 'reject', status: 400 };

  if (pathname.startsWith(API_PREFIX)) {
    // The target host is fixed: only the path and query come from the request. A path such as
    // "/api/blipfoto//evil.example/x" stays a path on apiOrigin because it is appended, not parsed
    // as a URL, and the origin is checked after parsing as a belt-and-braces measure.
    const target = new URL(`${apiOrigin}/${url.pathname.slice(API_PREFIX.length)}${url.search}`);
    if (target.origin !== new URL(apiOrigin).origin) return { kind: 'reject', status: 403 };
    return { kind: 'api', target: target.toString() };
  }

  const root = resolve(distDir);
  const relative = posix.normalize(pathname === '/' ? '/index.html' : pathname).replace(/^\/+/, '');
  const file = resolve(root, relative);
  if (file !== root && !file.startsWith(root + sep)) return { kind: 'reject', status: 403 };
  // A path with a file extension is an asset: if it is missing that is a 404, not the SPA shell.
  const looksLikeAsset = /\.[A-Za-z0-9]+$/.test(relative);
  return { kind: 'static', file, spaFallback: !looksLikeAsset };
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

export function mimeFor(file: string): string {
  const dot = file.lastIndexOf('.');
  return (
    (dot === -1 ? undefined : MIME[file.slice(dot).toLowerCase()]) ?? 'application/octet-stream'
  );
}

/** Request headers that must not be forwarded to the API: the renderer's origin and cookies mean
 * nothing there, and sending them can make the API treat the call as a cross-site browser request. */
export function sanitiseRequestHeaders(headers: Headers): Headers {
  const out = new Headers(headers);
  for (const name of ['origin', 'referer', 'host', 'cookie', 'cookie2']) out.delete(name);
  return out;
}

/** net.fetch has already decoded the body, so the upstream encoding/length headers would make the
 * renderer decode it a second time. Cookies from the API are not for the renderer either. */
export function sanitiseResponseHeaders(headers: Headers): Headers {
  const out = new Headers(headers);
  for (const name of ['content-encoding', 'content-length', 'transfer-encoding', 'set-cookie']) {
    out.delete(name);
  }
  return out;
}

/** The Content-Security-Policy for the app's documents. Inline scripts (b-mobile's index.html has
 * a tiny theme bootstrap) are allowed by hash, computed from the document actually being served,
 * so the policy stays correct when that script changes. */
export function buildCsp(indexHtml: string): string {
  const hashes = inlineScriptHashes(indexHtml);
  const scriptSrc = ["'self'", ...hashes.map((h) => `'sha256-${h}'`)].join(' ');
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // Ionic sets inline styles at runtime.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: data: blob:",
    "font-src 'self' data:",
    // Broad on purpose for now: the app loads map tiles and photos from third-party https hosts.
    "connect-src 'self' https:",
    "media-src 'self' https: blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  const re = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(re)) {
    const body = match[1] ?? '';
    if (body.trim() === '') continue;
    hashes.push(createHash('sha256').update(body, 'utf8').digest('base64'));
  }
  return hashes;
}

/** Only the app's own pages may talk to the main process. */
export function isTrustedSender(frameUrl: string | undefined): boolean {
  if (!frameUrl) return false;
  try {
    const url = new URL(frameUrl);
    return url.protocol === `${APP_SCHEME}:` && url.host === APP_HOST;
  } catch {
    return false;
  }
}
