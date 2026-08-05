// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { BBCodeText } from '../components/BBCodeText.js';

afterEach(cleanup);

describe('BBCodeText', () => {
  it('renders allowed tags as real elements, not raw HTML', () => {
    const { container } = render(<BBCodeText source="[b]bold[/b] and [i]italic[/i]" />);
    expect(container.querySelector('b')?.textContent).toBe('bold');
    expect(container.querySelector('i')?.textContent).toBe('italic');
  });

  it('leaves disallowed tags as literal source text instead of dropping or executing them', () => {
    render(<BBCodeText source="[script]alert(1)[/script] plain text" />);
    expect(screen.getByText(/\[script\]alert\(1\)\[\/script\]/)).toBeDefined();
  });

  it('never uses dangerouslySetInnerHTML-style raw injection for [url] content', () => {
    const { container } = render(<BBCodeText source="[url=https://example.com]link[/url]" />);
    const anchor = container.querySelector('a');
    expect(anchor?.getAttribute('href')).toBe('https://example.com');
    expect(anchor?.textContent).toBe('link');
  });

  it('normalizes a scheme-less bare URL to http://', () => {
    const { container } = render(<BBCodeText source="[url]example.com[/url]" />);
    expect(container.querySelector('a')?.getAttribute('href')).toBe('http://example.com');
  });

  it('normalizes an email-looking target to mailto:', () => {
    const { container } = render(<BBCodeText source="[url]person@example.com[/url]" />);
    expect(container.querySelector('a')?.getAttribute('href')).toBe('mailto:person@example.com');
  });

  it('calls the default window.open handler on link click when no onLinkClick is given', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { container } = render(<BBCodeText source="[url=https://example.com]link[/url]" />);
    fireEvent.click(container.querySelector('a')!);
    expect(openSpy).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
    openSpy.mockRestore();
  });

  it("splits blank-line-separated text into real <p> elements, matching Blipfoto's own _html output", () => {
    const { container } = render(<BBCodeText source={'First paragraph.\n\nSecond paragraph.'} />);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]?.textContent).toBe('First paragraph.');
    expect(paragraphs[1]?.textContent).toBe('Second paragraph.');
  });

  it('renders nothing for empty/whitespace-only source', () => {
    const { container } = render(<BBCodeText source={'   \n\n  '} />);
    expect(container.firstChild).toBeNull();
  });

  it('calls onLinkClick instead of window.open when provided', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const onLinkClick = vi.fn();
    const { container } = render(
      <BBCodeText source="[url=https://example.com]link[/url]" onLinkClick={onLinkClick} />,
    );
    fireEvent.click(container.querySelector('a')!);
    expect(onLinkClick).toHaveBeenCalledWith('https://example.com');
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });
});
