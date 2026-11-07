// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { useRef, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BBCodeToolbar } from '../BBCodeToolbar.js';

function Harness() {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [v, setV] = useState('hello');
  return (
    <>
      <BBCodeToolbar tags={['b', 's', 'url']} textareaRef={ref} onChange={setV} />
      <textarea ref={ref} value={v} onChange={(e) => setV(e.target.value)} aria-label="t" />
    </>
  );
}

describe('BBCodeToolbar keyboard', () => {
  afterEach(cleanup);
  it('buttons are not tab stops', () => {
    render(<Harness />);
    for (const b of screen.getAllByRole('button')) expect(b.tabIndex).toBe(-1);
  });

  it('Ctrl+S wraps the selection in strikethrough, Ctrl+L in a link', () => {
    render(<Harness />);
    const ta = screen.getByLabelText<HTMLTextAreaElement>('t');
    ta.focus();
    ta.setSelectionRange(0, 5);
    fireEvent.keyDown(ta, { key: 's', ctrlKey: true });
    expect(ta.value).toBe('[s]hello[/s]');
    ta.setSelectionRange(0, ta.value.length);
    fireEvent.keyDown(ta, { key: 'l', ctrlKey: true });
    expect(ta.value).toBe('[url][s]hello[/s][/url]');
  });

  it('ignores a tag this screen does not offer', () => {
    render(<Harness />);
    const ta = screen.getByLabelText<HTMLTextAreaElement>('t');
    fireEvent.keyDown(ta, { key: 'i', ctrlKey: true });
    expect(ta.value).toBe('hello');
  });
});
