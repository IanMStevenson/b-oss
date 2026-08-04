// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// §14's tag set and [url] behaviour are exactly the kind of rule most likely to be got subtly
// wrong (§19) — worth testing directly against the real @bbob integration, not just the preset
// function in isolation.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BBCodeText } from '../BBCodeText.js';

vi.mock('../../platform/browser.js', () => ({
  openUrl: vi.fn(),
}));

afterEach(cleanup);

describe('BBCodeText', () => {
  it('renders the five supported tags as their semantic HTML elements', () => {
    const { container } = render(
      <BBCodeText source="[b]bold[/b] [i]italic[/i] [u]under[/u] [s]struck[/s]" />,
    );
    expect(container.querySelector('b')?.textContent).toBe('bold');
    expect(container.querySelector('i')?.textContent).toBe('italic');
    expect(container.querySelector('u')?.textContent).toBe('under');
    expect(container.querySelector('s')?.textContent).toBe('struck');
  });

  it('renders an unknown tag as its literal source text rather than dropping it', () => {
    const { container } = render(<BBCodeText source="[quote]not supported[/quote]" />);
    expect(container.textContent).toContain('[quote]');
    expect(container.textContent).toContain('not supported');
  });

  it('[url=target]Label[/url] uses the attr as href and the content as the label', () => {
    const { container } = render(<BBCodeText source="[url=example.com]My link[/url]" />);
    const anchor = container.querySelector('a');
    expect(anchor?.textContent).toBe('My link');
    expect(anchor?.getAttribute('href')).toBe('http://example.com');
  });

  it('bare [url]target[/url] uses the target as both href and label', () => {
    const { container } = render(<BBCodeText source="[url]example.com/page[/url]" />);
    const anchor = container.querySelector('a');
    expect(anchor?.textContent).toBe('example.com/page');
    expect(anchor?.getAttribute('href')).toBe('http://example.com/page');
  });

  it('a URL with a scheme is left unchanged', () => {
    const { container } = render(<BBCodeText source="[url]https://example.com[/url]" />);
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
  });

  it('an email-looking target becomes a mailto: link', () => {
    const { container } = render(<BBCodeText source="[url]person@example.com[/url]" />);
    expect(container.querySelector('a')?.getAttribute('href')).toBe('mailto:person@example.com');
  });

  it('intercepts a link click and routes it through platform/browser.ts rather than navigating', async () => {
    const { openUrl } = await import('../../platform/browser.js');
    const { container } = render(<BBCodeText source="[url]example.com[/url]" />);
    const anchor = container.querySelector('a');
    expect(anchor).not.toBeNull();
    anchor!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(openUrl).toHaveBeenCalledWith('http://example.com');
  });
});
