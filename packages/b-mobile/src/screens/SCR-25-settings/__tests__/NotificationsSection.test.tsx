// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// SCR-25 Notifications (b-oss#244): two per-account push toggles (no master switch), the check
// interval, and the Blipfoto notification settings. IonAlert is stubbed at the @ionic/react boundary
// (b-oss#193 — Ionic's animated overlays drop clicks in jsdom under load).

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, act, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BlipfotoError } from '@b-oss/b-api';
import {
  NotificationsSection,
  SHOW_POLLING_INTERVAL,
  feedHint,
} from '../sections/NotificationsSection.js';
import { useAccountsStore } from '../../../state/accountsStore.js';
import type { StoredAccount } from '../../../state/accountsStore.js';
import { useDevicePrefsStore } from '../../../state/devicePrefsStore.js';
import { AccountMismatchError } from '../../../flows/accountMismatch.js';

vi.mock('@ionic/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ionic/react')>();
  interface StubButton {
    text: string;
    role?: string;
    handler?: () => void;
  }
  function IonAlert({
    isOpen,
    header,
    message,
    buttons = [],
    onDidDismiss,
  }: {
    isOpen: boolean;
    header?: string;
    message?: string;
    buttons?: StubButton[];
    onDidDismiss?: () => void;
  }) {
    if (!isOpen) return null;
    return (
      <div role="dialog" aria-label={header}>
        {message && <p>{message}</p>}
        {buttons.map((b) => (
          <button
            key={b.text}
            onClick={() => {
              b.handler?.();
              onDidDismiss?.();
            }}
          >
            {b.text}
          </button>
        ))}
      </div>
    );
  }
  return { ...actual, IonAlert };
});

const { fetchNotificationSettings, saveNotificationSettings } = vi.hoisted(() => ({
  fetchNotificationSettings: vi.fn(),
  saveNotificationSettings: vi.fn(),
}));
vi.mock('../../../data/settings.js', () => ({
  fetchNotificationSettings,
  saveNotificationSettings,
}));

const { changeAccountMode, MockOAuthCancelledError } = vi.hoisted(() => ({
  changeAccountMode: vi.fn(),
  MockOAuthCancelledError: class extends Error {},
}));
vi.mock('../../../flows/accountsFlow.js', () => ({
  changeAccountMode,
  OAuthCancelledError: MockOAuthCancelledError,
}));

const { updatePollingInterval, updatePushStreams } = vi.hoisted(() => ({
  updatePollingInterval: vi.fn(),
  updatePushStreams: vi.fn(),
}));
vi.mock('../../../flows/pushFlow.js', () => ({ updatePollingInterval, updatePushStreams }));

// Off-native by default (no in-app browser, so the mismatch alert offers no retry); the
// retry test flips it.
let isNative = false;
vi.mock('../../../platform/appState.js', () => ({ isNativePlatform: () => isNative }));

