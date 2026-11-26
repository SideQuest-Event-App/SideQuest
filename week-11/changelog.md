# Week 11 changelog: events, search and vibes

## Fixes along the way
- **"The AI didn't answer, so these are keyword matches":** the Anthropic key was rejected (401). The new key needs a workspace, so use a workspace-scoped key.
- **`npm install` error:** sketch-2 has no `package.json`, so npm read `~/package.json` instead. Nothing needs installing.
- **Tests wrote to live Supabase:** the `.env` loaders refilled keys that tests had removed. Two test accounts were created and then deleted. Loaders now only fill unset variables, and every test blanks the keys.

## Search
- Search now reads venue names, hosts and each event's qualities, so "black eagle", "buddies" and "offline no-phone dance party" match.
- Autocomplete works like Eventbrite's: "Search for…", **Venues** (with upcoming counts), **Hosts** and **Events**.
- Tapping a venue or host lists everything coming up there or by them. The host view shows their recurring nights and a Follow button.

## Knowing each event's vibe
- **Qualities** (`events/lib/qualities.js`) cover premise, crowd, rules, format and feel: Phone-free, Secret location, Queer & 2SLGBTQ+, Drag, Kink & leather, 19+, Dress code, DJ sets, Late night, and others. They're read from the title, description, full listing text and venue.
- The Eventbrite importer now keeps the listing's **full text** (`details`), not just the one-line summary. Lost Signal's "phones down" was hiding there.
- Listings too thin to judge are flagged in the import summary and on the event page, never guessed.
- Event pages have a new **"The vibe"** section: the premise, quality chips and a thin-listing note.
- The hand-run AI tagger now also writes a one-line premise, qualities and search keywords. It reads one date per recurring night.

## Posters
- Posters appear exactly as posted, with only resizing and cropping. The violet duotone filter is gone, and the gradient over Discover cards is replaced by a solid band under the image.

## New event sources
- **TOREVENT:** the curated Toronto arts and nightlife calendar, including the Black Eagle, Cafeteria and Comedy Bar.
- **Showpass:** small venues and promoters such as Buddies, Burdock and Hugh's Room.
- **YOHOMO:** Toronto's queer events list.
- **Venue websites:**
  - WordPress calendars: Buddies in Bad Times, Grossman's.
  - schema.org pages: Horseshoe, Sneaky Dee's, DROM.
  - Elfsight calendars: the **Black Eagle**, with 101 dates, repeat rules, skipped dates, and the host and price from its tags.
- Every site's robots.txt was checked first, and the fetcher checks again on each request.
- **Duplicate merging:** the same night listed under a room's name and under the building's name is now merged.

## Recurring nights and hosts
- `events/lib/series.js` links the dates of one night in three ways:
  - by the source's own repeat entry;
  - by name at the same venue, whatever the venue is called on each site;
  - by name and host across venues, for touring parties.
- Presenter prefixes ("TSO - …") and library systems' same-named clubs at different branches aren't linked.
- A date that says little gets what its other dates know: description, AI vibe, a poster, the host. It's marked as borrowed, and the next run takes it back off before linking again.
- **Memory between runs** (`data/series.json`): a new date months later still gets the night's vibe.
- Event pages show **"More dates"** with the rule ("4th Thursday of the month") and the next dates, noting a new venue or a new poster. Tapping a host's name opens their events.

## The importer has its own folder
- `sketch-1/import` and the importer parts of `sketch-1/lib` moved to a top-level **`events/`** folder with git history kept. It's split into `run.js`, `tag.js`, `instagram.js`, `sources/`, `lib/`, `config/` (edit by hand), `data/` (output), `docs/` and `test/`, and has its own AI helper and `.env` loader.
- `events/README.md` covers the layout, every source, how to add a venue, series and qualities.
- Both apps, the tests, the test runner, both GitHub workflows and the docs now point at `events/`.

## Upload (26 Nov)
- Uploaded a new import to Supabase: TOREVENT, Showpass, YOHOMO and venue websites, with the other sources kept. That's 3,528 events, including 100 Black Eagle dates, in 414 recurring series.
- The events-table upload first failed: a description was cut in the middle of a "bold" Unicode letter. Text is now never cut mid-character, and every string is cleaned before upload.

## Tests
- New test files: `events/test/vibe-sources.js` (14 checks), `events/test/series.js` (10) and `sketch-2/test/search-suggest.e2e.js` (6, run in a browser).
- All logic test files pass (17 of 17), and the suggestions browser test passes.

## Still to do
- **Eventbrite** is blocked from GitHub. Run it from home: `cd events && UPLOAD=1 ONLY=Eventbrite MERGE=1 node run.js`.
- **The AI tagger** (`node events/tag.js`) hasn't been run yet. It writes the premises and fixes keyword mistakes.
- Discover can still show several dates of the same weekly night.
