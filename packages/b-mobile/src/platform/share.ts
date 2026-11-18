// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps @capacitor/share: the system share sheet (copy, nearby share, any installed app). On
// Android the plugin sends one ACTION_SEND text, joining `text` and `url` — so recipients get a
// single message with a link in it, not a separate link attachment. Web fallback is the Web
// Share API where the browser has it, otherwise nothing (browser-mode development only).

import { Share } from '@capacitor/share';
import { isCapacitorNative } from './platformKind.js';
import { copyErrorDetails } from './diagnostics.js';
import { desktopBridge } from './desktop.js';

export interface ShareLinkOptions {
  url: string;
  text?: string;
  title?: string;
  dialogTitle?: string;
}

/** Closing the sheet without picking anything isn't an error worth surfacing. */
function isCancellation(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  return err instanceof Error && /cancel/i.test(err.message);
}

/** `shared`: a share sheet was used (or cancelled). `copied`: no share sheet exists (the desktop
 * shell, whose Chromium has no Web Share API), so the link went to the clipboard instead. */
export type ShareOutcome = 'shared' | 'copied';

export async function shareLink(options: ShareLinkOptions): Promise<ShareOutcome> {
  try {
    if (isCapacitorNative()) {
      await Share.share(options);
    } else if (typeof navigator.share === 'function') {
      await navigator.share({ url: options.url, text: options.text, title: options.title });
    } else if (desktopBridge() !== undefined) {
      await copyErrorDetails(options.url);
      return 'copied';
    }
  } catch (err) {
    if (!isCancellation(err)) throw err;
  }
  return 'shared';
}
