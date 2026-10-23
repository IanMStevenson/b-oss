# Releasing b-api

b-api is **not published anywhere**. `package.json` is `private: true`, there is no npm package,
no build artifact and no publication step. Anyone who wants it takes the source from this
repository (see the [site page](https://b-oss.dev/b-api.html)). So "releasing"
b-api means keeping it in a state that is safe to take from `main`, and saying what changed.

This is the b-api case of the repo-wide process in
[RELEASING.md](../../RELEASING.md#components-and-the-common-checklist).

## What consumers should do

- Pin to a commit, or to a `v*` tag. Tags are cut for b-ark releases and cover the whole
  monorepo, so a tag gives you b-api exactly as that b-ark release shipped it.
- Expect no semantic-versioning promise. `package.json` stays at `0.1.0`; the version is not
  bumped per release and does not signal breaking changes.
- Treat the changelog as the record of API-affecting changes.

## What a maintainer does

For any change to `packages/b-api/src`:

1. **Changelog.** If the public surface changes (a method, a type, an error, auth behaviour),
   add a user-facing line under `[Unreleased]` in the root `CHANGELOG.md`, prefixed `b-api:`,
   and mark breaking changes as such. Internal refactors and test changes don't need an entry.
2. **Docs.** Keep `packages/b-api/README.md` and `docs/api-reference.md` in step with the code.
3. **Tests.** `npm test --workspace=@b-oss/b-api` passes; live-API checks, where relevant, are
   described in `docs/integration-testing.md`.

At a b-ark release, nothing extra is needed for b-api: the changelog section and the tag carry it.
The common checklist's other steps (version bump, generated data, `RELEASE=1` build, smoke test,
publish) do not apply: b-api has no version file to bump, no generated data, no build artifact
and nothing to publish. b-api is still exercised by the b-ark smoke test, since b-ark's sign-in
and backup both go through it.

## If this changes

If b-api is ever published (an npm package, say), this file becomes a real process: drop
`private`, give it its own version and tags, and add a publish step. That would be a new issue,
not an edit here.
