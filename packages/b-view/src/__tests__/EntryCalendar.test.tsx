// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { EntryCalendar } from '../components/EntryCalendar.js';
import styles from '../components/EntryCalendar.module.css';

afterEach(cleanup);

const base = { date: '2026-10-02', minYear: 2004, maxYear: new Date().getFullYear() };

function setup(loadMonth = vi.fn().mockResolvedValue({ 1: 'e1', 2: 'e2', 4: 'e4' }), extra = {}) {
  const onSelect = vi.fn();
  const utils = render(
    <EntryCalendar {...base} loadMonth={loadMonth} onSelect={onSelect} {...extra} />,
  );
  return { ...utils, loadMonth, onSelect };
}

describe('EntryCalendar', () => {
  it("opens on the entry's month and loads it", async () => {
    const { loadMonth } = setup();
    await waitFor(() => expect(screen.getByLabelText('1 October 2026')).toBeDefined());
    expect(loadMonth).toHaveBeenCalledWith(2026, 10);
    expect(screen.getByLabelText<HTMLSelectElement>('Month').value).toBe('10');
    expect(screen.getByLabelText<HTMLSelectElement>('Year').value).toBe('2026');
  });

  it('days with an entry are tappable; every other day is inert and says so', async () => {
    const { onSelect } = setup();
    await waitFor(() => expect(screen.getByLabelText('4 October 2026').tagName).toBe('BUTTON'));

    const noEntry = screen.getByLabelText('5 October 2026, no entry');
    expect(noEntry.tagName).toBe('SPAN');
    expect(noEntry.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(noEntry);
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('4 October 2026'));
    expect(onSelect).toHaveBeenCalledWith('e4');
  });

  it('highlights the entry being viewed', async () => {
    setup();
    await waitFor(() => expect(screen.getByLabelText('2 October 2026')).toBeDefined());
    expect(screen.getByLabelText('2 October 2026').getAttribute('aria-current')).toBe('date');
    expect(screen.getByLabelText('1 October 2026').getAttribute('aria-current')).toBeNull();
  });

  it('is Monday-first: October 2026 starts on a Thursday, so three blank cells precede the 1st', async () => {
    const { container } = setup();
    await waitFor(() => expect(screen.getByLabelText('1 October 2026')).toBeDefined());
    expect(container.querySelectorAll(`.${styles.pad}`).length).toBe(3);
  });

  it('pages to the previous and next month, loading each', async () => {
    const { loadMonth } = setup(vi.fn().mockResolvedValue({}), { date: '2026-01-15' });
    await waitFor(() => expect(loadMonth).toHaveBeenCalledWith(2026, 1));
    fireEvent.click(screen.getByLabelText('Previous month')); // crosses the year boundary
    await waitFor(() => expect(loadMonth).toHaveBeenCalledWith(2025, 12));
    expect(screen.getByLabelText<HTMLSelectElement>('Year').value).toBe('2025');
    fireEvent.click(screen.getByLabelText('Next month'));
    await waitFor(() => expect(loadMonth).toHaveBeenLastCalledWith(2026, 1));
  });

  it('jumps straight to a month and year from the dropdowns', async () => {
    const { loadMonth } = setup();
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2012' } });
    await waitFor(() => expect(loadMonth).toHaveBeenCalledWith(2012, 10));
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '3' } });
    await waitFor(() => expect(loadMonth).toHaveBeenCalledWith(2012, 3));
  });

  it('cannot page into the future or before the first year', async () => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const { unmount } = setup(undefined, { date: thisMonth });
    await waitFor(() => expect(screen.getByLabelText('Next month')).toBeDefined());
    expect((screen.getByLabelText('Next month') as unknown as { disabled: boolean }).disabled).toBe(
      true,
    );
    unmount();

    setup(undefined, { date: '2004-01-01' });
    await waitFor(() => expect(screen.getByLabelText('Previous month')).toBeDefined());
    expect(
      (screen.getByLabelText('Previous month') as unknown as { disabled: boolean }).disabled,
    ).toBe(true);
  });

  it('shows an error with a retry, and the retry loads again', async () => {
    const loadMonth = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ 1: 'e1' });
    setup(loadMonth);
    await waitFor(() => expect(screen.getByText(/Couldn.t load this month/)).toBeDefined());
    fireEvent.click(screen.getByText('Try again'));
    await waitFor(() => expect(screen.getByLabelText('1 October 2026').tagName).toBe('BUTTON'));
    expect(loadMonth).toHaveBeenCalledTimes(2);
  });

  it('ignores a slow month that arrives after you have moved on', async () => {
    let resolveFirst: (v: Record<number, string>) => void = () => {};
    const loadMonth = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
      .mockResolvedValue({ 7: 'sep7' });
    setup(loadMonth);
    fireEvent.click(screen.getByLabelText('Previous month')); // → September, resolves quickly
    await waitFor(() => expect(screen.getByLabelText('7 September 2026').tagName).toBe('BUTTON'));
    resolveFirst({ 1: 'stale-october' }); // October finally lands
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByLabelText('1 September 2026')?.tagName).not.toBe('BUTTON');
    expect(screen.getByLabelText('7 September 2026').tagName).toBe('BUTTON');
  });
});
