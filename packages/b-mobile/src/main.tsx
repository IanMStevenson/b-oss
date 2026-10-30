// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { createRoot } from 'react-dom/client';
import { setupIonicReact } from '@ionic/react';

/* Core CSS required for Ionic components to work properly */
import '@ionic/react/css/core.css';

/* Basic CSS for apps built with Ionic */
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';

/* Optional CSS utils that can be commented out */
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';

import './styles/theme.css';
import './styles/globals.css';

import { AppShell } from './app/AppShell.js';
import { AppErrorBoundary } from './components/AppErrorBoundary.js';
import { installGlobalErrorLogging } from './platform/diagnostics.js';
import { initTheme } from './theme/theme.js';

setupIonicReact();
initTheme(); // also sets the system-bar styles
installGlobalErrorLogging(); // desktop shell only; a no-op elsewhere

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <AppShell />
  </AppErrorBoundary>,
);
