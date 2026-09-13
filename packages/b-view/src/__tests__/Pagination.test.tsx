// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// The fixed-cell-count layout (b-oss's pagination redesign) is the whole point of this rewrite —
// the previous version's arrow buttons visibly shifted position as the number of rendered items
// changed page to page, reported live as a real usability problem ("click next twice" unreliable
// since the button moved out from under the second click), not just cosmetic.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Pagination } from '../components/Pagination.js';

afterEach(cleanup);

function pageLabels(): string[] {
  return screen
    .getAllByRole('button')
    .map((b) => b.getAttribute('aria-label') ?? '')
    .filter((label) => label.startsWith('Page '))
    .map((label) => label.replace('Page ', ''));
}

function noop() {}

describe('Pagination — fixed cell count', () => {
  it('shows every page, unpadded, when there are fewer than the fixed cell count', () => {
    render(
      <Pagination
        currentPage={2}
        totalPages={4}
        onPage={noop}
        hasPrev
        hasNext
        onPrev={noop}
        onNext={noop}
      />,
    );
    expect(pageLabels()).toEqual(['1', '2', '3', '4']);
  });

  it('always renders exactly 7 numbered cells once there are more pages than that', () => {
    render(
      <Pagination
        currentPage={95}
        totalPages={381}
        onPage={noop}
        hasPrev
        hasNext
        onPrev={noop}
        onNext={noop}
      />,
    );
    expect(pageLabels()).toHaveLength(7);
  });

  it('always includes the first and last page', () => {
    render(
      <Pagination
        currentPage={95}
        totalPages={381}
        onPage={noop}
        hasPrev
        hasNext
        onPrev={noop}
        onNext={noop}
      />,
    );
    const labels = pageLabels();
    expect(labels[0]).toBe('1');
    expect(labels[labels.length - 1]).toBe('381');
  });

  it('always includes the immediate neighbours of the current page', () => {
    render(
      <Pagination
        currentPage={95}
        totalPages={381}
        onPage={noop}
        hasPrev
        hasNext
        onPrev={noop}
        onNext={noop}
      />,
    );
    expect(pageLabels()).toEqual(expect.arrayContaining(['94', '95', '96']));
  });

  it('renders exactly 7 cells at every edge and middle position, never more or fewer', () => {
    for (const current of [1, 2, 190, 380, 381]) {
      cleanup();
      render(
        <Pagination
          currentPage={current}
          totalPages={381}
          onPage={noop}
          hasPrev
          hasNext
          onPrev={noop}
          onNext={noop}
        />,
      );
      expect(pageLabels()).toHaveLength(7);
    }
  });

  it('cell width is a fixed number of characters based on the total, not the current page', () => {
    const { container } = render(
      <Pagination
        currentPage={1}
        totalPages={381}
        onPage={noop}
        hasPrev={false}
        hasNext
        onPrev={noop}
        onNext={noop}
      />,
    );
    const pageButton = screen.getByLabelText('Page 1');
    expect(pageButton.style.width).toBe('calc(3ch + 14px)');
    // The arrow buttons stay a plain fixed 28px regardless of digit count — only the numbered
    // cells need to widen for bigger totals.
    const prevButton = container.querySelector('[aria-label="Previous page"]') as HTMLElement;
    expect(prevButton.style.width).toBe('28px');
  });

  it('clicking a page number calls onPage with that page', () => {
    const onPage = vi.fn();
    render(
      <Pagination
        currentPage={1}
        totalPages={4}
        onPage={onPage}
        hasPrev={false}
        hasNext
        onPrev={noop}
        onNext={noop}
      />,
    );
    screen.getByLabelText('Page 3').click();
    expect(onPage).toHaveBeenCalledWith(3);
  });
});
