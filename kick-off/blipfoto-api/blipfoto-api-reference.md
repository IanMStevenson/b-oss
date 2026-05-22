# Blipfoto API Reference

> Source: https://www.blipfoto.com/developer/api/general

---

## Objects

Each formal object includes an `object` property containing the name of the object.

---

### Award

An Award object represents an award, optionally in the context of a recipient user.

| Name | Description | Datatype |
|------|-------------|----------|
| `award_id` | The award's unique ID. | integer |
| `icon_url` | The URL of the award's icon. | string |
| `added_stamp` | The timestamp when the award was given to the recipient, otherwise null. | integer\|null |
| `secret` | 1 if the award should be displayed as a secret award, otherwise 0. | integer |

```json
{
    "object":       "Award",
    "award_id":     1,
    "award_id_str": "1",
    "icon_url":     "http://www.blipfoto.com/_assets/images/awards/150/f8350fca318385ca732f08722d9bb6fe78a9be9d.png",
    "added_stamp":  1407321393,
    "secret":       0
}
```

---

### Day

A Day object represents a calendar day in a user's journal.

| Name | Description | Datatype |
|------|-------------|----------|
| `day` | The day of the month (from 1 to 31). | integer |
| `month` | The number of the month (from 1 to 12). | integer |
| `year` | The year. | integer |
| `state` | 0 = empty; 1 = has entry; 2 = entry suspended; 3 = future; 4 = too far in past; 5 = entry blocked | integer |
| `entry` | If state is 1, the Entry object; otherwise null. | Entry\|null |
| `actions.publish` | 1 if the user can publish an entry for this day, otherwise 0. | integer |

```json
{
    "object":  "Day",
    "day":     2,
    "month":   7,
    "year":    2014,
    "state":   1,
    "entry":   {
        "entry_id":      1897625808411822043,
        "entry_id_str":  "1897625808411822043",
        "date":          "2014-04-02",
        "date_stamp":    1396396801,
        "title":         "Circuit board",
        "username":      "gbradley",
        "location":      { "lat": 1.23, "lon": 4.56 },
        "thumbnail_url": "http://dev.blipfoto-thumbnail.s3-website-eu-west-1.amazonaws.com/9524901bf06e7ca5c3a7d6ef593d82af5ae8ef71.jpg",
        "image_url":     "http://dev.blipfoto-lores.s3-website-eu-west-1.amazonaws.com/9524901bf06e7ca5c3a7d6ef593d82af5ae8ef71.jpg"
    },
    "actions": { "publish": 0 }
}
```

---

### Comment

A Comment object represents a comment on a journal entry.

| Name | Description | Datatype |
|------|-------------|----------|
| `comment_id` | The comment's unique ID. | integer |
| `parent_id` | The comment parent's unique ID, or null for top-level comments. | integer\|null |
| `entry_id` | The unique ID of the entry to which this comment belongs. | integer\|null |
| `thumbnail_url` | The URL of a thumbnail image to display next to the comment. | string |
| `content` | The comment's content, which may contain markup. | string |
| `content_html` | The comment's content formatted as HTML. | string |
| `commenter` | The user who added the comment. | User |
| `actions.reply` | 1 if the authenticated user can reply, otherwise 0. | integer |
| `actions.edit` | 1 if the authenticated user can edit, otherwise 0. | integer |
| `actions.delete` | 1 if the authenticated user can delete, otherwise 0. | integer |
| `replies` | Array of reply Comment objects if `include_replies=1`, otherwise null. | array(Comment)\|null |

```json
{
    "object":         "Comment",
    "comment_id":     1928046815702159001,
    "comment_id_str": "1928046815702159001",
    "parent_id":      null,
    "parent_id_str":  null,
    "entry_id":       1918634075648690853,
    "entry_id_str":   "1918634075648690853",
    "thumbnail_url":  "http://dev.blipfoto-thumbnail.s3-website-eu-west-1.amazonaws.com/0bcddb298620610456a3d4a064ef59e02a35a9a8.jpg",
    "content":        "[i]Test[/i] comment from API",
    "content_html":   "<i>Test</i> comment from API",
    "commenter":      {
        "username":   "GBradley",
        "avatar_url": "...",
        "icons":      []
    },
    "actions":        { "reply": 1, "edit": 0, "delete": 0 },
    "replies":        []
}
```

