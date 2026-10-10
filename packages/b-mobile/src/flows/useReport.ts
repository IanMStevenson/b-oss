// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// FLW-11 entry point, shared by every Report affordance (entry, comment, member — b-oss#362). The
// API accepts a report only with a read-write user token, so a signed-in read-write account gets
// the in-app form (SCR-16); signed out or read-only, Report is still offered but opens Blipfoto's
// support request form in the browser instead of prompting a sign-in or an upgrade first.

import { useCanWrite } from '../state/accountsStore.js';
import { useAppNavigate } from '../app/routes/useAppNavigate.js';
import { openUrl } from '../platform/browser.js';

export const REPORT_REQUEST_URL = 'https://blipfoto.zendesk.com/hc/en-gb/requests/new';

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

export function useReport(): (target: ReportTarget) => void {
  const canWrite = useCanWrite();
  const navigate = useAppNavigate();
  return (target) => {
    if (!canWrite) {
      void openUrl(REPORT_REQUEST_URL);
      return;
    }
    const { entryId, ...state } = target;
    navigate.push(`/entry/${encodeURIComponent(entryId)}/report`, state);
  };
}
