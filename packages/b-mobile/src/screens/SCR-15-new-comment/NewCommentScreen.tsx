// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-15 — New/Edit Comment or Reply (FLW-07). Reached only via in-app taps (SCR-06's Comment/
// Reply/Edit) — never a deep link — so which comment is being replied to or edited travels
// through router `location.state` (extracted in AppRoutes.tsx) rather than a route param; see
// useAppNavigate.ts's doc comment on when state vs. a URL param is the right choice.
//
// A plain native <textarea> (with a ref), not IonTextarea: the formatting toolbar needs real
// cursor/selection access to wrap the selected text in a BBCode tag pair, which means reaching
// past Ionic's shadow-DOM wrapper — a plain textarea gives that directly. The toolbar itself is
// components/BBCodeToolbar.tsx (Phase 7), shared with SCR-11 — comments exclude the link tag
// (§14: link creation is gated per account server-side; SCR-11's entry descriptions still show it).

import { useRef, useState } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonAlert,
  IonText,
} from '@ionic/react';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { postComment, editComment } from '../../flows/commentsFlow.js';
import { describeError, mapApiError } from '../../data/errors.js';
import { BBCODE_TAGS } from '../../data/bbcode.js';
import { BBCodeToolbar } from '../../components/BBCodeToolbar.js';

interface NewCommentScreenProps {
  entryId: string;
  replyToCommentId?: string;
  editCommentId?: string;
  editInitialContent?: string;
}

const TOOLBAR_TAGS = BBCODE_TAGS.filter((tag) => tag !== 'url');

export function NewCommentScreen({
  entryId,
  replyToCommentId,
  editCommentId,
  editInitialContent,
}: NewCommentScreenProps) {
  const navigate = useAppNavigate();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [content, setContent] = useState(editInitialContent ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const isEditing = editCommentId != null;
  const title = isEditing ? 'Edit comment' : replyToCommentId ? 'Reply' : 'Add a comment';
  const hasChanges = isEditing ? content !== (editInitialContent ?? '') : content.trim().length > 0;

  function handleBack(): void {
    if (hasChanges) {
      setConfirmDiscard(true);
      return;
    }
    navigate.goBack();
  }

  async function handleSubmit(): Promise<void> {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (isEditing && editCommentId) {
        await editComment({ commentId: editCommentId, content });
      } else {
        await postComment({ entryId, content, parentId: replyToCommentId });
      }
      navigate.goBack();
    } catch (err) {
      const outcome = mapApiError(err);
      setError(describeError(outcome, 'Could not post this comment.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={handleBack}>Cancel</IonButton>
          </IonButtons>
          <IonTitle>{title}</IonTitle>
          <IonButtons slot="end">
            <IonButton disabled={!content.trim() || submitting} onClick={() => void handleSubmit()}>
              OK
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        {error && (
          <IonText color="danger">
            <p>{error}</p>
          </IonText>
        )}
        <BBCodeToolbar tags={TOOLBAR_TAGS} textareaRef={textareaRef} onChange={setContent} />
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Your comment…"
          rows={8}
          style={{ width: '100%', font: 'inherit', padding: 8 }}
        />
      </IonContent>

      <IonAlert
        isOpen={confirmDiscard}
        header="Discard comment?"
        onDidDismiss={() => setConfirmDiscard(false)}
        buttons={[
          { text: 'Keep editing', role: 'cancel' },
          { text: 'Discard', role: 'destructive', handler: () => navigate.goBack() },
        ]}
      />
    </IonPage>
  );
}