---

### Entry

A Entry object represents a journal entry.

| Name | Description | Datatype |
|------|-------------|----------|
| `entry_id` | The entry's unique ID. | integer |
| `date` | The date of the entry in YYYY-MM-DD format. | string |
| `date_stamp` | The epoch timestamp of the entry. | integer |
| `title` | The title of the entry. | string |
| `username` | The username of the user the entry belongs to. | string |
| `location` | WSG84 coordinate object (`lat`, `lon`), or null. | Object\|null |
| `thumbnail_url` | The URL of the entry's thumbnail image. | string |
| `image_url` | The URL of the entry's standard image. | string |

```json
{
    "object":        "Entry",
    "entry_id":      1899847490933359629,
    "entry_id_str":  "1899847490933359629",
    "date":          "2014-04-06",
    "date_stamp":    1396742401,
    "title":         "Window Shopping",
    "username":      "Leanne",
    "location":      { "lat": 55.958994, "lon": -3.212567 },
    "thumbnail_url": "http://blipfoto-thumbnail.s3-website-eu-west-1.amazonaws.com/c5273d515ce4c8b558a3dc54a40d270016df8a12.jpg",
    "image_url":     "http://blipfoto-lores.s3-website-eu-west-1.amazonaws.com/c5273d515ce4c8b558a3dc54a40d270016df8a12.jpg"
}
```

---

### Error

| Name | Description | Datatype |
|------|-------------|----------|
| `code` | The error code. | integer |
| `message` | A message describing the error. | string |

```json
{
    "object":  "Error",
    "code":    10,
    "message": "The resource is invalid."
}
```

See the Errors guide for the non-exhaustive list of possible error messages.

---

### Page

A Page object represents pagination in a response. Values may differ from request parameters if they lie outside allowed bounds.

| Name | Description | Datatype |
|------|-------------|----------|
| `index` | The page index (starting from 0). | integer |
| `size` | The maximum number of results returned per page. | integer |
| `more` | 1 if further pages can be fetched, otherwise 0. | integer |

```json
{
    "object": "Page",
    "index":  0,
    "size":   100,
    "more":   1
}
```

---

### Friendship

A Friendship object describes the follow status between two users.

| Name | Description | Datatype |
|------|-------------|----------|
| `source` | The username of the follower. | string\|null |
| `target` | The username of the user being followed. | string\|null |
| `state` | 0 = not following; 1 = following; 2 = pending; 3 = blocked | integer |
| `actions.follow` | 1 if the source can follow the target, otherwise 0. | integer |
| `actions.unfollow` | 1 if the source can unfollow the target, otherwise 0. | integer |

```json
{
    "object":  "Friendship",
    "source":  "gbradley",
    "target":  "S2",
    "state":   1,
    "actions": { "follow": 0, "unfollow": 1 }
}
```

---

### Token

A Token object represents an OAuth access token and its metadata.

| Name | Description | Datatype |
|------|-------------|----------|
| `access_token` | The access token string. | string |
| `scope` | The token scope. | string |
| `token_type` | The type of token; currently will be `bearer`. | string |
| `username` | The username of the user who owns the token. | string |

```json
{
    "object":       "Token",
    "access_token": "318daa058d523653d7d24415bfd71c4877918348",
    "scope":        "read,write",
    "token_type":   "bearer",
    "username":     "gbradley"
}
```

---

### User

A User object represents basic information about a single Blipfoto user.

| Name | Description | Datatype |
|------|-------------|----------|
| `username` | The user's unique username. | string |
| `avatar_url` | The URL for the user's avatar image. | string |
| `icons` | Array of icon objects, each with `icon_id` and `icon_url`. | array(object) |

```json
{
    "object":     "User",
    "username":   "GBradley",
    "avatar_url": "http://dev.blipfoto-avatar.s3-website-eu-west-1.amazonaws.com/1941089103172862634.jpg",
    "icons":      [
        { "icon_id": 1,     "icon_id_str": "1",     "icon_url": "http://gbradley.dev.blipfoto.com/_assets/images/icons/10.gif" },
        { "icon_id": 20000, "icon_id_str": "20000",  "icon_url": "http://gbradley.dev.blipfoto.com/_assets/images/icons/member.gif" }
    ]
}
```

