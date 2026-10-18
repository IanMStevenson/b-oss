// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps @capacitor/share: the system share sheet (copy, nearby share, any installed app). On
// Android the plugin sends one ACTION_SEND text, joining `text` and `url` — so recipients get a
// single message with a link in it, not a separate link attachment. Web fallback is the Web
// Share API where the browser has it, otherwise nothing (browser-mode development only).

import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';

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

export async function shareLink(options: ShareLinkOptions): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      await Share.share(options);
    } else if (typeof navigator.share === 'function') {
      await navigator.share({ url: options.url, text: options.text, title: options.title });
    }
  } catch (err) {
    if (!isCancellation(err)) throw err;
  }
}
