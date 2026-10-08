// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-06 — Entry Detail (FLW-05/06/07/08/10/11). Composes b-view's EntryDetail (now that its
// description/comment rendering goes through BBCodeText rather than dangerouslySetInnerHTML,
// closing the §14 conflict that used to rule it out here) with this screen's own reactions/
// commentComposer/entryActions/renderCommentActions slots and a few small b-view callback props
// (onLinkClick, onFullscreen, onTagClick, onLocationClick) added alongside those slots for the
// same reason: EntryDetail itself has no host-platform opinions, so anything that needs one is
// host-injected. b-view's own fullscreen button opens an internal Lightbox overlay by default;
// onFullscreen redirects it to SCR-07 instead, which stays a real, separately-routed screen (deep-
// link resilient, back-navigable). The trigger is the dedicated fullscreen button (or a
// double-tap; BEHAVIOUR.md, Screens), not a single photo tap.
//
// Follow/Unfollow/Report/Hide don't fit any of EntryDetail's slots (a backup viewer has no
// "follow/report/hide a member" concept) — rendered as this screen's own strip beneath EntryDetail
// instead. Star/Favourite share EntryDetail's one `reactions` slot, which can't independently hide
// just one of the two the way the old hand-built action row could — offered only when both
// actions.star and actions.favorite agree (both permitted or the viewer is anonymous, matching
// the old per-button "!activeAccount || actions?.x !== 0" rule combined across both flags); the
// two are not known to diverge in practice, and splitting the slot for a case that may never occur
// wasn't worth a further b-view change here.
//
// No more "More" overflow menu (2026-09 feedback round: every item it held now has its own inline
// home, so the menu itself goes away) — Edit is the one action left in EntryDetail's own
// `entryActions` nav-header slot; Report/Hide moved to the below-EntryDetail strip alongside
// Follow/Unfollow; Camera info was dropped entirely (redundant with the always-visible EXIF row);
// Replace photo/Delete moved into SCR-13's own single edit screen, no longer separate overflow
// items reached via router-state `mode`; Map's separate overflow item is gone too — the location
// pin now navigates to SCR-04 directly via `onLocationClick`, fixing the WebView-external-link gap
// the old plain `<a target="_blank">` had on native as a side effect of unifying to one affordance.
//
// Star/Favourite/Comment carry the account-confirm gate (BEHAVIOUR.md, "Confirm account before
// star, favourite or comment"); Follow/Report/Hide don't — the setting's scope is
// deliberately narrow. All four write actions hide entirely (not just disable) for a signed-in,
// read-only account; an anonymous tap routes through FLW-01 first, then resumes.
//
// FLW-13 (Phase 7): Edit, owner-only AND only read-write (a read-only owner never sees this —
// ownership doesn't imply write access). Pushes to SCR-13 (which itself sits behind
// WriteGuardRoute as a second, redundant-by-design gate — the same "never trust one call site"
// posture WriteGuardRoute exists for at all); SCR-13 now owns Replace photo and Delete entry
// itself, both formerly implemented here.
// 104 (protected)/202 (unavailable) get their own copy-deck messages via data/entries.ts's
// fetchEntry — this screen's own entryState.message just renders whatever it threw, same as any
// other error.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  IonPage,
  IonHeader,
  IonContent,
  IonSpinner,
  IonText,
  IonButton,
  IonAlert,
  IonToast,
} from '@ionic/react';
import { Flag, UserX, CornerUpLeft, Pencil, Trash2 } from 'lucide-react';
import { AppHeader } from '../../components/AppHeader.js';
import { EntryDetail, CommentComposer, ActionPill } from '@b-oss/b-view';
import type { BlipComment, EntryState, ActionPillItem } from '@b-oss/b-view';
import { useLiveEntry } from '../../data/useLiveEntry.js';
import { deleteEntry } from '../../data/entries.js';
import { fetchAuthorAvatar } from '../../data/users.js';
import { useCommentComposers } from './useCommentComposers.js';
import { useRevealReplyComposer } from './useRevealReplyComposer.js';
import { useScrollResume } from '../../data/useScrollResume.js';
import { EntryAuthorBlock, type FollowControl } from '../../components/EntryAuthorBlock.js';
import { UserBadges } from '../../components/UserBadges.js';
import { t } from '../../strings/index.js';
import { fetchCalendarMonth, fetchHistoryItems } from '../../data/journalDays.js';
import { openUrl } from '../../platform/browser.js';
import { resolveImage, invalidateImage } from '../../platform/imageCache.js';
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
import {
  useHiddenMembers,
  useHiddenMembersStore,
  useIsHidden,
} from '../../state/hiddenMembersStore.js';
import { describeError, mapApiError } from '../../data/errors.js';
import type { BlipComment as ApiComment } from '@b-oss/b-api';
import { useDevicePrefsStore } from '../../state/devicePrefsStore.js';
import { downloadOwnEntryImage } from '../../flows/downloadFlow.js';

