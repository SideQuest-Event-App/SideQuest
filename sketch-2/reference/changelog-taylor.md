# Sketch 2 changelog: 2026-10-18

## Setup
- Confirmed Sketch 2 already uses Sketch 1's Supabase project. Old `sketch2_accounts` view needs replacing with the table (SQL given; run in Supabase).
- README: added steps for deploying to Render (start `node sketch-2/server.js`, paid `ANTHROPIC_API_KEY`).

## Home (Discover)
- "Recommendations" renamed "For you". For you and Map share one header: toggle, bell, search bar.
- Removed the "N this week" line, quick filter chips and Profile avatar.
- Filters button in the search bar (shows a count); active filters show as removable chips.
- "See all (N)"; "Vibe Mixes" with a count circle on each tile; tile titles smaller than the heading.
- Save button on cards has a visible circle.
- All inputs: distinct fill, lilac border, hover and focus ring.

## Search
- Filters on the results page; changing one re-runs the search.
- Results reveal 5 at a time on scroll; the AI is asked for 10 per page, and the next page is fetched when needed.
- Rebuilt with the design's quest rows; "Not for me", Request it and Add event kept.

## Filters
- Time of day moved into the Filters sheet.
- Price is a slider: Free to $100+.
- Distance is a slider: 1 km to Within 10 km (no limit until moved).

## Onboarding
- One chevron on "Slide to explore".
- Selected cards no longer shrink (outline instead of border).
- Removed unused Apple/Google icons (sign-in buttons were already gone).

## Layout
- Old phone-frame preview removed; full screen at every size.
- Phone (≤760px), tablet (761–1099px, centred column), desktop (≥1100px, sidebar nav, wider column, two-column landing, full map).
- Sketch controls moved to a corner button on tablet and desktop.

## Map
- OpenFreeMap/OpenStreetMap credit folded into a small "i" button (licence requires the credit).

## Notes
- `concerns.md` rewritten with open issues and decisions.
- Nothing committed yet.

# Sketch 2 changelog: 2026-10-19

## Home (Discover)
- Removed "Monday · Toronto" above "Your week, picked." and "Fresh every Monday" under Weekly Sidequests.

## Filters
- New order: Category, Date, Time of day, Price, Distance from home, Who's going, Amenities.
- Date (new): Any day, Today, Tomorrow, This weekend, Custom. Custom shows From and To date pickers (either can be left empty).
- Time of day: added Custom, with From and To time pickers. A range that ends before it starts runs past midnight (8 PM to 2 AM).
- Who's going: "Friends going" is now "Friends" (the chip and the active-filter chip).
- Removed "Starts after" (Custom time of day covers it).
- Active filters show as chips: "This weekend", "Oct 22 to Oct 23", "8 PM to 2 AM", etc.

## Search
- Result rows are unchanged (match tag, the AI's reason, "Not for me").
- The big boxes at the end are replaced by "That's everything for now", a short line naming what wasn't found, "Request this sidequest" and "Know one? Add an event". With no results the heading is "Nothing fit that yet".
- The last search stays until a new one: leaving Search keeps its results, searching the same words again reopens them without asking the AI again, and a reload of the tab keeps them.
- The top line is now "1346 matches with Claude API" (or "… keyword matches (no AI)") in the same small grey text; the AI tag and the "of 3748 sidequests fit … trip" wording are gone.
- Search results have the tab bar. While a search is open, the Discover tab goes back to its results; the back arrow on Search closes it and Discover shows For you again.

## Community
- Removed the "Plan with friends" overline.
- Friends' highlights hidden (`SHOW_HIGHLIGHTS` in `screens-attendee.js` brings it back).

## Add Event
- Removed the "Tell hosts what you want" overline.

## Sidequests
- Sidequest Wrapped cards hidden (`SHOW_WRAPPED` in `screens-attendee.js` brings them back). The Wrapped screen itself still exists.
# Sketch 2 changelog: 2026-10-19 (event import)

## Automation
- New GitHub Action `.github/workflows/import-events.yml`: all sources on Mondays; Ticketmaster and Instagram on Thursdays. Uses no AI.
- The import goes to Supabase Storage (private bucket "imports", gzipped). The server checks for a new one every 6 hours and loads it without a restart.
- The window is now 3 months (was 4).
- Source order: Ticketmaster, Instagram, then DICE, Meetup, Luma, City of Toronto, Toronto Public Library, Eventbrite. The earlier source wins a tie between duplicates.

## Sources
- New: Toronto Public Library, from TPL's open-data feed. Only adult outings (arts, crafts, games, book clubs, writing, film); a weekly program shows its next 4 dates. About 800 events.
- Meetup now reads Toronto groups' event pages (`import/meetup-groups.json`, 189 groups, plus new ones from the city page). Its search pages are ruled out by Meetup's robots.txt, which the old importer had been using.
- NOW Toronto isn't imported: it answers our importer with 403.
- Instagram split in two. `node import/instagram.js` (by hand, Claude Code) downloads and reads new posts. The scheduled run only picks up the saved events.

## Instagram
- `reference/instagram-accounts.md` is now the account list: 61 accounts, with posts read, events found and paused notes. The by-hand run keeps the numbers up to date.
- Guardrails: at most 40 AI calls a run (`IG_MAX_CALLS`), 2 images per post, accounts paused after 20 posts read with no events, downloaded images deleted once read, and old readings dropped.

## Guardrails
- The importer checks every site's robots.txt (and its Crawl-delay) before each request, and stops asking a site that answers 403 or 429.
- A source that fails, or brings back under half of last run's events, keeps last run's events.

## Repo
- `sketch-1/import/.cache/` (1,373 files, ~270 MB) and `instagram-raw.json` (4.6 MB) removed from git's index; they stay on disk and are now ignored.
