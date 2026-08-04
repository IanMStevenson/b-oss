// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-06 — Entry Detail (FLW-05, view-only for this phase). Deliberately NOT b-view's
// EntryDetail: that component renders `description_html`/`content_html` via
// dangerouslySetInnerHTML, which app-architecture.md §14 explicitly rules out app-wide ("no
// dangerouslySetInnerHTML anywhere in the app... the security-relevant property, not a
// stylistic one" — content here is written by other members). Built from scratch instead,
// rendering the raw BBCode (`description`/`content`, not the `_html` variants) through
// BBCodeText. b-view's Lightbox is still reused for SCR-07 — it renders only <img>, no HTML
// content, so the same conflict doesn't apply there.
//
// TODO(Phase 4): the action bar (Comment/Star/Favourite/Follow — FLW-06/07/08) isn't built yet;
// this phase is read-only per FLW-05's scope. TODO(Phase 5+/7): owner-only edit/delete, report,
// hide-this-member, share. TODO(TODO F/G): 104 (protected)/202 (unavailable) get their own
// copy-deck messages once that work lands — for now the server's own error message shows as-is.

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
} from '@ionic/react';
import { useLiveEntry } from '../../data/useLiveEntry.js';
import { CachedImage } from '../../components/CachedImage.js';
import { BBCodeText } from '../../components/BBCodeText.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import type { BlipComment } from '@b-oss/b-view';

interface EntryDetailScreenProps {
  entryId: string;
}

function CommentThread({ comment, depth = 0 }: { comment: BlipComment; depth?: number }) {
  return (
    <div style={{ marginLeft: depth * 16, marginTop: 8 }}>
      <strong>{comment.commenter_username}</strong>
      <BBCodeText source={comment.content} />
      {comment.replies.map((reply) => (
        <CommentThread key={reply.comment_id} comment={reply} depth={depth + 1} />
      ))}
    </div>
  );
}

export function EntryDetailScreen({ entryId }: EntryDetailScreenProps) {
  const navigate = useAppNavigate();
  const { entryState, prevEntryId, nextEntryId, retry } = useLiveEntry(entryId);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/browse" />
          </IonButtons>
          <IonTitle>Entry</IonTitle>
          <IonButtons slot="end">
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
            <IonButton onClick={retry}>Retry</IonButton>
          </div>
        )}

        {entryState.status === 'loaded' && (
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
              {entryState.data.views_total.toLocaleString()} views · {entryState.data.stars_total}{' '}
              stars · {entryState.data.favorites_total} favourites
            </p>

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

            <h3>Comments ({entryState.data.comments.length})</h3>
            {entryState.data.comments.map((comment) => (
              <CommentThread key={comment.comment_id} comment={comment} />
            ))}
          </>
        )}
      </IonContent>
    </IonPage>
  );
}
