# About This Backup

## 1. What is this?

This folder is a backup of a personal photo journal from [Blipfoto](https://www.blipfoto.com), created using a tool called b-ark. Blipfoto is a long-running online journalling community built around the idea of one photo per day — each entry centres on a single image, accompanied by a title and description written by the journal's owner.

Journals vary enormously. Some people write extensively, others just a few words. Some post every day, others only occasionally. Some journals span twenty years and thousands of entries; others are just a handful. The writing is personal, often reflective, and rooted in the moment the photo was taken.

On the Blipfoto site, journals are browsed in two main ways: a thumbnail grid for navigation, and an individual entry page showing the photo, date, title, and description. Each entry may also include secondary details such as geographic location and camera (Exif) information, along with comments, replies, and engagement data such as views, likes, and favourites — which some users value highly.

This backup preserves all of that, organised as a set of JSON files and saved images. A full description of the structure and schema is in sections 5 and 6 below.

---

## 2. Example prompts

Here are some examples of things you could ask an AI to do with this backup. Feel free to adapt them.

**By date**

- _"Create a PDF document of all my entries from 2022"_
- _"Make a presentation of my entries between 1st and 31st August 2019"_

**By tag or keyword**

- _"Build a photo book of all my entries tagged 'walking'"_
- _"Create a presentation of entries where I mention my dog"_

**By engagement**

- _"Make a presentation of my 20 most favourited entries"_
- _"Create a spreadsheet showing how many entries I posted each month, and which got the most views"_

**By mood or theme**

- _"Find my 10 happiest-sounding entries and make a presentation"_
- _"Create a document of entries where I seem to be reflecting on getting older"_

**By camera or location**

- _"Make a photo book of everything I shot on my Fujifilm X100"_
- _"Create a presentation of all my entries taken in Japan"_

**Questions and searches**
Not every request needs to produce a document — sometimes you just want an answer. Try:

- _"What are the dates of all my entries that mention Brighton?"_
- _"Where did I buy the loganberry jam I mentioned?"_
- _"How many entries did I post in 2018, and which month was most active?"_
- _"What cameras have I used over the years?"_

---

## 3. Getting started

To use this backup with an AI, you first need to give the AI access to the files. There are a few ways to do this:

- **Claude Projects** (recommended) — Create a project at [claude.ai](https://www.claude.ai) and upload the backup folder. Claude will be able to read all the files and remember the context across your conversation. This is the easiest approach for most people.
- **Cowork** — Anthropic's Cowork tool can give Claude access to files directly on your computer without needing to upload them.
- **Other AI tools** — ChatGPT, Gemini, and Microsoft Copilot all have similar file upload capabilities. Claude is recommended because it handles large amounts of text well and follows complex instructions reliably, but the example prompts in section 2 should work with any capable AI.

Once the AI has access to your files, start by saying:

> _"Please read the README.md file in this backup before we start"_

Then use one of the example prompts from section 2, or describe what you'd like in your own words.

**A tip for large journals:** If you have hundreds or thousands of entries and want the AI to select based on something subjective — like mood or theme — it may help to ask the AI to work in two steps: first summarise all entries into a simple table (CSV file), then select from that table. If results seem incomplete, try asking explicitly: _"First create a summary table of all entries, then select the best ones from that."_

---

## 4. Instructions for the AI

_This section is addressed directly to the AI reading this file. If you are an AI, please follow these instructions when responding to requests about this backup._

### Understand the data before you start

Read this README fully before attempting any task. Familiarise yourself with the schema in section 5 and the file structure in section 6. The core content of each entry is the **title, date, body text, and primary image**. Everything else is supplementary.

### Three types of request: selection and output, conversational queries, and stats

User requests fall into three broad patterns:

1. **Selection + output** — the user wants to select a set of entries and produce a document, presentation, or other artefact from them. Most requests are of this type.
2. **Conversational query** — the user wants a direct answer rather than a document. For example: "What are the dates of all my entries that mention Brighton?" or "Where did I buy the loganberry jam I mentioned?" Respond conversationally. Do not produce a document unless asked.
3. **Stats and analysis** — the user wants counts, summaries, or patterns across the journal. For example: "How many entries did I post each year?" or "What cameras have I used?" These may warrant a table or spreadsheet, but confirm the format before proceeding.

For types 1 and 3, identify the selection criterion and output format before you start. If the selection criterion is ambiguous or cannot be resolved from the data, ask the user to clarify rather than guessing. For example, if a user asks for "my Japan trip", ask them for a date range or tag rather than attempting to infer it from narrative text.

Note that conversational queries (type 2) can require the same two-pass approach described in the next section — for example, answering "which entry did I mention buying loganberry jam?" may require reading all entries before responding. Apply that technique when the journal is large enough to make a single pass unreliable.

### Use a two-pass approach for subjective or semantic selection

If the user's request requires judging or scoring entry content — for example "happiest", "most reflective", "best written", "most eventful" — do **not** attempt to evaluate all entries in a single pass. Instead:

**Pass 1:** Read each entry and produce a CSV with at minimum: entry ID, date, title, a relevance or score value (1–10), and a one-line rationale.

**Pass 2:** Select the top entries from the CSV and produce the requested output.

This approach is more reliable and handles large journals that would otherwise exceed your context limits.

### Use a single pass for structured selection

For date ranges, specific tags, engagement counts, or camera model, a single pass is fine. Filter directly from the JSON fields as described in the schema.

### Tags — use when asked, but never assume complete coverage

Tags are user-generated and freeform. If the user explicitly asks to filter by tag, do so. However, never assume that the presence of a tag means all relevant entries carry that tag. Even if entries tagged "JapanTrip" exist, there may be other Japan entries that were never tagged. When a user asks for entries about a topic or place without specifying tags, ask them whether they want to rely on tags, search the entry text, or both — rather than assuming tags are complete.

### Geographic selection

If the user asks for entries from a particular country or region, attempt to resolve this from the `latitude` and `longitude` fields if present. If location data is missing or sparse, ask the user for a date range or tag to use instead.

### Engagement data

Some users care a great deal about views, likes, and favourites. These fields are available in the schema and can be used for selection (e.g. "my most favourited entries") or for stats output (e.g. a spreadsheet of engagement over time).

### Exif data

Camera and lens metadata is available but is of minority interest. Do not surface it unless the user specifically asks for it, or unless the task is explicitly about photography (e.g. "what cameras have I used most?"). Treat it as all-or-nothing — either include the full Exif block or omit it entirely.

### Output formats

Produce whatever format the user requests. Common outputs include presentations, PDF documents, photo books, static web pages, and spreadsheets. Use the nature of the content to guide the format — title, date, and a single image suggest a slide; body text with date suggests a narrative document; scored or counted data suggests a table. If the user does not specify a format, suggest the most natural one for their request and confirm before proceeding.

---

## 5. Data schema

There are two types of JSON file in this backup.

### journal.json — the index

`journal.json` sits at the root of this folder and is the starting point for any task. It contains a lightweight summary of every entry in the journal.

```json
{
  "schema_version": 1,
  "username": "morninglight",
  "journal_title": "Morning Light",
  "avatar_url": "https://...",
  "entry_total": 1847,
  "last_backup_at": "2024-11-03T14:22:21.007Z",
  "entries": [
    {
      "entry_id": "7284019365482910573",
      "date": "2019-08-14",
      "title": "Late tide",
      "thumbnail_path": "entries/2019/2019-08-14-t.jpg",
      "json_path": "entries/2019/2019-08-14.json"
    }
  ]
}
```

The `entries` array is sorted **newest-first**. Each item is a summary; the full content of each entry is in its own JSON file at the path given by `json_path`.

| Field                      | Type              | Description                               |
| -------------------------- | ----------------- | ----------------------------------------- |
| `username`                 | string            | Journal owner's username                  |
| `journal_title`            | string            | Display title of the journal              |
| `avatar_url`               | string            | URL of the owner's avatar image           |
| `entry_total`              | number            | Total number of entries                   |
| `last_backup_at`           | ISO 8601 string   | When the backup was last run              |
| `entries[].entry_id`       | string            | Unique entry identifier                   |
| `entries[].date`           | YYYY-MM-DD string | Entry date                                |
| `entries[].title`          | string            | Entry title                               |
| `entries[].thumbnail_path` | string            | Relative path to the thumbnail image      |
| `entries[].json_path`      | string            | Relative path to the full entry JSON file |

### Entry JSON files — entries/YYYY/YYYY-MM-DD.json

Each entry has its own JSON file containing the full text and metadata.

```json
{
  "schema_version": 1,
  "entry_id": "7284019365482910573",
  "date": "2019-08-14",
  "title": "Late tide",
  "username": "morninglight",
  "description": "Walked down to the shore after lunch. The tide was further out than I've seen it all summer, leaving long rippled banks of sand.",
  "description_html": "Walked down to the shore after lunch. The tide was further out than I've seen it all summer, leaving long rippled banks of sand.",
  "tags": ["shore"],
  "location": { "lat": 56.098961, "lon": -4.561446 },
  "views_total": 71,
  "stars_total": 3,
  "favorites_total": 0,
  "comments": [
    {
      "comment_id": "...",
      "parent_id": null,
      "commenter_username": "paperboatphoto",
      "commenter_avatar_url": "https://...",
      "content": "Gorgeous light on the sand.",
      "content_html": "Gorgeous light on the sand.",
      "replies": []
    }
  ],
  "exif": {
    "make": "samsung",
    "model": "Galaxy S25 Ultra",
    "camera": "Samsung Galaxy S25 Ultra",
    "exposure_time": "1/3333",
    "f_number": "f/1.7",
    "focal_length": "6mm",
    "iso": "40"
  },
  "images": {
    "thumbnail": "entries/2019/2019-08-14-t.jpg",
    "image": "entries/2019/2019-08-14.jpg"
  },
  "backed_up_at": "2024-11-03T14:22:18.441Z",
  "backup_app_version": "0.1.0"
}
```

**Core content fields** (always present):

| Field              | Type              | Description                                                                               |
| ------------------ | ----------------- | ----------------------------------------------------------------------------------------- |
| `entry_id`         | string            | Unique entry identifier                                                                   |
| `date`             | YYYY-MM-DD string | Entry date                                                                                |
| `title`            | string            | Entry title                                                                               |
| `description`      | string            | Body text (plain text)                                                                    |
| `description_html` | string            | Body text as HTML; differs from `description` when the entry contains formatting or links |
| `tags`             | string array      | User-assigned tags; empty array if none                                                   |
| `views_total`      | number            | Total view count                                                                          |
| `stars_total`      | number            | Total likes received                                                                      |
| `favorites_total`  | number            | Total times added to favourites                                                           |
| `comments`         | array             | Comment thread (see below)                                                                |

**Optional / nullable fields:**

| Field              | Type                     | Notes                                                                                  |
| ------------------ | ------------------------ | -------------------------------------------------------------------------------------- |
| `location`         | `{ lat, lon }` or `null` | GPS coordinates if the user recorded a location                                        |
| `exif`             | object or `null`         | Camera and lens metadata if available; all sub-fields are strings or `null`            |
| `images.thumbnail` | string                   | Relative path to the thumbnail image; present only if downloaded                       |
| `images.image`     | string                   | Relative path to the main display image; present only if downloaded                    |
| `images.original`  | string                   | Relative path to the original-quality image; present only if available and downloaded  |
| `images.hires`     | string                   | Relative path to the high-resolution variant; present only if available and downloaded |

The `images` object contains only the variants that were successfully downloaded. For most entries, `thumbnail` and `image` are present; `original` and `hires` are less commonly available.

**Comments** (the `comments` array; `replies` follow the same structure recursively):

| Field                  | Type             | Description                                                            |
| ---------------------- | ---------------- | ---------------------------------------------------------------------- |
| `comment_id`           | string           | Unique comment identifier                                              |
| `parent_id`            | string or `null` | ID of parent comment if this is a reply; `null` for top-level comments |
| `commenter_username`   | string           | Username of the commenter                                              |
| `commenter_avatar_url` | string           | URL of the commenter's avatar image                                    |
| `content`              | string           | Comment text (plain text)                                              |
| `content_html`         | string           | Comment text as HTML                                                   |
| `replies`              | array            | Nested replies, same structure                                         |

**Exif fields** (all strings or `null`): `make`, `model`, `camera` (full formatted name), `exposure_time`, `f_number`, `focal_length`, `iso`.

---

## 6. File structure

```
{username}/
├── README.md                 ← this file
├── journal.json              ← index of all entries (start here)
├── avatar.jpg                ← journal owner's avatar image
├── index.html                ← b-view journal browser (open in a web browser)
├── b-view/                   ← viewer assets
└── entries/
    ├── 2006/
    │   ├── 2006-03-14.json       ← full entry data
    │   ├── 2006-03-14-t.jpg      ← thumbnail
    │   ├── 2006-03-14.jpg        ← main display image
    │   ├── 2006-03-14-o.jpg      ← original quality (if available)
    │   └── 2006-03-14-h.jpg      ← high-res variant (if available)
    ├── 2007/
    │   └── ...
    └── 2026/
        └── ...
```

Entries are organised one subfolder per year. Within each year folder, the files for each entry share a base filename derived from the entry date:

| File               | Description                                                          |
| ------------------ | -------------------------------------------------------------------- |
| `YYYY-MM-DD.json`  | Full entry content: text, tags, location, engagement, comments, Exif |
| `YYYY-MM-DD-t.jpg` | Thumbnail image (small, used for grid views)                         |
| `YYYY-MM-DD.jpg`   | Main display image                                                   |
| `YYYY-MM-DD-o.jpg` | Original-quality image (not always available)                        |
| `YYYY-MM-DD-h.jpg` | High-resolution variant (not always available)                       |

**b-view viewer:** `index.html` and the `b-view/` folder are a built-in journal browser. Open `index.html` in a web browser to browse the journal visually. These files are not needed for AI tasks.

**Internal files:** Files beginning with `_` (such as `_log.ndjson` and `_checkpoint.json`) are used by the backup tool and can be ignored.
