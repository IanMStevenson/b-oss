// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InfoBadge } from '../InfoBadge.js';

afterEach(cleanup);

describe('InfoBadge', () => {
  it('links to the unofficial status page from the about popup', async () => {
    render(<InfoBadge appVersion="1.0.0" />);
    await userEvent.click(screen.getByLabelText('About b-ark'));
    const link = screen.getByText('Blipfoto status (unofficial)').closest('a');
    expect(link?.getAttribute('href')).toBe('https://b-oss.dev/b-status');
    expect(link?.getAttribute('target')).toBe('_blank');
  });
});
