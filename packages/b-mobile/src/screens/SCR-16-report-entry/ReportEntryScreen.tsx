// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-16 — Report Entry (FLW-11). Reports a comment through the same endpoint as an entry —
// there is no separate comment-report call — with the comment identified in the note, which is
// why `reportedComment` (author + excerpt) travels via router location.state, same reasoning as
// SCR-15's reply/edit context: this screen is only ever reached by an in-app tap, never a deep
// link.

import { useState } from 'react';
import {
  IonPage,
  IonHeader,
  IonButton,
  IonContent,
  IonList,
  IonItem,
  IonCheckbox,
  IonLabel,
  IonText,
  IonAlert,
} from '@ionic/react';
import { AppHeader } from '../../components/AppHeader.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { reportEntry } from '../../flows/reactionsFlow.js';
import { describeError, mapApiError } from '../../data/errors.js';
import { useAccountsStore } from '../../state/accountsStore.js';
import { useHiddenMembersStore } from '../../state/hiddenMembersStore.js';
import type { ReportReasons } from '@b-oss/b-api';

interface ReportEntryScreenProps {
  entryId: string;
  /** Who the report (and, if offered, Hide) would apply to — the entry's author when reporting
   * the entry itself, or the comment's author when reporting one of its comments. Absent only if
   * the caller couldn't determine it, in which case the post-report Hide offer is simply skipped. */
  targetUsername?: string;
  reportedComment?: { username: string; excerpt: string };
}

const REASONS: Array<{ key: keyof ReportReasons; label: string }> = [
  { key: 'reason_explicit', label: 'Explicit content' },
  { key: 'reason_inappropriate_content', label: 'Inappropriate content' },
  { key: 'reason_copyright', label: 'Copyright infringement' },
  { key: 'reason_promotional', label: 'Promotional / spam' },
  { key: 'reason_incorrect_date', label: 'Incorrect date' },
];

export function ReportEntryScreen({
  entryId,
  targetUsername,
  reportedComment,
}: ReportEntryScreenProps) {
  const navigate = useAppNavigate();
  const [selected, setSelected] = useState<Set<keyof ReportReasons>>(new Set());
  const [note, setNote] = useState(
    reportedComment ? `${reportedComment.username}'s comment: "${reportedComment.excerpt}"` : '',
  );
  const [needsReason, setNeedsReason] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportedOk, setReportedOk] = useState(false);

  function handleHide(): void {
    const account = useAccountsStore.getState();
    if (!targetUsername || !account.activeAccountId) return;
    useHiddenMembersStore.getState().hide(account.activeAccountId, targetUsername);
    navigate.goBack();
  }

  function toggleReason(key: keyof ReportReasons): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSend(): Promise<void> {
    if (selected.size === 0) {
      setNeedsReason(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    const reasons: ReportReasons = {};
    for (const key of selected) reasons[key] = 1;
    try {
      await reportEntry(entryId, reasons, note.trim() || undefined);
      setReportedOk(true);
    } catch (err) {
      const outcome = mapApiError(err);
      setError(describeError(outcome, 'Could not submit this report.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <AppHeader
          title={reportedComment ? 'Report comment' : 'Report entry'}
          variant="back"
          backHref={`/entry/${entryId}`}
        />
      </IonHeader>
      <IonContent className="ion-padding">
        {error && (
          <IonText color="danger">
            <p>{error}</p>
          </IonText>
        )}
        {needsReason && (
          <IonText color="danger">
            <p>Select a reason.</p>
          </IonText>
        )}

        <IonList>
          {REASONS.map(({ key, label }) => (
            <IonItem key={key}>
              <IonCheckbox
                checked={selected.has(key)}
                onIonChange={() => toggleReason(key)}
                justify="start"
                labelPlacement="end"
              >
                {label}
              </IonCheckbox>
            </IonItem>
          ))}
        </IonList>

        <p>
          {reportedComment
            ? `Reporting: ${reportedComment.username}'s comment`
            : 'Reporting: this entry'}
        </p>

        <IonLabel>Note (optional)</IonLabel>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          style={{ width: '100%', font: 'inherit', padding: 8 }}
        />

        <IonButton expand="block" disabled={submitting} onClick={() => void handleSend()}>
          Send
        </IonButton>
      </IonContent>

      <IonAlert
        isOpen={reportedOk}
        header="Report sent"
        message="Thanks — Blipfoto's moderators will review this."
        onDidDismiss={() => navigate.goBack()}
        buttons={[
          { text: 'Done', handler: () => navigate.goBack() },
          ...(targetUsername ? [{ text: `Also hide ${targetUsername}`, handler: handleHide }] : []),
        ]}
      />
    </IonPage>
  );
}
