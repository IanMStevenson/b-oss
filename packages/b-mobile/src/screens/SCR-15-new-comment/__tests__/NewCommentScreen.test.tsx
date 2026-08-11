// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import type { ComponentProps } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { NewCommentScreen } from '../NewCommentScreen.js';

const { postComment, editComment } = vi.hoisted(() => ({
  postComment: vi.fn(),
  editComment: vi.fn(),
}));
vi.mock('../../../flows/commentsFlow.js', () => ({ postComment, editComment }));

const goBack = vi.fn();
vi.mock('../../../app/routes/useAppNavigate.js', () => ({
  useAppNavigate: () => ({ push: vi.fn(), replace: vi.fn(), goBack }),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderScreen(props: Partial<ComponentProps<typeof NewCommentScreen>> = {}) {
  return render(
    <MemoryRouter>
      <NewCommentScreen entryId="1" {...props} />
    </MemoryRouter>,
  );
}

describe('NewCommentScreen', () => {
  it('disables OK until there is text, then posts a new top-level comment', async () => {
    postComment.mockResolvedValue({ comment: {} });
    renderScreen();
    const ok = screen.getByText('OK');
    await waitFor(() => expect(ok.hasAttribute('disabled')).toBe(true));

    const textarea = screen.getByPlaceholderText('Your comment…');
    await userEvent.type(textarea, 'Nice photo!');
    await waitFor(() => expect(ok.hasAttribute('disabled')).toBe(false));

    await userEvent.click(ok);
    await waitFor(() =>
      expect(postComment).toHaveBeenCalledWith({
        entryId: '1',
        content: 'Nice photo!',
        parentId: undefined,
      }),
    );
    expect(goBack).toHaveBeenCalled();
  });

  it('attaches a reply to its parent comment', async () => {
    postComment.mockResolvedValue({ comment: {} });
    renderScreen({ replyToCommentId: 'c1' });
    expect(screen.getByText('Reply')).toBeDefined();
    await userEvent.type(screen.getByPlaceholderText('Your comment…'), 'Thanks!');
    await userEvent.click(screen.getByText('OK'));
    await waitFor(() =>
      expect(postComment).toHaveBeenCalledWith({
        entryId: '1',
        content: 'Thanks!',
        parentId: 'c1',
      }),
    );
  });

  it('seeds the editor with existing text when editing, and commits an update not a new comment', async () => {
    editComment.mockResolvedValue({ comment: {} });
    renderScreen({ editCommentId: 'c1', editInitialContent: 'Original text' });
    expect(screen.getByText('Edit comment')).toBeDefined();
    const textarea = screen.getByPlaceholderText<HTMLTextAreaElement>('Your comment…');
    expect(textarea.value).toBe('Original text');

    await userEvent.click(screen.getByText('OK'));
    await waitFor(() =>
      expect(editComment).toHaveBeenCalledWith({ commentId: 'c1', content: 'Original text' }),
    );
    expect(postComment).not.toHaveBeenCalled();
  });

  it('keeps the text and shows an error on a post failure', async () => {
    postComment.mockRejectedValue(new Error('Network down'));
    renderScreen();
    await userEvent.type(screen.getByPlaceholderText('Your comment…'), 'Hello');
    await userEvent.click(screen.getByText('OK'));
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeDefined();
    expect(screen.getByPlaceholderText<HTMLTextAreaElement>('Your comment…').value).toBe('Hello');
    expect(goBack).not.toHaveBeenCalled();
  });

  it('confirms discard when cancelling with text entered', async () => {
    renderScreen();
    await userEvent.type(screen.getByPlaceholderText('Your comment…'), 'Half-written');
    await userEvent.click(screen.getByLabelText('Back'));
    expect(await screen.findByText('Discard comment?')).toBeDefined();
    expect(goBack).not.toHaveBeenCalled();
  });

  it('goes straight back with no confirmation when there is no text', async () => {
    renderScreen();
    await userEvent.click(screen.getByLabelText('Back'));
    expect(goBack).toHaveBeenCalled();
  });
});
