# API appendix

This is the **only** part of the spec that names technology deliberately: the **Blipfoto API**.
Everywhere else describes behaviour; here we record the contract the app depends on.

**Source of truth.** The authoritative wire contract — full JSON v4 request/response shapes, the
complete error-code catalogue, the `journal/day` state definitions, and the exact multipart write
fields — lives in the **build repository's API specification/documentation**. These appendix files
are a **thin, language-neutral layer**: they describe the *entities* the app works with and the
*endpoint touchpoints* it relies on, and they point to the build-repo spec for exact detail. They
are intentionally not a duplicate wire reference (which would drift).

Contents:

- **[auth.md](auth.md)** — how the app authenticates and handles sessions.
- **[endpoints.md](endpoints.md)** — the endpoint touchpoints the app uses, by capability, mapped
  to screens/flows.
- **[data-model.md](data-model.md)** — the domain entities in language-neutral terms.
- **[error-codes.md](error-codes.md)** — error codes the UI must handle specially.
- **[open-questions.md](open-questions.md)** — the (now very short) list of things to confirm at
  build time.

Conventions referenced throughout:

- **JSON v4** is the wire format (`/4/<resource>` with JSON bodies/responses).
- **Always send a bearer** — user token when signed in, the app's own client id when anonymous.
- **HTTP status is always 200**; success/failure is in the body's error code (see
  [error-codes.md](error-codes.md)).
- **Entry ids are strings** — they exceed safe integer precision; never store or round-trip them
  as numbers.
