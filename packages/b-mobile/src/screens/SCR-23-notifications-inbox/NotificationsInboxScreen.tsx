// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-23 — Notifications Inbox (FLW-15/16). Account-gated via AccountGuardRoute (AppRoutes.tsx),
// since this screen is reachable from a tapped push while signed out (FLW-16 step 3), unlike most
// other account-scoped screens whose only entry point is a nav item that's itself hidden while
// signed out.
//
// Fetching *is* what marks these items read (endpoints.md) — there is no separate call, and the
// unread badge is cleared locally the moment the fetch starts (FLW-15 step 2), not derived from
// the response afterward.
//
// `notification.content` genuinely is BBCode (confirmed against a live response — e.g. a follow
// notification's own "[url=...]see all requests[/url]"), so it goes through the same BBCodeText
// component every other BBCode field in this app does — never `dangerouslySetInnerHTML` (§14's
// app-wide ban) via `content_html`. The row's own primary tap target (the avatar) still routes via
// `resolveNotificationTarget` (data/notifications.ts, reading `link_url`); BBCodeText's own inline
// links are a separate, complementary mechanism for whatever `[url=]` tags `content` itself
// carries — the two often point at related but not identical destinations (e.g. a follow
// notification's inline link goes straight to the requests list, matching `link_url` for that
// case, but that's not guaranteed for every notification kind).
//
// No per-notification date grouping: `BlipNotification` (b-api's own type) carries no date/
// timestamp field at all — the API never sends one — so there's nothing to group by. The
// reference (blipfoto.com's own web client) groups by date, but must derive it from something
// this endpoint doesn't expose to us.

import { Bell } from 'lucide-react';
import { EmptyState } from '../../components/EmptyState.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IonPage,
  IonHeader,
  IonContent,
  IonSpinner,
  IonText,
  IonButton,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/core';
import { BBCodeText } from '@b-oss/b-view';
import { AppHeader } from '../../components/AppHeader.js';
import {
  fetchRecentNotifications,
  isNotificationFromHiddenMember,
  leadingActor,
  resolveNotificationTarget,
} from '../../data/notifications.js';
import { describeError, mapApiError } from '../../data/errors.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { useHiddenMembers } from '../../state/hiddenMembersStore.js';
import { useAccountsStore } from '../../state/accountsStore.js';
import { useNotificationCountsStore } from '../../state/notificationCountsStore.js';
import { openUrl } from '../../platform/browser.js';
import { InboxRow, RowThumb } from '../../components/InboxRow.js';
import type { BlipNotification } from '@b-oss/b-api';

type Status = 'loading' | 'loaded' | 'empty' | 'error';

