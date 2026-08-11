// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-06 — Entry Detail (FLW-05/06/07/08/10/11). Composes b-view's EntryDetail (now that its
// description/comment rendering goes through BBCodeText rather than dangerouslySetInnerHTML,
// closing the §14 conflict that used to rule it out here) with this screen's own reactions/
// commentComposer/entryActions/renderCommentActions slots and a few small b-view callback props
// (onLinkClick, onFullscreen, onTagClick) added alongside those slots for the same reason: EntryDetail
// itself has no host-platform opinions, so anything that needs one is host-injected. b-view's own
// fullscreen button opens an internal Lightbox overlay by default; onFullscreen redirects it to
// SCR-07 instead, which stays a real, separately-routed screen (deep-link resilient, back-
// navigable) — see SCR-06-entry-detail.md/SCR-07-full-screen-photo.md for the corrected trigger
// description ("dedicated fullscreen button", not a photo tap).
//
// Follow/Unfollow doesn't fit any of EntryDetail's slots (a backup viewer has no "follow a member"
// concept) — rendered as this screen's own strip beneath EntryDetail instead, same gating as
// before. Star/Favourite share EntryDetail's one `reactions` slot, which can't independently hide
// just one of the two the way the old hand-built action row could — offered only when both
// actions.star and actions.favorite agree (both permitted or the viewer is anonymous, matching
// the old per-button "!activeAccount || actions?.x !== 0" rule combined across both flags); the
// two are not known to diverge in practice, and splitting the slot for a case that may never occur
// wasn't worth a further b-view change here. Known, accepted, not-fixed: EntryDetail's own inline
// location pin is a plain `<a target="_blank">`, not routed through Capacitor's Browser plugin —
// on native this tap likely no-ops rather than opening Maps, but the overflow menu's own "Map"
// item (this app's real, working, internal SCR-04 map) is unaffected and remains the primary path.
//
// Star/Favourite/Comment carry the account-confirm gate (rules.md, "confirm the account before
// Star, Favourite, or a comment/reply"); Follow/Report/Hide don't — the setting's scope is
// deliberately narrow. All four write actions hide entirely (not just disable) for a signed-in,
// read-only account; an anonymous tap routes through FLW-01 first, then resumes.
//
// FLW-13 (Phase 7): Edit details / Replace photo / Delete, owner-only AND only read-write (a
// read-only owner never sees these — ownership doesn't imply write access, per rules.md). Edit/
// Replace-photo push to SCR-13 (which itself sits behind WriteGuardRoute as a second, redundant-
// by-design gate — the same "never trust one call site" posture WriteGuardRoute exists for at
// all); Delete never routes through SCR-13 at all (FLW-13's own diagram: confirm+delete happens
// directly from this overflow menu), so it's implemented right here.
// 104 (protected)/202 (unavailable) get their own copy-deck messages via data/entries.ts's
// fetchEntry — this screen's own entryState.message just renders whatever it threw, same as any
// other error.

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  IonPage,
  IonHeader,
  IonContent,
  IonSpinner,
  IonText,
  IonButton,
  IonAlert,
  IonActionSheet,
} from '@ionic/react';
import { AppHeader } from '../../components/AppHeader.js';
import { EntryDetail } from '@b-oss/b-view';
import type { BlipComment, EntryState } from '@b-oss/b-view';
import { useLiveEntry } from '../../data/useLiveEntry.js';
import { openUrl } from '../../platform/browser.js';
import { resolveImage } from '../../platform/imageCache.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { useOverlay } from '../../app/OverlayProvider.js';
import { useAccountsStore, useActiveAccount, useCanWrite } from '../../state/accountsStore.js';
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
import { deleteEntry } from '../../data/entries.js';
import {
  useHiddenMembers,
  useHiddenMembersStore,
  useIsHidden,
} from '../../state/hiddenMembersStore.js';
import { describeError, mapApiError } from '../../data/errors.js';
import type { BlipComment as ApiComment } from '@b-oss/b-api';

interface EntryDetailScreenProps {
  entryId: string;
}

/** Drops a comment (and its whole reply subtree) from what EntryDetail renders once its author
 * is hidden — full suppression, not a placeholder, per rules.md (a different treatment from
 * grids' hidden-tile placeholder, matching the old per-node CommentThread behaviour this
 * replaces). */
function filterHiddenComments(comments: BlipComment[], hidden: string[]): BlipComment[] {
  return comments
    .filter((c) => !hidden.includes(c.commenter_username))
    .map((c) => ({ ...c, replies: filterHiddenComments(c.replies, hidden) }));
}

