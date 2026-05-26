**Rebuild Everything**
npm run build

**Run b-ark in dev mode**
npm run dev --workspace=packages/b-ark

**Status**

I have a successful initial backup!

**TODO / Bugs:**

Should we cache journal avatar?
Look at what happens when no network? Should stop and wait a while, not keep thrashing

Entry Page Tasks:
Should we get commenter avatars and store in a sub-folder
Look at URLs. Should we rewrite

The counts on the UI are a mess - there are images visible but missing from the archive count
The "API Rate Limit" notification stuff is visually messy too...

Account re-ordering doesn't work

Version number - including on components b-view and b-ark (and sub libraries?)

Release notes?

**To Test**
Any sort of API failure.

**API Limitations**
Not seeing hires or original image links populated in pracice
No ability to read extras

**Check**
At least one incremental backup
That re-do correctly picks up new anything and actively refreshes downloaded images
That scheduled backups are working
​ b-view works standalone in file mode
​ b-view works standalone when uploaded to Catalyst 2 static served folder (and subfolder)

_Check in release_
Does release/packaging work?
After Auth Chrome asks "Open Electron" - I want it to say "open b-ark"
