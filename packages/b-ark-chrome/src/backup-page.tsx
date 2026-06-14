// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { StrictMode } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { BackupPage, BrowserBackend } from '@b-oss/b-ark-ui-chrome';
import '@b-oss/b-ark-ui-chrome/src/styles.css';

// b-ark relies on the File System Access folder picker, which only exists on desktop
// Chromium (Chrome, Edge). The Chrome Web Store already blocks install on platforms
// without it, but feature-detect here as belt-and-braces so a fringe Chromium fork
// that loads the extension without the API shows a clear message instead of a raw
// throw when the user clicks "choose folder".
function isSupportedBrowser(): boolean {
  return typeof window.showDirectoryPicker === 'function';
}

function UnsupportedBrowser(): ReactElement {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div style={{ maxWidth: 420, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
        <p style={{ color: 'var(--ink)', fontWeight: 600, marginBottom: 8 }}>
          This browser isn&rsquo;t supported
        </p>
        <p>
          b&#8209;ark backs up to a folder on your computer, which needs the File System Access API.
          Please use desktop Chrome or Edge.
        </p>
      </div>
    </div>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('#root element not found');

const backend = isSupportedBrowser() ? new BrowserBackend() : null;

createRoot(container).render(
  <StrictMode>{backend ? <BackupPage backend={backend} /> : <UnsupportedBrowser />}</StrictMode>,
);
