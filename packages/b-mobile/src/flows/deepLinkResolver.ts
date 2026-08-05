// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// app-architecture.md §16 — the one resolver for all three inbound URL-based paths, so cold start
// (`platform/deepLinks.ts#getLaunchUrl`) and warm start (`onAppUrlOpen`) can't diverge:
//
// - `bmobile://oauth/…` — the OAuth redirect. Recognised so it's never routed (flows/
//   oauthRound.ts's own, separately-scoped `onAppUrlOpen` listener consumes it while a round is
//   in progress; both listeners coexist safely since this resolver only ever *ignores* that URL).
// - `bmobile://entry/:id`, `bmobile://user/:username` — content links, routed directly. Neither
//   `/entry/:entryId` nor `/user/:username` is account-gated (browsing is anonymous-first per
//   rules.md), so there is no FLW-01 gate to apply here — unlike the share intent (FLW-12), which
//   is a write action.
// - `https://www.blipfoto.com/…` — the opt-in web link (§16; only ever reaches the app at all
//   when `devicePrefsStore.openBlipfotoLinksInApp`'s native `<activity-alias>` is enabled,
//   platform/blipfotoLinks.ts). Resolved via `data/notifications.ts#resolveWebPathTarget`, the
//   exact same `blipfoto.com/entry/{id}` / `blipfoto.com/{username}` / `blipfoto.com/me/
//   followers/requests` shapes SCR-23's own notification-link routing already implements — not
//   duplicated here.
//
// Deliberately accepts a plain `{ push }` callback rather than importing `useAppNavigate`/
// react-router directly — the ESLint platform-boundary rule restricts `react-router*` imports to
// `app/routes/**` and `AppShell.tsx` only, and every other `flows/*.ts` module already follows
// the same "navigation is injected, not imported" convention.

import { pathOf, resolveWebPathTarget } from '../data/notifications.js';

export type DeepLinkTarget =
  | { kind: 'entry'; entryId: string }
  | { kind: 'profile'; username: string }
  | { kind: 'follow-request' }
  | { kind: 'oauth' }
  | { kind: 'ignore' };

function resolveBmobilePath(parsed: URL): DeepLinkTarget {
  const segment = parsed.pathname.replace(/^\/+|\/+$/g, '');
  if (!segment) return { kind: 'ignore' };
  if (parsed.host === 'entry') return { kind: 'entry', entryId: decodeURIComponent(segment) };
  if (parsed.host === 'user') return { kind: 'profile', username: decodeURIComponent(segment) };
  return { kind: 'ignore' };
}

export function resolveDeepLink(url: string): DeepLinkTarget {
  // Read at call time, not module-load time — matches platform/mapTiles.ts's convention for the
  // same reason: it's what lets a test's `vi.stubEnv` actually take effect.
  const oauthRedirectPrefix = import.meta.env.VITE_OAUTH_REDIRECT_URI ?? 'bmobile://oauth/';
  if (url.startsWith(oauthRedirectPrefix)) return { kind: 'oauth' };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: 'ignore' };
  }

  if (parsed.protocol === 'bmobile:') return resolveBmobilePath(parsed);

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'www.blipfoto.com' || hostname === 'blipfoto.com') {
    return resolveWebPathTarget(pathOf(url)) ?? { kind: 'ignore' };
  }

  return { kind: 'ignore' };
}

export function routeDeepLink(target: DeepLinkTarget, push: (path: string) => void): void {
  switch (target.kind) {
    case 'entry':
      push(`/entry/${encodeURIComponent(target.entryId)}`);
      return;
    case 'profile':
      push(`/user/${encodeURIComponent(target.username)}`);
      return;
    case 'follow-request':
      push('/me/requests');
      return;
    case 'oauth':
    case 'ignore':
      return;
  }
}
