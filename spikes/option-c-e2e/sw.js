// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Convenience only: open the proof page on install and on toolbar-icon click.
// The proof itself runs entirely in page.js (the extension page) — the SW does no work.

const PAGE = 'page.html';

chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL(PAGE), active: true });
});

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL(PAGE), active: true });
});
