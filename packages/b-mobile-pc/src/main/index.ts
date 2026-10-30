// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Electron main process for b-mobile on desktop (epic b-oss#605). It serves b-mobile's web build on
// a private origin, proxies the Blipfoto API on that origin, keeps secrets in the OS keystore, and
// runs the sign-in window. All the decision logic lives in the pure modules next to this file.

import {
  app,
  BrowserWindow,
  ipcMain,
  net,
  protocol,
  safeStorage,
  screen,
  session,
  shell,
} from 'electron';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { CHANNELS } from '../shared/bridge.js';
import {
  APP_ORIGIN,
  APP_SCHEME,
  DEFAULT_API_ORIGIN,
  buildCsp,
  isTrustedSender,
  mimeFor,
  planAppRequest,
  sanitiseRequestHeaders,
  sanitiseResponseHeaders,
} from './app-protocol.js';
import { openAuthWindow } from './auth-window.js';
import { DEFAULT_AUTH_HOSTS, validateAuthRequest } from './auth-request.js';
import { SecureStore, type SecretCrypto } from './secure-store.js';
import { MIN_HEIGHT, MIN_WIDTH, parseWindowState } from './window-state.js';

// Test hooks (e2e runs against a stub API and a fake sign-in page). Ignored in a packaged app.
const testMode = !app.isPackaged;
const apiOrigin = (testMode && process.env.BMPC_API_ORIGIN) || DEFAULT_API_ORIGIN;
const authHosts = (testMode && process.env.BMPC_AUTH_HOSTS?.split(',')) || [...DEFAULT_AUTH_HOSTS];
const authAllowHttp = testMode && process.env.BMPC_AUTH_ALLOW_HTTP === '1';

const distDir = app.isPackaged
  ? join(process.resourcesPath, 'web')
  : (process.env.BMPC_DIST ?? resolve(__dirname, '../../../b-mobile/dist'));

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

// --- secure storage -------------------------------------------------------------------------

const electronCrypto: SecretCrypto = {
  async isAvailable() {
    if (!(await safeStorage.isAsyncEncryptionAvailable())) return false;
    // On Linux Electron can "encrypt" with a hard-coded password when no keyring is running:
    // that is plaintext in effect, so it does not count as available.
    if (process.platform === 'linux') {
      const backend = safeStorage.getSelectedStorageBackend();
      if (backend === 'basic_text' || backend === 'unknown') return false;
    }
    return true;
  },
  encrypt: (plaintext) => safeStorage.encryptStringAsync(plaintext),
  async decrypt(ciphertext) {
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(ciphertext);
    return { result, shouldReEncrypt };
  },
};

function atomicFile(path: string) {
  return {
    async read(): Promise<string | null> {
      try {
        return await readFile(path, 'utf8');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      }
    },
    async write(contents: string): Promise<void> {
      await mkdir(dirname(path), { recursive: true });
      // Write to path + '.tmp', then rename, so a crash never leaves a half-written file.
      await writeFile(`${path}.tmp`, contents, { mode: 0o600 });
      await rename(`${path}.tmp`, path);
    },
  };
}

// --- the app origin -------------------------------------------------------------------------

let cspHeader: string | undefined;

async function cspForDocuments(): Promise<string> {
  cspHeader ??= buildCsp(await readFile(join(distDir, 'index.html'), 'utf8'));
  return cspHeader;
}

async function proxyApi(request: Request, target: string): Promise<Response> {
  const init: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers: sanitiseRequestHeaders(request.headers),
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half';
  }
  try {
    const upstream = await net.fetch(target, init);
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: sanitiseResponseHeaders(upstream.headers),
    });
  } catch {
    return new Response('Could not reach the Blipfoto API', { status: 502 });
  }
}

async function readStatic(file: string): Promise<Buffer | null> {
  try {
    return await readFile(file);
  } catch (err) {
    if (
      (err as NodeJS.ErrnoException).code === 'ENOENT' ||
      (err as NodeJS.ErrnoException).code === 'EISDIR'
    ) {
      return null;
    }
    throw err;
  }
}

async function handleAppRequest(request: Request): Promise<Response> {
  const plan = planAppRequest(request.url, distDir, apiOrigin);
  if (plan.kind === 'reject') return new Response('Forbidden', { status: plan.status });
  if (plan.kind === 'api') return proxyApi(request, plan.target);

  let file = plan.file;
  let body = await readStatic(file);
  if (body === null && plan.spaFallback) {
    file = join(distDir, 'index.html');
    body = await readStatic(file);
  }
  if (body === null) return new Response('Not found', { status: 404 });

  const headers = new Headers({
    'content-type': mimeFor(file),
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-cache',
  });
  if (file.toLowerCase().endsWith('.html'))
    headers.set('content-security-policy', await cspForDocuments());
  return new Response(new Uint8Array(body), { headers });
}

// --- window ---------------------------------------------------------------------------------

let mainWindow: BrowserWindow | null = null;
const statePath = (): string => join(app.getPath('userData'), 'window-state.json');

async function createWindow(): Promise<void> {
  const saved = parseWindowState(
    await readFile(statePath(), 'utf8').catch(() => null),
    screen.getAllDisplays().map((d) => d.workArea),
  );
  const win = new BrowserWindow({
    x: saved.x,
    y: saved.y,
    width: saved.width,
    height: saved.height,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: 'b-mobile',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow = win;
  if (saved.maximized) win.maximize();

  // Links leave the app: https opens in the system browser, anything else is dropped.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(`${APP_ORIGIN}/`) || url === APP_ORIGIN) return;
    event.preventDefault();
    if (url.startsWith('https://')) void shell.openExternal(url);
  });

  win.on('close', () => {
    const b = win.getNormalBounds();
    void atomicFile(statePath()).write(JSON.stringify({ ...b, maximized: win.isMaximized() }));
  });
  win.on('closed', () => {
    mainWindow = null;
  });

  await win.loadURL(`${APP_ORIGIN}/`);
}

// --- start-up -------------------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  void app.whenReady().then(async () => {
    protocol.handle(APP_SCHEME, handleAppRequest);
    // Nothing in the app needs a browser permission (camera, location, notifications go through
    // the shell), so deny every request.
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
      callback(false),
    );

    const store = new SecureStore(
      electronCrypto,
      atomicFile(join(app.getPath('userData'), 'secure-store.json')),
    );
    const handle = (channel: string, fn: (...args: unknown[]) => unknown): void => {
      ipcMain.handle(channel, (event, ...args: unknown[]) => {
        if (!isTrustedSender(event.senderFrame?.url)) throw new Error('Untrusted sender');
        return fn(...args);
      });
    };
    handle(CHANNELS.secureGet, (key) => store.get(key));
    handle(CHANNELS.secureSet, (key, value) => store.set(key, value));
    handle(CHANNELS.secureRemove, (key) => store.remove(key));
    handle(CHANNELS.authOpen, (url, redirectPrefix) => {
      const request = validateAuthRequest(url, redirectPrefix, authHosts, authAllowHttp);
      return openAuthWindow(
        BrowserWindow.getFocusedWindow() ?? mainWindow,
        request.url,
        request.redirectPrefix,
      );
    });

    await createWindow();
  });

  app.on('window-all-closed', () => app.quit());
}
