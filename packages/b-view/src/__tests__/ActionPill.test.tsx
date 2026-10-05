// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ActionPill } from '../components/ActionPill.js';

afterEach(cleanup);

describe('ActionPill', () => {
  it('renders one icon button per item, named by its label (there is no visible text)', () => {
    render(
      <ActionPill
        items={[
          { key: 'a', label: 'Reply', icon: <svg data-testid="ia" />, onClick: () => {} },
          { key: 'b', label: 'Delete comment', icon: <svg data-testid="ib" />, onClick: () => {} },
        ]}
      />,
    );
    expect(screen.getByLabelText('Reply').getAttribute('title')).toBe('Reply');
    expect(screen.getByLabelText('Delete comment')).toBeDefined();
    expect(screen.queryByText('Reply')).toBeNull(); // icon-only
  });

  it('calls the matching handler', () => {
    const reply = vi.fn();
    const del = vi.fn();
    render(
      <ActionPill
        items={[
          { key: 'a', label: 'Reply', icon: <i />, onClick: reply },
          { key: 'b', label: 'Delete', icon: <i />, onClick: del, tone: 'danger' },
        ]}
      />,
    );
    fireEvent.click(screen.getByLabelText('Delete'));
    expect(del).toHaveBeenCalledTimes(1);
    expect(reply).not.toHaveBeenCalled();
  });

  it('renders nothing for an empty list', () => {
    const { container } = render(<ActionPill items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
