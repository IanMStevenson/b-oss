// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { CachedImage } from '../CachedImage.js';

const resolveImage = vi.fn<(src: string) => Promise<string>>();
const invalidateImage = vi.fn<(src: string) => Promise<void>>();
vi.mock('../../platform/imageCache.js', () => ({
  resolveImage: (src: string) => resolveImage(src),
  invalidateImage: (src: string) => invalidateImage(src),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('CachedImage', () => {
  it('shows the resolved image', async () => {
    resolveImage.mockResolvedValue('cached://a');
    render(<CachedImage src="https://cdn.example/a.jpg" alt="avatar" />);
    expect((await screen.findByAltText('avatar')).getAttribute('src')).toBe('cached://a');
  });

  it('drops the cached copy and refetches once when the image will not draw (b-oss#185)', async () => {
    resolveImage.mockResolvedValue('cached://a');
    invalidateImage.mockResolvedValue(undefined);
    render(<CachedImage src="https://cdn.example/a.jpg" alt="avatar" />);

    fireEvent.error(await screen.findByAltText('avatar'));
    await waitFor(() => expect(invalidateImage).toHaveBeenCalledWith('https://cdn.example/a.jpg'));
    await waitFor(() => expect(resolveImage).toHaveBeenCalledTimes(2));
    expect(await screen.findByAltText('avatar')).toBeDefined(); // an image again, not the placeholder
  });

  it('settles on the placeholder if the retry fails too', async () => {
    resolveImage.mockResolvedValue('cached://a');
    invalidateImage.mockResolvedValue(undefined);
    const { container } = render(<CachedImage src="https://cdn.example/a.jpg" alt="avatar" />);

    fireEvent.error(await screen.findByAltText('avatar'));
    await waitFor(() => expect(resolveImage).toHaveBeenCalledTimes(2));
    fireEvent.error(await screen.findByAltText('avatar'));

    await waitFor(() => expect(screen.queryByAltText('avatar')).toBeNull());
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull(); // the placeholder
    expect(invalidateImage).toHaveBeenCalledTimes(1);
  });
});
