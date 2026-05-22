// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import React from 'react';
import { createRoot } from 'react-dom/client';
import { App, ElectronBackend } from '@b-oss/b-ark-ui';
import '@b-oss/b-ark-ui/src/styles/global.css';

const backend = new ElectronBackend();

const container = document.getElementById('root');
if (!container) throw new Error('#root element not found');

createRoot(container).render(
  <React.StrictMode>
    <App backend={backend} />
  </React.StrictMode>,
);
