// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlipfotoError, NetworkError } from '@b-oss/b-api';

const { client, getClientForAccount } = vi.hoisted(() => ({
  client: { updateEntry: vi.fn(), getEntry: vi.fn() },
  getClientForAccount: vi.fn(),
}));
vi.mock('../client.js', () => ({ getClientForAccount }));

import { revealStoredPosition, StillVisibleError } from '../entryLocation.js';

beforeEach(() => {
  vi.useFakeTimers();
  getClientForAccount.mockResolvedValue(client);
});
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe('revealStoredPosition', () => {
  it('switches the map on without a position, reads it back, then switches it off again', async () => {
    client.updateEntry.mockResolvedValue({});
    client.getEntry.mockResolvedValue({ entry: { location: { lat: 55.9, lon: -3.2 } } });

    const position = await revealStoredPosition('a1', 'e1');

    expect(position).toEqual({ lat: 55.9, lon: -3.2 });
    expect(client.updateEntry.mock.calls).toEqual([
      [{ entryId: 'e1', display_location: 1 }],
      [{ entryId: 'e1', display_location: 0 }],
    ]);
  });

  it('returns null, with nothing left on, when the server holds no position', async () => {
    client.updateEntry.mockRejectedValue(new BlipfotoError(0, 'entry.location_missing'));

    expect(await revealStoredPosition('a1', 'e1')).toBeNull();
    expect(client.updateEntry).toHaveBeenCalledTimes(1);
    expect(client.getEntry).not.toHaveBeenCalled();
  });

  it('lets any other failure through before anything was shown', async () => {
    client.updateEntry.mockRejectedValue(new NetworkError('offline'));

    await expect(revealStoredPosition('a1', 'e1')).rejects.toBeInstanceOf(NetworkError);
    expect(client.updateEntry).toHaveBeenCalledTimes(1);
  });

  it('retries hiding the entry and succeeds', async () => {
    client.updateEntry
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new NetworkError('blip'))
      .mockResolvedValueOnce({});
    client.getEntry.mockResolvedValue({ entry: { location: { lat: 1, lon: 2 } } });

    const pending = revealStoredPosition('a1', 'e1');
    await vi.advanceTimersByTimeAsync(5000);

    expect(await pending).toEqual({ lat: 1, lon: 2 });
    expect(client.updateEntry).toHaveBeenCalledTimes(3);
  });

  it('throws StillVisibleError, carrying the position, when it cannot hide the entry again', async () => {
    client.updateEntry
      .mockResolvedValueOnce({})
      .mockRejectedValue(new NetworkError('still offline'));
    client.getEntry.mockResolvedValue({ entry: { location: { lat: 1, lon: 2 } } });

    const pending = revealStoredPosition('a1', 'e1').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(5000);

    const err = await pending;
    expect(err).toBeInstanceOf(StillVisibleError);
    expect((err as StillVisibleError).position).toEqual({ lat: 1, lon: 2 });
    // one reveal + three hide attempts
    expect(client.updateEntry).toHaveBeenCalledTimes(4);
  });

  it('still hides the entry when reading it back fails', async () => {
    client.updateEntry.mockResolvedValue({});
    client.getEntry.mockRejectedValue(new NetworkError('read failed'));

    const pending = revealStoredPosition('a1', 'e1').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(5000);

    expect(await pending).toBeInstanceOf(NetworkError);
    expect(client.updateEntry).toHaveBeenLastCalledWith({ entryId: 'e1', display_location: 0 });
  });
});
