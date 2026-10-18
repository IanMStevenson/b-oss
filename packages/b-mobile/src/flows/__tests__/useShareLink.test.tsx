// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// b-oss#417: the protected-journal warning in front of the share sheet.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useShareLink } from '../useShareLink.js';
import type { ShareTarget } from '../useShareLink.js';
import { t } from '../../strings/index.js';

const shareLink = vi.hoisted(() => vi.fn());
vi.mock('../../platform/share.js', () => ({ shareLink }));

const fetchJournalProtected = vi.hoisted(() => vi.fn());
vi.mock('../../data/users.js', () => ({ fetchJournalProtected }));

const target: ShareTarget = {
  url: 'https://www.blipfoto.com/entry/1',
  text: 'Sunrise by alice',
  ownerUsername: 'alice',
};

function Harness({ t: tgt }: { t: ShareTarget }) {
  const { share, shareDialog } = useShareLink();
  return (
    <>
      <button onClick={() => void share(tgt)}>go</button>
      {shareDialog}
    </>
  );
}

beforeEach(() => {
  shareLink.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

// IonAlert always renders its markup in jsdom; whether it is *open* is the property that matters.
const warningOpen = () =>
  (document.querySelector('ion-alert') as unknown as { isOpen: boolean } | null)?.isOpen === true;

describe('useShareLink', () => {
  it('shares straight away when the journal is open', async () => {
    fetchJournalProtected.mockResolvedValue(false);
    render(<Harness t={target} />);
    await userEvent.click(screen.getByText('go'));
    await waitFor(() => expect(shareLink).toHaveBeenCalledTimes(1));
    expect(shareLink).toHaveBeenCalledWith(
      expect.objectContaining({ url: target.url, text: target.text }),
    );
    expect(warningOpen()).toBe(false);
  });

  it('warns first when protected, naming the owner, and shares only on Share anyway', async () => {
    fetchJournalProtected.mockResolvedValue(true);
    render(<Harness t={target} />);
    await userEvent.click(screen.getByText('go'));
    await waitFor(() => expect(warningOpen()).toBe(true));
    expect(await screen.findByText(t('SHARE.protected.body', { username: 'alice' }))).toBeDefined();
    expect(shareLink).not.toHaveBeenCalled();

    await userEvent.click(screen.getByText(t('SHARE.protected.button_share')));
    await waitFor(() => expect(shareLink).toHaveBeenCalledTimes(1));
  });

  it('Cancel on the warning shares nothing', async () => {
    fetchJournalProtected.mockResolvedValue(true);
    render(<Harness t={target} />);
    await userEvent.click(screen.getByText('go'));
    await waitFor(() => expect(warningOpen()).toBe(true));
    await userEvent.click(screen.getByText('Cancel'));
    expect(shareLink).not.toHaveBeenCalled();
  });

  it('warns when the protected lookup fails', async () => {
    fetchJournalProtected.mockRejectedValue(new Error('offline'));
    render(<Harness t={target} />);
    await userEvent.click(screen.getByText('go'));
    await waitFor(() => expect(warningOpen()).toBe(true));
    expect(shareLink).not.toHaveBeenCalled();
  });

  it('skips the lookup when the caller already knows', async () => {
    render(<Harness t={{ ...target, isProtected: false }} />);
    await userEvent.click(screen.getByText('go'));
    await waitFor(() => expect(shareLink).toHaveBeenCalledTimes(1));
    expect(fetchJournalProtected).not.toHaveBeenCalled();
  });
});
