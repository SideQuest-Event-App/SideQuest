# Events: finding and importing them

Everything that gathers real GTA events for SideQuest lives here, apart from the apps. Both apps (`sketch-2`, and the
older `sketch-1`) read its output. Node 20+, nothing to install.

```
events/
  run.js          the import: every source, then cleanup, duplicates, recurring nights, qualities → data/events.json
  tag.js          by hand: the AI reads new listings (one date per recurring night) → data/event-tags.json
  instagram.js    by hand: the AI reads venues' Instagram posts and posters → data/instagram-events.json
  sources/        one file per site or kind of site (each says how it reads it, and why that's allowed)
  lib/            the shared steps: fetch (polite, robots.txt, cache), normalize, locate, dedupe, series, qualities,
                  tags, the Supabase upload, paths (where everything below lives) and the .env loader
  config/         what to read; edit by hand: venue calendars, Instagram accounts, Meetup groups, ICS feeds
  data/           what the import writes: events.json, series.json, event-tags.json, caches (git-ignored)
  docs/           setup guides (Instagram)
  test/           node test/<file>.js, or all of them with node sketch-2/test/run.js from the repo root
```

Keys go in `events/.env` (copy `.env.example`), or stay in `sketch-2/.env`: the importer reads both. The scheduled
import (`.github/workflows/import-events.yml`) runs `node run.js` here with GitHub's secrets and uploads to Supabase.

## Adding a venue

Most venues post their nights on their own site. Check its robots.txt allows the page, then add one entry:

- **An Elfsight calendar** (a `<div class="elfsight-app-…">` on the page, common on Squarespace and Wix sites):
  `config/elfsight-calendars.json` with the widget id, the page and the venue's address.
