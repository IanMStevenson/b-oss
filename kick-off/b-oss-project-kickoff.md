# B-oss Project Kick-off

I've decided to build an app to allow users to back up their content from Blipfoto.  

This may be one of a family of apps, so I am building in a way that modularises reusable functionality.  

The overarching  project is called B-oss (which stands for Blipfoto Open Source Software).  The initial Backup program is B-ark ("ark" signifying a place of safety for backup).  This was previously referred to as blipark - but I need to avoid using "blip" to protect the trademark so please all reference to blipark should become b-ark

Some preparatory work has already been done, and this file captures that thinking.

This file is in b-oss\kick-off and captures the thinking done so far.  The folder also  includes scraped blipfoto API documentation (blipfoto-api folder) and preliminary design work for b-ark (the b-ark-design folder) carried out by Claude Design.  There is a README.md file in that folder to help comprehension of what is there and with implementation instructions.

This document also contains User Flows (fed into Claude Design).

I now want to start designing the project and architecture.

# Project Setup

The project will be released as Open Source on Github "B-oss"

The project includes B-Ark but subject to architectural choices yet to be made there may be elements (e.g. Blipfoto API wrapper) that are reusable libraries, and other elements that are standalone or shared.  

For example, I intend to create a static REACT site that can be used locally on the computer or uploaded to hosting to view a backup folder (B-view).  This will be bundled with B-Ark but may also live separately.

B-Ark is initially going to be implemented in Electron, but SOME of the code (e.g. creating a backup manually and viewing it) may well also go into a future Android app, so I'd like the UI to be as separate as possible from the wrapper, with platform dependencies isolated through a well defined interface so as to maximise reusability.  The JSON structure used in the backup will also be re-usable in other projects.  The setup should reflect this.  I'm not planning on formally building things as separate libraries, but it would be good if they could be shared.

I will start with it private, then before going public with a clean working version will do git checkout --orphan main-public.

From the start I want to build (and maintain)  `README.md`, `LICENSE`, `.gitignore`  and a `CONTRIBUTING.md`.  THis is a GPLv3 project.

I have a strong preference for using Typescript.  The Claude Code configuration should have a post-action hook to run type checking and allow Claude Code to fix any errors before proceeding.



# User Flows

BlipArk is a tool that allows a user to back up entries from (one or more) Blipfoto Journals by attaching to their account using an API and running a set of functions to create a local backup on disk.

 The Blipfoto website has a clean white background, and I'd like my site to have the same. I'd like main text etc to be black, using a simple sans serif font. Top banner bar should be some sort of calm and tasteful dark green with a white "blipark" text for logo. Main icons, highlights etc should all use (or riff on) the green theme.

**General**

The app is a "singleton",  it launches once and when "closed" runs in the background with a system tray icon.  Clicking the icon re-opens the app.  There is a right click menu with "Open" and "Exit" options.  Exit is the only way of actually ending execution.  Running the app again from the start menu opens the existing instance.

 **First Open**

 The user opens the app for the first time (usually after installation)

 The main canvas shows a prompt to "Add Account"

 When the user accepts this invitation, they are taken through the BlipFoto Oauth process (using their browser for the actual login). 

 The app shows a "success" screen, showing the journal name, user name, profile picture, number of entries etc.

 There is a "Set Up Now" button,

 This takes us the settings screen for the account.

 **Subsequent Open - Home Screen**

 The app shows a list of added accounts down the left. These are identified by journal name and user name (less prominent) and profile photo. Each account has a RAG (Red/Amber/Green) indicator

 Green indicates the account is fully set up and backup completed as scheduled at the last configured time

Amber indicates the account is fully set up but that the backup is not up to date. This could be because the machine has only just been turned on after the last backup run, the initial backup has not completed etc.

Red indicates the last backup failed or setup information is missing.

 The top account shows as selected. The user can change the selection by clicking a different account.

 The list allows the user to drag the entries into a different order

 The main section of the screen shows square thumbnails for recent blips in a grid, filling the available space but without ever having and image cropped by the edge of the window. There are controls to adjust the thumbnail size (Increase or decrease by 10% say) with a reset to default option. There is also a "settings" control (gear), a "view" control (icon?) and a "backup now" control (icon?)
 At the bottom underneath the thumbnails a status bar provides information including the total number of archived blips, date of last archived entry, date of last successful backup etc, and shows the RAG status prominently.  It will also show a brief error message, and a way to access logs.

**Log Screen

** The log screen takes up the whole right panel area and has a close button at the top right. While it is visible, the menu items for other accounts are greyed out and disabled.

