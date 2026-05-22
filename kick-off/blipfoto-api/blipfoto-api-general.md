# Blipfoto API — General, Auth, Errors & Guides

> Sources:
> - https://www.blipfoto.com/developer/api/general
> - https://www.blipfoto.com/developer/api/guides/auth
> - https://www.blipfoto.com/developer/api/guides/errors
> - https://www.blipfoto.com/developer/api/guides/rate-limits
> - https://www.blipfoto.com/developer/api/guides/responses
> - https://www.blipfoto.com/developer/api/guides/markup

---

## Overview

The Blipfoto REST API gives programmatic access to everything on Blipfoto. Make a request to a URL and consume the response.

All requests are made over **HTTPS**, with parameters either in the querystring (GET or DELETE) or in the request body (POST or PUT).

Requests are [rate limited](#rate-limits) to prevent any one app or user from impacting the service.

Responses can be **JSON or XML**. See [Responses](#responses) for format details.

All requests are sent with an `Authorization` header to identify your app and your users, generated using OAuth2. See [Authorization](#authorization).

---

## Authorization

The API accepts two types of auth: **App auth** and **User auth**. Both produce an Access Token used to make authorized requests.

### App Auth

Use App auth when performing an action on behalf of your application, without a user context (e.g. fetching an entry for display on your website).

For App Auth, **use your Client ID as the Access Token**.

### User Auth

Use User auth when performing an action on behalf of a user (e.g. publishing an entry to a user's journal).

The user must first grant permission for your app to operate on their behalf. You then obtain an Access Token which identifies both your app and the user's account — without your app asking for their password.

This uses an **OAuth2 workflow**. The flow depends on your app type (web app or distributed app).

### Making Authorized Requests

After obtaining an Access Token, authorize requests by sending it as a bearer token in the `Authorization` header:

```
Authorization: Bearer your_access_token
```

---

### OAuth for Web Apps

If you have registered a **web app**, generate an Access Token with these steps:

#### Step 1 — Prompt for User Permissions

Redirect the user to the authorization URI found in your app settings. Pass the following querystring parameters:

| Name | Description | Required? |
|------|-------------|-----------|
| `response_type` | Must be set to `code`. | Yes |
| `client_id` | Your application's client ID. | Yes |
| `client_secret` | Your application's client secret. | Yes |
| `redirect_uri` | A URI to which the request will be redirected after authorization. | Yes |
| `scope` | The requested scope: `read` or `read,write`. | Yes |
| `state` | A random string which will be passed back in the redirection URI (CSRF protection). | Yes |

After the user grants (or denies) permission, they are redirected back to your `redirect_uri`.

#### Step 2 — Obtain an Authorization Code

Inspect the querystring parameters on your `redirect_uri` for:

| Key | Description |
|-----|-------------|
| `error` | If the user denied permission or an error occurred, contains the error string. |
| `state` | Must match the `state` value from Step 1. **Discard the request if they do not match** (CSRF protection). |
| `code` | A temporary Authorization Code required for Step 3. |

#### Step 3 — Obtain an Access Token

Use the `code` from Step 2 to make a request to [`POST /oauth/token`](blipfoto-api-reference.md#post-oauthtoken). A successful response returns a Token object containing the access token.

#### Redirect URIs for Web Apps

You must register a redirection URI in your app settings. The `redirect_uri` supplied in Step 1 must match the pre-registered URI.

Valid URI formats (HTTP or HTTPS; HTTPS recommended):

```
https://example.com/oauth/blipfoto
https://example.com/oauth/*
```

Wildcard suffixes are supported.

---

### OAuth for Distributed Apps

If you have registered a **distributed app**, generate an Access Token with these steps:

#### Step 1 — Prompt for User Permissions

Initiate a new browser session and send the user to the authorization URI in your app settings. Pass the following querystring parameters:

| Name | Description | Required? |
|------|-------------|-----------|
| `response_type` | Must be set to `token`. | Yes |
| `client_id` | Your application's client ID. | Yes |
| `redirect_uri` | A URI to which the request will be redirected. | Yes |
| `scope` | The requested scope: `read` or `read,write`. | Yes |
| `state` | A random string which will be passed back in the redirection URI. | Yes |

After the user grants (or denies) permission, they are redirected back to your `redirect_uri`.

#### Step 2 — Obtain an Access Token

Intercept the redirection request to `redirect_uri` and inspect the **URI fragment**. The querystring-encoded fragment contains the properties and values of a Token object, including the access token.

#### Redirect URIs for Distributed Apps

You must register a redirection URI in your app settings. Your app should use a **custom protocol** it can intercept.

Examples (iOS apps can register a custom URL scheme):

```
myapp://oauth/blipfoto
myapp://oauth/*
```

Wildcard suffixes are supported.

The following are **invalid** (standard HTTP/S protocols are not valid for distributed apps):

```
http://oauth/blipfoto
myapp://oauth/*/blipfoto
```

---

## Rate Limits

To prevent a single app or user from impacting the service, API requests are rate-limited.

### How Rate Limits Work

Requests are grouped by the **access token** used to authorize them. This means your app and each user of your app has a separate limit.

Each **15-minute time window** has a maximum number of requests. If you exceed this limit, a `"Request limit reached"` Error (code `11`) is returned until the start of the next window.

### Rate Limit Response Headers

Each response includes the following headers to help you monitor usage:

| Header | Description | Datatype |
|--------|-------------|----------|
| `X-RateLimit-Limit` | Total requests available in the 15-minute window. | integer |
| `X-RateLimit-Remaining` | Requests remaining in the current window. | integer |
| `X-RateLimit-Reset` | Seconds remaining until the next time window. | integer |

> A value of `-1` indicates the request is not subject to rate limits.

---

## Responses

API responses can be returned as **JSON** (default) or **XML**.

Each response has three top-level properties:

| Name | Description | Datatype |
|------|-------------|----------|
| `version` | The API version. | integer |
| `error` | An error object, or null when no error occurs. | Error\|null |
| `data` | The response data, or null if an error occurred. | object\|null |

### JSON Responses

JSON is the default format. You can specify it explicitly by appending `.json` to the resource URL:

```
https://api.blipfoto.com/4/resource.json
```

#### Dealing with 64-bit Integers

Many languages (including ECMAScript) cannot handle the full 64-bit integer range. To avoid precision loss, a `{property_name}_str` property is added to every JSON object property whose name ends in `_id`:

```json
{
    "entry_id":     123456789,
    "entry_id_str": "123456789"
}
```

Treat the `_str` variant as a string to avoid loss of precision.

#### JSON-P

JSON-P is supported via the `callback` parameter. Specifying this with a GET request wraps the response in the named callback function.

### XML Responses

Specify XML by appending `.xml` to the resource URL:

```
https://api.blipfoto.com/4/resource.xml
```

The root element for all XML responses is `<api>`.

Where the datatype is an array, each item is represented by an `<item>` element. For example:

**JSON:**
```json
{
    "version": 4,
    "error":   null,
    "data":    {
        "people": ["alice", "bob"]
    }
}
```

**Equivalent XML:**
```xml
<api>
    <version>4</version>
    <error />
    <data>
        <people>
            <item>alice</item>
            <item>bob</item>
        </people>
    </data>
</api>
```

---

## Markup

Some content (entry descriptions, comments) supports basic text formatting using **BBCode-style markup**. Where a property supports markup, a `*_html` variant of the property is also returned.

| BBCode | HTML output |
|--------|-------------|
| `[b]bold[/b]` | `<b>bold</b>` |
| `[i]italic[/i]` | `<i>italic</i>` |
| `[u]underline[/u]` | `<u>underline</u>` |
| `[s]strikethrough[/s]` | `<strike>strikethrough</strike>` |
| `[url=http://example.com]Example[/url]` | `<a href="http://example.com">Example</a>` |
| `\n` | `<br />` |

---

## Errors

Errors may occur in a variety of circumstances (e.g. wrong app configuration, or a user attempting an illegal action).

Error information is returned in the top-level `error` property of the response. When an error occurs, the `data` property is always `null`.

```json
{
    "error": {
        "object":  "Error",
        "code":    10,
        "message": "The resource is invalid."
    },
    "data": null
}
```

### Error Codes

The following is a non-exhaustive list of possible error codes and messages.

| Code | Message |
|------|---------|
| 0 | Temporarily unavailable. |
| 1 | A general error occurred (%s). |
| 10 | The resource is invalid. |
| 11 | Request limit reached. |
| 12 | The request method is invalid for the resource. |
| 13 | The resource is invalid. |
| 14 | The response format is invalid. |
| 15 | The protocol is invalid — please send requests over HTTPS. |
| 16 | The access token scope is insufficient. |
| 30 | invalid_request |
| 31 | invalid_grant |
| 32 | unsupported_grant_type |
| 33 | invalid_client |
| 34 | unauthorized_client |
| 35 | invalid_redirect_uri |
| 50 | The user access token is missing. |
| 51 | The user access token is invalid. |
| 52 | The client is invalid. |
| 80 | No query options were provided. |
| 80 | Location type is invalid. |
| 80 | Sort is invalid. |
| 80 | Bounding box is invalid. |
| 100 | No username(s) provided. |
| 101 | Username(s) invalid. |
| 102 | The username is unavailable. |
| 103 | The specified user is unavailable. |
| 104 | The specified user is protected. |
| 105 | Invalid action for the authenticated user. |
| 106 | The specified user is not a member. |
| 107 | The email is already in use. |
| 200 | No entry ID provided. |
| 201 | Entry ID invalid. |
| 202 | Entry unavailable. |
| 203 | No type provided. |
| 204 | Type invalid. |
| 205 | New comments are disabled on this entry. |
| 206 | Report reason missing. |
| 221 | The authenticated user has already starred this entry. |
| 222 | The authenticated user has already favorited this entry. |
| 223 | The authenticated user has reached their favorite limit. |
| 230 | No photo ID provided. |
| 231 | Photo ID invalid. |
| 232 | Photo unavailable. |
| 233 | The authenticated user has reached their photo limit. |
| 240 | Image data is not a valid JPG. |
| 250 | You cannot publish entries for a date this far in the past. |
| 251 | You cannot publish entries for a date in the future. |
| 252 | You already have an entry on this date. |
| 300 | No comment ID provided. |
| 301 | Comment ID invalid. |
| 302 | Parent ID invalid. |
| 303 | This comment cannot be replied to. |
| 304 | The authenticated user cannot reply to this comment. |
| 305 | The authenticated user cannot delete this comment. |
| 306 | The authenticated user cannot edit this comment. |
| 350 | Request ID(s) invalid. |
| 400 | The country code is invalid. |
| 450 | This app is not configured for push notifications. |
| 451 | No push token provided. |
| 452 | Push token invalid. |
| 453 | Notification IDs missing. |
| 501 | No email address provided. |
| 501 | Email address invalid. |
| 502 | Email address is too long. |
| 503 | No password provided. |
| 504 | Password invalid. |
| 505 | No username provided. |
| 506 | Display name invalid. |
| 507 | Display name too long. |
| 508 | No real name provided. |
| 509 | Real name invalid. |
| 510 | Real name too long. |
| 511 | No age provided. |
| 512 | Age invalid. |
| 513 | Country code invalid. |
| 514 | Timezone ID invalid. |
| 515 | Locale ID invalid. |
| 516 | Journal title is invalid. |
| 517 | Journal title is too long. |
| 518 | No entry ID provided. |
| 519 | Entry ID invalid. |
| 520 | No content provided. |
| 521 | Content invalid. |
| 522 | Parent ID invalid. |
| 523 | No date provided. |
| 524 | Date invalid. |
| 525 | Entry title is too long. |
| 526 | Entry title is invalid. |
| 527 | Entry tags are too long. |
| 528 | Entry tags are invalid. |
| 601 | Permissions denied. |
| 602 | Your Facebook account is connected to a different Blipfoto account. |
| 603 | Your Blipfoto account is connected to a different Facebook account. |
| 604 | Sign in with Facebook is disabled for this account. |
| 605 | There is no Blipfoto account connected to your Facebook account. |
| 621 | Permissions denied. |
| 622 | Your Twitter account is connected to a different Blipfoto account. |
| 623 | Your Blipfoto account is connected to a different Twitter account. |
| 624 | Sign in with Twitter is disabled for this account. |
| 625 | There is no Blipfoto account connected to your Twitter account. |
