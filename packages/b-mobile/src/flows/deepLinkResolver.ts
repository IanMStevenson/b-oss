// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// app-architecture.md §16 — the one resolver for all three inbound URL-based paths, so cold start
// (`platform/deepLinks.ts#getLaunchUrl`) and warm start (`onAppUrlOpen`) can't diverge:
//
// - `bmobile://oauth/…` — the OAuth redirect. Recognised so it's never routed (flows/
//   oauthRound.ts's own, separately-scoped `onAppUrlOpen` listener consumes it while a round is
//   in progress; both listeners coexist safely since this resolver only ever *ignores* that URL).
// - `bmobile://entry/:id`, `bmobile://user/:username` — content links, routed directly. Neither
//   `/entry/:entryId` nor `/user/:username` is account-gated (browsing is anonymous-first),
//   so there is no FLW-01 gate to apply here — unlike the share intent (FLW-12), which
//   is a write action.
// - `https://www.blipfoto.com/…` — the opt-in web link (§16; only ever reaches the app at all
//   when `devicePrefsStore.openBlipfotoLinksInApp`'s native `<activity-alias>` is enabled,
//   platform/blipfotoLinks.ts). Resolved by b-api-web's `parseSiteUrl`, the one
//   place the site's link grammar (`blipfoto.com/entry/{id}`, `blipfoto.com/{username}`,
//   `blipfoto.com/me/followers/requests`) is written down; SCR-23's notification links use it too.
//
// Deliberately accepts a plain `{ push }` callback rather than importing `useAppNavigate`/
// react-router directly — the ESLint platform-boundary rule restricts `react-router*` imports to
// `app/routes/**` and `AppShell.tsx` only, and every other `flows/*.ts` module already follows
// the same "navigation is injected, not imported" convention.

import { parseSiteUrl } from '@b-oss/b-api-web';

export type DeepLinkTarget =
  | { kind: 'entry'; entryId: string }
  | { kind: 'profile'; username: string }
  | { kind: 'follow-request' }
  | { kind: 'oauth' }
  | { kind: 'ignore' };

// Split by hand rather than reading `URL#host`/`pathname`: WebViews before about Chromium M130
// don't parse the host of a non-special scheme, so `bmobile://entry/5` gives host `''` and
// pathname `//entry/5` there (b-oss#796).
function resolveBmobilePath(url: string): DeepLinkTarget {
  const rest = url.replace(/^[^:]+:\/\//, '').split(/[?#]/)[0] ?? '';
  const slash = rest.indexOf('/');
  const host = slash === -1 ? rest : rest.slice(0, slash);
  const segment = (slash === -1 ? '' : rest.slice(slash)).replace(/^\/+|\/+$/g, '');
  if (!segment) return { kind: 'ignore' };
  // Any app can send a VIEW intent, so a malformed percent-escape (`%E0%A4%A`, a bare `%`) must
  // resolve to `ignore` rather than let decodeURIComponent's URIError escape to the listener.
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return { kind: 'ignore' };
  }
  if (host === 'entry') return { kind: 'entry', entryId: decoded };
  if (host === 'user') return { kind: 'profile', username: decoded };
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

  // bmobile-debug: is the debug build's own scheme (b-oss#462); only its manifest registers it.
  if (parsed.protocol === 'bmobile:' || parsed.protocol === 'bmobile-debug:') {
    return resolveBmobilePath(url);
  }

  // The site's own links (the grammar lives in b-api-web).
  return parseSiteUrl(url) ?? { kind: 'ignore' };
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