vi.mock('../../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

const ALL_ON = {
  feed_friends: 1,
  feed_entry_favorite_received: 1,
  feed_entry_star_received: 1,
  feed_publish_milestone: 1,
  feed_publish_followers_milestone: 1,
  feed_new_award: 1,
} as const;

function account(overrides: Partial<StoredAccount> = {}): StoredAccount {
  return {
    id: 'a1',
    username: 'alice',
    avatarUrl: null,
    appTokenScope: 'read,write',
    hasServiceToken: false,
    notificationRegistrationId: null,
    notificationStatus: null,
    ...overrides,
  };
}

const registered = (overrides: Partial<StoredAccount> = {}) =>
  account({
    hasServiceToken: true,
    notificationRegistrationId: 'reg-1',
    notificationStatus: 'active',
    ...overrides,
  });

function setAccount(a: StoredAccount) {
  useAccountsStore.setState({ accounts: [a], activeAccountId: a.id, hydrated: true });
}

function toggle(label: string): HTMLElement {
  return screen.getByLabelText(label);
}

function flip(label: string, checked: boolean) {
  toggle(label).dispatchEvent(new CustomEvent('ionChange', { bubbles: true, detail: { checked } }));
}

beforeEach(() => {
  setAccount(account());
  useDevicePrefsStore.setState({
    confirmAccountBeforeReaction: false,
    reminders: {},
    uploadFullSize: true,
    openBlipfotoLinksInApp: false,
    notificationPollingIntervalMinutes: 5,
    hydrated: true,
  });
  fetchNotificationSettings.mockResolvedValue({ feed: { configured: 1, settings: { ...ALL_ON } } });
  saveNotificationSettings.mockResolvedValue(undefined);
  changeAccountMode.mockResolvedValue(undefined);
  updatePollingInterval.mockResolvedValue(undefined);
  updatePushStreams.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  isNative = false;
});

describe('NotificationsSection — push toggles', () => {
  it('renders the two toggles for the active account, both off when not registered', async () => {
    render(<NotificationsSection />);
    expect(screen.getByText('b-mobile notifications')).toBeDefined();
    expect(screen.getByText('Notifications from b-mobile on this device')).toBeDefined();
    expect((toggle('New comments') as HTMLIonToggleElement).checked).toBe(false);
    expect((toggle('New notifications') as HTMLIonToggleElement).checked).toBe(false);
    await screen.findByText('Blipfoto notification settings');
  });

  it('reflects the stored streams of a registered account', async () => {
    setAccount(registered({ pushComments: true, pushNotifications: false }));
    render(<NotificationsSection />);
    await screen.findByText('Blipfoto notification settings');
    expect((toggle('New comments') as HTMLIonToggleElement).checked).toBe(true);
    expect((toggle('New notifications') as HTMLIonToggleElement).checked).toBe(false);
  });

  it('first one on from off runs the enable path with just that stream', async () => {
    render(<NotificationsSection />);
    await screen.findByText('Blipfoto notification settings');
    flip('New comments', true);
    await waitFor(() =>
      expect(changeAccountMode).toHaveBeenCalledWith(
        'a1',
        {
          scope: 'read,write',
          notifications: true,
          pushStreams: { comments: true, notifications: false },
        },
        { beforeServiceRound: expect.any(Function) as unknown },
      ),
    );
    expect(updatePushStreams).not.toHaveBeenCalled();
  });

  it('toggling one while the other stays on PATCHes the new flags', async () => {
    setAccount(registered());
    render(<NotificationsSection />);
    await screen.findByText('Blipfoto notification settings');
    flip('New comments', false);
    await waitFor(() =>
      expect(updatePushStreams).toHaveBeenCalledWith('a1', {
        comments: false,
        notifications: true,
      }),
    );
    expect(changeAccountMode).not.toHaveBeenCalled();
  });

  it('a failed PATCH shows an error', async () => {
    setAccount(registered());
    updatePushStreams.mockRejectedValue(new Error('service down'));
    render(<NotificationsSection />);
    await screen.findByText('Blipfoto notification settings');
    flip('New comments', false);
    expect(await screen.findByText('service down')).toBeDefined();
  });

  it('last one off on a read-write account warns, and Keep on changes nothing', async () => {
    setAccount(registered({ pushComments: false, pushNotifications: true }));
    render(<NotificationsSection />);
    await screen.findByText('Blipfoto notification settings');
    flip('New notifications', false);

    const dialog = await screen.findByRole('dialog', { name: 'Turn off notifications?' });
    expect(dialog.textContent).toContain(
      'Turning this off stops all notifications for alice. To turn them back on later you may need to sign in to Blipfoto again.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Keep on' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(changeAccountMode).not.toHaveBeenCalled();
    expect(updatePushStreams).not.toHaveBeenCalled();
    expect((toggle('New notifications') as HTMLIonToggleElement).checked).toBe(true);
  });

  it('last one off on a read-write account deregisters only after Turn off', async () => {
    setAccount(registered({ pushComments: false, pushNotifications: true }));
    render(<NotificationsSection />);
    await screen.findByText('Blipfoto notification settings');
    flip('New notifications', false);
    await screen.findByRole('dialog', { name: 'Turn off notifications?' });
    expect(changeAccountMode).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    await waitFor(() =>
      expect(changeAccountMode).toHaveBeenCalledWith('a1', {
        scope: 'read,write',
        notifications: false,
      }),
    );
  });

  it('last one off on a read-only account deregisters with no warning', async () => {
    setAccount(registered({ appTokenScope: 'read', pushComments: true, pushNotifications: false }));
    render(<NotificationsSection />);
    await screen.findByText('Blipfoto notification settings');
    flip('New comments', false);
    await waitFor(() =>
      expect(changeAccountMode).toHaveBeenCalledWith('a1', {
        scope: 'read',
        notifications: false,
      }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a dead service token shows the needs-sign-in note, and turning one on signs in again', async () => {
    setAccount(
      account({
        notificationRegistrationId: 'reg-1',
        notificationStatus: 'read-token-invalid',
        pushComments: true,
        pushNotifications: true,
      }),
    );
    render(<NotificationsSection />);
    await screen.findByText('Blipfoto notification settings');
    expect(screen.getByText(/Blipfoto needs you to sign in again/)).toBeDefined();
    expect((toggle('New comments') as HTMLIonToggleElement).checked).toBe(false);
    flip('New notifications', true);
    await waitFor(() =>
      expect(changeAccountMode).toHaveBeenCalledWith(
        'a1',
        {
          scope: 'read,write',
          notifications: true,
          pushStreams: { comments: false, notifications: true },
        },
        { beforeServiceRound: expect.any(Function) as unknown },
      ),
    );
  });
});

describe('NotificationsSection — feed settings', () => {
  it('has no Push group from Blipfoto', async () => {
    setAccount(registered());
    render(<NotificationsSection />);
    await screen.findByText('Blipfoto notification settings');
    expect(screen.queryByText('Push')).toBeNull();
    expect(fetchNotificationSettings).toHaveBeenCalledTimes(1);
  });

  it('renders the feed toggles with plain labels', async () => {
    render(<NotificationsSection />);
    expect(await screen.findByText('Activity from people you follow')).toBeDefined();
    expect(screen.getByText('Stars')).toBeDefined();
    expect(screen.getByText('Follower milestones')).toBeDefined();
  });

  it('saving sends only the feed keys, and never pings the service', async () => {
    setAccount(registered());
    render(<NotificationsSection />);
    await screen.findByText('Stars');
    flip('Stars', false);
    await userEvent.click(await screen.findByText('Save', { selector: 'ion-button' }));

    await waitFor(() =>
      expect(saveNotificationSettings).toHaveBeenCalledWith({
        ...ALL_ON,
        feed_entry_star_received: 0,
      }),
    );
    expect(updatePushStreams).not.toHaveBeenCalled();
    expect(updatePollingInterval).not.toHaveBeenCalled();
    expect(changeAccountMode).not.toHaveBeenCalled();
  });

  it('is view-only for a read-only account', async () => {
    setAccount(account({ appTokenScope: 'read' }));
    render(<NotificationsSection />);
    await screen.findByText('Stars');
    expect((toggle('Stars') as HTMLIonToggleElement).disabled).toBe(true);
  });

  it('Cancel restores the saved values', async () => {
    render(<NotificationsSection />);
    await screen.findByText('Stars');
    flip('Stars', false);
    await userEvent.click(await screen.findByText('Cancel', { selector: 'ion-button' }));
    await waitFor(() => expect(screen.queryByText('Save', { selector: 'ion-button' })).toBeNull());
    expect((toggle('Stars') as HTMLIonToggleElement).checked).toBe(true);
  });

  it('shows an error state when the load fails', async () => {
    fetchNotificationSettings.mockRejectedValue(new BlipfotoError(500, 'Server error'));
    render(<NotificationsSection />);
    expect(await screen.findByText('Server error')).toBeDefined();
  });
});

describe('NotificationsSection — feed hint', () => {
  it('lists the feed types that are off, under New notifications', async () => {
    setAccount(registered());
    fetchNotificationSettings.mockResolvedValue({
      feed: {
        configured: 1,
        settings: { ...ALL_ON, feed_entry_star_received: 0, feed_publish_followers_milestone: 0 },
      },
    });
    render(<NotificationsSection />);
    const hint = await screen.findByTestId('feed-hint');
    expect(hint.textContent).toBe(
      "Your Blipfoto feed has stars and follower milestones turned off, so you won't be notified about those.",
    );
  });

  it('says plainly when every type is off', async () => {
    setAccount(registered());
    fetchNotificationSettings.mockResolvedValue({
      feed: {
        configured: 1,
        settings: Object.fromEntries(Object.keys(ALL_ON).map((k) => [k, 0])),
      },
    });
    render(<NotificationsSection />);
    const hint = await screen.findByTestId('feed-hint');
    expect(hint.textContent).toContain('this app will never have any notifications to tell you');
  });

  it('shows nothing when every type is on', async () => {
    setAccount(registered());
    render(<NotificationsSection />);
    await screen.findByText('Stars');
    expect(screen.queryByTestId('feed-hint')).toBeNull();
  });

  it('shows nothing while New notifications is off', async () => {
    setAccount(registered({ pushComments: true, pushNotifications: false }));
    fetchNotificationSettings.mockResolvedValue({
      feed: { configured: 1, settings: { ...ALL_ON, feed_entry_star_received: 0 } },
    });
    render(<NotificationsSection />);
    await screen.findByText('Stars');
    expect(screen.queryByTestId('feed-hint')).toBeNull();
  });

  it('follows the saved settings, not unsaved edits', async () => {
    setAccount(registered());
    render(<NotificationsSection />);
    await screen.findByText('Stars');
    flip('Stars', false);
    expect(screen.queryByTestId('feed-hint')).toBeNull();
    await userEvent.click(await screen.findByText('Save', { selector: 'ion-button' }));
    expect((await screen.findByTestId('feed-hint')).textContent).toContain('stars');
  });

  it('feedHint joins three or more types with commas', () => {
    expect(
      feedHint({ ...ALL_ON, feed_friends: 0, feed_new_award: 0, feed_publish_milestone: 0 }),
    ).toContain('activity from people you follow, publishing milestones and awards');
  });
});

describe('NotificationsSection — check interval (hidden by SHOW_POLLING_INTERVAL, b-oss#304)', () => {
  async function typeInterval(input: HTMLElement, value: string): Promise<void> {
    // Separate acts: the blur handler reads the draft the input event just stored.
    act(() => {
      input.dispatchEvent(new CustomEvent('ionInput', { detail: { value } }));
    });
    act(() => {
      input.dispatchEvent(new CustomEvent('ionBlur'));
    });
    await Promise.resolve();
  }

  it('is not shown by default', () => {
    expect(SHOW_POLLING_INTERVAL).toBe(false);
    render(<NotificationsSection />);
    expect(screen.queryByLabelText('Check for new activity every')).toBeNull();
  });

  it('commits on blur and PATCHes it when registered', async () => {
    setAccount(registered());
    render(<NotificationsSection showPollingInterval />);
    const input = screen.getByLabelText<HTMLIonInputElement>('Check for new activity every');
    expect(input.value).toBe('5');
    await typeInterval(input, '20');
    await waitFor(() => expect(updatePollingInterval).toHaveBeenCalledWith('a1', 20));
    expect(useDevicePrefsStore.getState().notificationPollingIntervalMinutes).toBe(20);
  });

  it('stays local-only when not registered', async () => {
    render(<NotificationsSection showPollingInterval />);
    const input = screen.getByLabelText<HTMLIonInputElement>('Check for new activity every');
    await typeInterval(input, '10');
    await waitFor(() =>
      expect(useDevicePrefsStore.getState().notificationPollingIntervalMinutes).toBe(10),
    );
    expect(updatePollingInterval).not.toHaveBeenCalled();
  });

  it('rejects a value under the 5-minute floor', async () => {
    render(<NotificationsSection showPollingInterval />);
    const input = screen.getByLabelText<HTMLIonInputElement>('Check for new activity every');
    await typeInterval(input, '2');
    await waitFor(() => expect(input.value).toBe('5'));
    expect(useDevicePrefsStore.getState().notificationPollingIntervalMinutes).toBe(5);
  });

  it('a PATCH failure rolls back the value and shows an error', async () => {
    setAccount(registered());
    updatePollingInterval.mockRejectedValueOnce(new Error('server floor rejected'));
    render(<NotificationsSection showPollingInterval />);
    const input = screen.getByLabelText<HTMLIonInputElement>('Check for new activity every');
    await typeInterval(input, '20');
    expect(await screen.findByText('server floor rejected')).toBeDefined();
    await waitFor(() => expect(input.value).toBe('5'));
  });
});

describe('NotificationsSection — second sign-in and wrong account (b-oss#240)', () => {
  type Hooks = { beforeServiceRound?: () => Promise<boolean> };
  /** Mirrors the real flow: a read-write account asks the hook before the read-only round. */
  function enableAsksFirst(): void {
    changeAccountMode.mockImplementation(async (_id: string, _target: unknown, hooks?: Hooks) => {
      if (hooks?.beforeServiceRound) await hooks.beforeServiceRound();
    });
  }

  it('explains the second sign-in before it, and Cancel aborts with the toggle snapping back', async () => {
    let proceeded: boolean | null = null;
    changeAccountMode.mockImplementation(async (_id: string, _target: unknown, hooks?: Hooks) => {
      proceeded = (await hooks?.beforeServiceRound?.()) ?? true;
    });
    render(<NotificationsSection />);
    await screen.findByText('Blipfoto notification settings');

    const before = toggle('New comments') as HTMLIonToggleElement;
    before.checked = true; // what the Ionic toggle does to itself on tap
    flip('New comments', true);

    const dialog = await screen.findByRole('dialog', { name: 'One more sign-in' });
    expect(dialog.textContent).toContain('separate read-only approval');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(proceeded).toBe(false));
    await waitFor(() => expect(toggle('New comments')).not.toBe(before));
    expect((toggle('New comments') as HTMLIonToggleElement).checked).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Continue goes ahead with the second sign-in', async () => {
    let proceeded: boolean | null = null;
    changeAccountMode.mockImplementation(async (_id: string, _target: unknown, hooks?: Hooks) => {
      proceeded = (await hooks?.beforeServiceRound?.()) ?? true;
    });
    render(<NotificationsSection />);
    await screen.findByText('Blipfoto notification settings');
    flip('New notifications', true);
    await screen.findByRole('dialog', { name: 'One more sign-in' });
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(proceeded).toBe(true));
  });

  it('a round for another account shows who it was for (no retry off native)', async () => {
    enableAsksFirst();
    changeAccountMode.mockRejectedValueOnce(new AccountMismatchError('alice', 'bob'));
    render(<NotificationsSection />);
    await screen.findByText('Blipfoto notification settings');
    flip('New comments', true);

    const dialog = await screen.findByRole('dialog', { name: 'Wrong Blipfoto account' });
    expect(dialog.textContent).toContain(
      'That sign-in was for bob, not alice. Your browser is signed in to Blipfoto as bob.',
    );
    expect(screen.queryByRole('button', { name: 'Try again in the app' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText(/Could not turn/)).toBeNull();
  });

  it('on native, retry runs the same enable in the clean in-app browser', async () => {
    isNative = true;
    changeAccountMode.mockRejectedValueOnce(new AccountMismatchError('alice', 'bob'));
    render(<NotificationsSection />);
    await screen.findByText('Blipfoto notification settings');
    flip('New notifications', true);

    await screen.findByRole('dialog', { name: 'Wrong Blipfoto account' });
    changeAccountMode.mockResolvedValue(undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Try again in the app' }));

    await waitFor(() =>
      expect(changeAccountMode).toHaveBeenLastCalledWith('a1', {
        scope: 'read,write',
        notifications: true,
        pushStreams: { comments: false, notifications: true },
        useEmbedded: true,
      }),
    );
  });

  it("the service's own 403 (owner unknown) gets the same explanation", async () => {
    changeAccountMode.mockRejectedValueOnce(new AccountMismatchError('alice', null));
    render(<NotificationsSection />);
    await screen.findByText('Blipfoto notification settings');
    flip('New comments', true);
    const dialog = await screen.findByRole('dialog', { name: 'Wrong Blipfoto account' });
    expect(dialog.textContent).toContain(
      'That sign-in was for a different Blipfoto account, not alice.',
    );
  });
});