- **WordPress with "The Events Calendar"** (`/wp-json/tribe/events/v1/events` answers): `config/wp-calendars.json`.
- **A page with schema.org events** (search engines' event data in the page): `config/venue-pages.json`.
- **An Instagram business account**: a row in `config/instagram-accounts.md`.

## Sources

```
cd events
node run.js        # first run takes 2 to 3 hours (mostly Eventbrite's ~9,000 event pages, read politely);
                          # re-runs within 12 hours come from the cache and take minutes
node ../sketch-2/server.js  # the app picks up the new events (sketch-1 too)

ONLY=Ticketmaster,Instagram MERGE=1 node run.js
                          # fetch just those sources and add them to the events already in data/events.json
```

| Source | How | Notes |
|---|---|---|
| **DICE** | The event sitemaps DICE publishes for search engines, filtered to GTA events, then each event page's schema.org data | Exact start times, venue coordinates, prices in CAD. DICE's `/api/` is off-limits in its robots.txt, so it isn't used. |
| **Eventbrite** | Every Toronto "all events" listing page for the window (split into smaller date ranges until each fits under Eventbrite's 49-page limit), then each in-person event's page for price, organizer and full description | There's no public search API, and `/api/v3/destination/events/` is off-limits in robots.txt. Listing pages rate-limit, so the importer waits 6 seconds between them and backs off on a 429. Prices Eventbrite shows in USD are converted and marked "converted". |
| **Meetup** | The public "find events" pages for in-person events within 25 miles of Toronto, one day at a time (by relevance and by time), plus the Toronto city page, then each event's page for venue coordinates, fee and photo | Meetup's API needs a paid Pro account. Each find page only shows a day's top events, so this is most, not all, of Meetup. No Meetup fee doesn't mean free (many groups charge elsewhere), so those prices are N/A. |
| **Luma** | Luma's Toronto discover list (the same `api.lu.ma/discover` call the page makes; robots.txt allows it), then each event page for its description | Only the events Luma features for Toronto, a few dozen. |
| **City of Toronto** | The [Festivals & Events open data feed](https://open.toronto.ca/dataset/festivals-events/) | Official, no scraping: festivals, exhibits, performances, markets and tours on the City's calendar, with images. Long runs (an exhibit open for weeks) are listed once, on their next date, with "Runs until". |
| **Ticketmaster** | The official [Discovery API](https://developer.ticketmaster.com/) | Needs a free key: add `TICKETMASTER_API_KEY=...` to `.env`, then re-run. Sports are left out (outside our three scenes). |
| **Instagram** | The Instagram Graph API's Business Discovery: the last 40 posts of each venue or promoter in `config/instagram-accounts.json`. For posts from the last 60 days the importer downloads the images (up to 4 slides of a carousel), and the AI reads each **poster (OCR) together with its caption** and pulls out the events they announce | Needs `INSTAGRAM_USER_ID` and `INSTAGRAM_ACCESS_TOKEN` in `.env`. **Looser than the other sources**: posts aren't listings, so relative dates ("this Friday") are worked out from the post date, a missing time becomes the venue's usual start (else 8 PM), and where poster and caption disagree the poster wins. The venue is the account's own unless the post names another one we already know, or gives an address we can find on the map (anything else is left out). Price is only filled in when the post states it. The poster is shown as the event's image: Instagram's image links expire, so a copy is kept (see "Posters" below). Downloads are saved (`data/instagram-raw.json`, `data/instagram-images/`), so an expired token still imports the last snapshot, and each post is read by the AI once (`data/instagram-extracted.json`; posts read before posters were are read again once their images are downloaded). To add a venue, add its handle and address to the accounts file. |
| **TOREVENT** | torevent.ca's calendar file (`events.js`, which its own pages load): a free, hand-curated Toronto arts and nightlife calendar (concerts, club nights, comedy, film, queer nights at the Black Eagle and Cafeteria) | robots.txt allows everything and its terms don't restrict reuse. It's one person's work, so every listing links back to its TOREVENT page. No coordinates in the file: venues we already know are matched by name, the rest are looked up on OpenStreetMap. |
| **Showpass** | Showpass's public events API, by GTA city (`location__city`) | Many small venues and promoters sell here (Buddies in Bad Times, Burdock, Hugh's Room). robots.txt allows `/api/`. |
| **YOHOMO** | yohomo.ca's homepage list, then each event's page (time, venue, price, ticket link, poster, write-up) | Toronto's queer events list: Black Eagle nights, drag, parties often on no ticketing site. robots.txt allows everything. Pages give no year: the next such date is used. |
| **Venue websites** | Venues' own sites: WordPress "The Events Calendar" APIs (`config/wp-calendars.json`: Buddies in Bad Times, Grossman's Tavern) pages with schema.org event data (`config/venue-pages.json`: Horseshoe Tavern, Sneaky Dee's, DROM Taberna) and Elfsight calendar widgets (`config/elfsight-calendars.json`: the Black Eagle), read from `core.service.elfsight.com/p/boot/`, which Elfsight's robots.txt allows. A repeating calendar entry ("4th Thursday of the month", with its skipped dates) becomes one date each time it happens, and its tags ("HOSTED BY t.k.k.", "9PM / NO COVER") become the host, the time and the price | Each site's robots.txt was checked before it was listed, and `lib/fetch.js` checks again on every request. A page that gives a date but no time uses the venue's usual start, and the listing says so. |
| Resident Advisor | Not imported | ra.co answers automated visitors with a 403 and a captcha, disallows its API, and blocks AI crawlers (Anthropic's included) from the whole site in robots.txt. |
| Partiful | Not imported | Its robots.txt only admits search engines and link-preview bots, and its events are mostly private invites with no public Toronto listing. |
| blogTO | Not imported | Its terms and robots.txt prohibit scraping and building datasets from its content. |

The importer identifies itself honestly, waits between requests to each site (the sources run side by side, each at its own pace), and caches what it reads in `data/.cache/` (12 hours; for big pages only the few fields it uses) so re-runs are quick. It keeps every in-person GTA event except clearly off-topic ones (webinars, business seminars, real estate, pro sports games and the like, judged by title and category). Events are tagged with vibes from the listing's own words; ones that match none of our vibes get the scene "Other" and still show up in search and filters. It merges duplicates (see below), keeping the fuller listing and filling its gaps from the others, and works out the neighbourhood from the venue's coordinates. Options: `DAYS=30`, and `DICE_MAX`, `EVENTBRITE_MAX`, `MEETUP_MAX`, `LUMA_MAX`, `TORONTO_MAX`, `TICKETMASTER_MAX`, `INSTAGRAM_MAX` to cap a source. `ONLY=` runs just the named sources; `MERGE=1` adds their events to the current `data/events.json` (merging duplicates) instead of replacing it.

**Duplicates** (`lib/dedupe.js`, used by the importer, by the server when it loads a new import, and whenever someone adds an event): two listings are one event when they're at the same venue (pins close together, and venue names that don't contradict each other) and start within 30 minutes with the same poster and some shared title words, or within 30 minutes with most title words shared, or within 75 minutes (doors vs show) with nearly the same title. Two *different* posters need nearly the same title, so a studio's "Moon lamp" and "Genie lamp" workshops at the same hour stay apart, as do one chain's workshop at 30 venues and titles that differ only by a number. Merged listings show "Also listed on" links. `node lib/dedupe.js` re-checks `data/events.json` in place.

**Trip times** are estimates: subway time over the real Line 1 and Line 2 network from Union, Finch, Kennedy or Kipling (2 minutes a stop, 4 per transfer), plus a walk or a bus/streetcar leg from the nearest station. Good enough to filter "too far", not a trip planner.

## Recurring nights and hosts

Most nightlife repeats, so once we know what a night is like, a new date only needs to say it's happening again.
`lib/series.js` links every date of a night into one series: by the source's own repeating entry (an Elfsight
calendar's), by the night's name at the same venue (whatever the venue is called on each site, or its spot on the
map), or by its name and host across venues (a touring party). The name is the title without dates, edition numbers
or a subtitle ("DADDY NEXT DOOR - DENIM & LEATHER EDITION" is Daddy Next Door). A presenter's prefix with different
shows ("TSO - Messiah", "TSO - Elf") isn't one night, and an organization with events at many venues (a library
system) only links within one venue.

Each date in a series gets `series: { id, rule, count }`, the rule read from the dates ("Every Friday", "4th
Thursday of the month") or given by the source. A date that says little gets what its other dates know: their
description, the AI's premise, qualities, keywords and vibes, a poster if it has none, the host. It's marked in
`shared` (the app says "Some of this is from other dates of this night"), its own values are kept in `own`, and the
next run takes the lent parts back off before linking again. What each series ever told us is remembered in
`data/series.json` (and Supabase Storage with `UPLOAD=1`), so a new date months later, with no other dates in the
window, still gets the night's description and vibe. The AI tagger reads one date per series.

Hosts come from each listing's organizer (a calendar's "HOSTED BY" tag counts). The app lists a host's upcoming
events and recurring nights from their name on an event page or the search suggestions, and search matches hosts.

## Qualities

Beyond its vibe, every event gets **qualities** (`lib/qualities.js`: the premise, like "Phone-free" or "Secret location"; the crowd, like "Queer & 2SLGBTQ+" or "Desi & South Asian"; the rules, like "19+" or "Dress code"; the format and the feel), read by plain rules from the title, the description, the listing's full text (`details`, up to 1,200 characters) and the venue. Search matches them and their synonyms ("offline" finds "Phone-free"), and the event page shows them under "The vibe". The hand-run AI tagger (`node tag.js`) adds a one-line premise, more qualities and search keywords. A listing that says too little to tell what the night is like is marked `info: "thin"`, counted in the import summary and flagged on its page, never guessed.
