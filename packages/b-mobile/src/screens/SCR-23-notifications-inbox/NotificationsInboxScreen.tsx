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
// Notification text is rendered as plain text (`notification.content`, the raw — not `_html` —
// variant), never `dangerouslySetInnerHTML` (§14's app-wide ban): `content` is already
// server-composed prose, not BBCode, so there is nothing to parse or hyperlink inline — the row's
// own tap target already routes correctly via `resolveNotificationTarget` (data/notifications.ts),
// which reads the *same* underlying link data `content_html` carries.
//
// Row labels are plain <span>s, not IonLabel — RESUME.md's documented jsdom gotcha (IonLabel's
// children not reliably reachable via getByText in this test setup).

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IonPage,
  IonHeader,
  IonContent,
  IonSpinner,
  IonText,
  IonButton,
  IonItem,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/core';
import { AppHeader } from '../../components/AppHeader.js';
import { AccountIndicator } from '../../components/AccountIndicator.js';
import {
  fetchRecentNotifications,
  isNotificationFromHiddenMember,
  resolveNotificationTarget,
} from '../../data/notifications.js';
import { describeError, mapApiError } from '../../data/errors.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { useHiddenMembers } from '../../state/hiddenMembersStore.js';
import { useNotificationCountsStore } from '../../state/notificationCountsStore.js';
import { openUrl } from '../../platform/browser.js';
import { CachedImage } from '../../components/CachedImage.js';
import type { BlipNotification } from '@b-oss/b-api';

type Status = 'loading' | 'loaded' | 'empty' | 'error';

export function NotificationsInboxScreen() {
  const navigate = useAppNavigate();
  const hiddenUsernames = useHiddenMembers();
  const clearNotifications = useNotificationCountsStore((s) => s.clearNotifications);

  const [status, setStatus] = useState<Status>('loading');
  const [items, setItems] = useState<BlipNotification[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const latestIdRef = useRef<string | null>(null);

  const load = useCallback(() => {
    // Optimistic local clear, at the same moment the fetch (the real, server-side clear) starts
    // — FLW-15 step 2.
    clearNotifications();
    setStatus('loading');
    setErrorMessage(null);
    fetchRecentNotifications().then(
      (notifications) => {
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
  }, []);

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
        <AppHeader
          title="Notifications"
          variant="back"
          backHref="/browse"
          end={<AccountIndicator />}
        />
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
          <div className="ion-padding">
            <p>No notifications yet.</p>
          </div>
        )}
        {(status === 'loaded' || status === 'empty') && (
          <>
            <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
              <IonRefresherContent />
            </IonRefresher>
            {visibleItems.map((notification) => (
              <IonItem
                key={notification.notification_id_str}
                button
                onClick={() => handleTap(notification)}
              >
                {notification.image_url && (
                  <CachedImage
                    src={notification.image_url}
                    alt=""
                    style={{ width: 40, height: 40, marginRight: 8, flexShrink: 0 }}
                  />
                )}
                <span>{notification.content}</span>
              </IonItem>
            ))}
          </>
        )}
      </IonContent>
    </IonPage>
  );
}
