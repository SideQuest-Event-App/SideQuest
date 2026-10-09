# Sketch 1: Sidequest

**What it is:** the [Sidequest proposal](../SideQuest%20Proposal/Version-1.0)'s layout, screens, interactions and features, rebuilt at higher fidelity, and running on a real server, database and AI the way [Sketch 0](../sketch-0) does.

- **Layout, flows and features** follow the proposal's [wireframe](../SideQuest%20Proposal/Version-1.0/sidequest-wireframe) and [ProductSpecs.md](../SideQuest%20Proposal/Version-1.0/ProductSpecs.md): the same 38 screens across the attendee and host apps, the same tabs, and the same journeys (onboarding, For You, Crew Blend and the group vote, Quest Requests, Quest Log, Event Day Mode, host registration, publishing, Demand Insights, recaps).
- **Visual style is deliberately unstyled**: greyscale only, with no gradients, shadows, glows, blurs or decorative motion (the one thing that still moves is the loading ring, so you can tell the AI is working). Event photos and posters are shown in greyscale too. Dark and Light modes both keep text at WCAG AA contrast or better. Layout, fonts (Syne and DM Sans), spacing and radii still follow the [Visual Design Guide](../SideQuest%20Proposal/Version-1.0/VisualDesignGuide-Proposals.md), and the CSS variables keep the guide's names (`--sq-accent-primary`, `--radius-lg`, …), so its "Dark neon nightlight" colours can go back in by changing the tokens at the top of `public/styles.css`.
- **Server, database and AI** work like Sketch 0, plus everything the wireframe only faked is now real and shared: a request an attendee posts shows up in the host's Demand Insights, a host's claim notifies the people who asked, a published quest lands in attendees' For You feeds, and a host's live update appears in Event Day Mode.

**The events are real.** `seed/events.json` holds every in-person GTA listing we could collect for the next four months, imported by `node import/run.js` from Eventbrite, Meetup, DICE, Luma, the City of Toronto's Festivals & Events open data, and (with a key) Ticketmaster. Titles, dates, venues, prices, descriptions, organizers, photos/posters and ticket links come from the listings. **Anything a listing doesn't give is shown as "N/A"** (price, end time, organizer, description, image, address); nothing is filled in with guesses. Each quest's page has a "Listing details" card with every field and a link to the original listing (and to the other sites it's also listed on). What's still made up: the six friends you can add to a party, and the starting Quest Requests. Trip times are Sidequest's own estimates from each venue's coordinates (see below). Real listings have no reviews or "who's going" data, so the app doesn't show any.

## Real events: the importer

```
cd sketch-1
node import/run.js        # first run takes 2 to 3 hours (mostly Eventbrite's ~9,000 event pages, read politely);
                          # re-runs within 12 hours come from the cache and take minutes
node server.js            # picks up the new events; accounts, logs and requests are kept
```

