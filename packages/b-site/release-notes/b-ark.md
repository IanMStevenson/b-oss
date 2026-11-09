## 1.0.10 - 2026-11-09

Fixed: the "Choose folder" button on the first screen could open more than one folder picker, which could then cause an error the first time you signed in. It now opens just one.
Error messages now stay on screen until you close them, other messages last 30 seconds, and hovering over one pauses it. Errors are also recorded in the backup folder's log.

## 1.0.9 - 2026-11-08

Scrolling and zooming in the photo viewer is smoother and more predictable: zoom steps are sensible, you can only drag the photo when zoomed in, and nothing jumps at fit size.
The Delay setting is gone; b-ark now pauses a fixed 100 ms between fetches.

## 1.0.7 - 2026-11-03

Now available from the Microsoft Store, which keeps b-ark up to date for you.
• Scheduled backups is now the one setting for background backups. Turning it on also starts b-ark with Windows.
• If a backup fails, the notice now says whether you're offline or Blipfoto isn't answering, with Retry and a link to the Blipfoto status page.

## 1.0.6 - 2026-10-23

Improved re-fetch of journal entries that failed during the initial backup.

- Entries that couldn't be downloaded are now retried automatically on later backups, and anything missing from your archive is filled in without needing to start a new backup.

Minor UI improvements to the handling of warnings and errors.

- When a journal needs attention, a notice at the top now explains why and what you can do about it.

## 1.0.5 - 2026-09-08

• New: back up Original and Extra images as well as the standard ones (you sign in to each journal on the Blipfoto website once), and browse Extra images in a viewer.
• Faster backups, newest posts first so recent entries appear sooner.
• Fixed: files could occasionally fail to save, and "open in browser" could fail to start.

## 1.0.1 - 2026-06-14

Fixed an error ("EPERM", a file-permission problem) that appeared now and then during a backup.

## 1.0.0 - 2026-06-11

The first release. The versions before it were highly stable in testing. New: clearer warnings if b-ark needs to be authorised again.
