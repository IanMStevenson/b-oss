// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import type { ComponentProps } from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ReportEntryScreen } from '../ReportEntryScreen.js';
import { useAccountsStore } from '../../../state/accountsStore.js';
import { useHiddenMembersStore } from '../../../state/hiddenMembersStore.js';

const { reportEntry } = vi.hoisted(() => ({ reportEntry: vi.fn() }));
vi.mock('../../../flows/reactionsFlow.js', () => ({ reportEntry }));

vi.mock('../../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

const goBack = vi.fn();
vi.mock('../../../app/routes/useAppNavigate.js', () => ({
  useAppNavigate: () => ({ push: vi.fn(), replace: vi.fn(), goBack }),
}));

beforeEach(() => {
  useAccountsStore.setState({
    accounts: [
      {
        id: 'a1',
        username: 'me',
        avatarUrl: null,
        appTokenScope: 'read,write',
        hasServiceToken: false,
        notificationRegistrationId: null,
        notificationStatus: null,
      },
    ],
    activeAccountId: 'a1',
    hydrated: true,
  });
  useHiddenMembersStore.setState({ hiddenByAccount: {}, hydrated: true });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderScreen(props: Partial<ComponentProps<typeof ReportEntryScreen>> = {}) {
  return render(
    <MemoryRouter>
      <ReportEntryScreen entryId="1" {...props} />
    </MemoryRouter>,
  );
}

function checkReason(label: string): void {
  const item = screen.getByText(label).closest('ion-checkbox')!;
  item.dispatchEvent(new CustomEvent('ionChange', { bubbles: true }));
}

describe('ReportEntryScreen', () => {
  it('blocks Send with no reason selected', async () => {
    renderScreen();
    await userEvent.click(screen.getByText('Send'));
    expect(await screen.findByText('Select a reason.')).toBeDefined();
    expect(reportEntry).not.toHaveBeenCalled();
  });

  it('submits with a selected reason and an optional note', async () => {
    reportEntry.mockResolvedValue(undefined);
    renderScreen();
    checkReason('Copyright infringement');
    await userEvent.click(screen.getByText('Send'));
    await waitFor(() =>
      expect(reportEntry).toHaveBeenCalledWith('1', { reason_copyright: 1 }, undefined),
    );
    expect(await screen.findByText('Report sent')).toBeDefined();
  });

  it("names the comment's author and pre-seeds the note when reporting a comment", () => {
    renderScreen({
      targetUsername: 'alice',
      reportedComment: { username: 'alice', excerpt: 'nice shot' },
    });
    expect(screen.getByText("Reporting: alice's comment")).toBeDefined();
    expect(screen.getByText('alice\'s comment: "nice shot"')).toBeDefined();
  });

  it('offers Hide as a separate action after a successful report, never applied automatically', async () => {
    reportEntry.mockResolvedValue(undefined);
    renderScreen({ targetUsername: 'alice' });
    checkReason('Promotional / spam');
    await userEvent.click(screen.getByText('Send'));
    expect(await screen.findByText('Also hide alice')).toBeDefined();
    expect(useHiddenMembersStore.getState().hiddenByAccount.a1).toBeUndefined();

    await userEvent.click(screen.getByText('Also hide alice'));
    expect(useHiddenMembersStore.getState().hiddenByAccount.a1).toEqual(['alice']);
  });
});