export function NotificationsInboxScreen() {
  const navigate = useAppNavigate();
  const hiddenUsernames = useHiddenMembers();
  const clearNotifications = useNotificationCountsStore((s) => s.clearNotifications);
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);

  const [status, setStatus] = useState<Status>('loading');
  const [items, setItems] = useState<BlipNotification[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const latestIdRef = useRef<string | null>(null);
  // `BlipNotification` has no unread flag. The badge count is the number of unread items, and the
  // endpoint returns newest first, so the first N rows of the first response are the new ones.
  // Snapshotted once, before the optimistic clear below zeroes it (same trap as SCR-24's ref).
  const newIdsRef = useRef<Set<string> | null>(null);
  // The count itself is also kept once: load() runs more than once (a Retry, or a dev double
  // effect) and by then the badge is already zeroed, which would otherwise make the first
  // response to land mark nothing as new.
  const unreadCountRef = useRef<number | null>(null);

  const load = useCallback(() => {
    // Optimistic local clear, at the same moment the fetch (the real, server-side clear) starts
    // — FLW-15 step 2.
    unreadCountRef.current ??= useNotificationCountsStore.getState().notifications;
    const unreadCount = unreadCountRef.current;
    clearNotifications();
    setStatus('loading');
    setErrorMessage(null);
    fetchRecentNotifications().then(
      (notifications) => {
        if (newIdsRef.current === null) {
          newIdsRef.current = new Set(
            notifications.slice(0, unreadCount).map((n) => n.notification_id_str),
          );
        }
        latestIdRef.current = notifications[0]?.notification_id_str ?? null;
        setItems(notifications);
        setStatus(notifications.length === 0 ? 'empty' : 'loaded');
      },
      (err: unknown) => {
        const outcome = mapApiError(err);
        setErrorMessage(describeError(outcome, 'Could not load notifications.'));
        setStatus('error');
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId]);

  useEffect(() => {
    load();
  }, [load]);

  function handleRefresh(event: CustomEvent<RefresherEventDetail>): void {
    fetchRecentNotifications(latestIdRef.current ?? undefined).then(
      (fresh) => {
        if (fresh.length > 0) {
          latestIdRef.current = fresh[0].notification_id_str;
          setItems((prev) => [...fresh, ...prev]);
          setStatus('loaded');
        }
        event.detail.complete();
      },
      () => event.detail.complete(),
    );
  }

  function handleTap(notification: BlipNotification): void {
    const target = resolveNotificationTarget(notification);
    if (target.kind === 'entry') {
      navigate.push(`/entry/${encodeURIComponent(target.entryId)}`);
    } else if (target.kind === 'profile') {
      navigate.push(`/user/${encodeURIComponent(target.username)}`);
    } else if (target.kind === 'follow-request') {
      navigate.push('/me/requests');
    } else {
      void openUrl(target.url);
    }
  }

  const visibleItems = items.filter((n) => !isNotificationFromHiddenMember(n, hiddenUsernames));

  return (
    <IonPage>
      <IonHeader>
        <AppHeader title="Notifications" variant="menu" />
      </IonHeader>
      <IonContent>
        {status === 'loading' && (
          <div className="ion-padding" style={{ display: 'flex', justifyContent: 'center' }}>
            <IonSpinner />
          </div>
        )}
        {status === 'error' && (
          <div className="ion-padding">
            <IonText color="danger">
              <p>{errorMessage}</p>
            </IonText>
            <IonButton onClick={load}>Retry</IonButton>
          </div>
        )}
        {status === 'empty' && (
          <EmptyState icon={<Bell size={40} strokeWidth={1.5} />} title="No notifications yet." />
        )}
        {(status === 'loaded' || status === 'empty') && (
          <>
            <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
              <IonRefresherContent />
            </IonRefresher>
            {visibleItems.map((notification) => (
              <InboxRow
                key={notification.notification_id_str}
                align="top"
                unread={newIdsRef.current?.has(notification.notification_id_str) ?? false}
                leading={
                  <button
                    onClick={() => handleTap(notification)}
                    aria-label="Open"
                    className="inbox-row-leading"
                  >
                    <RowThumb src={notification.image_url} />
                  </button>
                }
              >
                <NotificationBody
                  notification={notification}
                  onOpenProfile={(username) =>
                    navigate.push(`/user/${encodeURIComponent(username)}`)
                  }
                />
              </InboxRow>
            ))}
          </>
        )}
      </IonContent>
    </IonPage>
  );
}

/** Bold green member name (the same control as the Comments rows) when the actor can be read off
 * the payload reliably, then the rest of the BBCode; otherwise the content as sent. */
function NotificationBody({
  notification,
  onOpenProfile,
}: {
  notification: BlipNotification;
  onOpenProfile: (username: string) => void;
}) {
  const actor = leadingActor(notification);
  if (!actor) {
    return <BBCodeText source={notification.content} onLinkClick={(href) => void openUrl(href)} />;
  }
  return (
    <div>
      <button onClick={() => onOpenProfile(actor.username)} className="inbox-row-name">
        {actor.username}
      </button>
      <BBCodeText source={actor.rest} onLinkClick={(href) => void openUrl(href)} />
    </div>
  );
}
