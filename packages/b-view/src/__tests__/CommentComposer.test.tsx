// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CommentComposer, type CommentComposerProps } from '../components/CommentComposer.js';

afterEach(cleanup);

/** Hosts own the text; this stands in for one so typing actually updates the box. */
function Host(props: Partial<CommentComposerProps> & { initial?: string }) {
  const [value, setValue] = useState(props.initial ?? '');
  return <CommentComposer onSubmit={() => {}} {...props} value={value} onChange={setValue} />;
}

describe('CommentComposer', () => {
  it('starts disabled, and enables "Add comment" once there is real text', () => {
    render(<Host />);
    const button = screen.getByText('Add comment');
    expect(button.hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByLabelText('Your comment'), { target: { value: '   ' } });
    expect(button.hasAttribute('disabled')).toBe(true); // whitespace only is not a comment

    fireEvent.change(screen.getByLabelText('Your comment'), { target: { value: 'Lovely' } });
    expect(button.hasAttribute('disabled')).toBe(false);
  });

  it('submits on the button, but never an empty comment', () => {
    const onSubmit = vi.fn();
    render(<Host onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText('Add comment'));
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Your comment'), { target: { value: 'Lovely' } });
    fireEvent.click(screen.getByText('Add comment'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('while posting: shows "Posting…", blocks a second submit and edits, keeps the text', () => {
    const onSubmit = vi.fn();
    const { container } = render(<Host initial="Lovely" posting onSubmit={onSubmit} />);
    const button = screen.getByText('Posting…');
    expect(button.hasAttribute('disabled')).toBe(true);
    fireEvent.click(button);
    fireEvent.submit(container.querySelector('form')!);
    expect(onSubmit).not.toHaveBeenCalled();
    const box = screen.getByLabelText<HTMLTextAreaElement>('Your comment');
    expect(box.readOnly).toBe(true);
    expect(box.value).toBe('Lovely');
  });

  it('shows a failed attempt as an alert and keeps the text for a retry', () => {
    render(<Host initial="Lovely" error="Could not post this comment." />);
    expect(screen.getByRole('alert').textContent).toBe('Could not post this comment.');
    expect(screen.getByLabelText<HTMLTextAreaElement>('Your comment').value).toBe('Lovely');
    expect(screen.getByText('Add comment').hasAttribute('disabled')).toBe(false);
  });

  it('offers Cancel only when the host can back out (a reply or an edit)', () => {
    const onCancel = vi.fn();
    const { rerender } = render(<Host />);
    expect(screen.queryByText('Cancel')).toBeNull();
    rerender(<Host onCancel={onCancel} submitLabel="Reply" />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Reply')).toBeDefined();
  });

  it('cannot cancel mid-post', () => {
    render(<Host posting onCancel={() => {}} />);
    expect(screen.getByText('Cancel').hasAttribute('disabled')).toBe(true);
  });

  it('focuses the box on mount only when asked (a reply/edit the user just requested)', () => {
    const { unmount } = render(<Host />);
    expect(document.activeElement).not.toBe(screen.getByLabelText('Your comment'));
    unmount();
    render(<Host autoFocus />);
    expect(document.activeElement).toBe(screen.getByLabelText('Your comment'));
  });
});