interface EntryDetailScreenProps {
  entryId: string;
  /** Open the reply composer on this comment (its API id) as soon as the entry loads — for a
   * reply started from the comments inbox, which lands here instead of on a separate screen. */
  initialReplyToCommentId?: string;
}

/** Drops a comment (and its whole reply subtree) from what EntryDetail renders once its author is
 * hidden — full suppression, not a placeholder (BEHAVIOUR.md, Hidden members; a different treatment
 * from grids' hidden-tile placeholder, matching the old per-node CommentThread behaviour this
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

export function EntryDetailScreen({ entryId, initialReplyToCommentId }: EntryDetailScreenProps) {
  const photoFit = useDevicePrefsStore((s) => s.photoFit);
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
    refresh,
  } = useLiveEntry(entryId);

  // Coming Back to an entry (say from the author's profile) lands where you were scrolled to, not
  // at the top (b-oss#190). Only once the entry has loaded and given the page its height.
  const scroll = useScrollResume(`entry:${entryId}`, entryState.status === 'loaded');

  const [reaction, setReaction] = useState<ReactionOverlay | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmUnfollow, setConfirmUnfollow] = useState(false);
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState(false);
  const [downloadToast, setDownloadToast] = useState<string | null>(null);
  const [confirmHide, setConfirmHide] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiComment | null>(null);

  const authorUsername = entryState.status === 'loaded' ? entryState.data.username : null;
  const isOwnEntry = authorUsername !== null && authorUsername === activeAccount?.username;
  const authorHidden = useIsHidden(authorUsername);

  // The entry response carries no avatar: your own is already on the account; anyone else's is one
  // light, session-cached profile call (shared across that author's entries).
  const [authorAvatar, setAuthorAvatar] = useState<string | null>(null);
  const ownAvatar = activeAccount?.avatarUrl ?? null;
  useEffect(() => {
    setAuthorAvatar(null);
    if (!authorUsername) return;
    if (isOwnEntry && ownAvatar) {
      setAuthorAvatar(ownAvatar);
      return;
    }
    let cancelled = false;
    fetchAuthorAvatar(authorUsername).then(
      (url) => {
        if (!cancelled) setAuthorAvatar(url);
      },
      () => {
        // No avatar is a cosmetic degradation (the block shows an initial) — not worth an error.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [authorUsername, isOwnEntry, ownAvatar]);

  const commentActionsMap = useMemo(() => {
    const map = new Map<string, ApiComment>();
    flattenComments(comments, map);
    return map;
  }, [comments]);

  const composers = useCommentComposers({
    entryId,
    // FLW-06/07: sign in / confirm the account / require read-write, at the moment of posting.
    gate: () => gateReaction(true),
    // The new comment appears via a silent refresh — `reload` would blink the page to a spinner.
    onPosted: refresh,
  });

  // A reply started from the comments inbox opens its composer once, when the entry has loaded.
  const startedInitialReply = useRef(false);
  useEffect(() => {
    if (!initialReplyToCommentId || startedInitialReply.current) return;
    const target = commentActionsMap.get(initialReplyToCommentId);
    if (!target || target.actions.reply !== 1) return;
    startedInitialReply.current = true;
    composers.openReply(target.comment_id_str, target.comment_id_str);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReplyToCommentId, commentActionsMap]);

  useRevealReplyComposer(
    scroll.ref,
    composers.target?.kind === 'reply' ? composers.target.viewId : null,
  );

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

  function handleReportComment(comment: ApiComment): void {
    navigate.push(`/entry/${entryId}/report`, {
      targetUsername: comment.commenter.username,
      reportedComment: {
        username: comment.commenter.username,
        excerpt: comment.content.slice(0, 80),
      },
    });
  }

  async function handleConfirmedDeleteEntry(): Promise<void> {
    setConfirmDeleteEntry(false);
    try {
      await deleteEntry(entryId);
      navigate.replace('/browse');
    } catch (err) {
      setErrorMessage(describeError(mapApiError(err), 'Could not delete this entry.'));
    }
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

  // Own journal only — the flow refuses anything else, and the button is only offered for it.
  async function handleDownloadPhoto(): Promise<void> {
    if (entryState.status !== 'loaded') return;
    try {
      const location = await downloadOwnEntryImage(entryState.data, activeAccount?.username);
      setDownloadToast(location ? `Saved to ${location}` : 'Opened the photo');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not save the photo.');
    }
  }

  function handleReportEntry(): void {
    navigate.push(`/entry/${entryId}/report`, { targetUsername: authorUsername ?? undefined });
  }

  function handleUnhideAuthor(): void {
    const account = useAccountsStore.getState();
    if (!authorUsername || !account.activeAccountId) return;
    useHiddenMembersStore.getState().unhide(account.activeAccountId, authorUsername);
  }

  function renderCommentActions(comment: BlipComment): ReactNode {
    const apiComment = commentActionsMap.get(comment.comment_id);
    if (!apiComment) return null;
    // Icon buttons in one small pill (Blipfoto's idiom) rather than a row of text buttons. You
    // can't report your own comment, so Report only shows on other people's.
    const items: ActionPillItem[] = [];
    if (apiComment.actions.reply === 1) {
      items.push({
        key: 'reply',
        label: 'Reply',
        icon: <CornerUpLeft size={15} strokeWidth={1.6} />,
        onClick: () => composers.openReply(comment.comment_id, apiComment.comment_id_str),
      });
    }
    if (apiComment.actions.edit === 1) {
      items.push({
        key: 'edit',
        label: 'Edit comment',
        icon: <Pencil size={15} strokeWidth={1.6} />,
        onClick: () =>
          composers.openEdit(comment.comment_id, apiComment.comment_id_str, apiComment.content),
      });
    }
    if (apiComment.actions.delete === 1) {
      items.push({
        key: 'delete',
        label: 'Delete comment',
        icon: <Trash2 size={15} strokeWidth={1.6} />,
        tone: 'danger',
        onClick: () => setDeleteTarget(apiComment),
      });
    }
    if (apiComment.commenter.username !== activeAccount?.username) {
      items.push({
        key: 'report',
        label: 'Report comment',
        icon: <Flag size={15} strokeWidth={1.6} />,
        onClick: () => handleReportComment(apiComment),
      });
    }
    return <ActionPill items={items} />;
  }

  const showReactions =
    !hideForReadOnly && (!activeAccount || (actions?.star !== 0 && actions?.favorite !== 0));
  const showComment = !hideForReadOnly && (!activeAccount || actions?.comment !== 0);
  // Comments switched off on this journal (actions.comment === 0): say so rather than leaving the
  // user to wonder where the comment box went (SCR-06.comments_disabled, per the spec).
  const commentsOff = !hideForReadOnly && !!activeAccount && actions?.comment === 0;
  // Straight from the loaded friendship until you act (an effect seeds `reaction` a render later,
  // which flashed "follow" for someone you already follow).
  const friendshipState = reaction?.friendshipState ?? friendship?.state ?? null;
  const followControl: FollowControl =
    !hideForReadOnly && !isOwnEntry && authorUsername
      ? friendshipState === 1
        ? 'following'
        : friendshipState === 2
          ? 'requested'
          : 'follow'
      : null;

  return (
    <IonPage>
      <IonHeader>
        <AppHeader title="Entry" variant="back" backHref="/browse" accountIndicator />
      </IonHeader>
      <IonContent {...scroll}>
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
              photoFit={photoFit}
              entryState={displayEntryState}
              prevEntryId={prevEntryId}
              nextEntryId={nextEntryId}
              onNavigate={(id) => navigate.replace(`/entry/${id}`)}
              // Calendar and history are navigation, so they're offered on every user's entries —
              // but they need the signed-in API (journal/month is user-auth only).
              loadCalendarMonth={
                activeAccount && authorUsername
                  ? (year, month) => fetchCalendarMonth(authorUsername, year, month)
                  : undefined
              }
              loadHistory={
                activeAccount && authorUsername && entryState.status === 'loaded'
                  ? () => fetchHistoryItems(authorUsername, entryState.data.date)
                  : undefined
              }
              resolveAsset={resolveImage}
              invalidateAsset={invalidateImage}
              onLinkClick={(href) => void openUrl(href)}
              onFullscreen={() => navigate.push(`/entry/${entryId}/photo`)}
              onPhotoDoubleTap={() => navigate.push(`/entry/${entryId}/photo`)}
              onTagClick={(tag) => navigate.push(`/tag/${encodeURIComponent(tag)}`)}
              onLocationClick={() => navigate.push(`/map?entry=${entryId}`)}
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
                commentsOff ? (
                  <p
                    style={{
                      margin: '8px 0',
                      color: 'var(--muted)',
                      fontSize: 'var(--text-sm, 13px)',
                    }}
                  >
                    {t('SCR-06.comments_disabled')}
                  </p>
                ) : showComment ? (
                  <CommentComposer
                    value={composers.mainValue}
                    onChange={composers.setMainValue}
                    onSubmit={() => void composers.submitMain()}
                    posting={composers.mainPosting}
                    error={composers.mainError}
                    formatting
                  />
                ) : undefined
              }
              onUserClick={(username) =>
                navigate.push(
                  username === activeAccount?.username
                    ? '/me'
                    : `/user/${encodeURIComponent(username)}`,
                )
              }
              renderCommenterBadges={(comment) => (
                <UserBadges icons={commentActionsMap.get(comment.comment_id)?.commenter.icons} />
              )}
              renderCommentEditor={(comment) =>
                composers.target?.kind === 'edit' &&
                composers.target.viewId === comment.comment_id ? (
                  <CommentComposer
                    value={composers.targetValue}
                    onChange={composers.setTargetValue}
                    onSubmit={() => void composers.submitTarget()}
                    posting={composers.targetPosting}
                    error={composers.targetError}
                    submitLabel="Save"
                    ariaLabel="Edit your comment"
                    formatting
                    onCancel={composers.closeTarget}
                    autoFocus
                  />
                ) : null
              }
              renderCommentReply={(comment) =>
                composers.target?.kind === 'reply' &&
                composers.target.viewId === comment.comment_id ? (
                  <CommentComposer
                    value={composers.targetValue}
                    onChange={composers.setTargetValue}
                    onSubmit={() => void composers.submitTarget()}
                    posting={composers.targetPosting}
                    error={composers.targetError}
                    submitLabel="Reply"
                    ariaLabel={`Reply to ${comment.commenter_username}`}
                    formatting
                    onCancel={composers.closeTarget}
                    autoFocus
                  />
                ) : null
              }
              header={
                authorUsername ? (
                  <EntryAuthorBlock
                    username={authorUsername}
                    journalTitle={
                      entryState.status === 'loaded' ? entryState.data.journal_title : ''
                    }
                    avatarUrl={authorAvatar}
                    follow={followControl}
                    onFollow={() => void handleFollow()}
                    onUnfollow={() => setConfirmUnfollow(true)}
                    onOpenProfile={() =>
                      navigate.push(
                        isOwnEntry ? '/me' : `/user/${encodeURIComponent(authorUsername)}`,
                      )
                    }
                  />
                ) : undefined
              }
              ownerActions={
                isOwnEntry
                  ? {
                      // Downloading only reads, so a read-only sign-in still gets it; editing and
                      // deleting need write access.
                      onDownload: () => void handleDownloadPhoto(),
                      ...(canWrite
                        ? {
                            onEdit: () => navigate.push(`/entry/${entryId}/edit`),
                            onDelete: () => setConfirmDeleteEntry(true),
                          }
                        : {}),
                    }
                  : undefined
              }
              renderCommentActions={renderCommentActions}
            />

            {/* Report/Hide only exist for other people's entries (follow now lives in the author
                block above), so on your own there is nothing to render here. */}
            {!isOwnEntry && (
              <div
                className="ion-padding"
                style={{
                  paddingTop: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <button
                  aria-label="Report"
                  onClick={handleReportEntry}
                  style={{ background: 'none', border: 'none', padding: 8, cursor: 'pointer' }}
                >
                  <Flag size={16} strokeWidth={1.6} />
                </button>
                {authorUsername && (
                  <button
                    aria-label={`Hide ${authorUsername}`}
                    onClick={() => setConfirmHide(true)}
                    style={{ background: 'none', border: 'none', padding: 8, cursor: 'pointer' }}
                  >
                    <UserX size={16} strokeWidth={1.6} />
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </IonContent>

      {accountConfirmDialog}

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

      <IonToast
        isOpen={downloadToast !== null}
        message={downloadToast ?? ''}
        duration={3500}
        onDidDismiss={() => setDownloadToast(null)}
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
