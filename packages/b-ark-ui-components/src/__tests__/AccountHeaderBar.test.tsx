// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AccountHeaderBar } from '../AccountHeaderBar.js';
import { BackupButton } from '../BackupButton.js';

afterEach(cleanup);

describe('AccountHeaderBar', () => {
  it('renders the title and the meta line when the journal is loaded', () => {
    render(
      <AccountHeaderBar
        avatar={<div data-testid="avatar" />}
        avatarSize={56}
        title="My Journal"
        username="gbradley"
        metaReady
        sinceDate="2024-01-09"
        entryTotal={1234}
        actions={null}
      />,
    );
    expect(screen.getByText('My Journal')).toBeDefined();
    // meta line: "@gbradley · since 09 Jan 2024 · 1,234 entries"
    const meta = screen.getByText(/@gbradley/);
    expect(meta.textContent).toContain('1,234 entries');
    expect(meta.textContent).toContain('09 Jan 2024');
  });

  it('omits the since/entries meta until the journal is ready', () => {
    render(
      <AccountHeaderBar
        avatar={<div />}
        avatarSize={40}
        title="t"
        username="gbradley"
        metaReady={false}
        sinceDate={null}
        entryTotal={0}
        actions={null}
      />,
    );
    const meta = screen.getByText(/@gbradley/);
    expect(meta.textContent).not.toContain('entries');
  });

  it('renders the status dot only when a colour is given', () => {
    const { container, rerender } = render(
      <AccountHeaderBar
        avatar={<div />}
        avatarSize={56}
        statusDotColour="var(--rag-green)"
        title="t"
        username="u"
        metaReady={false}
        sinceDate={null}
        entryTotal={0}
        actions={null}
      />,
    );
    // dot is the absolutely-positioned sibling of the avatar
    const withDot = container.querySelectorAll('div[style*="border-radius: 50%"]').length;
    rerender(
      <AccountHeaderBar
        avatar={<div />}
        avatarSize={56}
        title="t"
        username="u"
        metaReady={false}
        sinceDate={null}
        entryTotal={0}
        actions={null}
      />,
    );
    const withoutDot = container.querySelectorAll('div[style*="border-radius: 50%"]').length;
    expect(withDot).toBeGreaterThan(withoutDot);
  });
});

describe('BackupButton', () => {
  it('shows the default CloudDownload icon for the primary variant', () => {
    const { container } = render(<BackupButton label="Back up now" />);
    expect(screen.getByText('Back up now')).toBeDefined();
    expect(container.querySelector('svg')).not.toBeNull(); // icon present
  });

  it('hides the icon while busy and disables the button', () => {
    const { container } = render(<BackupButton label="Backing up…" busy />);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('button')?.disabled).toBe(true);
  });

  it('renders the cancel variant without an icon', () => {
    const { container } = render(<BackupButton label="Cancel" variant="cancel" />);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('button')?.disabled).toBe(false);
  });
});