---

## Resources

### Authorization levels

- **User** — requires a user access token
- **App** — requires app-level auth (client credentials); no user token needed

---

### GET config/countries

Returns an array of supported countries & territories. Apps may store the response locally and update it periodically.

**Authorization:** User / App

**Response:**

| Name | Description | Datatype |
|------|-------------|----------|
| `countries[].country_code` | The country's ISO 3166 code. | string |
| `countries[].title` | The country's title (in English). | string |

---

### GET config/locales

Returns an array of supported locales.

**Authorization:** User / App

**Response:**

| Name | Description | Datatype |
|------|-------------|----------|
| `locales[].locale_code` | The unique code for the locale. | string |
| `locales[].title` | The locale's title (in English). | string |

---

### GET config/terms

Returns information about various terms used on the Blipfoto platform.

**Authorization:** User / App

**Response:**

| Name | Description | Datatype |
|------|-------------|----------|
| `reserved` | Array of terms which may not be used as usernames (non-exhaustive). | array(string) |

---

### GET entries/favorites

Return a page of a user's favorite entries.

**Authorization:** User / App

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `username` | Username of the journal owner. Omit to use authenticated user. | No |
| `page_index` | Page index to return. | No |
| `page_size` | Number of results per page. | No |

**Response:** `page` (Page), `entries` (Array(Entry))

---

### GET entries/following

Return a page of entries from users the authenticated user is following.

**Authorization:** User

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `page_index` | Page index to return. | No |
| `page_size` | Number of results per page. | No |

**Response:** `page` (Page), `entries` (Array(Entry))

---

### GET entries/journal

Return a page of entries from a journal.

**Authorization:** User / App

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `username` | Username of the journal owner. Omit to use authenticated user. | No |
| `page_index` | Page index to return. | No |
| `page_size` | Number of results per page. | No |

**Response:** `page` (Page), `entries` (Array(Entry))

---

### GET entries/recent

Return a page of recent entries.

**Authorization:** User / App

**Parameters:** `page_index`, `page_size` (both optional)

**Response:** `page` (Page), `entries` (Array(Entry))

---

### GET entries/popular

Return a page of popular entries.

**Authorization:** User / App

**Parameters:** `page_index`, `page_size` (both optional)

**Response:** `page` (Page), `entries` (Array(Entry))

---

### GET entries/new

Return a page of entries by new users.

**Authorization:** User / App

**Parameters:** `page_index`, `page_size` (both optional)

**Response:** `page` (Page), `entries` (Array(Entry))

---

### GET entries/search

Perform an entry search and return relevant results.

**Authorization:** User

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `query` | Text query; may include `#` or `@` shortcuts. | No |
| `location_type` | Filter by location: `radial` or `bounding_box`. | No |
| `lat` | Latitude of central coordinate (radial). | No |
| `lon` | Longitude of central coordinate (radial). | No |
| `distance` | Radius in kilometres (radial, default 20). | No |
| `min_lat` | Minimum latitude (bounding_box). | No |
| `max_lat` | Maximum latitude (bounding_box). | No |
| `min_lon` | Minimum longitude (bounding_box). | No |
| `max_lon` | Maximum longitude (bounding_box). | No |
| `sort` | `date` (most recent first), `relevancy`, or `location` (closest). | No |
| `page_index` | Page index to return. | No |
| `page_size` | Number of results per page. | No |

**Response:** `page` (Page), `entries` (array(Entry))

---

### GET entry

Return information about a journal entry.

**Authorization:** User / App

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `entry_id` | The unique ID of the entry. | No |
| `username` | If `entry_id` omitted, returns this user's most recent entry. Omit for authenticated user's most recent. | No |
| `return_details` | Pass 1 to include a `details` object. | No |
| `return_metadata` | Pass 1 to include a `metadata` object (EXIF). | No |
| `return_comments` | Pass 1 to include a `comments` object. | No |
| `include_replies` | With `return_comments=1`, pass 1 to include replies. | No |
| `return_related` | Pass 1 to include a `related` object (previous/next/year entries). | No |
| `return_friendships` | Pass 1 to include a `friendships` array. | No |
| `return_actions` | Pass 1 to include an `actions` object. | No |
| `return_image_urls` | Pass 1 to include an `image_urls` object. | No |