| Source | How | Notes |
|---|---|---|
| **DICE** | The event sitemaps DICE publishes for search engines, filtered to GTA events, then each event page's schema.org data | Exact start times, venue coordinates, prices in CAD. DICE's `/api/` is off-limits in its robots.txt, so it isn't used. |
| **Eventbrite** | Every Toronto "all events" listing page for the window (split into smaller date ranges until each fits under Eventbrite's 49-page limit), then each in-person event's page for price, organizer and full description | There's no public search API, and `/api/v3/destination/events/` is off-limits in robots.txt. Listing pages rate-limit, so the importer waits 6 seconds between them and backs off on a 429. Prices Eventbrite shows in USD are converted and marked "converted". |
| **Meetup** | The public "find events" pages for in-person events within 25 miles of Toronto, one day at a time (by relevance and by time), plus the Toronto city page, then each event's page for venue coordinates, fee and photo | Meetup's API needs a paid Pro account. Each find page only shows a day's top events, so this is most, not all, of Meetup. No Meetup fee doesn't mean free (many groups charge elsewhere), so those prices are N/A. |
| **Luma** | Luma's Toronto discover list (the same `api.lu.ma/discover` call the page makes; robots.txt allows it), then each event page for its description | Only the events Luma features for Toronto, a few dozen. |
| **City of Toronto** | The [Festivals & Events open data feed](https://open.toronto.ca/dataset/festivals-events/) | Official, no scraping: festivals, exhibits, performances, markets and tours on the City's calendar, with images. Long runs (an exhibit open for weeks) are listed once, on their next date, with "Runs until". |
| **Ticketmaster** | The official [Discovery API](https://developer.ticketmaster.com/) | Needs a free key: add `TICKETMASTER_API_KEY=...` to `.env`, then re-run. Sports are left out (outside our three scenes). |
| Resident Advisor | Not imported | ra.co answers automated visitors with a 403 and a captcha, disallows its API, and blocks AI crawlers (Anthropic's included) from the whole site in robots.txt. |
| Partiful | Not imported | Its robots.txt only admits search engines and link-preview bots, and its events are mostly private invites with no public Toronto listing. |
| blogTO | Not imported | Its terms and robots.txt prohibit scraping and building datasets from its content. |

The importer identifies itself honestly, waits between requests to each site (the sources run side by side, each at its own pace), and caches what it reads in `import/.cache/` (12 hours; for big pages only the few fields it uses) so re-runs are quick. It keeps every in-person GTA event except clearly off-topic ones (webinars, business seminars, real estate, pro sports games and the like, judged by title and category). Events are tagged with vibes from the listing's own words; ones that match none of our vibes get the scene "Other" and still show up in search and filters. It merges the same event listed on two sites (same day, same block, same title words), keeps the fuller listing and fills its gaps from the other, and works out the neighbourhood from the venue's coordinates. Options: `DAYS=30`, and `DICE_MAX`, `EVENTBRITE_MAX`, `MEETUP_MAX`, `LUMA_MAX`, `TORONTO_MAX`, `TICKETMASTER_MAX` to cap a source.

**Trip times** are estimates: subway time over the real Line 1 and Line 2 network from Union, Finch, Kennedy or Kipling (2 minutes a stop, 4 per transfer), plus a walk or a bus/streetcar leg from the nearest station. Good enough to filter "too far", not a trip planner.

The database is also lighter on fake activity now: host dashboards start empty and fill up as you use the app.

## Run it

Needs [Node.js](https://nodejs.org) 18 or newer. No `npm install` needed.

```
cd sketch-1
node server.js
```

Then open http://localhost:3000. On a laptop it shows inside a phone frame with demo controls beside it (switch between the attendee and host apps, jump to any screen, change the theme, reset the data). On a phone (same Wi-Fi, your computer's IP and port 3000) it fills the screen.

Quick tour: tap **Already on a quest? Log in** for a ready-made attendee, or **Request a quest** to go through onboarding. For the host side, pick **Host** in the side panel, then either register or use **Demo: sign in as a host from the sample events**.

## The AI

Same setup as Sketch 0. It uses, in order: the Anthropic API if `.env` has a key, otherwise Claude Code (`claude` on your PATH, using your Claude subscription), otherwise simple keyword matching (not AI). The side panel and every AI-written line say which one was used. If the AI fails, the app falls back to keywords and says so instead of breaking.

To use the API, copy `.env.example` to `.env`, paste your key, and restart. `.env` is in `.gitignore`. To skip the AI entirely (fast demos, no subscription), run `AI=off node server.js`.

With thousands of real listings, the AI doesn't read them all: each job first shortlists the best few dozen candidates by vibe and keyword overlap, then the AI ranks and explains those. The AI does four jobs, all steered by `strategy.md` (re-read on every request, edit freely):

| Job | Where | What it does |
|---|---|---|
| **Taste avatar** | Discover (For You), onboarding, Profile | Scores every eligible event 0–100 for you from your vibes, past events, ratings and "not for me" taps, and writes the "why this is for you" line and a one-sentence summary of your taste. Re-runs only when any of that changes. |
| **Search** | Discover search bar | Sketch 0's matching: what you're in the mood for, in; up to 5 picks with reasons out. Interests nothing fit are listed with the reason (nothing listed, over budget, too far) and can become a Quest Request. |
| **Crew Blend** | Parties → your party | Sketch 0's crew matching: picks the whole party would enjoy, with a line per person and each person's trip time. The party's budget is the lowest anyone set. |
| **Draft from a request** | Host → Demand Insights → claim → Create a quest | Writes a title, description, vibes, price and start time that answer the request and fit the host. |

Budget and travel limits are applied **before** the AI sees anything, and only events from the eligible list are accepted back, so nothing over budget or too far can be picked.

## The database

One JSON file, `data/db.json`, created from the files in `seed/` the first time you run the server. Every change is written straight back, so restarts keep everything. It holds attendee and host accounts, parties (members, votes, chat), events (samples plus anything hosts publish), Quest Requests, notifications, host updates, event chat, check-ins, and the logs hosts' numbers come from: searches (with unmet interests), "Accept quest" taps, "Did you go?" answers and ratings, and "not for me" taps. **Reset all data** in the side panel (or deleting `data/`) starts over. `data/` is not committed.

**Supabase (for a deployed server).** Hosts like Render wipe `data/` on every deploy, so the same database can live in [Supabase](https://supabase.com) instead (still no `npm install`: it uses Supabase's REST API):

1. Create a Supabase project and run `supabase/schema.sql` in its SQL Editor.
2. Add `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (Project Settings → API; the secret key, not the anon key) to `.env`, or to your host's environment variables.
3. Run `node server.js`. It prints `Database: Supabase`, and the first run fills Supabase from `seed/`.

Events are stored one row each, and everything else is one `app_state` row, so a tap only re-sends what changed. Run one server at a time: each keeps the data in memory. Without the keys, everything works from `data/db.json` as before.

**Analytics.** Every tap, screen view and AI call is also recorded as one row in the `analytics_events` table (or `data/analytics.jsonl` without Supabase keys), for the launch questions: confirmed attendance and ratings by week, the funnel from signup to rating, retention, which recommendations lead to accepts, AI speed and fallbacks, and what happens to Quest Requests. `supabase/analytics-queries.sql` has a query for each; paste them into Supabase's SQL Editor. Rows hold ids, choices and counts only, never names, emails, chat or search text. Demo shortcuts (`demo: true`) and failed taps (`ok: false`) are recorded but left out of the queries.

Your browser only remembers which attendee and host account are yours (and your theme). There are no passwords; anyone on the same server can act as any host from the sample list.

## What's honest about the numbers

Sketch 0's rule carries over: tapping **Accept quest** is intent only. After the quest (2 hours after it starts, when the host ends it, or with "Demo: skip to after the event"), the Quest Log asks **Did you go?**. Only a "yes" counts toward the north star and unlocks the rating. Hosts see accepts and confirmed attendance side by side in their dashboard and recaps.

## Files

- `server.js`: the web server, every action the app can take, budget and travel limits, the host report (Demand Insights, recaps, audience), and the AI endpoints
- `lib/ai.js`: the three AI backends, the four prompts, and the keyword fallbacks
- `lib/db.js`: the database (Supabase when its keys are in `.env`, otherwise `data/db.json`), and the sample friends' taste profiles
- `supabase/schema.sql`: the tables to create in Supabase
- `lib/analytics.js`, `supabase/analytics-queries.sql`: launch analytics, and the queries that read them
- `seed/`: imported real events (`events.json`) and the starting Quest Requests
- `import/`: the importer (`run.js`), one file per source in `import/sources/` (DICE, Eventbrite, Meetup, Luma, City of Toronto, Ticketmaster), `normalize.js` (vibes, neighbourhoods, subway trip times) and `fetch.js` (polite, cached downloads)
- `public/index.html`, `public/styles.css`: the phone shell, side panel and design tokens
- `public/js/ui.js`: icons, event images (or an "Image: N/A" box), and shared components
- `public/js/screens-attendee.js`, `public/js/screens-host.js`: every screen
- `public/js/actions.js`: what each button does
- `public/js/app.js`: navigation, rendering, and talking to the server
- `strategy.md`: the product strategy the AI is steered by (copied from Sketch 0)

## Known gaps

- Only four starting points for trip times (Union, Finch, Kennedy, Kipling), and the times are estimates.
- Listings are a snapshot: re-run the importer to refresh. Events are sent to the browser separately from the rest of the app's state, and only again when they change, so thousands of listings don't slow every tap. Vibes come from keywords in each listing, so some are off (a DJ night tagged only as live music, for example).
- Copying other platforms' listings is fine for a class prototype, not for a launched product. The research's advice still stands: real launch data should come from hosts and partner feeds.
- Claude Code can take 10 to 30 seconds per AI call. The app shows a loading state and caches results, but the API is much faster.
- Friends are sample profiles, not other people using the app, so party votes and chat replies are simulated.
- Out of scope, as in the wireframe: social sign-in, uploads (posters, photos, venue maps), ticket scanning, scheduling, chat moderation, payouts.
- Not built from the spec's later list: Find my party with real locations, rideshare, in-app tickets.
