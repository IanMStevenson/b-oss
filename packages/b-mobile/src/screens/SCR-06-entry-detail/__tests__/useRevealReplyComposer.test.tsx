// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { useRef } from 'react';
import { useRevealReplyComposer } from '../useRevealReplyComposer.js';

function Harness({ replyViewId }: { replyViewId: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useRevealReplyComposer(ref, replyViewId);
  return (
    <div ref={ref}>
      <form data-testid="other">
        <textarea aria-label="Your comment" />
      </form>
      {replyViewId && (
        <form data-testid="reply">
          <textarea aria-label="Reply to bob" />
        </form>
      )}
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useRevealReplyComposer', () => {
  it('centres the open reply form (not the main comment box), clear of the safe areas', async () => {
    const calls: Array<[HTMLElement, ScrollIntoViewOptions | undefined]> = [];
    Element.prototype.scrollIntoView = function (this: HTMLElement, arg) {
      calls.push([this, arg as ScrollIntoViewOptions | undefined]);
    };
    const { getByTestId } = render(<Harness replyViewId="c1" />);
    await vi.waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const [el, opts] = calls[0];
    expect(el).toBe(getByTestId('reply'));
    expect(opts?.block).toBe('center');
    expect(el.style.scrollMarginBottom).toContain('safe-area-inset-bottom');
  });

  it('re-centres when the viewport resizes (soft keyboard) shortly after opening', async () => {
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    render(<Harness replyViewId="c1" />);
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new Event('resize'));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('does nothing while no reply is open', async () => {
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    render(<Harness replyViewId={null} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(spy).not.toHaveBeenCalled();
  });
});
