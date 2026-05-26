# b-oss Working Document

## **Status**

I have a successful initial backup!

## TODO

The counts on the UI are a mess - there are images visible but missing from the archive count
The "API Rate Limit" notification stuff is visually messy too...

**Release Process**

Version number - including on components b-view and b-ark (and sub libraries?)

Release Notes

> **⚠ Reminder — revisit during release-process design**
>
> When the release process is designed (Windows + macOS signing pipeline, version-bump flow, changelog discipline, publish step), wire in these dependency-security pieces that are pointless without it:
>
> - `npm audit --omit=dev --audit-level=high` as a hard gate in the release workflow (block the build on high/critical advisories on production deps).
> - The same audit on a scheduled CI run (e.g. nightly cron) so advisories surface even between releases.
> - A "review Dependabot queue" item on the pre-release checklist.
> - SHA-512 of the produced installer published alongside the release notes, until Authenticode signing is in place (cross-reference SECURITY.md).
> - Reconsider Authenticode code signing at that point — see item #4 in the original security review.

## Bugs

## Testing Required

**To Test**
Any sort of API failure.

**API Limitations**
Not seeing hires or original image links populated in pracice
No ability to read extras

**Check**
That re-do correctly picks up new anything and actively refreshes downloaded images
That scheduled backups are working

**_Check in release_**
Does release/packaging work?
After Auth Chrome should say "open b-ark" not "Open Electron?"

## Key Commands

**Rebuild Everything**
npm run build

**Run b-ark in dev mode**
npm run dev --workspace=packages/b-ark
