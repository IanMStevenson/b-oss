// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { EntryNavStrip, type HistoryItem } from '../components/EntryNavStrip.js';
import type { EntryIndex } from '../types.js';

afterEach(cleanup);

const baseProps = {
  date: '2026-10-02',
  prevEntryId: '10',
  nextEntryId: '12',
  onNavigate: () => {},
};

const ago: HistoryItem = {
  label: '1 year ago',
  entryId: 'ago-1',
  date: '2025-10-02',
  thumbnailPath: 'thumbs/ago.jpg',
};
const ahead: HistoryItem = {
  label: '1 year ahead',
  entryId: 'ahead-1',
  date: '2027-10-02',
  thumbnailPath: 'thumbs/ahead.jpg',
};

describe('EntryNavStrip — tile and arrows', () => {
  it('shows the date tile as "2nd" over "Oct, 26"', () => {
    render(<EntryNavStrip {...baseProps} />);
    expect(screen.getByText('2nd')).toBeDefined();
    expect(screen.getByText('Oct, 26')).toBeDefined();
  });

  it('falls back to the raw string for a malformed date rather than showing garbage', () => {
    render(<EntryNavStrip {...baseProps} date="not-a-date" />);
    expect(screen.getByText('not-a-date')).toBeDefined();
  });

  it('◀ goes to the older entry and ▶ to the newer', () => {
    const onNavigate = vi.fn();
    render(<EntryNavStrip {...baseProps} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByLabelText('Older entry'));
    expect(onNavigate).toHaveBeenLastCalledWith('10');
    fireEvent.click(screen.getByLabelText('Newer entry'));
    expect(onNavigate).toHaveBeenLastCalledWith('12');
  });

  it('disables an arrow at either end of the journal', () => {
    const onNavigate = vi.fn();
    render(
      <EntryNavStrip
        {...baseProps}
        prevEntryId={null}
        nextEntryId={null}
        onNavigate={onNavigate}
      />,
    );
    const older = screen.getByLabelText('Older entry');
    const newer = screen.getByLabelText('Newer entry');
    expect(older.hasAttribute('disabled')).toBe(true);
    expect(newer.hasAttribute('disabled')).toBe(true);
    fireEvent.click(older);
    fireEvent.click(newer);
    expect(onNavigate).not.toHaveBeenCalled();
  });
});

describe('EntryNavStrip — calendar button', () => {
  const entries: EntryIndex[] = [
    { entry_id: '1', date: '2026-10-02', title: 't', thumbnail_path: 'p', json_path: 'j' },
  ];

  it('is hidden when the host can offer neither a local list nor a date picker', () => {
    render(<EntryNavStrip {...baseProps} />);
    expect(screen.queryByLabelText('Jump to date')).toBeNull();
  });

  it('uses the popup calendar when the host has the entries locally (the viewer)', () => {
    render(<EntryNavStrip {...baseProps} entries={entries} />);
    expect(screen.getByLabelText('Jump to date')).toBeDefined();
  });

  it('uses the native date picker otherwise, reporting the chosen date (the app)', () => {
    const onPickDate = vi.fn();
    const { container } = render(<EntryNavStrip {...baseProps} onPickDate={onPickDate} />);
    expect(screen.getByLabelText('Jump to date')).toBeDefined();
    const input = container.querySelector('input[type="date"]')!;
    fireEvent.change(input, { target: { value: '2025-06-15' } });
    expect(onPickDate).toHaveBeenCalledWith('2025-06-15');
  });
});

describe('EntryNavStrip — history pop-down', () => {
  it('has no history button unless the host can look entries up', () => {
    render(<EntryNavStrip {...baseProps} />);
    expect(screen.queryByLabelText('This day in other years')).toBeNull();
  });

  it('does not look anything up until it is opened', () => {
    const loadHistory = vi.fn().mockResolvedValue([]);
    render(<EntryNavStrip {...baseProps} loadHistory={loadHistory} />);
    expect(loadHistory).not.toHaveBeenCalled();
  });

  it('opens with the entries a year either side, and tapping one navigates and closes', async () => {
    const onNavigate = vi.fn();
    const loadHistory = vi.fn().mockResolvedValue([ago, ahead]);
    render(<EntryNavStrip {...baseProps} onNavigate={onNavigate} loadHistory={loadHistory} />);

    fireEvent.click(screen.getByLabelText('This day in other years'));
    await waitFor(() => expect(screen.getByLabelText('1 year ago: 2025-10-02')).toBeDefined());
    expect(screen.getByLabelText('1 year ahead: 2027-10-02')).toBeDefined();
    expect(loadHistory).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText('1 year ahead: 2027-10-02'));
    expect(onNavigate).toHaveBeenCalledWith('ahead-1');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows only the side that exists', async () => {
    render(<EntryNavStrip {...baseProps} loadHistory={() => Promise.resolve([ago])} />);
    fireEvent.click(screen.getByLabelText('This day in other years'));
    await waitFor(() => expect(screen.getByLabelText('1 year ago: 2025-10-02')).toBeDefined());
    expect(screen.queryByLabelText(/1 year ahead/)).toBeNull();
  });

  it('says so when there is nothing on either side', async () => {
    render(<EntryNavStrip {...baseProps} loadHistory={() => Promise.resolve([])} />);
    fireEvent.click(screen.getByLabelText('This day in other years'));
    await waitFor(() =>
      expect(screen.getByText('No entries a year either side of this date.')).toBeDefined(),
    );
  });

  it('shows an error, and a second tap retries', async () => {
    const loadHistory = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue([ago]);
    render(<EntryNavStrip {...baseProps} loadHistory={loadHistory} />);
    const button = screen.getByLabelText('This day in other years');

    fireEvent.click(button);
    await waitFor(() => expect(screen.getByText(/Couldn.t load/)).toBeDefined());

    fireEvent.click(button); // close
    fireEvent.click(button); // reopen → retry
    await waitFor(() => expect(screen.getByLabelText('1 year ago: 2025-10-02')).toBeDefined());
    expect(loadHistory).toHaveBeenCalledTimes(2);
  });

  it('closes on Escape, and when the entry changes', async () => {
    const { rerender } = render(
      <EntryNavStrip {...baseProps} loadHistory={() => Promise.resolve([ago])} />,
    );
    fireEvent.click(screen.getByLabelText('This day in other years'));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByLabelText('This day in other years'));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined());
    rerender(
      <EntryNavStrip {...baseProps} date="2026-10-03" loadHistory={() => Promise.resolve([ago])} />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ignores a slow lookup that finishes after the pop-down was closed', async () => {
    let resolveSlow: (items: HistoryItem[]) => void = () => {};
    const loadHistory = vi.fn(() => new Promise<HistoryItem[]>((r) => (resolveSlow = r)));
    render(<EntryNavStrip {...baseProps} loadHistory={loadHistory} />);
    const button = screen.getByLabelText('This day in other years');
    fireEvent.click(button);
    fireEvent.click(button); // closed again before it resolved
    resolveSlow([ago]);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
