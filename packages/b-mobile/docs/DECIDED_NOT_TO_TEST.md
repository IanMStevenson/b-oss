# Things the owner has EXPLICITLY decided NOT to test

> **THIS IS NOT A TESTING LOG, A TO-DO LIST OR A LIST OF UNVERIFIED THINGS.**
> A row belongs here only when the owner has **explicitly said "I'm not testing this"** — usually
> because the failure is unlikely **and** a real test is costly. Nobody else may add a row on
> their own judgement, and agents must not edit this file unprompted.
>
> Testing that is still to be done (device checks, verification of something just built) lives in
> **GitHub issues** or the PR description — never here. When a row here is ever tested, delete the
> row and say so in the commit.

Purpose: a reminder to the owner, for when one of these comes back to bite, or for a quiet moment
when going looking for trouble.

| Path                                                                                                                                       | Covered by                                                       | Not exercised                                                          | Why it's low risk / what would break                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Launch/resume finds OS notification permission withdrawn → all notifications state cleared (b-oss#251)                                     | `pushFlow.test.ts`, `accountsFlow.test.ts` (`clearServiceToken`) | Revoking the permission on a real Android device and reopening the app | Only residual doubt is what `checkPushPermission()` reports after a revoke; the code treats anything other than `granted` as withdrawn. |
| b-push: read token undecryptable after `READ_TOKEN_ENCRYPTION_KEY` rotation → row marked `read-token-invalid`, one reauth push (b-oss#252) | `poll.test.ts` (row encrypted under key A, polled with key B)    | A real key rotation on the deployed Worker                             | AES-GCM fails deterministically under a wrong key. Needs the b-push deploy to take effect.                                              |
