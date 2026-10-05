// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { IonSegment } from '@ionic/react';
import { ScrollEdgeHint } from '../ScrollEdgeHint.js';

afterEach(cleanup);

// jsdom does no layout, so drive the geometry the component reads.
function setGeometry(
  el: Element,
  g: { scrollWidth: number; clientWidth: number; scrollLeft: number },
) {
  for (const [k, v] of Object.entries(g)) {
    Object.defineProperty(el, k, { configurable: true, value: v });
  }
}

describe('ScrollEdgeHint', () => {
  it('shows a hint only on the side that still has hidden content, and updates as you scroll', () => {
    render(
      <ScrollEdgeHint>
        <IonSegment />
      </ScrollEdgeHint>,
    );
    const segment = document.querySelector('ion-segment')!;

    setGeometry(segment, { scrollWidth: 600, clientWidth: 300, scrollLeft: 0 });
    fireEvent.scroll(segment);
    expect(screen.queryByTestId('scroll-hint-left')).toBeNull();
    expect(screen.getByTestId('scroll-hint-right')).toBeDefined();

    setGeometry(segment, { scrollWidth: 600, clientWidth: 300, scrollLeft: 150 });
    fireEvent.scroll(segment);
    expect(screen.getByTestId('scroll-hint-left')).toBeDefined();
    expect(screen.getByTestId('scroll-hint-right')).toBeDefined();

    setGeometry(segment, { scrollWidth: 600, clientWidth: 300, scrollLeft: 300 });
    fireEvent.scroll(segment);
    expect(screen.getByTestId('scroll-hint-left')).toBeDefined();
    expect(screen.queryByTestId('scroll-hint-right')).toBeNull();
  });

  it('shows nothing when every tab already fits', () => {
    render(
      <ScrollEdgeHint>
        <IonSegment />
      </ScrollEdgeHint>,
    );
    const segment = document.querySelector('ion-segment')!;
    setGeometry(segment, { scrollWidth: 300, clientWidth: 300, scrollLeft: 0 });
    fireEvent.scroll(segment);
    expect(screen.queryByTestId('scroll-hint-left')).toBeNull();
    expect(screen.queryByTestId('scroll-hint-right')).toBeNull();
  });
});
