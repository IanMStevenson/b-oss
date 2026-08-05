// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// GENERATED FILE — do not edit by hand.
// Source: docs/AppSpec/TextStrings.csv (TODO F's copy deck). Regenerate with:
//   node scripts/generate-strings.mjs

export const STRINGS = {
  'CONFIRM.avatar_delete.button': 'Remove',
  'CONFIRM.avatar_delete.title': 'Remove your profile picture?',
  'CONFIRM.delete_comment.button': 'Delete',
  'CONFIRM.delete_comment.moderation.body':
    "This can't be undone. {username} will still be able to comment on your entries again.",
  'CONFIRM.delete_comment.moderation.title': "Delete {username}'s comment from your journal?",
  'CONFIRM.delete_comment.own.body': "This can't be undone.",
  'CONFIRM.delete_comment.own.title': 'Delete this comment?',
  'CONFIRM.delete_entry.body':
    "This can't be undone - the entry, its comments and its stats will be gone for good.",
  'CONFIRM.delete_entry.button': 'Delete',
  'CONFIRM.delete_entry.title': 'Delete this entry?',
  'CONFIRM.discard.body': "You'll lose what you've written if you leave now.",
  'CONFIRM.discard.button_discard': 'Discard',
  'CONFIRM.discard.button_keep_editing': 'Keep editing',
  'CONFIRM.discard.title': 'Discard your changes?',
  'CONFIRM.hide.body':
    "You won't see their entries, comments or notifications.\nThis doesn't stop them seeing your journal or commenting on your entries.",
  'CONFIRM.hide.confirm_button': 'Hide',
  'CONFIRM.hide.offer_private': 'Make your journal private',
  'CONFIRM.hide.offer_remove_follower': 'Remove them as a follower',
  'CONFIRM.hide.title': 'Hide {username}?',
  'CONFIRM.hide.undo_toast': '{username} hidden. Undo',
  'CONFIRM.refuse.body':
    "They won't be able to see your journal.\nThis doesn't hide their entries from you.",
  'CONFIRM.refuse.button': 'Refuse',
  'CONFIRM.refuse.offer_hide': "Also hide {username}, so you don't see their entries either?",
  'CONFIRM.refuse.title': "Refuse {username}'s request?",
  'CONFIRM.remove_account.body':
    "This signs the account out of the app completely and cancels any of its uploads still in progress. You'll need to sign in again to use it here.",
  'CONFIRM.remove_account.button': 'Remove account',
  'CONFIRM.remove_account.title': 'Remove {username} from this app?',
  'CONFIRM.remove_follower.button': 'Remove follower',
  'CONFIRM.remove_follower.protected.body':
    "They'll lose access to your journal, but they can ask to follow again - you can approve or refuse that request when it comes in.",
  'CONFIRM.remove_follower.protected.title': 'Remove {username} as a follower?',
  'CONFIRM.remove_follower.public.body':
    "This doesn't stop them seeing your journal - it's public. They can follow again anytime.",
  'CONFIRM.remove_follower.public.title': 'Remove {username} as a follower?',
  'CONFIRM.restore_access.offer_hide':
    'Their entries have always been visible to you. Want to hide them instead?',
  'CONFIRM.restore_access.toast': '{username} can see your journal again.',
  'CONFIRM.unfollow.body': "You'll stop seeing their entries in your Following tab.",
  'CONFIRM.unfollow.button': 'Unfollow',
  'CONFIRM.unfollow.title': 'Unfollow {username}?',
  'CONFIRM.unhide.toast': "{username} unhidden - you'll see their content again.",
  'ERR.101.username_invalid': "That username isn't valid.",
  'ERR.102.username_taken': 'That username is already taken.',
  'ERR.104.protected': 'Protected',
  'ERR.11.rate_limited': 'Please wait a moment and try again.',
  'ERR.202.entry_unavailable': 'This entry is no longer available.',
  'ERR.205.comments_disabled': 'Comments are turned off for this journal.',
  'ERR.223.favourite_quota': "You've reached today's favourite limit. Try again tomorrow.",
  'ERR.240.invalid_jpg': "That photo can't be used. Please choose a JPEG image.",
  'ERR.250.publish_too_old': 'That date is too far in the past.',
  'ERR.251.publish_future': 'That date is in the future.',
  'ERR.252.already_posted': 'You already have an entry for that day.',
  'ERR.303_304.comment_no_reply': "This comment can't be replied to.",
  'ERR.305.comment_no_delete': "You can't delete this comment.",
  'ERR.306.comment_no_edit': 'You can only edit your own comments.',
  'ERR.31.invalid_grant': 'Sign-in failed. Please try again.',
  'ERR.516_517.journal_title': 'Journal titles can be up to 25 characters.',
  'ERR.525_526.entry_title': 'Titles can be up to 50 characters.',
  'ERR.527_528.tags': 'Tags can be up to 255 characters in total.',
  'ERR.publish_blocked_neutral': "You can't publish an entry for that date.",
  'FLW22.downgrade_to_readonly.body':
    "This signs {username} out of posting, reacting, commenting and following. You can switch back to read-write anytime - you'll just need to sign in again.",
  'FLW22.downgrade_to_readonly.button': 'Switch to read-only',
  'FLW22.downgrade_to_readonly.title': 'Switch {username} to read-only?',
  'FLW22.notifications_off.body':
    'This signs the notification service out of this account. You can turn notifications back on anytime.',
  'FLW22.notifications_off.button': 'Turn off notifications',
  'FLW22.notifications_off.title': 'Turn off notifications for {username}?',
  'FLW22.notifications_on.explainer':
    'One more step - authorize read-only access for notifications',
  'FLW22.upgrade_to_readwrite.body':
    'This needs one more sign-in step, to authorize posting, reacting, commenting and following.',
  'FLW22.upgrade_to_readwrite.button': 'Continue',
  'FLW22.upgrade_to_readwrite.title': 'Switch {username} to read-write?',
  'GENERIC.error.list_load': "Couldn't load this. Check your connection and try again.",
  'GENERIC.error.retry_button': 'Retry',
  'HIDDEN.grid_tile.caption': 'Hidden',
  'HIDDEN.list_badge': 'Hidden',
  'HIDDEN.list_badge_on_refused_screen': 'Also hidden',
  'HIDDEN.member_state.body':
    "You won't see their entries, comments or notifications until you unhide them.",
  'HIDDEN.member_state.button': 'Unhide',
  'HIDDEN.member_state.title': "You've hidden {username}",
  'PERM.location.denied': 'Location access is off. Turn it on in Settings to use this.',
  'PERM.location.needed': 'Allow location access to use this.',
  'PERM.notifications.refused':
    'Notifications are turned off for this app in system settings. Turn them on there to receive pushes and reminders.',
  'PUSH.comments.body.many': '{count} new comments',
  'PUSH.comments.body.one': '1 new comment',
  'PUSH.notifications.body.many': '{count} new notifications',
  'PUSH.notifications.body.one': '1 new notification',
  'PUSH.reauth_required.body': 'Notifications for {username} need you to sign in again.',
  'PUSH.reauth_required.title': 'Sign-in needed',
  'PUSH.title': 'Blipfoto',
  'REFUSED.list_badge': 'Also refused',
  'REMINDER.body': "You haven't posted today's entry yet, {username}.",
  'REMINDER.title': "Time for today's blip",
  'SCR-01.button.continue': 'Continue',
  'SCR-01.button.sign_in': 'Sign in',
  'SCR-01.error.failed': 'Sign-in failed. Please try again.',
  'SCR-01.error.redirect_mismatch':
    'Sign-in is misconfigured (redirect URI mismatch). This is a setup problem, not something to retry.',
  'SCR-01.error.second_auth_failed':
    "You're signed in, but notifications couldn't be turned on. You can try again anytime from Settings.",
  'SCR-01.explainer.first_run.body':
    "Read-write lets you do everything: post your daily photo, star, favourite, comment and follow. Most people want this.\n\nRead-only signs you in to browse and read, and nothing else. Nothing you do can change your account. Useful if you mostly look rather than post, or you'd rather this app couldn't post as you.\n\nYou can change this later for any account, and you can add more than one account.",
  'SCR-01.explainer.first_run.button': 'Got it',
  'SCR-01.explainer.first_run.title': 'Two ways to sign in',
  'SCR-01.interstitial.second_auth': 'One more step - authorize read-only access for notifications',
  'SCR-01.link.browse_anon': 'Just looking? Browse without signing in',
  'SCR-01.link.create_account': 'New to Blipfoto? Create account',
  'SCR-01.mode.read_only.subtitle': 'Browse and read only - no posting or reacting',
  'SCR-01.mode.read_only.title': 'Read-only',
  'SCR-01.mode.read_write.subtitle': 'Post, react, comment, follow',
  'SCR-01.mode.read_write.title': 'Read-write',
  'SCR-01.notifications_toggle': 'Get notifications',
  'SCR-01.reason.comment': 'Sign in to comment',
  'SCR-01.reason.favourite': 'Sign in to favourite this entry',
  'SCR-01.reason.follow': 'Sign in to follow {username}',
  'SCR-01.reason.generic': 'Sign in to continue',
  'SCR-01.reason.publish': 'Sign in to post your photo',
  'SCR-01.reason.report': 'Sign in to report this',
  'SCR-01.reason.star': 'Sign in to star this entry',
  'SCR-01.tooltip.read_only':
    "This app can see everything you can see, but can't change anything - no posting, reacting, commenting or following. You can switch to read-write later without losing the account.",
  'SCR-01.tooltip.read_write':
    'This app can post entries, comment, star, favourite and follow on your behalf, and change your settings.',
  'SCR-02.empty.following':
    'Nothing here yet. Follow some journals to see their entries in this tab.',
  'SCR-02.empty.just_me': "You haven't posted anything yet. Your first entry will show up here.",
  'SCR-02.empty.nearby': 'No entries nearby right now.',
  'SCR-02.empty.popular': 'No entries to show right now.',
  'SCR-02.empty.recent': 'No entries to show right now.',
  'SCR-02.nearby.permission_denied':
    'Nearby needs location access. Turn it on in Settings to see entries near you.',
  'SCR-02.nearby.permission_needed': 'See entries near you - allow location access?',
  'SCR-03.empty.no_results': 'No results for {term}',
  'SCR-03.error': "Couldn't load results. Check your connection and try again.",
  'SCR-03.idle': 'Search entries and people',
  'SCR-04.empty.region': 'No entries in this area.',
  'SCR-04.error.unavailable': "Map isn't available right now.",
  'SCR-05.empty': 'No entries tagged #{tag}',
  'SCR-06.comments_disabled': 'Comments are turned off for this journal.',
  'SCR-06.empty.comments': 'No comments yet. Be the first.',
  'SCR-06.error.load_generic': "Couldn't load this entry. Check your connection and try again.",
  'SCR-06.error.protected':
    "This entry is protected. You'll need to be an approved follower to see it.",
  'SCR-06.error.unavailable': 'This entry is no longer available.',
  'SCR-07.error.load': "This photo couldn't be loaded.",
  'SCR-08.empty': 'No camera information',
  'SCR-09.error.unusable_photo': "That photo can't be used. Please choose a different one.",
  'SCR-09.permission.camera_blocked':
    'Camera access is turned off in system settings. Turn it on there to take photos.',
  'SCR-09.permission.camera_refused':
    "Camera access is off, so you can't take a photo here. You can still choose one from your device.",
  'SCR-09.permission.open_settings': 'Open settings',
  'SCR-13.error.generic': "Couldn't save your changes. Check your connection and try again.",
  'SCR-14.empty':
    "No uploads yet. Entries you publish will show up here while they're on their way.",
  'SCR-15.error.post_failed': "Couldn't post your comment. Your text is still here - try again.",
  'SCR-16.error.no_reason': 'Select a reason',
  'SCR-17.empty.awards': 'No awards yet.',
  'SCR-17.empty.entries': "You haven't posted anything yet. Share your first entry from New Entry.",
  'SCR-17.empty.favourites': "You haven't favourited anything yet.",
  'SCR-17.empty.followers': 'No followers yet.',
  'SCR-17.empty.following': "You're not following anyone yet.",
  'SCR-18.error.load_generic': "Couldn't load this profile. Check your connection and try again.",
  'SCR-18.error.not_found': "This profile couldn't be found.",
  'SCR-19.empty.followers': 'No followers yet.',
  'SCR-19.empty.following': 'Not following anyone yet.',
  'SCR-20.empty': 'No pending requests',
  'SCR-21.empty': "You haven't refused anyone.",
  'SCR-21.header': "They can't see your journal. This doesn't hide their entries from you.",
  'SCR-22.empty': 'No awards yet',
  'SCR-23.empty': 'No notifications yet',
  'SCR-24.empty': 'No comments yet',
  'SCR-25.error.save_generic': "Couldn't save your changes. Check your connection and try again.",
  'SCR-29.row.delete_account': 'Delete my account',
  'SCR-29.row.delete_account.subtitle':
    'Opens your Blipfoto account settings on the web. Not specific to any account signed in here.',
  'SCR-29.row.help': 'Help',
  'SCR-29.row.icon_guide': 'Icon guide',
  'SCR-29.row.licences': 'Open-source licences',
  'SCR-29.row.link_handling': 'Open blipfoto.com links in this app',
  'SCR-29.row.privacy_policy': 'Privacy policy',
  'SCR-29.row.safety_privacy': 'Safety & privacy',
  'SCR-29.row.terms': 'Terms & legal',
  'SCR-29.safety_privacy.cutoff':
    "Want someone gone entirely? Make your journal private, remove them as a follower, hide them, and refuse any new request they send. That last step only becomes available once they actually ask again - it's a sequence, not one switch.",
  'SCR-29.safety_privacy.delete_comment':
    'Delete a comment - on your own entries, you can remove any comment, from anyone, straight away. No need to wait for a report.',
  'SCR-29.safety_privacy.hide':
    "Hide a member - you stop seeing their entries, comments and notifications. It's personal, immediate and reversible, and they're never told. It doesn't stop them seeing your journal or commenting on your entries.",
  'SCR-29.safety_privacy.intro':
    "A few different tools handle unwanted attention, and they do different jobs - here's what each one actually does.",
  'SCR-29.safety_privacy.refuse':
    "Refuse a follow request - they can't see your journal. Only available on a private journal, and only against a request - there's nothing to refuse from someone already following you (remove them instead).",
  'SCR-29.safety_privacy.remove_follower':
    'Remove a follower - ends the relationship. On a private journal they lose access, but they can ask to follow again; on a public journal your entries were never hidden from them anyway.',
  'SCR-29.safety_privacy.report':
    "Report - sends an entry or a comment to Blipfoto's moderators, who can act for everyone, not just you. Use this for anything that should be looked at more widely.",
  'SCR-30.error.load': "Couldn't load your accounts. Try again.",
  'SCR-31.empty': "You haven't hidden anyone.",
  'SCR-31.header':
    "You won't see their entries, comments or notifications. This doesn't stop them seeing your journal or commenting on it.",
  'SCR-31.public_journal_warning':
    'Your journal is public, so hidden members can still see your entries.',
  'UPGRADE.body':
    "{username} is signed in read-only, so it can't do that. Switch to read-write to continue - you'll be asked to sign in again for write access.",
  'UPGRADE.button.confirm': 'Switch to read-write',
  'UPGRADE.button.decline': 'Not now',
  'UPGRADE.error.scope_16':
    "This account doesn't have permission to do that. It's signed in read-only.",
  'UPGRADE.title': 'This account is read-only',
} as const;
