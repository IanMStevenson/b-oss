// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
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

describe('CommentComposer — formatting toolbar (b-oss#173)', () => {
  const box = () => screen.getByLabelText<HTMLTextAreaElement>('Your comment');
  /** Selects `from`..`to` in the textarea, as a user dragging over text would. */
  const select = (from: number, to: number) => {
    box().focus();
    box().setSelectionRange(from, to);
  };

  it('is absent unless asked for', () => {
    render(<Host />);
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('shows B, I, U, S and Link', () => {
    render(<Host formatting />);
    for (const name of ['Bold', 'Italic', 'Underline', 'Strikethrough', 'Link']) {
      expect(screen.getByLabelText(name)).toBeDefined();
    }
  });

  it('wraps the selected text in the chosen tag', () => {
    render(<Host formatting initial="say hello there" />);
    select(4, 9);
    fireEvent.click(screen.getByLabelText('Bold'));
    expect(box().value).toBe('say [b]hello[/b] there');
  });

  it('with nothing selected inserts an empty pair, and formats stack', async () => {
    render(<Host formatting initial="word" />);
    select(0, 4);
    fireEvent.click(screen.getByLabelText('Bold'));
    await waitFor(() => expect(box().selectionStart).toBe(3)); // inner text stays selected
    fireEvent.click(screen.getByLabelText('Italic'));
    expect(box().value).toBe('[b][i]word[/i][/b]');
  });

  it('keeps the box focused when a toolbar button is pressed (so the keyboard stays up)', () => {
    render(<Host formatting />);
    const bold = screen.getByLabelText('Bold');
    const notPrevented = fireEvent.mouseDown(bold); // false means preventDefault() was called
    expect(notPrevented).toBe(false);
  });

  describe('link', () => {
    it('asks for an address, then makes the selection the link text', () => {
      render(<Host formatting initial="see this page now" />);
      select(4, 13);
      fireEvent.click(screen.getByLabelText('Link'));
      fireEvent.change(screen.getByLabelText('Link address'), {
        target: { value: 'https://example.com' },
      });
      fireEvent.click(screen.getByText('Add link'));
      expect(box().value).toBe('see [url=https://example.com]this page[/url] now');
      expect(screen.queryByLabelText('Link address')).toBeNull(); // the field closes
    });

    it('with no selection the address labels itself', () => {
      render(<Host formatting />);
      fireEvent.click(screen.getByLabelText('Link'));
      fireEvent.change(screen.getByLabelText('Link address'), { target: { value: 'example.com' } });
      fireEvent.click(screen.getByText('Add link'));
      expect(box().value).toBe('[url]example.com[/url]');
    });

    it('Enter confirms the link and does NOT submit the comment', () => {
      const onSubmit = vi.fn();
      render(<Host formatting initial="hi" onSubmit={onSubmit} />);
      fireEvent.click(screen.getByLabelText('Link'));
      const field = screen.getByLabelText('Link address');
      fireEvent.change(field, { target: { value: 'example.com' } });
      fireEvent.keyDown(field, { key: 'Enter' });
      expect(box().value).toContain('[url]example.com[/url]');
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('Cancel and Escape close it without changing the text', () => {
      render(<Host formatting initial="hi" />);
      fireEvent.click(screen.getByLabelText('Link'));
      fireEvent.click(screen.getByText('Cancel'));
      expect(screen.queryByLabelText('Link address')).toBeNull();
      fireEvent.click(screen.getByLabelText('Link'));
      fireEvent.keyDown(screen.getByLabelText('Link address'), { key: 'Escape' });
      expect(screen.queryByLabelText('Link address')).toBeNull();
      expect(box().value).toBe('hi');
    });

    it('an empty address changes nothing', () => {
      render(<Host formatting initial="hi" />);
      fireEvent.click(screen.getByLabelText('Link'));
      fireEvent.click(screen.getByText('Add link'));
      expect(box().value).toBe('hi');
    });
  });

  it('is disabled while a post is in flight', () => {
    render(<Host formatting posting initial="hi" />);
    expect(screen.getByLabelText('Bold').hasAttribute('disabled')).toBe(true);
    expect(screen.getByLabelText('Link').hasAttribute('disabled')).toBe(true);
  });
});
