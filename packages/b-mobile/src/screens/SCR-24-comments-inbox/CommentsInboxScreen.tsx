// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-24 — Comments Inbox (FLW-15/16). Account-gated via AccountGuardRoute (AppRoutes.tsx), same
// reasoning as SCR-23 (reachable from a tapped push while signed out, FLW-16 step 3).
//
// Fetching *is* what marks every one of the account's unread comments read — not just the page
// returned (endpoints.md). `newIdsRef` captures which ids were unread from the **first** response
// only (`data/notifications.ts#unreadCommentIds`, app-architecture.md §11's "first-page-unread-
// snapshot" trap) — a `useRef` seeded once, deliberately not derived reactively from `items` on
// every render, since any later response (pull-to-refresh) will show every row as already read.
//
// Hidden-member suppression here is exact, unlike SCR-23's best-effort heuristic — a comment
// states who wrote it structurally (`commenter.username`), no text-parsing needed.
//
// Reply/Report route through the same SCR-15/SCR-16 route-state shape SCR-06's comment thread
// already uses (AppRoutes.tsx's `CommentRouteState`/`ReportRouteState`) — same screens, same
// contract, a second caller.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonSpinner,
  IonText,
  IonButton,
  IonItem,
  IonAlert,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/core';
import { fetchRecentComments, unreadCommentIds } from '../../data/notifications.js';
import { deleteComment } from '../../flows/commentsFlow.js';
import { mapApiError } from '../../data/errors.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { useAccountsStore } from '../../state/accountsStore.js';
import { useHiddenMembers, useHiddenMembersStore } from '../../state/hiddenMembersStore.js';
import { useNotificationCountsStore } from '../../state/notificationCountsStore.js';
import { CachedImage } from '../../components/CachedImage.js';
import type { BlipComment } from '@b-oss/b-api';

type Status = 'loading' | 'loaded' | 'empty' | 'error';

export function CommentsInboxScreen() {
  const navigate = useAppNavigate();
  const hiddenUsernames = useHiddenMembers();
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const clearComments = useNotificationCountsStore((s) => s.clearComments);

  const [status, setStatus] = useState<Status>('loading');
  const [items, setItems] = useState<BlipComment[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BlipComment | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const latestIdRef = useRef<string | null>(null);
  // Seeded once, from the first successful response only — see the file header comment.
  const newIdsRef = useRef<Set<string> | null>(null);

  const load = useCallback(() => {
    clearComments();
    setStatus('loading');
    setErrorMessage(null);
    fetchRecentComments().then(
      (comments) => {
        if (newIdsRef.current === null) {
          newIdsRef.current = unreadCommentIds(comments);
        }
        latestIdRef.current = comments[0]?.comment_id_str ?? null;
        setItems(comments);
        setStatus(comments.length === 0 ? 'empty' : 'loaded');
      },
      (err: unknown) => {
        const outcome = mapApiError(err);
        setErrorMessage(outcome.kind === 'message' ? outcome.message : 'Could not load comments.');
        setStatus('error');
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleRefresh(event: CustomEvent<RefresherEventDetail>): void {
    fetchRecentComments(latestIdRef.current ?? undefined).then(
      (fresh) => {
        if (fresh.length > 0) {
          latestIdRef.current = fresh[0].comment_id_str;
          setItems((prev) => [...fresh, ...prev]);
          setStatus('loaded');
        }
        event.detail.complete();
      },
      () => event.detail.complete(),
    );
  }

  function handleHide(username: string): void {
    if (!activeAccountId) return;
    useHiddenMembersStore.getState().hide(activeAccountId, username);
  }

  async function handleConfirmedDelete(): Promise<void> {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteComment(target.comment_id_str);
      setItems((prev) => prev.filter((c) => c.comment_id_str !== target.comment_id_str));
    } catch (err) {
      const outcome = mapApiError(err);
      setActionError(
        outcome.kind === 'message' ? outcome.message : 'Could not delete this comment.',
      );
    }
  }

  function handleReply(comment: BlipComment): void {
    if (!comment.entry_id_str) return;
    navigate.push(`/entry/${encodeURIComponent(comment.entry_id_str)}/comment`, {
      replyToCommentId: comment.comment_id_str,
    });
  }

  function handleReport(comment: BlipComment): void {
    if (!comment.entry_id_str) return;
    navigate.push(`/entry/${encodeURIComponent(comment.entry_id_str)}/report`, {
      targetUsername: comment.commenter.username,
      reportedComment: {
        username: comment.commenter.username,
        excerpt: comment.content.slice(0, 80),
      },
    });
  }

  const visibleItems = items.filter((c) => !hiddenUsernames.includes(c.commenter.username));

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/browse" />
          </IonButtons>
          <IonTitle>Comments</IonTitle>
        </IonToolbar>
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
            <p>No comments yet.</p>
          </div>
        )}
        {(status === 'loaded' || status === 'empty') && (
          <>
            <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
              <IonRefresherContent />
            </IonRefresher>
            {visibleItems.map((comment) => (
              <IonItem key={comment.comment_id_str}>
                <button
                  onClick={() =>
                    comment.entry_id_str &&
                    navigate.push(`/entry/${encodeURIComponent(comment.entry_id_str)}`)
                  }
                  style={{ background: 'none', border: 'none', padding: 0, flexShrink: 0 }}
                >
                  <CachedImage
                    src={comment.thumbnail_url}
                    alt=""
                    style={{ width: 48, height: 48, marginRight: 8 }}
                  />
                </button>
                <div style={{ flex: 1, padding: '8px 0' }}>
                  <button
                    onClick={() =>
                      navigate.push(`/user/${encodeURIComponent(comment.commenter.username)}`)
                    }
                    style={{ background: 'none', border: 'none', padding: 0, font: 'inherit' }}
                  >
                    <strong>{comment.commenter.username}</strong>
                  </button>
                  {newIdsRef.current?.has(comment.comment_id_str) && (
                    <span style={{ color: 'var(--ion-color-success)' }}> New</span>
                  )}
                  <div>{comment.content}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {comment.actions.reply === 1 && (
                      <IonButton size="small" fill="clear" onClick={() => handleReply(comment)}>
                        Reply
                      </IonButton>
                    )}
                    {comment.actions.delete === 1 && (
                      <IonButton
                        size="small"
                        fill="clear"
                        color="danger"
                        onClick={() => setDeleteTarget(comment)}
                      >
                        Delete
                      </IonButton>
                    )}
                    <IonButton size="small" fill="clear" onClick={() => handleReport(comment)}>
                      Report
                    </IonButton>
                    <IonButton
                      size="small"
                      fill="clear"
                      onClick={() => handleHide(comment.commenter.username)}
                    >
                      Hide this member
                    </IonButton>
                  </div>
                </div>
              </IonItem>
            ))}
          </>
        )}
      </IonContent>

      <IonAlert
        isOpen={!!deleteTarget}
        header={`Delete ${deleteTarget?.commenter.username ?? ''}'s comment?`}
        onDidDismiss={() => setDeleteTarget(null)}
        buttons={[
          { text: 'Cancel', role: 'cancel' },
          { text: 'Delete', role: 'destructive', handler: () => void handleConfirmedDelete() },
        ]}
      />

      <IonAlert
        isOpen={!!actionError}
        header="Something went wrong"
        message={actionError ?? ''}
        onDidDismiss={() => setActionError(null)}
        buttons={['OK']}
      />
    </IonPage>
  );
}