It displays a tabular version of the log, timestamps and entries, with colour coded icons to differentiate "Error" (Red cross), "Warning" (Amber), "Success" (Green tick) and "Info" (blue i)


 **Settings Screen**

 The settings screen takes up the whole right panel area and has a close button at the top right. While it is visible, the menu items for other accounts are greyed out and disabled. 

 The settings screen contains all the settings for the project. It will add more and may need to scroll down

The first setting is "Folder". A text box to edit a path, with a button next to it for a Folder Picker

 The next setting is a scheduler. It should show the time of the next "scheduled run" specified as a date (show as editable text with a date picker button) and time (time should be specified as a round hour using a dropdown: From 00:00, 01:00, 02:00 etc. Finally it should contain an interval selector dropdown (daily, weekly, monthly).

 The next setting is "Gap Check". An integer box that specifies how far back the system should check for gaps to fill in (default 31)

 The next setting is "Redo". An integer entry box, which specifies the number of recent entries to update on each backup pass (default 7)

 

# Blipfoto Backup App — Design Capture

## MoSCoW Requirements

### Must
- Use OAuth to log in to Blipfoto (localhost redirect confirmed supported)
- Have a user-friendly UI
- Be available to Windows users
- NOT depend on expensive hosting or cloud services (static hosting acceptable)
- Be possible to release as open source
- Save and update image/text files on the local filesystem

### Should
- Be available to Mac users (via open source contributor model — see below)
- Offer automated backup on a schedule (constrained to when app is running)

### Could
- Generate static HTML locally so the user can browse the backup in a browser
- Include a local React-based viewer that reads the backup data files directly
- Be available on Linux (falls out of the build setup naturally)

### Won't
- Be a native Android or iOS app
- Have complicated dependencies for the user to install
- Be a Chrome browser extension (considered and rejected)
- Require admin/elevated permissions to install

---

## Technology Stack Decisions

| Concern | Decision |
|---|---|
| App framework | Electron |
| UI framework | React |
| Packaging | electron-builder, NSIS per-user installer (no admin required) |
| Distribution | GitHub Releases |
| Auto-update | electron-updater (integrated with GitHub Releases) |
| OAuth flow | System browser → localhost redirect (not embedded webview) |
| CI / Mac builds | GitHub Actions — structurally ready from project start, Mac workflow stubbed/commented until a Mac contributor validates and owns it |
| Project hosting | GitHub (open source) |

---

## Data & File Format Decisions

- **Structured metadata:** JSON (one file or optionally split by year)
- **Images:** Flat files in a folder hierarchy
- **Per-blip text:** Optional Markdown sidecar files with YAML frontmatter for metadata — human-readable in any text editor, renderable in VS Code, GitHub, Obsidian etc.
- Year-based partitioning is a user option to keep folder sizes manageable

---

## Features Mentioned But Not Yet Designed

These emerged in discussion and need scoping in a future session:

- **Local HTML generation** — app generates a static HTML site from backup data so the user can browse their journal in a browser without the app open
- **Local React viewer** — alternative to static HTML; a mini React app installed alongside the backup that reads the JSON/image files directly and provides a richer browsing UI
- **Scheduled/automatic backup** — app runs in system tray (Windows taskbar / Mac menu bar), performs backup on a schedule without user intervention; no dependency on OS task scheduler
- **Start with Windows** — option to launch app at login so tray-based scheduling works without manual launch
- **Incremental backup** — only fetch blips since last backup run; needed to work within Blipfoto API rate limits for ongoing use
- **Progress UI** — long-running backup jobs need feedback given API rate limiting

---

## Open Questions Parked for Later

- Do Blipfoto image URLs require authenticated requests, or are they publicly accessible once metadata is fetched? (Affects download implementation detail, not architecture)
- Code signing: a certificate (~£60–100/year, e.g. Certum or Sectigo) eliminates Windows SmartScreen warnings and smoother auto-update. Not needed for development or early users, but worth revisiting before wider distribution.
- Exact JSON schema for blip metadata — design when building the API integration layer
- Whether the local viewer is static HTML generation or a React app — both consume the same JSON, so defer until backup core is working

---

## Mac Build Strategy

Mac builds require macOS (Apple code signing cannot be cross-compiled). The agreed approach:

- `electron-builder` config covers all three targets (Windows, Mac, Linux) from the start
- GitHub Actions workflow for Mac build is included but disabled/commented in the repo
- `CONTRIBUTING.md` explicitly calls out Mac build owner as a wanted contribution
- A community Mac user validates, enables, and owns the Mac build pipeline