**Response:** `entry` (Entry), plus optional objects below.

#### details object (if `return_details=1`)

| Name | Description | Datatype |
|------|-------------|----------|
| `journal_title` | Title of the journal the entry belongs to. | string |
| `description` | Entry descriptive text (may contain markup). | string |
| `description_html` | Entry descriptive text as HTML. | string |
| `tags` | Array of tags. | Array(String) |
| `views.total` | Total number of views. | integer |
| `stars.total` | Total number of stars. | integer |
| `stars.starred` | 1 if authenticated user has starred the entry. | integer |
| `favorites.total` | Total number of favorites. | integer |
| `favorites.favorited` | 1 if authenticated user has favorited the entry. | integer |

#### metadata object (if `return_metadata=1`)

| Name | Description | Datatype |
|------|-------------|----------|
| `Make` | Camera make from EXIF. | String\|null |
| `Model` | Camera model from EXIF. | String\|null |
| `ExposureTime` | Exposure time from EXIF. | String\|null |
| `FNumber` | F-stop from EXIF. | String\|null |
| `FocalLength` | Focal length from EXIF. | String\|null |
| `ISO` | ISO from EXIF. | String\|null |
| `camera` | Pretty version of Make + Model. | String\|null |

#### comments object (if `return_comments=1`)

| Name | Description | Datatype |
|------|-------------|----------|
| `total` | Total number of comments. | integer |
| `list` | Array of comments. | Array(Comment) |

#### related object (if `return_related=1`)

| Name | Description | Datatype |
|------|-------------|----------|
| `previous` | Previous entry in the journal, or null. | Entry\|null |
| `next` | Next entry in the journal, or null. | Entry\|null |
| `year_ago` | Entry one year ago, or null. | Entry\|null |
| `year_ahead` | Entry one year ahead, or null. | Entry\|null |

#### actions object (if `return_actions=1`)

| Name | Description | Datatype |
|------|-------------|----------|
| `star` | 1 if authenticated user can star. | integer |
| `favorite` | 1 if authenticated user can favorite. | integer |
| `comment` | 1 if authenticated user can comment. | integer |
| `edit` | 1 = full edit, 2 = tags & location only, 0 = cannot edit. | integer |
| `delete` | 1 if authenticated user can delete. | integer |

#### image_urls object (if `return_image_urls=1`)

| Name | Description | Datatype |
|------|-------------|----------|
| `lores` | URL of low resolution image. | String\|null |
| `stdres` | URL of standard resolution image. | String\|null |
| `hires` | URL of high resolution image. | String\|null |
| `original` | URL of original image. | String\|null |

---

### POST entry

Publish a new journal entry.

**Authorization:** User

**Content-Type:** `multipart/form-data`

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `image` | The JPG image to upload. | Yes |
| `date` | Entry date in YYYY-MM-DD format. Defaults to EXIF `DateTimeOriginal` or current date. | No |
| `title` | Entry title (max 50 characters). | No |
| `description` | Entry description (may contain markup). | No |
| `tags` | Comma-separated list of tags. | No |
| `lat` | Latitude (WSG84). | No |
| `lon` | Longitude (WSG84). | No |
| `display_location` | Set to 1 to display entry on maps. | No |
| `thumbnail_crop` | Crop as `x,y,w` floats (0.0–1.0) of image dimensions. Invalid values are ignored. | No |
| `facebook_publish_entry` | 1 to share, 0 to not share (overrides user default for this entry). | No |
| `twitter_publish_entry` | 1 to share, 0 to not share (overrides user default for this entry). | No |
| `gmt_offset` | Difference in whole hours between GMT and local device time. | No |
| `exif_Make` | Override camera make. | No |
| `exif_Model` | Override camera model. | No |
| `exif_ExposureTime` | Override exposure time. | No |
| `exif_FNumber` | Override F-number. | No |
| `exif_FocalLength` | Override focal length. | No |
| `exif_ISO` | Override ISO. | No |
| `exif_Orientation` | Override orientation (integer 0–8). | No |

