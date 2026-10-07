# Untested paths

A long-term record of tests the owner has **deliberately chosen not to do** — too much trouble to
try for real at the time, so the risk was accepted. It is a reference for when one of these comes
back to bite, or for a quiet moment when someone wants to go looking for trouble.

It is **not** a to-do list, and not a place to log checks that simply haven't happened yet. Device
checks still to do belong in the PR description. Add a row only when the owner has said "I'll trust
this / skip testing it"; remove it if it is ever tested (and say so in the commit).

| Path                                                                                                                                       | Covered by                                                       | Not exercised                                                          | Why it's low risk / what would break                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Launch/resume finds OS notification permission withdrawn → all notifications state cleared (b-oss#251)                                     | `pushFlow.test.ts`, `accountsFlow.test.ts` (`clearServiceToken`) | Revoking the permission on a real Android device and reopening the app | Only residual doubt is what `checkPushPermission()` reports after a revoke; the code treats anything other than `granted` as withdrawn. |
| b-push: read token undecryptable after `READ_TOKEN_ENCRYPTION_KEY` rotation → row marked `read-token-invalid`, one reauth push (b-oss#252) | `poll.test.ts` (row encrypted under key A, polled with key B)    | A real key rotation on the deployed Worker                             | AES-GCM fails deterministically under a wrong key. Needs the b-push deploy to take effect.                                              |
