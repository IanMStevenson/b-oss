// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Service worker. Its only job in this spike is to open the *writer* page as an
// UNFOCUSED BACKGROUND TAB (active: false). A freshly created tab does not inherit
// transient user activation, so whatever the writer manages to do, it does without
// a gesture — exactly the situation the real auto-launch backup tab would be in.

chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('setup.html'), active: true });
});

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('writer.html'), active: false });
});
