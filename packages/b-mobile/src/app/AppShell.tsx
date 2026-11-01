// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The app shell (§5): IonMenu for primary navigation, a single IonRouterOutlet for the page
// stack — no router-level tabs, since SCR-02's seven feeds (Recent, Following, Me, Popular,
// Milestones, New Blippers, Nearby) are in-screen state, not routes.

import { useEffect, useRef } from 'react';
import {
  IonApp,
  IonMenu,
  IonRouterOutlet,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonMenuToggle,
} from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import {
  Bell,
  CircleHelp,
  CirclePlus,
  LayoutGrid,
  LogIn,
  MapPin,
  MessageSquare,
  Search,
  Settings,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { NavigateFunction } from 'react-router-dom';
import type { CSSProperties, RefObject } from 'react';
import { AccountRowBody } from '../components/AccountRowBody.js';
import { OverlayProvider, OverlayHost } from './OverlayProvider.js';
import { renderAppRoutes } from './routes/AppRoutes.js';
import { useAccountsStore, useActiveAccount, useCanWrite } from '../state/accountsStore.js';
import { markAuthReady } from '../state/authReady.js';
import { maybeRunFeedProbe } from '../diagnostics/feedProbe.js';
import { useHiddenMembersStore } from '../state/hiddenMembersStore.js';
import { useDevicePrefsStore } from '../state/devicePrefsStore.js';
import { useNotificationCountsStore } from '../state/notificationCountsStore.js';
import { useUploadQueueStore } from '../state/uploadQueueStore.js';
import { startUploadQueueRunner } from '../flows/uploadQueueRunner.js';
import { onReminderTapped } from '../platform/localNotifications.js';
import { refreshAccountAvatars } from '../flows/avatarFlow.js';
import { switchAccount, handleForcedLogout, devSignInWithToken } from '../flows/accountsFlow.js';
import { onPushReceived, onPushTapped, onPushTokenChanged } from '../platform/push.js';
import {
  runLaunchBackstopCheck,
  handleDeviceTokenRotated,
  routeForPushTap,
} from '../flows/pushFlow.js';
import { applyFontScale } from '../platform/accessibility.js';
import { onAppStateChange } from '../platform/appState.js';
import { onAppUrlOpen, getLaunchUrl } from '../platform/deepLinks.js';
import { resolveDeepLink, routeDeepLink } from '../flows/deepLinkResolver.js';
import { isBackSwallowedAt, BROWSE_BACK_PRIORITY } from './hardwareBack.js';
import { checkForSharedImage, onShareReceived } from '../platform/shareIntent.js';

const MAIN_CONTENT_ID = 'main-content';

// React Router 6's useNavigate() returns a new function whenever the location changes. The
// listeners below subscribe once (and DeepLinkListener also consumes the launch URL / shared
// image on mount), so they hold the latest navigate in a ref instead of depending on it —
// otherwise every navigation would tear down and re-run those effects.
function useLatestNavigate(): RefObject<NavigateFunction> {
  const navigate = useNavigate();
  const ref = useRef(navigate);
  ref.current = navigate;
  return ref;
}

// Primary nav (BEHAVIOUR.md, Navigation shell). Every target route exists in AppRoutes.
//
// Grouped like the Blipfoto site, with lucide icons: Comments, Notifications, New entry · Browse,
// Map, Search · the signed-in account's row (opens your own profile; "Sign in" when signed out) ·
// Settings | Help · the app version. Accounts and Hidden members are reached from Settings, and
// the header avatar opens the account switcher.
const NAV_CURRENT_STYLE = {
  '--background': 'var(--selected-row-bg)',
  '--color': 'var(--selected-row-text)',
  fontWeight: 600,
} as CSSProperties;

const NAV_ICON_PROPS = { size: 20, strokeWidth: 1.75, 'aria-hidden': true } as const;

function isCurrent(currentPath: string, to: string): boolean {
  return currentPath === to || currentPath.startsWith(`${to}/`);
}

function NavItem({
  to,
  label,
  icon,
  badge = 0,
  currentPath,
}: {
  to: string;
  label: string;
  icon: ReactNode;
  badge?: number;
  currentPath: string;
}) {
  const current = isCurrent(currentPath, to);
  return (
    <IonMenuToggle autoHide={false}>
      <IonItem
        routerLink={to}
        aria-current={current ? 'page' : undefined}
        className={current ? 'nav-item-current' : undefined}
        style={current ? NAV_CURRENT_STYLE : undefined}
      >
        <span slot="start" style={{ display: 'flex' }}>
          {icon}
        </span>
        <IonLabel>{label}</IonLabel>
        {badge > 0 && <IonBadge slot="end">{badge}</IonBadge>}
      </IonItem>
    </IonMenuToggle>
  );
}

function NavDivider() {
  return <div role="separator" style={{ borderTop: '1px solid var(--line)' }} />;
}

// The signed-in account's row: the same AccountRowBody as the switcher, opening your own profile.
function NavAccountBlock({ currentPath }: { currentPath: string }) {
  const activeAccount = useActiveAccount();
  if (!activeAccount) return null;
  const current = isCurrent(currentPath, '/me');
  return (
    <IonMenuToggle autoHide={false}>
      <IonItem
        routerLink="/me"
        detail={false}
        lines="none"
        aria-label={`Account: ${activeAccount.username}. Open your profile`}
        aria-current={current ? 'page' : undefined}
        className={current ? 'nav-item-current' : undefined}
        style={{
          '--padding-top': '8px',
          '--padding-bottom': '8px',
          ...(current ? NAV_CURRENT_STYLE : {}),
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
          <AccountRowBody account={activeAccount} active={false} avatarSize={40} />
        </div>
      </IonItem>
    </IonMenuToggle>
  );
}

// Settings | Help as one small row of two equal halves.
function NavPairRow({ currentPath }: { currentPath: string }) {
  const cell = (to: string, label: string, icon: ReactNode) => {
    const current = isCurrent(currentPath, to);
    return (
      <IonMenuToggle autoHide={false} style={{ flex: 1 }}>
        <IonItem
          routerLink={to}
          detail={false}
          aria-current={current ? 'page' : undefined}
          className={current ? 'nav-item-current' : undefined}
          style={current ? NAV_CURRENT_STYLE : undefined}
        >
          <span slot="start" style={{ display: 'flex' }}>
            {icon}
          </span>
          <IonLabel>{label}</IonLabel>
        </IonItem>
      </IonMenuToggle>
    );
  };
  return (
    <div style={{ display: 'flex' }}>
      {cell('/settings', 'Settings', <Settings {...NAV_ICON_PROPS} />)}
      {cell('/help', 'Help', <CircleHelp {...NAV_ICON_PROPS} />)}
    </div>
  );
}

// __APP_VERSION__: b-mobile's own package.json version (src/appVersion.ts, set in vite.config.ts).
function NavVersion() {
  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';
  return (
    <IonMenuToggle autoHide={false}>
      <IonItem routerLink="/help" detail={false} lines="none">
        <IonLabel style={{ fontSize: 'var(--text-sm, 12px)', color: 'var(--ion-color-medium)' }}>
          b-mobile {version}
        </IonLabel>
      </IonItem>
    </IonMenuToggle>
  );
}

function NavMenu() {
  const activeAccount = useActiveAccount();
  const canWrite = useCanWrite();
  const notificationsCount = useNotificationCountsStore((s) => s.notifications);
  const commentsCount = useNotificationCountsStore((s) => s.comments);
  const { pathname } = useLocation();
  // swipeGesture off: a swipe from the left screen edge was opening this menu by accident (and
  // competing with the in-page swipe navigation). The menu opens from the header button only.
  return (
    <IonMenu contentId={MAIN_CONTENT_ID} swipeGesture={false}>
      <IonContent>
        {/* Flex column filling the drawer so the version footer sits at the bottom of the screen
            (IonContent's own bottom padding keeps it clear of the gesture bar). */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
          <IonList lines="none" style={{ padding: 0 }}>
            {activeAccount ? (
              <NavAccountBlock currentPath={pathname} />
            ) : (
              <NavItem
                to="/sign-in"
                label="Sign in"
                icon={<LogIn {...NAV_ICON_PROPS} />}
                currentPath={pathname}
              />
            )}
            <NavDivider />
            {activeAccount && (
              <>
                <NavItem
                  to="/comments"
                  label="Comments"
                  icon={<MessageSquare {...NAV_ICON_PROPS} />}
                  badge={commentsCount}
                  currentPath={pathname}
                />
                <NavItem
                  to="/notifications"
                  label="Notifications"
                  icon={<Bell {...NAV_ICON_PROPS} />}
                  badge={notificationsCount}
                  currentPath={pathname}
                />
              </>
            )}
            {canWrite && (
              <NavItem
                to="/compose"
                label="New entry"
                icon={<CirclePlus {...NAV_ICON_PROPS} />}
                currentPath={pathname}
              />
            )}
            {(activeAccount || canWrite) && <NavDivider />}
            <NavItem
              to="/browse"
              label="Browse"
              icon={<LayoutGrid {...NAV_ICON_PROPS} />}
              currentPath={pathname}
            />
            <NavItem
              to="/map"
              label="Map"
              icon={<MapPin {...NAV_ICON_PROPS} />}
              currentPath={pathname}
            />
            <NavItem
              to="/search"
              label="Search"
              icon={<Search {...NAV_ICON_PROPS} />}
              currentPath={pathname}
            />
            <NavDivider />
            <NavPairRow currentPath={pathname} />
          </IonList>
          <div style={{ marginTop: 'auto' }}>
            <NavVersion />
          </div>
        </div>
      </IonContent>
    </IonMenu>
  );
}

// FLW-16 — receiving/tapping a push. Mounted inside IonReactRouter (needs useNavigate() for tap
// routing), same shape as ReminderTapListener below.
function PushListener() {
  const navigate = useLatestNavigate();
  useEffect(() => {
    const offReceived = onPushReceived((payload) => {
      if (payload.kind === 'reauth-required') {
        // FLW-16 step 7: "receiving it (tap or not) feeds FLW-02's... handling immediately" —
        // this is the tap-independent half, for when the push arrives while the app is in the
        // foreground. The tap-independent case while the app *isn't* running is covered by the
        // next launch's backstop check (runLaunchBackstopCheck) instead, since there is no
        // custom background message handler (§11's deliberate choice — see platform/push.ts).
        handleForcedLogout(payload.accountId, 'service');
        return;
      }
      // A push carries no per-stream detail beyond which one moved (§11) — refreshing both
      // totals is simpler than threading the payload's `stream` through and no more expensive,
      // since `messages/totals/unread` is one call for both counts already.
      void useNotificationCountsStore.getState().refresh();
    });
    const offTapped = onPushTapped((payload) => {
      void routeForPushTap(payload).then((route) => navigate.current(route));
    });
    const offTokenChanged = onPushTokenChanged((token) => {
      void handleDeviceTokenRotated(token);
    });
    return () => {
      offReceived();
      offTapped();
      offTokenChanged();
    };
  }, [navigate]);
  return null;
}

// app-architecture.md §16 — the one place all three inbound paths (cold start's launch URL/share
// intent, warm start's appUrlOpen/share signal) reach their resolvers, so cold and warm start
// can't diverge. Needs Router context for `navigate`, same shape as PushListener/
// ReminderTapListener. The share-intent path only navigates to `/compose` here — the actual
// photo was already consumed into platform/shareIntent.ts's cache by the time this runs (FLW-12
// goes through `/compose`'s own WriteGuardRoute gate before NewEntryScreen ever mounts to pick
// it up; see that module's header comment for why the consumption has to happen here, not there).
function DeepLinkListener() {
  const navigate = useLatestNavigate();
  useEffect(() => {
    void getLaunchUrl().then((url) => {
      if (url) routeDeepLink(resolveDeepLink(url), (path) => navigate.current(path));
    });
    void checkForSharedImage().then((found) => {
      if (found) navigate.current('/compose');
    });
    const offUrlOpen = onAppUrlOpen((url) => {
      routeDeepLink(resolveDeepLink(url), (path) => navigate.current(path));
    });
    const offShareReceived = onShareReceived(() => {
      void checkForSharedImage().then((found) => {
        if (found) navigate.current('/compose');
      });
    });
    return () => {
      offUrlOpen();
      offShareReceived();
    };
  }, [navigate]);
  return null;
}

// FLW-18's "tapping it switches to that account, then opens SCR-09" — needs Router context for
// navigation, so it's mounted inside IonReactRouter rather than alongside the top-level hydrate
// effect above (which has none).
function ReminderTapListener() {
  const navigate = useLatestNavigate();
  useEffect(
    () =>
      onReminderTapped((accountId) => {
        const active = useAccountsStore.getState().activeAccountId;
        if (active !== accountId) {
          try {
            switchAccount(accountId);
          } catch {
            // Account no longer stored, or needs reauth — nothing sensible to switch to; still open
            // compose so the tap isn't a dead end, against whichever account ends up active.
          }
        }
        navigate.current('/compose');
      }),
    [navigate],
  );
  return null;
}

// Ionic fires `ionBackButton` on the system Back button and runs only the highest-priority
// registered handler; not calling `processNextHandler` stops the router's own handler (and so the
// navigate/exit) from running. Menu and overlay handlers outrank this one.
interface BackButtonDetail {
  register: (priority: number, handler: (processNextHandler: () => void) => void) => void;
}

function BrowseBackGuard() {
  const { pathname } = useLocation();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  useEffect(() => {
    const onBack = (e: Event) => {
      (e as CustomEvent<BackButtonDetail>).detail.register(
        BROWSE_BACK_PRIORITY,
        (processNextHandler: () => void) => {
          if (!isBackSwallowedAt(pathRef.current)) processNextHandler();
        },
      );
    };
    document.addEventListener('ionBackButton', onBack);
    return () => document.removeEventListener('ionBackButton', onBack);
  }, []);
  return null;
}

export function AppShell() {
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);

  useEffect(() => {
    void applyFontScale();
    const accountsHydrated = useAccountsStore.getState().hydrate();
    // Dev-only, desktop-browser convenience: real OAuth needs a captured `bmobile://` redirect
    // (platform/deepLinks.ts), which no desktop browser can deliver. VITE_DEV_TOKEN — a token
    // obtained outside the app, e.g. Blipfoto's own app-admin pages — lets §19's "browser-mode
    // development" cover signed-in screens too. Only fires when no account is already active, so
    // it seeds once and never fights a real sign-in/switch-account/sign-out done afterwards.
    // `MODE === 'development'` rather than `DEV` — Vitest also sets `DEV: true`, and a real
    // VITE_DEV_TOKEN in .env.local would otherwise fire a real network call on every test run
    // that mounts AppShell, mutating the live accountsStore singleton in the background.
    //
    // markAuthReady() only fires once this (and hydration) has actually settled — data/client.ts's
    // getClient() awaits authReady before reading accountsStore, so a screen that fetches on
    // mount can't race ahead of the dev-seed's own network round-trip, silently fall back to the
    // anonymous client, and get a confusing "user access token is missing" from a "User auth
    // only" endpoint that's actually rejecting the *anonymous* request, not the real token.
    // .catch() keeps this from ever hanging authReady forever if the seed's own network call fails.
    if (import.meta.env.MODE === 'development' && import.meta.env.VITE_DEV_TOKEN) {
      void accountsHydrated
        .then(async () => {
          if (!useAccountsStore.getState().activeAccountId) {
            await devSignInWithToken(import.meta.env.VITE_DEV_TOKEN as string).catch(() => {});
          }
        })
        .finally(markAuthReady);
    } else {
      void accountsHydrated.finally(markAuthReady);
    }
    // b-oss#196 diagnostic — inert unless built with VITE_FEED_PROBE=1.
    void maybeRunFeedProbe();
    void useHiddenMembersStore.getState().hydrate();
    void useDevicePrefsStore.getState().hydrate();
    // The upload queue (§9) has non-React consumers by design — started once here rather than
    // from any one screen, so a background upload resumes even if the app launches straight into
    // a route that never touches uploadQueueStore itself. Loaded from prefs first, so the runner's
    // launch recovery (a stuck `uploading` item back to `waiting`) sees the persisted queue rather
    // than an empty store (b-oss#342).
    void useUploadQueueStore.getState().hydrate().then(startUploadQueueRunner);
    // FLW-16 step 8 — the launch-time backstop, run once accounts are known (it reads
    // accountsStore directly, not via a React selector, so it just needs hydrate() to resolve).
    void accountsHydrated.then(() => runLaunchBackstopCheck());
    // Fill in / refresh every account's profile picture (the switcher and header show it).
    void accountsHydrated.then(() => refreshAccountAvatars());
    // Returning from system settings is not assumed to have succeeded — re-run the
    // same backstop check on every resume, not only at launch, since the OS permission (or the
    // service's registration health) may have changed while the app was backgrounded.
    return onAppStateChange((isActive) => {
      if (isActive) void runLaunchBackstopCheck();
    });
  }, []);

  // Notification-count badges are per-account (a server figure for whichever account is
  // authenticated) — refetched whenever the active account changes, and zeroed rather than left
  // showing a stale number when there's no account (or the incoming one, before its own fetch
  // resolves) to own them.
  useEffect(() => {
    useNotificationCountsStore.getState().reset();
    if (activeAccountId) {
      void useNotificationCountsStore.getState().refresh();
    }
  }, [activeAccountId]);

  return (
    <IonApp>
      <OverlayProvider>
        <IonReactRouter>
          <NavMenu />
          <ReminderTapListener />
          <BrowseBackGuard />
          <PushListener />
          <DeepLinkListener />
          <OverlayHost />
          <IonRouterOutlet id={MAIN_CONTENT_ID}>{renderAppRoutes()}</IonRouterOutlet>
        </IonReactRouter>
      </OverlayProvider>
      <div className="system-nav-strip" aria-hidden="true" />
    </IonApp>
  );
}
