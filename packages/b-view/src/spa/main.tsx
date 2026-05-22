// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import '../styles/base.css';
import App from './App.js';

createRoot(document.getElementById('root')!).render(<App />);
