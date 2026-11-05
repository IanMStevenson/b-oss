// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Area } from 'react-easy-crop';
import { SquareSelector } from '../SquareSelector.js';

afterEach(cleanup);

describe('SquareSelector', () => {
  it('arrow keys nudge the selection and report the percent area', () => {
    const onChange = vi.fn();
    render(
      <SquareSelector
        imageSrc="x.jpg"
        initial={{ x: 0.1, y: 0.1, w: 0.3 }}
        ratio={1.5}
        naturalWidth={3000}
        minCropEdge={300}
        onCropAreaChange={onChange}
      />,
    );
    fireEvent.keyDown(screen.getByTestId('square-selection'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledTimes(1);
    const area = (onChange.mock.calls[0] as [Area])[0];
    expect(area.x).toBeCloseTo(11, 6);
    expect(area.y).toBeCloseTo(10, 6);
    expect(area.width).toBeCloseTo(30, 6);
  });

  it('renders four corner handles', () => {
    render(
      <SquareSelector
        imageSrc="x.jpg"
        initial={{ x: 0, y: 0, w: 0.5 }}
        ratio={1}
        naturalWidth={2000}
        minCropEdge={300}
        onCropAreaChange={() => {}}
      />,
    );
    for (const c of ['nw', 'ne', 'sw', 'se'])
      expect(screen.getByTestId(`handle-${c}`)).toBeTruthy();
  });
});
