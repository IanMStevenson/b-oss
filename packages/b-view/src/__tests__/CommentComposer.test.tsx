// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { CommentComposer, type CommentComposerProps } from '../components/CommentComposer.js';
import userEvent from '@testing-library/user-event';
import { normalizeLinkAddress } from '../components/BBCodeEditor.js';

afterEach(cleanup);

// ProseMirror measures the DOM (caret coordinates, scrolling into view); jsdom has no layout.
beforeAll(() => {
  const noRects = () =>
    ({
      length: 0,
      item: () => null,
      [Symbol.iterator]: [][Symbol.iterator],
    }) as unknown as DOMRectList;
  const stub = (target: object, name: string, value: unknown) => {
    if (!(name in target)) Object.defineProperty(target, name, { value, configurable: true });
  };
  stub(Range.prototype, 'getClientRects', noRects);
  stub(Range.prototype, 'getBoundingClientRect', () => new DOMRect(0, 0, 0, 0));
  stub(Element.prototype, 'getClientRects', noRects);
  stub(document, 'elementFromPoint', () => null);
});

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
  /** The BBCode the host currently holds (Host mirrors it into a data attribute). */
  const value = () => screen.getByTestId('value').textContent;
  const pressed = () =>
    ['Bold', 'Italic', 'Underline', 'Strikethrough']
      .map((l) => (screen.getByLabelText(l).getAttribute('aria-pressed') === 'true' ? l[0] : '-'))
      .join('');

  /** Selects characters `from`..`to` of the first line's text (offsets into its text). */
  function select(from: number, to: number): void {
    const walker = document.createTreeWalker(box(), NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let seen = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const len = node.textContent!.length;
      if (from >= seen && from <= seen + len) range.setStart(node, from - seen);
      if (to >= seen && to <= seen + len) {
        range.setEnd(node, to - seen);
        break;
      }
      seen += len;
    }
    box().focus();
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });
  }

  function RichHost(props: Partial<CommentComposerProps> & { initial?: string }) {
    const [v, setV] = useState(props.initial ?? '');
    return (
      <>
        <CommentComposer onSubmit={() => {}} {...props} formatting value={v} onChange={setV} />
        <output data-testid="value">{v}</output>
        <button type="button" onClick={() => setV('')}>
          host clears
        </button>
      </>
    );
  }

  it('is a plain textarea, with no toolbar, unless asked for', () => {
    render(<Host />);
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(screen.getByLabelText('Your comment').tagName).toBe('TEXTAREA');
  });

  it('shows BBCode as formatting, not tags', () => {
    render(<RichHost initial={'[b]bold[/b] and [url=https://x.org]link[/url]\nline 2'} />);
    expect(box().getAttribute('contenteditable')).toBe('true');
    expect(box().querySelector('b')?.textContent).toBe('bold');
    expect(box().querySelector('a')?.getAttribute('href')).toBe('https://x.org');
    expect(box().textContent).not.toContain('[b]');
    expect(box().querySelectorAll('div')).toHaveLength(2);
  });

  it('reports what the user typed as BBCode, and enables the submit button', async () => {
    render(<RichHost />);
    await userEvent.click(box());
    await userEvent.keyboard('hi [[b]typed[[/b]'); // `[[` is user-event's escape for `[`
    expect(value()).toBe('hi [b]typed[/b]'); // typed tags stay text until reopened
    expect(screen.getByText('Add comment').hasAttribute('disabled')).toBe(false);
  });

  it('formats chosen with nothing selected apply to what is typed next, and combine', async () => {
    render(<RichHost />);
    await userEvent.click(box());
    for (const l of ['Bold', 'Italic', 'Underline', 'Strikethrough']) {
      await userEvent.click(screen.getByLabelText(l));
    }
    expect(pressed()).toBe('BIUS');
    await userEvent.keyboard('word');
    expect(value()).toBe('[b][i][u][s]word[/s][/u][/i][/b]');
  });

  it('turns them all off again, one at a time, straight after typing (device bug)', async () => {
    render(<RichHost />);
    await userEvent.click(box());
    for (const l of ['Bold', 'Italic', 'Underline', 'Strikethrough']) {
      await userEvent.click(screen.getByLabelText(l));
    }
    await userEvent.keyboard('word');
    const states = [];
    for (const l of ['Bold', 'Italic', 'Underline', 'Strikethrough']) {
      await userEvent.click(screen.getByLabelText(l));
      states.push(pressed());
    }
    expect(states).toEqual(['-IUS', '--US', '---S', '----']);
    // Opening and cancelling the link field doesn't bring them back.
    await userEvent.click(screen.getByLabelText('Link'));
    await userEvent.click(screen.getByText('Cancel'));
    expect(pressed()).toBe('----');
    await userEvent.keyboard('X');
    expect(value()).toBe('[b][i][u][s]word[/s][/u][/i][/b]X');
  });

  it('B on a selection formats it, and again un-formats it', () => {
    render(<RichHost initial="say hello there" />);
    select(4, 9);
    fireEvent.click(screen.getByLabelText('Bold'));
    expect(value()).toBe('say [b]hello[/b] there');
    expect(pressed()).toBe('B---');
    fireEvent.click(screen.getByLabelText('Bold'));
    expect(value()).toBe('say hello there');
  });

  it('only loads `value` when it changes from outside, not for its own typing', async () => {
    render(<RichHost initial="draft" />);
    select(5, 5);
    await userEvent.keyboard(' typed');
    const textNode = box().firstChild!.firstChild;
    expect(value()).toBe('draft typed');
    // Its own change didn't rebuild the DOM under the keyboard.
    expect(box().firstChild!.firstChild).toBe(textNode);

    // A host clearing the box after a post does reload it.
    fireEvent.click(screen.getByText('host clears'));
    expect(box().textContent).toBe('');
    expect(box().getAttribute('data-empty')).toBe('true');
  });

  it('the submit button stays off for a box with only blank lines', async () => {
    render(<RichHost />);
    await userEvent.click(box());
    await userEvent.keyboard('{Enter}{Enter}');
    expect(value()).toBe('\n\n');
    expect(screen.getByText('Add comment').hasAttribute('disabled')).toBe(true);
  });

  it('keeps the box focused when a toolbar button is pressed (so the keyboard stays up)', () => {
    render(<RichHost />);
    expect(fireEvent.mouseDown(screen.getByLabelText('Bold'))).toBe(false);
    expect(fireEvent.mouseDown(screen.getByLabelText('Link'))).toBe(false);
  });

  it('pastes plain text only, a line per line', () => {
    render(<RichHost initial="x" />);
    select(1, 1);
    const pasted = fireEvent.paste(box(), {
      clipboardData: {
        getData: (type: string) => (type === 'text/plain' ? 'one\r\ntwo' : '<b>one</b>'),
      },
    });
    expect(pasted).toBe(false);
    expect(value()).toBe('xone\ntwo');
  });

  it('is read-only, with the toolbar disabled, while a post is in flight', () => {
    render(<RichHost posting initial="hi" />);
    expect(box().getAttribute('contenteditable')).toBe('false');
    expect(box().getAttribute('aria-readonly')).toBe('true');
    expect(screen.getByLabelText('Bold').hasAttribute('disabled')).toBe(true);
    expect(screen.getByLabelText('Link').hasAttribute('disabled')).toBe(true);
  });

  it('focuses the box on mount only when asked', () => {
    render(<RichHost autoFocus initial="edit me" />);
    expect(document.activeElement).toBe(box());
  });

  describe('link', () => {
    it('makes the selection a link to the address (https:// added when missing)', () => {
      render(<RichHost initial="see this page now" />);
      select(4, 13);
      fireEvent.click(screen.getByLabelText('Link'));
      expect(screen.queryByLabelText('Link text')).toBeNull(); // the selection is the text
      fireEvent.change(screen.getByLabelText('Link address'), { target: { value: 'example.com' } });
      fireEvent.click(screen.getByText('Add link'));
      expect(value()).toBe('see [url=https://example.com]this page[/url] now');
      expect(screen.queryByLabelText('Link address')).toBeNull(); // the field closes
    });

    it('with nothing selected inserts a link, its text optional (the address otherwise)', () => {
      render(<RichHost initial="x" />);
      select(1, 1);
      fireEvent.click(screen.getByLabelText('Link'));
      fireEvent.change(screen.getByLabelText('Link address'), {
        target: { value: 'https://x.org' },
      });
      fireEvent.change(screen.getByLabelText('Link text'), { target: { value: 'Tom & Jerry' } });
      fireEvent.click(screen.getByText('Add link'));
      expect(value()).toBe('x[url=https://x.org]Tom & Jerry[/url]');
    });

    it('an email address becomes an [email] link', () => {
      render(<RichHost initial="x" />);
      select(0, 0);
      fireEvent.click(screen.getByLabelText('Link'));
      fireEvent.change(screen.getByLabelText('Link address'), {
        target: { value: 'me@example.com' },
      });
      fireEvent.click(screen.getByText('Add link'));
      expect(value()).toBe('[email=me@example.com]me@example.com[/email]x');
    });

    it('in an existing link, offers to change or remove it', () => {
      render(<RichHost initial="a [url=https://old.org]old[/url] b" />);
      select(3, 3);
      fireEvent.click(screen.getByLabelText('Edit link'));
      const field = screen.getByLabelText<HTMLInputElement>('Link address');
      expect(field.value).toBe('https://old.org');
      fireEvent.change(field, { target: { value: 'https://new.org' } });
      fireEvent.click(screen.getByText('Update link'));
      expect(value()).toBe('a [url=https://new.org]old[/url] b');

      select(3, 3);
      fireEvent.click(screen.getByLabelText('Edit link'));
      fireEvent.click(screen.getByText('Remove link'));
      expect(value()).toBe('a old b');
    });

    it('Enter confirms the link and does NOT submit the comment', () => {
      const onSubmit = vi.fn();
      render(<RichHost initial="hi" onSubmit={onSubmit} />);
      select(0, 2);
      fireEvent.click(screen.getByLabelText('Link'));
      const field = screen.getByLabelText('Link address');
      fireEvent.change(field, { target: { value: 'example.com' } });
      fireEvent.keyDown(field, { key: 'Enter' });
      expect(value()).toBe('[url=https://example.com]hi[/url]');
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('Cancel, Escape and an empty address change nothing', () => {
      render(<RichHost initial="hi" />);
      select(0, 2);
      fireEvent.click(screen.getByLabelText('Link'));
      fireEvent.click(screen.getByText('Cancel'));
      expect(screen.queryByLabelText('Link address')).toBeNull();
      fireEvent.click(screen.getByLabelText('Link'));
      fireEvent.keyDown(screen.getByLabelText('Link address'), { key: 'Escape' });
      expect(screen.queryByLabelText('Link address')).toBeNull();
      fireEvent.click(screen.getByLabelText('Link'));
      fireEvent.click(screen.getByText('Add link'));
      expect(value()).toBe('hi');
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