/** EntryDetail's own comments are b-view-shaped (BlipComment, no per-comment action flags — see
 * data/entries.ts's LoadedEntry doc comment). renderCommentActions only ever sees those, so this
 * flattens the raw ApiComment list (which does carry `.actions`) into a lookup by id. */
function flattenComments(comments: ApiComment[], map: Map<string, ApiComment>): void {
  for (const c of comments) {
    map.set(c.comment_id_str, c);
    if (c.replies) flattenComments(c.replies, map);
  }
}

export function EntryDetailScreen({ entryId }: EntryDetailScreenProps) {
  const navigate = useAppNavigate();
  const { showUpgradePrompt } = useOverlay();
  const activeAccount = useActiveAccount();
  const canWrite = useCanWrite();
  const hiddenMembers = useHiddenMembers();
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmUnfollow, setConfirmUnfollow] = useState(false);
  const [confirmHide, setConfirmHide] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiComment | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState(false);

  const authorUsername = entryState.status === 'loaded' ? entryState.data.username : null;
  const isOwnEntry = authorUsername !== null && authorUsername === activeAccount?.username;
  const authorHidden = useIsHidden(authorUsername);

  const commentActionsMap = useMemo(() => {
    const map = new Map<string, ApiComment>();
    flattenComments(comments, map);
    return map;
  }, [comments]);

  // EntryDetail renders stars_total/favorites_total straight from entryState.data itself — it
  // has no separate hook for an optimistic count the way the reactions slot does for the starred/
  // favorited booleans, so the optimistic bump/rollback in `reaction` has to be projected into the
  // entry data here too, or the star/heart icons would flip state while their counts stayed stuck
  // at the last fetch until the next reload().
  const displayEntryState: EntryState = useMemo(() => {
    if (entryState.status !== 'loaded') return entryState;
    return {
      ...entryState,
      data: {
        ...entryState.data,
        stars_total: reaction?.starsTotal ?? entryState.data.stars_total,
        favorites_total: reaction?.favoritesTotal ?? entryState.data.favorites_total,
        comments: filterHiddenComments(entryState.data.comments, hiddenMembers),
      },
    };
  }, [entryState, hiddenMembers, reaction]);

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
      showUpgradePrompt();
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
      setErrorMessage(describeError(outcome, 'Could not star this entry.'));
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
        setErrorMessage(describeError(outcome, 'Could not favourite this entry.'));
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
      setErrorMessage(describeError(outcome, 'Could not follow this member.'));
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
      setErrorMessage(describeError(outcome, 'Could not unfollow this member.'));
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
      setErrorMessage(describeError(outcome, 'Could not delete this comment.'));
    }
  }

  function handleConfirmedHide(): void {
    setConfirmHide(false);
    const account = useAccountsStore.getState();
    if (!authorUsername || !account.activeAccountId) return;
    useHiddenMembersStore.getState().hide(account.activeAccountId, authorUsername);
  }

  async function handleConfirmedDeleteEntry(): Promise<void> {
    setConfirmDeleteEntry(false);
    setDeletingEntry(true);
    try {
      await deleteEntry(entryId);
      navigate.replace('/browse');
    } catch (err) {
      const outcome = mapApiError(err);
      setErrorMessage(describeError(outcome, 'Could not delete this entry.'));
      setDeletingEntry(false);
    }
  }

  function handleUnhideAuthor(): void {
    const account = useAccountsStore.getState();
    if (!authorUsername || !account.activeAccountId) return;
    useHiddenMembersStore.getState().unhide(account.activeAccountId, authorUsername);
  }

  function renderCommentActions(comment: BlipComment): ReactNode {
    const apiComment = commentActionsMap.get(comment.comment_id);
    if (!apiComment) return null;
    return (
      <>
        {apiComment.actions.reply === 1 && (
          <IonButton size="small" fill="clear" onClick={() => void handleReply(apiComment)}>
            Reply
          </IonButton>
        )}
        {apiComment.actions.edit === 1 && (
          <IonButton size="small" fill="clear" onClick={() => handleEdit(apiComment)}>
            Edit
          </IonButton>
        )}
        {apiComment.actions.delete === 1 && (
          <IonButton
            size="small"
            fill="clear"
            color="danger"
            onClick={() => setDeleteTarget(apiComment)}
          >
            Delete
          </IonButton>
        )}
        <IonButton size="small" fill="clear" onClick={() => handleReportComment(apiComment)}>
          Report
        </IonButton>
      </>
    );
  }

  const showReactions =
    !hideForReadOnly && (!activeAccount || (actions?.star !== 0 && actions?.favorite !== 0));
  const showComment = !hideForReadOnly && (!activeAccount || actions?.comment !== 0);
  const friendshipState = reaction?.friendshipState ?? null;

  return (
    <IonPage>
      <IonHeader>
        <AppHeader title="Entry" variant="back" backHref="/browse" />
      </IonHeader>
      <IonContent>
        {entryState.status === 'loading' && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <IonSpinner />
          </div>
        )}

        {entryState.status === 'error' && (
          <div className="ion-padding">
            <IonText color="danger">
              <p>{entryState.message}</p>
            </IonText>
            <IonButton onClick={reload}>Retry</IonButton>
          </div>
        )}

        {entryState.status === 'loaded' && authorHidden && (
          <div className="ion-padding">
            <p>You&rsquo;ve hidden this member.</p>
            <IonButton onClick={handleUnhideAuthor}>Unhide</IonButton>
          </div>
        )}

        {entryState.status === 'loaded' && !authorHidden && (
          <>
            <EntryDetail
              entryState={displayEntryState}
              prevEntryId={prevEntryId}
              nextEntryId={nextEntryId}
              onNavigate={(id) => navigate.replace(`/entry/${id}`)}
              resolveAsset={resolveImage}
              onLinkClick={(href) => void openUrl(href)}
              onFullscreen={() => navigate.push(`/entry/${entryId}/photo`)}
              onTagClick={(tag) => navigate.push(`/tag/${encodeURIComponent(tag)}`)}
              reactions={
                showReactions
                  ? {
                      starred: reaction?.starred ?? starred,
                      favorited: reaction?.favorited ?? favorited,
                      onToggleStar: () => void handleStar(),
                      onToggleFavorite: () => void handleFavorite(),
                    }
                  : undefined
              }
              commentComposer={
                showComment ? (
                  <IonButton fill="outline" onClick={() => void handleComment()}>
                    Add a comment
                  </IonButton>
                ) : undefined
              }
              entryActions={
                <IonButton disabled={deletingEntry} onClick={() => setOverflowOpen(true)}>
                  More
                </IonButton>
              }
              renderCommentActions={renderCommentActions}
            />

            {!hideForReadOnly && !isOwnEntry && authorUsername && (
              <div className="ion-padding" style={{ paddingTop: 0 }}>
                {friendshipState === 1 && (
                  <IonButton size="small" fill="outline" onClick={() => setConfirmUnfollow(true)}>
                    Unfollow
                  </IonButton>
                )}
                {friendshipState === 2 && (
                  <IonButton size="small" fill="outline" disabled>
                    Request sent
                  </IonButton>
                )}
                {(friendshipState === 0 || friendshipState == null) && (
                  <IonButton size="small" fill="outline" onClick={() => void handleFollow()}>
                    Follow
                  </IonButton>
                )}
              </div>
            )}
          </>
        )}
      </IonContent>

      {accountConfirmDialog}

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

      <IonAlert
        isOpen={confirmDeleteEntry}
        header="Delete this entry?"
        message="This can't be undone."
        onDidDismiss={() => setConfirmDeleteEntry(false)}
        buttons={[
          { text: 'Cancel', role: 'cancel' },
          { text: 'Delete', role: 'destructive', handler: () => void handleConfirmedDeleteEntry() },
        ]}
      />

      <IonActionSheet
        isOpen={overflowOpen}
        onDidDismiss={() => setOverflowOpen(false)}
        buttons={[
          ...(isOwnEntry && canWrite
            ? [
                {
                  text: 'Edit details',
                  handler: () => navigate.push(`/entry/${entryId}/edit`, { mode: 'details' }),
                },
                {
                  text: 'Replace photo',
                  handler: () => navigate.push(`/entry/${entryId}/edit`, { mode: 'photo' }),
                },
                {
                  text: 'Delete entry',
                  role: 'destructive',
                  handler: () => setConfirmDeleteEntry(true),
                },
              ]
            : []),
          ...(entryState.status === 'loaded' && entryState.data.exif
            ? [{ text: 'Camera info', handler: () => navigate.push(`/entry/${entryId}/metadata`) }]
            : []),
          ...(entryState.status === 'loaded' && entryState.data.location
            ? [{ text: 'Map', handler: () => navigate.push(`/map?entry=${entryId}`) }]
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

interface ReactionOverlay {
  starred: boolean;
  favorited: boolean;
  starsTotal: number;
  favoritesTotal: number;
  friendshipState: 0 | 1 | 2 | 3 | null;
}
