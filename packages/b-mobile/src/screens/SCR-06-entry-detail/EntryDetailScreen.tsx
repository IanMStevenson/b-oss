// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-06 — Entry Detail (FLW-05/06/07/08/10/11). Deliberately NOT b-view's EntryDetail: that
// component renders `description_html`/`content_html` via dangerouslySetInnerHTML, which
// app-architecture.md §14 explicitly rules out app-wide ("no dangerouslySetInnerHTML anywhere in
// the app... the security-relevant property, not a stylistic one" — content here is written by
// other members). Built from scratch instead, rendering the raw BBCode (`description`/`content`,
// not the `_html` variants) through BBCodeText. b-view's Lightbox is still reused for SCR-07 — it
// renders only <img>, no HTML content, so the same conflict doesn't apply there.
//
// Star/Favourite/Comment carry the account-confirm gate (rules.md, "confirm the account before
// Star, Favourite, or a comment/reply"); Follow/Report/Hide don't — the setting's scope is
// deliberately narrow. All four write actions hide entirely (not just disable) for a signed-in,
// read-only account; an anonymous tap routes through FLW-01 first, then resumes.
//
// TODO(Phase 5+/7): owner-only edit/delete of the entry itself, and share. TODO(TODO F/G): 104
// (protected)/202 (unavailable) get their own copy-deck messages once that work lands — for now
// the server's own error message shows as-is.

import { useEffect, useState } from 'react';
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
  IonChip,
  IonAlert,
  IonActionSheet,
} from '@ionic/react';
import { useLiveEntry } from '../../data/useLiveEntry.js';
import { CachedImage } from '../../components/CachedImage.js';
import { BBCodeText } from '../../components/BBCodeText.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { useAccountsStore, useActiveAccount } from '../../state/accountsStore.js';
import { signInGated } from '../../flows/accountsFlow.js';
import { useAccountConfirmGate } from '../../flows/useAccountConfirmGate.js';
import {
  starEntry,
  favoriteEntry,
  followUser,
  unfollowUser,
  FavoriteQuotaError,
} from '../../flows/reactionsFlow.js';
import { deleteComment } from '../../flows/commentsFlow.js';
import { useHiddenMembersStore, useIsHidden } from '../../state/hiddenMembersStore.js';
import { mapApiError } from '../../data/errors.js';
import type { BlipComment as ApiComment } from '@b-oss/b-api';

interface EntryDetailScreenProps {
  entryId: string;
}

function CommentThread({
  comment,
  depth = 0,
  onReply,
  onEdit,
  onDelete,
  onReport,
}: {
  comment: ApiComment;
  depth?: number;
  onReply: (comment: ApiComment) => void;
  onEdit: (comment: ApiComment) => void;
  onDelete: (comment: ApiComment) => void;
  onReport: (comment: ApiComment) => void;
}) {
  const isHidden = useIsHidden(comment.commenter.username);
  if (isHidden) return null;

  return (
    <div style={{ marginLeft: depth * 16, marginTop: 8 }}>
      <strong>{comment.commenter.username}</strong>
      <BBCodeText source={comment.content} />
      <div style={{ display: 'flex', gap: 8 }}>
        {comment.actions.reply === 1 && (
          <IonButton size="small" fill="clear" onClick={() => onReply(comment)}>
            Reply
          </IonButton>
        )}
        {comment.actions.edit === 1 && (
          <IonButton size="small" fill="clear" onClick={() => onEdit(comment)}>
            Edit
          </IonButton>
        )}
        {comment.actions.delete === 1 && (
          <IonButton size="small" fill="clear" color="danger" onClick={() => onDelete(comment)}>
            Delete
          </IonButton>
        )}
        <IonButton size="small" fill="clear" onClick={() => onReport(comment)}>
          Report
        </IonButton>
      </div>
      {(comment.replies ?? []).map((reply) => (
        <CommentThread
          key={reply.comment_id_str}
          comment={reply}
          depth={depth + 1}
          onReply={onReply}
          onEdit={onEdit}
          onDelete={onDelete}
          onReport={onReport}
        />
      ))}
    </div>
  );
}

interface ReactionOverlay {
  starred: boolean;
  favorited: boolean;
  starsTotal: number;
  favoritesTotal: number;
  friendshipState: 0 | 1 | 2 | 3 | null;
}

