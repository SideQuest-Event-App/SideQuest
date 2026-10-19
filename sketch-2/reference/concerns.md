# Sketch 2: concerns to review

These are from the 2026-10-18 revision (claude.md), most important first. This replaces the earlier list from 2026-10-16, whose changes never reached the code.

## Event import (2026-10-19)

1. **Add three GitHub secrets, then run it once.** On GitHub, go to Settings → Secrets and variables → Actions and add `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `TICKETMASTER_API_KEY`. Then go to Actions → "Import events" → Run workflow. Nothing has run on GitHub yet, so I haven't seen a full run there. A full run reads a few thousand pages slowly (the robots.txt pacing), so expect it to take about an hour or more; the job allows up to 4 hours.
2. **Instagram needs you once or twice a week:** run `node import/instagram.js` from `sketch-1/`. If you skip it, the scheduled runs keep the last saved Instagram events and the run log warns once they're over 8 days old. The Instagram token expires every 60 days; when it does, the script says so and builds from the last download.
3. **Sketch 1 doesn't use the automatic import.** Only Sketch 2's server reads Supabase Storage. Sketch 1 still reads `sketch-1/seed/events.json`, which now changes only when someone runs the importer by hand.
4. **Toronto Public Library adds about 800 listings,** mostly book clubs, chess, knitting and writing groups, all free. They're only picked for people whose tastes match, but they're about a third of all listings. To have fewer, tighten `OUTINGS` or `PER_PROGRAM` in `sources/tpl.js`.
5. **Meetup may bring back fewer events** now that it reads only known groups (the search pages it used are against Meetup's robots.txt). New groups come in only from Meetup's Toronto city page.
6. **The repo is still large in git history.** The download cache is out of the index now, but past commits still hold it. Shrinking history means rewriting it (for example with `git filter-repo`), which everyone with a copy would need to re-clone, so I haven't done it.
7. **The untracking is staged, not committed.** `git status` shows the cache files and `instagram-raw.json` as deleted. That's only from git's index; the files are still on disk.

## Needs you

1. **Render service for Sketch 2.** The code is ready, but the service has to be created on Render. The steps are in README → "Put it online (Render)". Leave Root Directory empty and use the start command `node sketch-2/server.js`, because Sketch 2 reads Sketch 1's events and importer.
2. **The API key is billed.** On Render, every feed, search page, Crew Blend and poster read goes to the paid API. Search now asks for up to 10 picks per call instead of 5, and asks again for each further page you scroll to. That's more output per search, so each search costs a bit more. Locally, `sketch-1/.env` and `sketch-2/.env` both still have `ANTHROPIC_API_KEY`, and `lib/ai.js` uses the API before Claude Code. So running locally is billed too, unless you remove that line.
3. **One Sketch 2 server per Supabase at a time.** A local server and the Render one both write the whole shared state (parties, requests, notifications) to `app_state` row 2, so they overwrite each other. Accounts are safe because each one has its own row. Sketch 1 has the same limit.

## Behaviour

4. **Changing a filter on Search runs a new AI search** (as you chose). Through Claude Code, one search took about 18 seconds in testing. Each filter change waits that long again, and on Render each one is a billed call.
5. **"1107 of 3748 sidequests fit" is misleading.** The total counts every listing, past events included. Sketch 1 does the same (`limitsSummary` in `server.js`).
6. **The Dark/Light setting does nothing.** Profile calls `SQ.setTheme`, which doesn't exist, so tapping it throws an error in the console.
7. **Filters reach the server as a list of event ids** (up to about 2,000). That's fine at today's size, but with many more listings the filters should be applied on the server instead.

## Decisions I made (say if you want them different)

8. **Filters live in the search bar.** The reference image has no filter chips on For you. So the Filters button is now at the end of the search bar on For you, Map and Search, with a count when filters are on, and each filter that's on shows as a removable chip under the bar. "Anytime / Daytime / Evening" moved into the Filters sheet as "Time of day". Map's category chips are gone, so both views share one header.
9. **The Profile avatar is gone from the For you header,** to match the image. Profile is still in the tab bar.
10. **Discover and Search share one set of filters.** A filter set on For you also narrows Search, and the other way round.
11. **The Vibe mix circle** is white with dark text, and it counts every sidequest in that mix this week, so it can be 2 or 3 digits.
12. **"See all N"** counts every Weekly Sidequest, the same number the Weekly page shows, even when filters are on.
13. **Inputs:** text fields, search bars, chat composers and the side panel's selects now have their own fill, a lilac edge, a brighter edge on hover and a focus ring. To adjust all of them, change `--input-fill`, `--input-border`, `--input-border-hover` and `--input-ring` in `styles.css`.
14. **The save button on quest cards** now has a frosted grey circle like the reference, so it shows on light photos.
15. **Search reveals 5 at a time,** but it fills the screen first. If 5 results don't reach the bottom, the next 5 show straight away.

## Second round (claude.md, 2026-10-18)

16. **Distance starts off.** The distance slider runs from 1 km to "Within 10 km", but no distance limit is set until you move it. The label says "Anywhere" until then. Otherwise everything over 10 km away would be hidden by default. Price works the other way: its top stop, "$100+", means no limit.
17. **Price is "up to".** The price slider is the most you'd pay: Free, then up to $5, $10 … $95, then $100+. Listings with no price are hidden while a price limit is on.
18. **Three layouts by width, no phone frame:** phone up to 760px, tablet from 761px (centred column, bottom tab bar), desktop from 1100px (sidebar). The old phone-frame preview and its Layout switch are gone. Sketch controls open from a corner button on tablet and desktop, and are hidden on a phone as before (so a demo login code only shows on a tablet or desktop).
23. **The map credit is folded, not deleted.** The "© OpenFreeMap © OpenStreetMap" banner now starts closed as a small dark "i" button that shows the credit when tapped. OpenStreetMap's licence requires the credit to be on the map, so it isn't removed entirely.
24. **Selected cards no longer resize.** Role cards, vibe tiles, "when you go out" cards, account cards and code boxes show their selection with an outline or inset ring instead of a thicker border.
19. **Desktop is the phone design, spread out.** Screens use the same components in a wider column. Discover's rows still scroll sideways rather than becoming grids, and detail screens (a sidequest, onboarding, forms) are a 680px column. Some screens with sidebar tabs, like Community's party cards, stretch to the full 1040px column, which could use a grid later.
20. **The Vibe Mixes tile titles** are now 16px (Title M) under the 20px section heading.

## Already done before this round

21. **Apple and Google sign-in** were removed on Oct 16 (commit 1ad1b4f). This round only deleted their leftover, unused icons.
22. **Supabase was already shared with Sketch 1.** Sketch 2 uses Sketch 1's keys and the same project, and its tables (`sketch2_events`, `sketch2_accounts`, `app_state` row 2) were already there and in use.
