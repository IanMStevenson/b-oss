import { useCallback, useEffect, useState } from 'react';
import { fetchUserProfile } from './users.js';
import { useAccountsStore } from '../state/accountsStore.js';
import { resumeGet, resumeSet } from './resumeCache.js';

// Screens that open another screen (the map, the photo picker) are unmounted and rebuilt on Back,
// so a membership read kept only in component state starts again as "unknown" on every return and
// anything gated on it (the crop frame, the extras block) vanishes until the profile call answers
// (b-oss#1056). The last answer is kept per account and shown straight away; the call still runs
// each time, so a lapsed or new membership is picked up. A failed call keeps the last answer.
const KEY = (accountId: string | null) => `membership:${accountId ?? ''}`;

export interface Membership {
  /** null while checking, or when the check failed (see `failed`). */
  isMember: boolean | null;
  /** The profile fetch rejected, so membership is unknown — not "not a member" (b-oss#720). */
  failed: boolean;
  retry: () => void;
}

export function useMembership(): Membership {
  const accountId = useAccountsStore((s) => s.activeAccountId);
  const [isMember, setIsMember] = useState<boolean | null>(
    () => resumeGet<boolean>(KEY(accountId)) ?? null,
  );
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchUserProfile().then(
      (profile) => {
        if (cancelled) return;
        setFailed(false);
        const member = profile.details?.member === 1;
        resumeSet(KEY(accountId), member);
        setIsMember(member);
      },
      () => {
        if (cancelled) return;
        setIsMember(resumeGet<boolean>(KEY(accountId)) ?? null);
        setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt, accountId]);

  const retry = useCallback(() => {
    setFailed(false);
    setIsMember(null);
    setAttempt((n) => n + 1);
  }, []);

  return { isMember, failed, retry };
}
