// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BackupPage, BrowserBackend } from '@b-oss/b-ark-ui-chrome';
import '@b-oss/b-ark-ui-chrome/src/styles.css';

const backend = new BrowserBackend();

const container = document.getElementById('root');
if (!container) throw new Error('#root element not found');

createRoot(container).render(
  <StrictMode>
    <BackupPage backend={backend} />
  </StrictMode>,
);
