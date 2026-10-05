# b-mobile — things blipfoto.com can do that the app can't (yet)

A running log, so "why doesn't the app do X?" has one place to look. Add a row whenever we find a
gap; move it to **Resolved** when it's closed. "Why" says whether the cause is the API (can't fix
here), a deliberate deferral (can), or just not built.

## Open

| What the site does | What the app does | Why | Ref |
| --- | --- | --- | --- |
| Shows a commenter's country flag and donor badge beside their name | Shows only the camera and staff badges | **API.** A comment's `commenter` has only `username`, `avatar_url`, `icons` (camera/staff). Flag would need a per-commenter `user` lookup (country code); donor status may not be exposed at all. | [#208](https://github.com/IanMStevenson/b-oss/issues/208) |
| Comment box renders toolbar formatting WYSIWYG (stores BBCode) | Plain text box; toolbar inserts visible BBCode tags | **Deferred** (not a priority; liveable). Needs a rich editor that round-trips BBCode. | [#206](https://github.com/IanMStevenson/b-oss/issues/206) |
| Download an entry's photo | Not offered | **Deferred.** | [#175](https://github.com/IanMStevenson/b-oss/issues/175) |
| Browse any feed to any depth | Every entry feed stops at `page_index` 200 (20,000 entries at 100/page); Recent and Popular end sooner (their real depth is unmeasured) | **API.** The server clamps the index; confirmed on every feed by the on-device probe. | [#196](https://github.com/IanMStevenson/b-oss/issues/196) |
| — | Photo downscaling before upload isn't implemented; entries always upload full size | **Not built.** The "upload full size" setting is disabled until it is. | `SCR-25` Misc |

## Matches the site (not a limitation, recorded so it isn't re-investigated)

- Only a very recent comment of your own can be edited: the server returns `actions.edit = 0` for
  older ones, and blipfoto.com behaves the same ([#207](https://github.com/IanMStevenson/b-oss/issues/207)).

## Resolved

_None yet._