**Response:** `entry` (Entry)

---

### PUT entry

Update an existing journal entry. The value of the `edit` action determines which parameters are accepted.

**Authorization:** User

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `entry_id` | The entry's unique ID. | Yes |
| `image` | Replacement JPG image. | No |
| `date` | Entry date in YYYY-MM-DD. | No |
| `title` | Entry title (max 50 characters). | No |
| `description` | Entry description (may contain markup). | No |
| `tags` | Comma-separated list of tags. | No |
| `lat` | Latitude (WSG84). | No |
| `lon` | Longitude (WSG84). | No |
| `display_location` | 1 to enable map display, 0 to disable. | No |
| `exif_Make` / `exif_Model` / `exif_ExposureTime` / `exif_FNumber` / `exif_FocalLength` / `exif_ISO` / `exif_Orientation` | Override EXIF fields. | No |

**Response:** `entry` (Entry)

---

### DELETE entry

Delete a journal entry.

**Authorization:** User

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `entry_id` | The entry's unique ID. | Yes |

**Response:** `success` (integer)

---

### POST entry/comment

Add a comment to an entry.

**Authorization:** User

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `entry_id` | The ID of the entry to comment on. | Yes |
| `content` | The comment's content (may contain markup). | Yes |
| `parent_id` | Parent comment's ID if replying. | No |

**Response:** `comment` (Comment)

---

### DELETE entry/comment

Delete a comment.

**Authorization:** User

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `comment_id` | The comment's unique ID. | Yes |

**Response:** `success` (integer)

---

### PUT entry/comment

Edit a comment.

**Authorization:** User

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `comment_id` | The ID of the comment to edit. | Yes |
| `content` | The comment's new content (may contain markup). | Yes |

**Response:** `comment` (Comment)

---

### POST entry/favorite

Favorite an entry.

**Authorization:** User

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `entry_id` | The entry's unique ID. | Yes |

**Response:** `success` (integer)

---

### POST entry/report

Report an entry. At least one valid reason must be given.

**Authorization:** User

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `entry_id` | The entry's unique ID. | Yes |
| `reason_explicit` | Pass 1 to report for this reason. | No |
| `reason_inappropriate_content` | Pass 1 to report for this reason. | No |
| `reason_copyright` | Pass 1 to report for this reason. | No |
| `reason_promotional` | Pass 1 to report for this reason. | No |
| `reason_incorrect_date` | Pass 1 to report for this reason. | No |
| `comment` | Optional comment. | No |

**Response:** `success` (integer)

---

### POST entry/star

Star an entry.

**Authorization:** User

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `entry_id` | The entry's unique ID. | Yes |

**Response:** `success` (integer)

---

### GET journal/day

Describes a calendar day in the authenticated user's journal.

**Authorization:** User

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `date` | A date in YYYY-MM-DD format. | Yes |

**Response:** `day` (Day)

---

### GET journal/month

Describes a month in a user's journal.

**Authorization:** User

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `date` | A date in YYYY-MM-DD format. | Yes |
| `username` | Username of the user. Omit to use authenticated user. | No |
| `week_start` | Day week starts: 1 (Monday) to 7 (Sunday), or 0 to ignore week start. Defaults to authenticated user's locale. | No |

**Response:**

| Name | Description | Datatype |
|------|-------------|----------|
| `month` | Month of the year (1–12). | integer |
| `year` | The year. | integer |
| `week_start` | The `week_start` value in use. | integer |
| `days` | Array of Day objects (or null for padding days when `week_start` is non-zero). | array(Day\|null) |

---

### GET messages/comments/recent

Return recent comments on the authenticated user's journal, newest first.

**Authorization:** User

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `size` | Number of comments to return (default 100, max 200). | No |
| `since_id` | Returns results more recent than the specified comment ID. | No |

**Response:** `comments` (array(Comment))

---

### GET messages/notifications/recent

Return recent notifications for the authenticated user, newest first.

**Authorization:** User

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `size` | Number of notifications to return (default 100, max 200). | No |
| `since_id` | Returns results more recent than the specified notification ID. | No |

**Response:** `notifications` — array of objects with:

| Name | Description | Datatype |
|------|-------------|----------|
| `notification_id` | The notification's unique ID. | integer |
| `content` | Notification content (may contain markup). | string |
| `content_html` | Notification content as HTML. | string |
| `image_url` | URL of the notification's image. | string |
| `link_url` | URL of the notification's link. | string |

---

### PUT messages/notifications/unread

Mark a list of notifications as read.

**Authorization:** User

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `notification_ids` | Comma-separated list of notification IDs. | Yes |

**Response:** `success` (integer)

---

### GET messages/totals/unread

Returns totals for unread messages.

**Authorization:** User

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `return_comments` | Pass 1 to include `comments` count. | No |
| `return_notifications` | Pass 1 to include `notifications` count. | No |

**Response:** `comments` (integer, if requested), `notifications` (integer, if requested)

---

### GET oauth/token

Retrieve the Token object for the auth in use. When using Implicit Grant, use this to verify the token was issued to your app.

**Authorization:** User

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `client_id` | Your application's client ID. | Yes |

**Response:** `token` (Token)

---

### POST oauth/token

Obtain a new access token (Authorization Code or Resource Owner Credentials grant types).

**Authorization:** App

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `client_id` | Your application's client ID. | Yes |
| `grant_type` | `authorization_code` or `password`. | Yes |
| `code` | Authorization code (if `grant_type=authorization_code`). | Yes |
| `redirect_uri` | Redirect URL as supplied in the authorization request (if `grant_type=authorization_code`). | Yes |
| `scope` | `read` or `read,write` (if `grant_type=password`). | Yes |
| `username` | User's email address (if `grant_type=password`). | Yes |
| `password` | User's password (if `grant_type=password`). | Yes |
| `return_user` | Set to 1 to include a User object in the response (if `grant_type=password`). | No |

**Response:** `token` (Token), optionally `user` (User) if `return_user=1`

---

### DELETE oauth/token

Delete the access token in use (typically on user sign-out).

**Authorization:** User

**Response:** `success` (integer)

---

### GET user/awards

Return a list of available awards in the context of a recipient user.

**Authorization:** User / App

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `username` | Pass a username to highlight awards given to that user. Omit for authenticated user. | No |

**Response:** `awards` — array of Award objects sorted by `added_stamp` in reverse chronological order.

---

### GET user/profile

Return information about a specific user.

**Authorization:** User

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `username` | Username of the user. Omit for authenticated user. | No |
| `return_details` | Pass 1 to include a `details` object. | No |
| `return_entries` | Pass 1 to include an `entries` object. | No |
| `return_friendship` | Pass 1 to include a `friendship` object. | No |

