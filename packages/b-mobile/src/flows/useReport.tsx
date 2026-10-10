// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// FLW-11 entry point, shared by every Report affordance (entry, comment, member — b-oss#362). The
// API accepts a report only with a read-write user token, so a signed-in read-write account gets
// the in-app form (SCR-16); signed out or read-only, Report is still offered but explains itself
// in a dialog, then opens Blipfoto's support request form in the browser on Continue.
//
// Like useAccountConfirmGate, the dialog is a plain declarative IonAlert the caller renders
// alongside its own JSX (`reportDialog`).

import { useState } from 'react';
import type { ReactNode } from 'react';
import { IonAlert } from '@ionic/react';
import { useCanWrite } from '../state/accountsStore.js';
import { useAppNavigate } from '../app/routes/useAppNavigate.js';
import { openUrl } from '../platform/browser.js';

export const REPORT_REQUEST_URL = 'https://blipfoto.zendesk.com/hc/en-gb/requests/new';

export const REPORT_VIA_SUPPORT_MESSAGE =
  'Blipfoto requires reports via Zendesk unless you are signed in using Read/Write mode';

/** What SCR-16 is reporting. Every report is an entry report (the API has no other report
 * resource): a comment or a member is identified in the note, against an entry of theirs. */
export interface ReportTarget {
  entryId: string;
  /** Whose content this is — offered for Hide after the report is sent. */
  targetUsername?: string;
  reportedComment?: { username: string; excerpt: string };
  /** Reporting the member rather than the entry, from their profile. */
  reportedMember?: string;
}

export function useReport(): {
  report: (target: ReportTarget) => void;
  reportDialog: ReactNode;
} {
  const canWrite = useCanWrite();
  const navigate = useAppNavigate();
  const [explaining, setExplaining] = useState(false);

  function report(target: ReportTarget): void {
    if (!canWrite) {
      setExplaining(true);
      return;
    }
    const { entryId, ...state } = target;
    navigate.push(`/entry/${encodeURIComponent(entryId)}/report`, state);
  }

  const reportDialog = (
    <IonAlert
      isOpen={explaining}
      header="Report"
      message={REPORT_VIA_SUPPORT_MESSAGE}
      onDidDismiss={() => setExplaining(false)}
      buttons={[
        { text: 'Cancel', role: 'cancel' },
        { text: 'Continue', handler: () => void openUrl(REPORT_REQUEST_URL) },
      ]}
    />
  );

  return { report, reportDialog };
}
