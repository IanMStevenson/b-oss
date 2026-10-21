// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// b-oss#330 item 1 — cold/warm start parity (§16). The same URL must land on the same route
// whether it arrives as the launch URL (cold) or an appUrlOpen event (warm), through the real
// AppShell wiring rather than the resolver in isolation.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, waitFor, act, screen } from '@testing-library/react';
import { AppShell } from '../AppShell.js';
import { useAccountsStore } from '../../state/accountsStore.js';

let launchUrl: string | null = null;
let warmHandler: ((url: string) => void) | null = null;

vi.mock('../../platform/deepLinks.js', () => ({
  getLaunchUrl: () => Promise.resolve(launchUrl),
  onAppUrlOpen: (cb: (url: string) => void) => {
    warmHandler = cb;
    return () => {
      warmHandler = null;
    };
  },
}));

afterEach(() => {
  cleanup();
  launchUrl = null;
  warmHandler = null;
  useAccountsStore.setState({ accounts: [], activeAccountId: null });
  window.history.pushState({}, '', '/');
});

const cases: Array<[string, string]> = [
  ['bmobile://entry/12345', '/entry/12345'],
  ['bmobile://user/alice', '/user/alice'],
  ['https://www.blipfoto.com/entry/987', '/entry/987'],
  ['https://www.blipfoto.com/bob', '/user/bob'],
  ['https://www.blipfoto.com/me/followers/requests', '/me/requests'],
];

describe('AppShell deep links: cold vs warm start', () => {
  it.each(cases)('%s routes to %s on cold start', async (url, path) => {
    launchUrl = url;
    render(<AppShell />);
    await waitFor(() => expect(window.location.pathname).toBe(path));
  });

  it.each(cases)('%s routes to %s on warm start', async (url, path) => {
    render(<AppShell />);
    await waitFor(() => expect(warmHandler).not.toBeNull());
    await screen.findAllByText(/Browse/);
    act(() => warmHandler!(url));
    await waitFor(() => expect(window.location.pathname).toBe(path));
  });

  it.each([
    'bmobile://oauth/#access_token=t&state=s',
    'https://evil.example/entry/1',
    'bmobile://settings/x',
    'not a url',
  ])('never navigates for %s, cold or warm', async (url) => {
    launchUrl = url;
    render(<AppShell />);
    await waitFor(() => expect(warmHandler).not.toBeNull());
    act(() => warmHandler!(url));
    // Give both listeners a chance to (wrongly) navigate before asserting the route is untouched.
    await new Promise((r) => setTimeout(r, 50));
    expect(window.location.pathname).toBe('/browse');
  });
});
