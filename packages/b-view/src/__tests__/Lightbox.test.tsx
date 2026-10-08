// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Lightbox } from '../components/Lightbox.js';

afterEach(cleanup);

function setup(props: Partial<React.ComponentProps<typeof Lightbox>> = {}) {
  const onClose = vi.fn();
  const onNavigate = vi.fn();
  render(
    <Lightbox
      images={['a.jpg', 'b.jpg', 'c.jpg']}
      index={1}
      onClose={onClose}
      onNavigate={onNavigate}
      {...props}
    />,
  );
  return { onClose, onNavigate };
}

describe('Lightbox top bar', () => {
  it('shows title, journal name and date', () => {
    setup({ title: 'Harbour wall', journalTitle: "Alice's journal", date: '2nd Oct 2026' });
    expect(screen.getByText('Harbour wall')).toBeTruthy();
    expect(screen.getByText(/Alice's journal/)).toBeTruthy();
    expect(screen.getByText(/2nd Oct 2026/)).toBeTruthy();
  });

  it('steps through images with the arrows and closes', () => {
    const { onNavigate, onClose } = setup();
    fireEvent.click(screen.getByLabelText('Next image'));
    fireEvent.click(screen.getByLabelText('Previous image'));
    expect(onNavigate).toHaveBeenNthCalledWith(1, 2);
    expect(onNavigate).toHaveBeenNthCalledWith(2, 0);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('disables the arrow at either end of the images', () => {
    setup({ index: 0 });
    expect(screen.getByLabelText<HTMLButtonElement>('Previous image').disabled).toBe(true);
    expect(screen.getByLabelText<HTMLButtonElement>('Next image').disabled).toBe(false);
  });

  it('uses host entry navigation when given, disabling a missing side', () => {
    const onNext = vi.fn();
    const { onNavigate } = setup({ images: ['a.jpg'], index: 0, entryNav: { onNext } });
    expect(screen.getByLabelText<HTMLButtonElement>('Previous image').disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Next image'));
    expect(onNext).toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('hides the arrows for a lone image with no host navigation', () => {
    setup({ images: ['a.jpg'], index: 0 });
    expect(screen.queryByLabelText('Next image')).toBeNull();
  });

  it('arrow keys follow the same handlers', () => {
    const onPrevious = vi.fn();
    setup({ images: ['a.jpg'], index: 0, entryNav: { onPrevious } });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onPrevious).toHaveBeenCalled();
  });
});
