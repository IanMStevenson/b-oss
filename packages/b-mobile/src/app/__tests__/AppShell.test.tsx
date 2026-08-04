// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AppShell } from '../AppShell.js';

afterEach(cleanup);

describe('AppShell', () => {
  it('boots to the Browse route by default', async () => {
    render(<AppShell />);
    expect(await screen.findByText(/SCR-02/)).toBeDefined();
  });
});
