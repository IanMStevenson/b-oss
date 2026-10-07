# b-mobile — paths not yet tried on a real device

Things built and tested in jsdom and/or headless desktop Chromium, but not yet exercised on a real
Android phone. Add a section when something lands in that state; tick items off (or delete the
section) once they've been tried on a device, noting anything that behaved differently.

## Rich-text comment editor (b-oss#206)

Verified in headless Chromium with a mobile viewport, touch taps and a simulated IME composition
(`Input.imeSetComposition`). What a real soft keyboard does inside the Android WebView is the open
question. On the entry page, in each of the new-comment, reply and edit boxes:

- [ ] **Gboard typing with predictive text and autocorrect** — words build normally, the
      underline/suggestion strip works, accepting a suggestion or autocorrection replaces the word
      correctly, and nothing jumps or duplicates. Also inside bold text.
- [ ] **Swipe/glide typing** — whole words land in one go, including straight after a bold word.
- [ ] **Voice typing** (Gboard mic).
- [ ] **Select a word (long-press), then tap B** — the word goes bold, stays selected, and the
      keyboard stays up. Tap B again — it un-bolds. Same for I / U / S.
- [ ] **Tap B with nothing selected, then type** — new text is bold; tap B again and carry on —
      plain. The B button shows pressed while it's on.
- [ ] **Backspace across formatting** — at the start of a bold run, across a link, and deleting
      a whole link. Nothing unexpected is left behind (check by saving and reopening for edit).
- [ ] **Enter / blank lines** — new lines and a blank line between paragraphs survive Save and
      show the same in the posted comment.
- [ ] **Link from a selection** — long-press a word, tap the link button, enter `example.com`,
      Add link: the word becomes a link to `https://example.com`. The keyboard switching to the
      address field and back doesn't lose the selection.
- [ ] **Link with nothing selected** — the optional "Text to show" field appears; with it blank,
      the address becomes the text.
- [ ] **Tap a link in the box** — doesn't open a browser; with the caret in it, the link button
      reads "Edit link" and offers Update link / Remove link.
- [ ] **Paste** — long-press → Paste of text copied from Chrome (formatted) arrives as plain text,
      with its line breaks.
- [ ] **The box scrolls the caret into view** above the keyboard when typing a long comment
      (it grows to 60% of the screen height, then scrolls).
- [ ] **Edit an existing comment containing typed tags** (e.g. written on blipfoto.com as
      `[b]x[/b]`) — shows as bold in the box; Save keeps it as `[b]x[/b]`.
- [ ] **Draft survival** — type formatted text, swipe to another entry and back: the formatting
      is still there.
- [ ] **Post, then check the comment on blipfoto.com** — bold/italic/underline/strike/link
      render there as they did in the box.
