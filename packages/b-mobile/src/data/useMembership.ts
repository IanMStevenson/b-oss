import { useCallback, useEffect, useState } from 'react';
import { fetchUserProfile } from './users.js';

export interface Membership {
  /** null while checking, or when the check failed (see `failed`). */
  isMember: boolean | null;
  /** The profile fetch rejected, so membership is unknown — not "not a member" (b-oss#720). */
  failed: boolean;
  retry: () => void;
}

export function useMembership(): Membership {
  const [isMember, setIsMember] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchUserProfile().then(
      (profile) => {
        if (cancelled) return;
        setFailed(false);
        setIsMember(profile.details?.member === 1);
      },
      () => {
        if (cancelled) return;
        setIsMember(null);
        setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setFailed(false);
    setIsMember(null);
    setAttempt((n) => n + 1);
  }, []);

  return { isMember, failed, retry };
}
