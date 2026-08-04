// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// FLW-07 — post/edit/delete a comment or reply. Pure API wrappers; SCR-15 owns the compose UI and
// discard-guard, SCR-06 owns the inline delete affordance and the "reload to show it" step on
// success (rules.md: no client-side comment cache to patch optimistically into).

import { getClient } from '../data/client.js';
import type { CommentResponse } from '@b-oss/b-api';

export async function postComment(params: {
  entryId: string;
  content: string;
  parentId?: string;
}): Promise<CommentResponse> {
  const client = await getClient();
  return client.postComment(params);
}

export async function editComment(params: {
  commentId: string;
  content: string;
}): Promise<CommentResponse> {
  const client = await getClient();
  return client.updateComment(params);
}

export async function deleteComment(commentId: string): Promise<void> {
  const client = await getClient();
  await client.deleteComment(commentId);
}
