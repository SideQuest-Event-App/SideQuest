# Turning on the automatic Instagram import

Once two values are in `events/.env`, every `node run.js` reads the recent posts of every account in
`events/config/instagram-accounts.md` by itself and turns the ones that announce events into listings. Until
then it keeps using the events saved by the last `node instagram.js`.

It uses Instagram's **official Graph API** ("Business Discovery"): Meta's supported way for an app to read another
professional (business or creator) account's public posts. It doesn't log in as anyone, doesn't open instagram.com
pages, and doesn't scrape. Instagram's Terms of Use forbid collecting data "in an automated way" without Meta's
permission; the Graph API, used under Meta's Platform Terms, *is* that permission.

**What it can't do:** read personal (non-professional) accounts, private accounts, or age-gated accounts. Every
account in our list is a venue's or promoter's business account, so that's fine. Stories aren't available either.

**What it reads:** each account's last 40 posts, once per import (61 accounts = 61 calls; the Graph API allows far
more). New posts are read with plain rules (a date, a time, a price in the caption). Posts the AI already read (with
their posters) keep the AI's reading. The AI only reads posts when you ask (`node instagram.js`, or `IG_AI=1`),
with Claude Code on your plan.

## What you need

- An Instagram account you control, switched to a **professional account** (Business or Creator). A new, empty one
  made for the class project is fine. It doesn't need posts or followers.
- A **Facebook Page**, linked to that Instagram account. (Business Discovery goes through Facebook Login, which needs
  a Page. A new, empty Page is fine.)
- A **Meta developer account** (free) and a Meta app.

About 30 minutes, once.

## Step by step

### 1. Make the Instagram account professional

1. Open the Instagram app on your phone and log in to the account you'll use.
2. Tap your profile picture (bottom right), then the three lines (top right).
3. Tap **Settings and privacy** → **Account type and tools** → **Switch to professional account**.
4. Pick any category (for example "Community" or "Education") and choose **Business**.

### 2. Make a Facebook Page and link it

1. On a computer, go to [facebook.com/pages/create](https://www.facebook.com/pages/create) and make a Page (for example
   "SideQuest INF2573"). Nothing needs to be posted on it.
2. On the Page, open **Settings** → **Linked accounts** (sometimes **Instagram**) → **Connect account**, and log in to
   the Instagram account from step 1.

### 3. Make a Meta app

1. Go to [developers.facebook.com](https://developers.facebook.com) and click **Get started** (or **My Apps**) to make a
   developer account, if you don't have one.
2. Click **Create app**. When asked what it's for, choose the option for **managing a business / other**, then the app
   type **Business**. Name it something like "SideQuest import".
3. In the app's dashboard, add the product **Instagram** and choose **API setup with Facebook login**
   ("Instagram API with Facebook Login").
4. Leave the app in **Development** mode. You're the app's admin, so it can use your own Page and Instagram account
   without Meta's App Review.

### 4. Get a token

The simplest token that doesn't expire is a **System User** token from Meta Business Suite:

1. Go to [business.facebook.com/settings](https://business.facebook.com/settings) (Business settings). If you don't
   have a business portfolio yet, make one, and add your Page to it (**Accounts** → **Pages** → **Add**).
2. Under **Users** → **System users**, click **Add**, give it a name ("sidequest-import"), role **Admin**.
3. Click **Assign assets**, choose your Page, and turn on full control.
4. Under **Accounts** → **Apps**, add your app from step 3 (if it isn't there yet), and assign it to the system user.
5. Back on the system user, click **Generate new token**, choose your app, set expiry to **Never**, and tick these
   permissions: `instagram_basic`, `pages_show_list`, `pages_read_engagement` (and `business_management` if it's
   offered). Click **Generate token** and **copy it**. Keep it somewhere safe for a minute; don't paste it in chat,
   an issue, or a commit.

(Alternative, if you'd rather not use Business settings: open the
[Graph API Explorer](https://developers.facebook.com/tools/explorer/), pick your app, add the same permissions, click
**Generate Access Token**, then exchange it for a long-lived one in the
[Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/) ("Extend Access Token"). That one
lasts about 60 days, so you'd repeat this every two months. The import's log says when the token is rejected.)

### 5. Find your Instagram account's id

1. Open the [Graph API Explorer](https://developers.facebook.com/tools/explorer/), paste your token in the
   **Access Token** box.
2. In the query box, type `me/accounts?fields=name,instagram_business_account` and click **Submit**.
3. In the answer, find your Page; under it, `instagram_business_account` has an `id` (a long number starting with
   `1784…`). That's your `INSTAGRAM_USER_ID`.
4. Optional check: query `<that id>?fields=business_discovery.username(thegarrisonto){username,media_count}`. If it
   answers with `thegarrisonto`, everything works.

### 6. Put the two values in `.env`

In `events/.env` (or `sketch-2/.env`), never in the code:

```
INSTAGRAM_USER_ID=1784...
INSTAGRAM_ACCESS_TOKEN=...
```

The importer masks the token in every line it prints.

### 7. Try it

1. `cd events && ONLY=Instagram MERGE=1 node run.js`
2. You should see lines like `instagram: 61 accounts downloaded` and
   `instagram: 1234 recent posts from 61 accounts (… read before by the AI, … read by the caption rules), N events`.
3. If it says `automated read failed (…)` instead, the message says why (most often an expired token: make a new one
   in step 4 and replace it in `.env`). The run still uses the last saved events.

## Ways to run it

- `ONLY=Instagram MERGE=1 node run.js` (from `events/`): the automatic read, as part of an import.
- `node instagram.js`: Claude Code also reads the posters (better results). What it reads is saved in
  `data/instagram-extracted.json`, and every import after uses those readings too.
- `IG_AI=1 ONLY=Instagram MERGE=1 node run.js`: the automatic read, with Claude Code reading new posts (at most
  `IG_MAX_CALLS` calls, default 40).

## Switches

| Variable | What it does |
|---|---|
| `INSTAGRAM_AUTO=off` | Don't call the Graph API; use the last saved events. |
| `IG_AI=1` | Let the AI read new posts (needs Claude Code or an API key, and `AI` not `off`). |
| `IG_MAX_CALLS` | AI calls per run at most (default 40). |
| `IG_GRAPH_VERSION` | Graph API version (default `v24.0`); change it when Meta retires that one. |

## Other ways to get venue events (no Instagram)

Many venues also publish their calendar as an `.ics` feed or on their own site with schema.org event data. Feeds go in
`config/ics-feeds.json` (read by `sources/ics.js`) once a venue's feed and terms are checked. That's the
sturdiest source of all: no token, no account.