export function EntryDetailScreen({ entryId }: EntryDetailScreenProps) {
  const navigate = useAppNavigate();
  const activeAccount = useActiveAccount();
  const { confirmAccount, dialog: accountConfirmDialog } = useAccountConfirmGate();
  const {
    entryState,
    prevEntryId,
    nextEntryId,
    actions,
    starred,
    favorited,
    friendship,
    comments,
    reload,
  } = useLiveEntry(entryId);

  const [reaction, setReaction] = useState<ReactionOverlay | null>(null);
  const [upgradePromptOpen, setUpgradePromptOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmUnfollow, setConfirmUnfollow] = useState(false);
  const [confirmHide, setConfirmHide] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiComment | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);

  const authorUsername = entryState.status === 'loaded' ? entryState.data.username : null;
  const isOwnEntry = authorUsername !== null && authorUsername === activeAccount?.username;
  const authorHidden = useIsHidden(authorUsername);

  // `entryState` itself is a fresh wrapper object on every call to useLiveEntry (every render),
  // even when nothing about the underlying resource changed — depending on it directly would
  // reseed (and clobber) the optimistic reaction state on every render, including the render the
  // optimistic update itself causes. `entryState.data` (the LoadedEntry's `.entry`) is a property
  // of useResource's actual React state, so it *is* referentially stable across renders where the
  // resource hasn't reloaded — that's what this effect keys off instead.
  const loadedEntry = entryState.status === 'loaded' ? entryState.data : null;
  useEffect(() => {
    if (loadedEntry) {
      setReaction({
        starred,
        favorited,
        starsTotal: loadedEntry.stars_total,
        favoritesTotal: loadedEntry.favorites_total,
        friendshipState: friendship?.state ?? null,
      });
    }
  }, [loadedEntry, starred, favorited, friendship]);

  const hideForReadOnly = activeAccount !== null && activeAccount.appTokenScope !== 'read,write';

  /** Shared FLW-06/07 gate: anonymous signs in first; with the confirm-account setting on and
   * 2+ accounts, the account picker runs before the read-write check; a read-only result (of
   * whichever account ends up active) shows the upgrade prompt instead of proceeding. */
  async function gateReaction(confirmStep: boolean): Promise<boolean> {
    if (!useAccountsStore.getState().activeAccountId) {
      try {
        await signInGated();
      } catch {
        return false;
      }
    }
    if (confirmStep) {
      const proceed = await confirmAccount();
      if (!proceed) return false;
    }
    const fresh = useAccountsStore.getState();
    const active = fresh.accounts.find((a) => a.id === fresh.activeAccountId);
    if (active?.appTokenScope !== 'read,write') {
      setUpgradePromptOpen(true);
      return false;
    }
    return true;
  }

  // The seeding effect above (which sets `reaction` from the freshly-loaded entry) runs after
  // render, not during it — a handler firing before that first effect has committed would see
  // `reaction` still null. Falling back to this render's own starred/favorited/friendship/
  // loadedEntry (exactly what the effect would have seeded it to) keeps every updater below
  // correct regardless of that timing, rather than the update silently no-op'ing against a null
  // `prev`.
  function baseReaction(): ReactionOverlay {
    return (
      reaction ?? {
        starred,
        favorited,
        starsTotal: loadedEntry?.stars_total ?? 0,
        favoritesTotal: loadedEntry?.favorites_total ?? 0,
        friendshipState: friendship?.state ?? null,
      }
    );
  }

  async function handleStar(): Promise<void> {
    if (!(await gateReaction(true))) return;
    setReaction((prev) => {
      const base = prev ?? baseReaction();
      return { ...base, starred: true, starsTotal: base.starsTotal + 1 };
    });
    try {
      await starEntry(entryId);
    } catch (err) {
      setReaction((prev) => {
        const base = prev ?? baseReaction();
        return { ...base, starred: false, starsTotal: base.starsTotal - 1 };
      });
      const outcome = mapApiError(err);
      setErrorMessage(outcome.kind === 'message' ? outcome.message : 'Could not star this entry.');
    }
  }

  async function handleFavorite(): Promise<void> {
    if (!(await gateReaction(true))) return;
    setReaction((prev) => {
      const base = prev ?? baseReaction();
      return { ...base, favorited: true, favoritesTotal: base.favoritesTotal + 1 };
    });
    try {
      await favoriteEntry(entryId);
    } catch (err) {
      setReaction((prev) => {
        const base = prev ?? baseReaction();
        return { ...base, favorited: false, favoritesTotal: base.favoritesTotal - 1 };
      });
      if (err instanceof FavoriteQuotaError) {
        setErrorMessage(err.message);
      } else {
        const outcome = mapApiError(err);
        setErrorMessage(
          outcome.kind === 'message' ? outcome.message : 'Could not favourite this entry.',
        );
      }
    }
  }

  async function handleFollow(): Promise<void> {
    if (!authorUsername) return;
    if (!(await gateReaction(false))) return;
    const prevState = baseReaction().friendshipState ?? 0;
    setReaction((prev) => ({ ...(prev ?? baseReaction()), friendshipState: 1 }));
    try {
      const result = await followUser(authorUsername);
      setReaction((prev) => ({ ...(prev ?? baseReaction()), friendshipState: result.state }));
    } catch (err) {
      setReaction((prev) => ({ ...(prev ?? baseReaction()), friendshipState: prevState }));
      const outcome = mapApiError(err);
      setErrorMessage(
        outcome.kind === 'message' ? outcome.message : 'Could not follow this member.',
      );
    }
  }

  async function handleUnfollow(): Promise<void> {
    if (!authorUsername) return;
    if (!(await gateReaction(false))) return;
    setReaction((prev) => ({ ...(prev ?? baseReaction()), friendshipState: 0 }));
    try {
      await unfollowUser(authorUsername);
    } catch (err) {
      setReaction((prev) => ({ ...(prev ?? baseReaction()), friendshipState: 1 }));
      const outcome = mapApiError(err);
      setErrorMessage(
        outcome.kind === 'message' ? outcome.message : 'Could not unfollow this member.',
      );
    }
  }

  async function handleComment(): Promise<void> {
    if (!(await gateReaction(true))) return;
    navigate.push(`/entry/${entryId}/comment`);
  }

  async function handleReply(comment: ApiComment): Promise<void> {
    if (!(await gateReaction(true))) return;
    navigate.push(`/entry/${entryId}/comment`, { replyToCommentId: comment.comment_id_str });
  }

  function handleEdit(comment: ApiComment): void {
    navigate.push(`/entry/${entryId}/comment`, {
      editCommentId: comment.comment_id_str,
      editInitialContent: comment.content,
    });
  }

  function handleReportComment(comment: ApiComment): void {
    navigate.push(`/entry/${entryId}/report`, {
      targetUsername: comment.commenter.username,
      reportedComment: {
        username: comment.commenter.username,
        excerpt: comment.content.slice(0, 80),
      },
    });
  }

  async function handleConfirmedDelete(): Promise<void> {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteComment(target.comment_id_str);
      reload();
    } catch (err) {
      const outcome = mapApiError(err);
      setErrorMessage(
        outcome.kind === 'message' ? outcome.message : 'Could not delete this comment.',
      );
    }
  }

  function handleConfirmedHide(): void {
    setConfirmHide(false);
    const account = useAccountsStore.getState();
    if (!authorUsername || !account.activeAccountId) return;
    useHiddenMembersStore.getState().hide(account.activeAccountId, authorUsername);
  }

  function handleUnhideAuthor(): void {
    const account = useAccountsStore.getState();
    if (!authorUsername || !account.activeAccountId) return;
    useHiddenMembersStore.getState().unhide(account.activeAccountId, authorUsername);
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/browse" />
          </IonButtons>
          <IonTitle>Entry</IonTitle>
          <IonButtons slot="end">
            {entryState.status === 'loaded' && (
              <IonButton onClick={() => setOverflowOpen(true)}>More</IonButton>
            )}
            <IonButton
              disabled={!prevEntryId}
              onClick={() => prevEntryId && navigate.replace(`/entry/${prevEntryId}`)}
            >
              ←
            </IonButton>
            <IonButton
              disabled={!nextEntryId}
              onClick={() => nextEntryId && navigate.replace(`/entry/${nextEntryId}`)}
            >
              →
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        {entryState.status === 'loading' && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <IonSpinner />
          </div>
        )}

        {entryState.status === 'error' && (
          <div>
            <IonText color="danger">
              <p>{entryState.message}</p>
            </IonText>
            <IonButton onClick={reload}>Retry</IonButton>
          </div>
        )}

        {entryState.status === 'loaded' && authorHidden && (
          <div>
            <p>You&rsquo;ve hidden this member.</p>
            <IonButton onClick={handleUnhideAuthor}>Unhide</IonButton>
          </div>
        )}

        {entryState.status === 'loaded' && !authorHidden && (
          <>
            {entryState.data.images.image && (
              <button
                onClick={() => navigate.push(`/entry/${entryId}/photo`)}
                style={{ padding: 0, border: 'none', background: 'none', width: '100%' }}
              >
                <CachedImage
                  src={entryState.data.images.image}
                  alt={entryState.data.title}
                  loading="eager"
                />
              </button>
            )}

            <h1>{entryState.data.title || entryState.data.date}</h1>
            <p style={{ color: 'var(--muted)' }}>
              {entryState.data.views_total.toLocaleString()} views ·{' '}
              {reaction?.starsTotal ?? entryState.data.stars_total} stars ·{' '}
              {reaction?.favoritesTotal ?? entryState.data.favorites_total} favourites
            </p>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {!hideForReadOnly && (!activeAccount || actions?.star !== 0) && (
                <IonButton
                  size="small"
                  fill={reaction?.starred ? 'solid' : 'outline'}
                  disabled={reaction?.starred}
                  onClick={() => void handleStar()}
                >
                  {reaction?.starred ? 'Starred' : 'Star'}
                </IonButton>
              )}
              {!hideForReadOnly && (!activeAccount || actions?.favorite !== 0) && (
                <IonButton
                  size="small"
                  fill={reaction?.favorited ? 'solid' : 'outline'}
                  disabled={reaction?.favorited}
                  onClick={() => void handleFavorite()}
                >
                  {reaction?.favorited ? 'Favourited' : 'Favourite'}
                </IonButton>
              )}
              {!hideForReadOnly && (!activeAccount || actions?.comment !== 0) && (
                <IonButton size="small" fill="outline" onClick={() => void handleComment()}>
                  Comment
                </IonButton>
              )}
              {!hideForReadOnly && !isOwnEntry && authorUsername && (
                <>
                  {reaction?.friendshipState === 1 && (
                    <IonButton size="small" fill="outline" onClick={() => setConfirmUnfollow(true)}>
                      Following
                    </IonButton>
                  )}
                  {reaction?.friendshipState === 2 && (
                    <IonButton size="small" fill="outline" disabled>
                      Request sent
                    </IonButton>
                  )}
                  {(reaction?.friendshipState === 0 || reaction?.friendshipState == null) && (
                    <IonButton size="small" fill="outline" onClick={() => void handleFollow()}>
                      Follow
                    </IonButton>
                  )}
                </>
              )}
            </div>

            <BBCodeText source={entryState.data.description} />

            {entryState.data.tags.length > 0 && (
              <div>
                {entryState.data.tags.map((tag) => (
                  <IonChip
                    key={tag}
                    onClick={() => navigate.push(`/tag/${encodeURIComponent(tag)}`)}
                  >
                    #{tag}
                  </IonChip>
                ))}
              </div>
            )}

            <h3>Comments ({comments.length})</h3>
            {comments.map((comment) => (
              <CommentThread
                key={comment.comment_id_str}
                comment={comment}
                onReply={(c) => void handleReply(c)}
                onEdit={handleEdit}
                onDelete={setDeleteTarget}
                onReport={handleReportComment}
              />
            ))}
          </>
        )}
      </IonContent>

      {accountConfirmDialog}

      <IonAlert
        isOpen={upgradePromptOpen}
        header="Read-only account"
        message="This account is signed in read-only. Sign in for write access to continue."
        onDidDismiss={() => setUpgradePromptOpen(false)}
        buttons={[
          { text: 'Cancel', role: 'cancel' },
          { text: 'Manage accounts', handler: () => navigate.push('/accounts') },
        ]}
      />

      <IonAlert
        isOpen={!!errorMessage}
        header="Something went wrong"
        message={errorMessage ?? ''}
        onDidDismiss={() => setErrorMessage(null)}
        buttons={['OK']}
      />

      <IonAlert
        isOpen={confirmUnfollow}
        header="Unfollow?"
        onDidDismiss={() => setConfirmUnfollow(false)}
        buttons={[
          { text: 'Cancel', role: 'cancel' },
          { text: 'Unfollow', role: 'destructive', handler: () => void handleUnfollow() },
        ]}
      />

      <IonAlert
        isOpen={confirmHide}
        header={`Hide ${authorUsername ?? ''}?`}
        message="You won't see their entries, comments or notifications. This doesn't stop them seeing your journal or commenting on your entries."
        onDidDismiss={() => setConfirmHide(false)}
        buttons={[
          { text: 'Cancel', role: 'cancel' },
          { text: 'Hide', role: 'destructive', handler: handleConfirmedHide },
        ]}
      />

      <IonAlert
        isOpen={!!deleteTarget}
        header="Delete comment?"
        onDidDismiss={() => setDeleteTarget(null)}
        buttons={[
          { text: 'Cancel', role: 'cancel' },
          { text: 'Delete', role: 'destructive', handler: () => void handleConfirmedDelete() },
        ]}
      />

      <IonActionSheet
        isOpen={overflowOpen}
        onDidDismiss={() => setOverflowOpen(false)}
        buttons={[
          ...(entryState.status === 'loaded' && entryState.data.exif
            ? [{ text: 'Camera info', handler: () => navigate.push(`/entry/${entryId}/metadata`) }]
            : []),
          {
            text: 'Report',
            handler: () =>
              navigate.push(`/entry/${entryId}/report`, {
                targetUsername: authorUsername ?? undefined,
              }),
          },
          ...(!isOwnEntry && authorUsername
            ? [
                {
                  text: `Hide ${authorUsername}`,
                  role: 'destructive',
                  handler: () => setConfirmHide(true),
                },
              ]
            : []),
          { text: 'Cancel', role: 'cancel' },
        ]}
      />
    </IonPage>
  );
}
