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

describe('Lightbox keys', () => {
  it('Backspace closes; Escape and modified Backspace do not', () => {
    const { onClose } = setup();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'Backspace', ctrlKey: true });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Backspace in a text field is left alone', () => {
    const { onClose } = setup();
    const input = document.body.appendChild(document.createElement('input'));
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onClose).not.toHaveBeenCalled();
    input.remove();
  });
});

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

  it('hides the arrows for a lone image ', () => {
    setup({ images: ['a.jpg'], index: 0 });
    expect(screen.queryByLabelText('Next image')).toBeNull();
  });

  it('arrow keys step through the images', () => {
    const { onNavigate } = setup({ images: ['a.jpg', 'b.jpg'], index: 0 });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onNavigate).toHaveBeenCalledWith(1);
  });
});

describe('Lightbox placement (b-oss#953)', () => {
  it('renders under <body>, not inside a host ancestor that would contain its fixed backdrop', () => {
    const host = document.body.appendChild(document.createElement('div'));
    host.style.cssText = 'contain: layout; overflow-y: auto;';
    render(<Lightbox images={['a.jpg']} index={0} onClose={vi.fn()} onNavigate={vi.fn()} />, {
      container: host,
    });
    const dialog = screen.getByRole('dialog');
    expect(host.contains(dialog)).toBe(false);
    expect(dialog.parentElement).toBe(document.body);
    host.remove();
  });
});