**Response:** `user` (User), `visibility` (1 if viewer can see user's details and entries, otherwise 0)

#### details object (if `return_details=1`, null if no permission)

| Name | Description | Datatype |
|------|-------------|----------|
| `journal_title` | Title of the user's journal. | string |
| `biography` | User's biography (may contain markup). | string |
| `biography_html` | User's biography as HTML. | string |
| `country_code` | Code of the user's country. | string |
| `entry_total` | Total number of entries. | integer |
| `member` | 1 if currently a member, otherwise 0. | integer |
| `privacy` | 1 if entries are protected, otherwise 0. | integer |

#### entries object (if `return_entries=1`, null if no permission)

| Name | Description | Datatype |
|------|-------------|----------|
| `latest` | The user's latest entry. | Entry |

#### friendship object (if `return_friendship=1`)

Describes the Friendship between the authenticated and returned users.

---

### GET user/settings

Return the user's settings.

**Authorization:** User

**Response:**

| Name | Description | Datatype |
|------|-------------|----------|
| `username` | The user's username. | string |
| `journal_title` | The user's journal title. | string |
| `real_name` | The user's real name. | string |
| `real_name_search` | 1 if searchable by real name, otherwise 0. | integer |
| `biography` | Biography (may contain markup). | string |
| `locale_code` | Code of the user's locale. | string |
| `country_code` | Code of the user's country. | string |
| `privacy` | 1 if privacy enabled, otherwise 0. | integer |
| `comments` | 1 if comments enabled, otherwise 0. | integer |
| `avatar_url` | URL of the user's avatar. | string |

---

### PUT user/settings

Update the user's settings.

**Authorization:** User

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `username` | A new username. | No |
| `journal_title` | A new journal title. | No |
| `real_name` | The user's real name. | No |
| `real_name_search` | 1 to enable search by real name, 0 to disable. | No |
| `biography` | Biography (may contain markup). | No |
| `locale_code` | A valid locale code. | No |
| `country_code` | A valid country code. | No |
| `privacy` | 1 to enable, 0 to disable. | No |
| `comments` | 1 to enable new comments, 0 to disable. | No |
| `avatar` | A JPEG image to use as avatar. | No |
| `delete_avatar` | 1 to delete current avatar. | No |

**Response:** `success` (integer)

---

### GET user/settings/notifications

Return a user's notification settings.

**Authorization:** User

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `return_feed` | Pass 1 to include a `feed` object. | No |
| `return_email` | Pass 1 to include an `email` object. | No |
| `return_push` | Pass 1 to include a `push` object. | No |

**Response:** Each requested object contains:

| Name | Description | Datatype |
|------|-------------|----------|
| `configured` | 1 if this notification type is configured, otherwise 0. | integer |
| `settings` | Object with setting keys and current state (0 or 1), or null if not configured. | Object\|null |

---

### PUT user/settings/notifications

Update a user's notification settings.

**Authorization:** User

**Parameters:** Any key from a `settings` object obtained via the GET resource. Pass 1 to enable, 0 to disable.

**Response:** `success` (integer)

---

### GET users/following

Return a paginated list of users the authenticated user is following.

**Authorization:** User / App

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `username` | Username to look up. Omit for authenticated user. | No |
| `page_index` | Page index to return. | No |
| `page_size` | Number of results per page. | No |

**Response:** `page` (Page), `users` (Array(User))

---

### POST users/following

Follow a list of users.

**Authorization:** User

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `usernames` | Comma-separated list of usernames to follow. | Yes |

**Response:** `friendships` (Array(Friendship))

---

### DELETE users/following

Unfollow a list of users.

**Authorization:** User

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `usernames` | Comma-separated list of usernames to unfollow. | Yes |

**Response:** `friendships` (Array(Friendship))

---

### GET users/followers

Return a paginated list of a user's followers.

**Authorization:** User / App

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `username` | Username to look up. Omit for authenticated user. | No |
| `page_index` | Page index to return. | No |
| `page_size` | Number of results per page. | No |

**Response:** `page` (Page), `users` (Array(User))

---

### DELETE users/followers

Remove followers from the authenticated user's followers list.

**Authorization:** User

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `usernames` | Comma-separated list of usernames to remove. | No |

**Response:** `friendships` (Array(Friendship))

---

### GET users/requests/blocked

Return a list of users blocked by the authenticated user.

**Authorization:** User

**Parameters:** `page_index`, `page_size` (both optional)

**Response:** `page` (Page), `users` (Array(User))

---

### DELETE users/requests/blocked

Unblock a list of blocked users.

**Authorization:** User

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `usernames` | Comma-separated list of usernames to unblock. | Yes |

**Response:** `friendships` (Array(Friendship))

---

### GET users/requests/pending

Return a list of users requesting to follow the authenticated user.

**Authorization:** User

**Parameters:** `page_index`, `page_size` (both optional)

**Response:** `page` (Page), `users` (Array(User))

---

### PUT users/requests/pending

Accept a list of follow requests.

**Authorization:** User

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `usernames` | Comma-separated list of usernames to approve. | Yes |

**Response:** `friendships` (Array(Friendship))

---

### DELETE users/requests/pending

Block (reject) a list of follow requests.

**Authorization:** User

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `usernames` | Comma-separated list of usernames whose requests will be rejected. | Yes |

**Response:** `friendships` (Array(Friendship))

---

### GET users/search

Perform a user search and return relevant results.

**Authorization:** User

**Parameters:**

| Name | Description | Required? |
|------|-------------|-----------|
| `query` | Text query; may include `@` shortcuts. | No |
| `page_index` | Page index to return. | No |
| `page_size` | Number of results per page. | No |

**Response:** `page` (Page), `users` (array(User))
