// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { CommentComposer, type CommentComposerProps } from '../components/CommentComposer.js';
import { normalizeLinkAddress } from '../components/BBCodeEditor.js';

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

describe('CommentComposer — rich-text box (b-oss#206)', () => {
  const box = () => screen.getByRole('textbox', { name: 'Your comment' });
  let exec: ReturnType<typeof vi.fn<(command: string, ui: boolean, arg?: string) => boolean>>;
  let states: Record<string, boolean>;

  beforeEach(() => {
    // jsdom has no editing commands: record what the box asks the browser to do.
    exec = vi.fn((_command: string, _ui: boolean, _arg?: string) => true);
    states = {};
    Object.assign(document, {
      execCommand: exec,
      queryCommandState: (command: string) => states[command] ?? false,
    });
  });
  afterEach(() => {
    delete (document as { execCommand?: unknown }).execCommand;
    delete (document as { queryCommandState?: unknown }).queryCommandState;
  });

  /** Selects the characters `from`..`to` of the box's first text node, and tells the box. */
  function select(from: number, to: number): void {
    const text = document.createTreeWalker(box(), NodeFilter.SHOW_TEXT).nextNode()!;
    const range = document.createRange();
    range.setStart(text, from);
    range.setEnd(text, to);
    box().focus();
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });
  }

  const commands = () =>
    exec.mock.calls.map((c) => [c[0], c[2]]).filter(([c]) => c !== 'styleWithCSS');

  it('is a plain textarea, with no toolbar, unless asked for', () => {
    render(<Host />);
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(screen.getByLabelText('Your comment').tagName).toBe('TEXTAREA');
  });

  it('shows BBCode as formatting, not tags', () => {
    render(<Host formatting initial={'[b]bold[/b] and [url=https://x.org]link[/url]\nline 2'} />);
    expect(box().getAttribute('contenteditable')).toBe('true');
    expect(box().querySelector('b')?.textContent).toBe('bold');
    expect(box().querySelector('a')?.getAttribute('href')).toBe('https://x.org');
    expect(box().textContent).not.toContain('[b]');
    expect(box().querySelectorAll('div')).toHaveLength(2);
  });

  it('reports what the user typed as BBCode, and enables the submit button', () => {
    const onChange = vi.fn();
    render(<CommentComposer formatting value="" onChange={onChange} onSubmit={() => {}} />);
    box().innerHTML = 'hi <b>there</b><div>[i]typed[/i]</div>';
    fireEvent.input(box());
    expect(onChange).toHaveBeenLastCalledWith('hi [b]there[/b]\n[i]typed[/i]');
  });

  it('never redraws the box for its own typing (the keyboard is mid-word), only for outside changes', () => {
    const { rerender } = render(<Host formatting initial="draft" />);
    const text = box().firstChild!.firstChild as Text;
    text.data = 'draft typed';
    fireEvent.input(box());
    // The same text node is still there: the DOM wasn't rebuilt under the keyboard.
    expect(box().firstChild!.firstChild).toBe(text);

    // A host clearing the box after a post does redraw it.
    rerender(<CommentComposer formatting value="" onChange={() => {}} onSubmit={() => {}} />);
    expect(box().innerHTML).toBe('');
    expect(box().getAttribute('data-empty')).toBe('true');
  });

  it('the submit button stays off for a box with only blank lines', () => {
    render(<Host formatting />);
    box().innerHTML = '<div><br></div><div><br></div>';
    fireEvent.input(box());
    expect(screen.getByText('Add comment').hasAttribute('disabled')).toBe(true);
  });

  it("B / I / U / S use the browser's formatting command on the selection", () => {
    render(<Host formatting initial="say hello" />);
    select(4, 9);
    for (const label of ['Bold', 'Italic', 'Underline', 'Strikethrough']) {
      fireEvent.click(screen.getByLabelText(label));
    }
    expect(commands()).toEqual([
      ['bold', undefined],
      ['italic', undefined],
      ['underline', undefined],
      ['strikeThrough', undefined],
    ]);
    expect(exec).toHaveBeenCalledWith('styleWithCSS', false, 'false');
  });

  it('shows which formats are on where the caret is', () => {
    render(<Host formatting initial="[b]x[/b]" />);
    states = { bold: true };
    select(0, 1);
    expect(screen.getByLabelText('Bold').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('Italic').getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps the box focused when a toolbar button is pressed (so the keyboard stays up)', () => {
    render(<Host formatting />);
    expect(fireEvent.mouseDown(screen.getByLabelText('Bold'))).toBe(false);
    expect(fireEvent.mouseDown(screen.getByLabelText('Link'))).toBe(false);
  });

  it('pastes plain text only', () => {
    render(<Host formatting initial="x" />);
    select(1, 1);
    const pasted = fireEvent.paste(box(), {
      clipboardData: {
        getData: (type: string) => (type === 'text/plain' ? 'one\r\ntwo' : '<b>one</b>'),
      },
    });
    expect(pasted).toBe(false);
    expect(commands()).toEqual([['insertText', 'one\ntwo']]);
  });

  it('is read-only, with the toolbar disabled, while a post is in flight', () => {
    render(<Host formatting posting initial="hi" />);
    expect(box().getAttribute('contenteditable')).toBe('false');
    expect(box().getAttribute('aria-readonly')).toBe('true');
    expect(screen.getByLabelText('Bold').hasAttribute('disabled')).toBe(true);
    expect(screen.getByLabelText('Link').hasAttribute('disabled')).toBe(true);
  });

  it('focuses the box on mount only when asked', () => {
    render(<Host formatting autoFocus initial="edit me" />);
    expect(document.activeElement).toBe(box());
  });

  describe('link', () => {
    it('makes the selection a link to the address (https:// added when missing)', () => {
      render(<Host formatting initial="see this page now" />);
      select(4, 13);
      fireEvent.click(screen.getByLabelText('Link'));
      expect(screen.queryByLabelText('Link text')).toBeNull(); // the selection is the text
      fireEvent.change(screen.getByLabelText('Link address'), { target: { value: 'example.com' } });
      fireEvent.click(screen.getByText('Add link'));
      expect(commands()).toEqual([['createLink', 'https://example.com']]);
      expect(screen.queryByLabelText('Link address')).toBeNull(); // the field closes
    });

    it('with nothing selected inserts a link, its text optional (the address otherwise)', () => {
      render(<Host formatting initial="x" />);
      select(1, 1);
      fireEvent.click(screen.getByLabelText('Link'));
      fireEvent.change(screen.getByLabelText('Link address'), {
        target: { value: 'https://x.org/?a=1&b=<2>' },
      });
      fireEvent.change(screen.getByLabelText('Link text'), { target: { value: 'Tom & "Jerry"' } });
      fireEvent.click(screen.getByText('Add link'));
      expect(commands()).toEqual([
        [
          'insertHTML',
          '<a href="https://x.org/?a=1&amp;b=&lt;2&gt;">Tom &amp; &quot;Jerry&quot;</a>',
        ],
      ]);

      exec.mockClear();
      select(0, 0);
      fireEvent.click(screen.getByLabelText('Link'));
      fireEvent.change(screen.getByLabelText('Link address'), {
        target: { value: 'me@example.com' },
      });
      fireEvent.click(screen.getByText('Add link'));
      expect(commands()).toEqual([
        ['insertHTML', '<a href="mailto:me@example.com">me@example.com</a>'],
      ]);
    });

    it('in an existing link, offers to change or remove it', () => {
      render(<Host formatting initial="[url=https://old.org]old[/url]" />);
      const linkText = box().querySelector('a')!.firstChild as Text;
      const range = document.createRange();
      range.setStart(linkText, 1);
      range.collapse(true);
      box().focus();
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
      act(() => {
        document.dispatchEvent(new Event('selectionchange'));
      });

      fireEvent.click(screen.getByLabelText('Edit link'));
      const field = screen.getByLabelText<HTMLInputElement>('Link address');
      expect(field.value).toBe('https://old.org');
      fireEvent.change(field, { target: { value: 'https://new.org' } });
      fireEvent.click(screen.getByText('Update link'));
      expect(commands()).toEqual([['createLink', 'https://new.org']]);

      exec.mockClear();
      fireEvent.click(screen.getByLabelText('Edit link'));
      fireEvent.click(screen.getByText('Remove link'));
      expect(commands()).toEqual([['unlink', undefined]]);
    });

    it('Enter confirms the link and does NOT submit the comment', () => {
      const onSubmit = vi.fn();
      render(<Host formatting initial="hi" onSubmit={onSubmit} />);
      select(0, 2);
      fireEvent.click(screen.getByLabelText('Link'));
      const field = screen.getByLabelText('Link address');
      fireEvent.change(field, { target: { value: 'example.com' } });
      fireEvent.keyDown(field, { key: 'Enter' });
      expect(commands()).toEqual([['createLink', 'https://example.com']]);
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('Cancel, Escape and an empty address change nothing', () => {
      render(<Host formatting initial="hi" />);
      select(0, 2);
      fireEvent.click(screen.getByLabelText('Link'));
      fireEvent.click(screen.getByText('Cancel'));
      expect(screen.queryByLabelText('Link address')).toBeNull();
      fireEvent.click(screen.getByLabelText('Link'));
      fireEvent.keyDown(screen.getByLabelText('Link address'), { key: 'Escape' });
      expect(screen.queryByLabelText('Link address')).toBeNull();
      fireEvent.click(screen.getByLabelText('Link'));
      fireEvent.click(screen.getByText('Add link'));
      expect(commands()).toEqual([]);
    });
  });
});

describe('normalizeLinkAddress', () => {
  it.each([
    ['', ''],
    ['  example.com  ', 'https://example.com'],
    ['//example.com/x', 'https://example.com/x'],
    ['http://example.com', 'http://example.com'],
    ['https://example.com', 'https://example.com'],
    ['me@example.com', 'mailto:me@example.com'],
    ['mailto:me@example.com', 'mailto:me@example.com'],
  ])('%j -> %j', (input, expected) => {
    expect(normalizeLinkAddress(input)).toBe(expected);
  });
});
