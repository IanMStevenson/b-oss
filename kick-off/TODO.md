Bugs:

Backup did ~443 entries then stalled. COULD be API throttling but UI doesn't indicate. Stalled at 08:28 or so - wait to see if resumes to check if it's that or another failure more. It DOES resume, and does another 444! So we seem to have 450 per period or something.

THe backup is incomplete - only 5873 entries - and it's not SHOWING incomplete - why?

The "No blips archived" appears when we know there ARE blips - not a complete backup, but why can't we see what's there?

All images are placeholders

Failed to write b-view files

Features:
Lat/long link to Google Maps?
Comments are counted, not shown
No log
Dots in header - why? I think these are mac styling, remove.
Status dot on account selector needs to be larger
Account selector should show number of blips AND number of archived blips
Should we get commenter avatars and store in a sub-folder

Behaviour:

API Limitations
Not seeing hires or original image links populated in pracice
No ability to read extras

Check:

    API limtit should now show up in progress banner
    Do we get replies and do they work?

Check in release:

    After Auth Chrome asks "Open Electron" - I want it to say "open b-ark"
