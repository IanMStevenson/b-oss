# Untested paths

Behaviour that is implemented, and covered by unit tests where noted, but has **not** been
exercised on a real device or against the real service. A deliberate, maintained list: it keeps
these out of the issue tracker, which is for work still to do. Add a line when you ship something
you couldn't try for real; remove it when it has been tried (and say so in the commit).

| Path | Covered by | Not exercised | Why it's low risk / what would break |
| --- | --- | --- | --- |
| Launch/resume finds OS notification permission withdrawn → all notifications state cleared (b-oss#251) | `pushFlow.test.ts`, `accountsFlow.test.ts` (`clearServiceToken`) | Revoking the permission on a real Android device and reopening the app | Only residual doubt is what `checkPushPermission()` reports after a revoke; the code treats anything other than `granted` as withdrawn. |
| b-push: read token undecryptable after `READ_TOKEN_ENCRYPTION_KEY` rotation → row marked `read-token-invalid`, one reauth push (b-oss#252) | `poll.test.ts` (row encrypted under key A, polled with key B) | A real key rotation on the deployed Worker | AES-GCM fails deterministically under a wrong key. Needs the b-push deploy to take effect. |
