# Sketch 1: Sidequest

**What it is:** the [Sidequest proposal](../SideQuest%20Proposal/Version-1.0)'s layout, screens, interactions and features, rebuilt at higher fidelity, and running on a real server, database and AI the way [Sketch 0](../sketch-0) does.

- **Layout, flows and features** follow the proposal's [wireframe](../SideQuest%20Proposal/Version-1.0/sidequest-wireframe) and [ProductSpecs.md](../SideQuest%20Proposal/Version-1.0/ProductSpecs.md): the same 38 screens across the attendee and host apps, the same tabs, and the same journeys (onboarding, For You, Crew Blend and the group vote, Quest Requests, Quest Log, Event Day Mode, host registration, publishing, Demand Insights, recaps).
- **Visual style is deliberately unstyled**: greyscale only, with no gradients, shadows, glows, blurs or decorative motion (the one thing that still moves is the loading ring, so you can tell the AI is working). Event photos and posters are shown in greyscale too. Dark and Light modes both keep text at WCAG AA contrast or better. Layout, fonts (Syne and DM Sans), spacing and radii still follow the [Visual Design Guide](../SideQuest%20Proposal/Version-1.0/VisualDesignGuide-Proposals.md), and the CSS variables keep the guide's names (`--sq-accent-primary`, `--radius-lg`, …), so its "Dark neon nightlight" colours can go back in by changing the tokens at the top of `public/styles.css`.
- **Server, database and AI** work like Sketch 0, plus everything the wireframe only faked is now real and shared: a request an attendee posts shows up in the host's Demand Insights, a host's claim notifies the people who asked, a published quest lands in attendees' For You feeds, and a host's live update appears in Event Day Mode.

**The events are real.** `events/data/events.json` holds every in-person GTA listing we could collect for the next four months, imported by `node events/run.js` from Eventbrite, Meetup, DICE, Luma, the City of Toronto's Festivals & Events open data, Ticketmaster, and Toronto venues' Instagram posts. Titles, dates, venues, prices, descriptions, organizers, photos/posters and ticket links come from the listings. **Anything a listing doesn't give is shown as "N/A"** (price, end time, organizer, description, image, address); nothing is filled in with guesses. Each quest's page has a "Listing details" card with every field and a link to the original listing (and to the other sites it's also listed on). What's still made up: the six friends you can add to a party, and the starting Quest Requests. Trip times are Sidequest's own estimates from each venue's coordinates (see below). Real listings have no reviews or "who's going" data, so the app doesn't show any.

## Real events: the importer
## Real events: the importer

The importer moved to its own folder, [`events/`](../events/README.md), shared with Sketch 2. Sketch 1 reads `events/data/events.json`.


## Adding events from a poster

Hosts and attendees can add an event by uploading a poster or a screenshot (of a post, a story or a listing). The AI reads it (OCR through Claude's image reading: Claude Code on your subscription, or the API if `.env` has a key) and fills in the form: title, date, start and end time, venue and address, price, organizer, ticket link and a short description. People check it and change anything before it goes live. A poster that lists several dates (a monthly lineup) offers each one to pick from.

- **Hosts**: "Create a quest" starts with *Add from a poster or screenshot*. If the event is already on Sidequest (imported from another site, or added by a member), the host sees it and can **claim it** instead of publishing a copy: the listing becomes theirs, keeps its links to other sites, and survives re-imports. Publishing anyway merges the host's details and poster into that listing.
- **Attendees**: "Spotted an event? Add it from a poster" on the Requests screen (also on Profile). It's listed as added by a Sidequest member. If it's already listed, the poster fills that listing's gaps (an image, a price) instead of making a copy.
- The venue goes on the map from listings we already have, or from its name and address through OpenStreetMap's free Nominatim service (one lookup a second, cached in `data/geocode.json`). Attendees need a venue we can place; hosts fall back to their neighbourhood.

**Posters** are kept as copies named by a hash of the image (so the same poster always gets the same address, which also helps spot duplicates). With Supabase keys in `.env` they go to a public Supabase Storage bucket, `posters`, created on first use, so they survive deploys. Otherwise they're files in `data/posters/` served at `/posters/`.

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
| **Read a screenshot or link** | Discover → + button | Reads a screenshot of an event (Eventbrite, Instagram, a poster…), or a shared link whose page has no event data of its own, searches the web for the original listing, and fills in a draft. Nothing is guessed: blanks show as N/A. Needs the API or Claude Code; without either, the person fills the form in by hand. |

Budget and travel limits are applied **before** the AI sees anything, and only events from the eligible list are accepted back, so nothing over budget or too far can be picked.

## Events found by attendees

Anyone can add an event Sidequest doesn't have: tap **+** on Discover, then paste the event's link, pick a screenshot, or tap **Enter it yourself**. A link from Eventbrite, DICE, Luma, Meetup and most ticket sites fills the form straight from the page's own event data (no AI needed); other pages and screenshots go to the AI. Check the draft and make sure it links to the original listing (required). It goes up marked **Unverified** and is linked to that listing; the same link twice opens the existing event instead of making a copy.

- **Verifying:** another attendee opens the event and taps **Get tickets** (the purchase-ticket button, on the quest page or after accepting). That opens the original listing and unlocks **It's real** / **Not real**. The person who added an event can't verify it. Whichever answer has more votes wins: **Verified**, or **Reported** (hidden from feeds and search). The person who added it is notified either way.
- **Flagging:** every event page has **Flag incorrect info**: pick what's wrong (title, date, venue, price…) and say what. Flags show on the event page for everyone.

These events live in the same `events` store as everything else (Supabase or `data/db.json`), with `importedBy`, `verification` and `flags` fields, so no schema change is needed, and they're kept when listings are re-imported.

## The database

One JSON file, `data/db.json`, created from the files in `seed/` the first time you run the server. Every change is written straight back, so restarts keep everything. It holds attendee and host accounts, parties (members, votes, chat), events (samples plus anything hosts publish), Quest Requests, notifications, host updates, event chat, check-ins, and the logs hosts' numbers come from: searches (with unmet interests), "Accept quest" taps, "Did you go?" answers and ratings, and "not for me" taps. **Reset all data** in the side panel (or deleting `data/`) starts over. `data/` is not committed.

**Supabase (for a deployed server).** Hosts like Render wipe `data/` on every deploy, so the same database can live in [Supabase](https://supabase.com) instead (still no `npm install`: it uses Supabase's REST API):

1. Create a Supabase project and run `supabase/schema.sql` in its SQL Editor.
2. Add `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (Project Settings → API; the secret key, not the anon key) to `.env`, or to your host's environment variables.
3. Run `node server.js`. It prints `Database: Supabase`, and the first run fills Supabase from `seed/`.

Events are stored one row each, and everything else is one `app_state` row, so a tap only re-sends what changed. Run one server at a time: each keeps the data in memory. Without the keys, everything works from `data/db.json` as before.

**Analytics.** Every tap, screen view and AI call is also recorded as one row in the `analytics_events` table (or `data/analytics.jsonl` without Supabase keys), for the launch questions: confirmed attendance and ratings by week, the funnel from signup to rating, retention, which recommendations lead to accepts, AI speed and fallbacks, and what happens to Quest Requests. `supabase/analytics-queries.sql` has a query for each; paste them into Supabase's SQL Editor. Rows hold ids, choices and counts only, never names, emails, chat or search text. Demo shortcuts (`demo: true`) and failed taps (`ok: false`) are recorded but left out of the queries.

Your browser only remembers which attendee and host account are yours (and your theme). There are no passwords; anyone on the same server can act as any host from the sample list.

## Ticket wallet

Quest Log → the ticket icon opens the wallet. "Add a ticket" takes a screenshot or photo, a PDF ticket, or an Apple Wallet pass (`.pkpass`), so every ticket sits in one place. Accepting a quest also offers "Add my ticket to my wallet", and Event day mode shows the ticket.

- **Codes stay scannable.** The browser finds every QR code, PDF417, Aztec, Data Matrix or barcode in the file ([zxing-wasm](https://github.com/Sec-ant/zxing-wasm), loaded only on this screen), redraws it sharp from its exact contents, then decodes the redraw and keeps it only if it reads back byte for byte. If it can't be redrawn, the original pixels are kept, cropped and never resized. Codes always show on white, and the screen stays awake while a ticket is open.
- **Details** (event, venue, date, seat) are read by the AI from the picture or the PDF's text; a Wallet pass's own fields fill them without AI. You check them before saving. A ticket is linked to its quest when the date matches and the titles share a word.
- Tickets live on the attendee, in the same database as everything else (`data/db.json` or Supabase's `app_state`), so no new table is needed.
- Tickets whose code changes every few seconds (Ticketmaster SafeTix) can't be copied by anyone and stay in their own app.

## What's honest about the numbers

Sketch 0's rule carries over: tapping **Accept quest** is intent only. After the quest (2 hours after it starts, when the host ends it, or with "Demo: skip to after the event"), the Quest Log asks **Did you go?**. Only a "yes" counts toward the north star and unlocks the rating. Hosts see accepts and confirmed attendance side by side in their dashboard and recaps.

## Files

- `server.js`: the web server, every action the app can take, budget and travel limits, the host report (Demand Insights, recaps, audience), and the AI endpoints
- `lib/ai.js`: the three AI backends, the four prompts, and the keyword fallbacks
- `lib/db.js`: the database (Supabase when its keys are in `.env`, otherwise `data/db.json`), and the sample friends' taste profiles
- `supabase/schema.sql`: the tables to create in Supabase
- `lib/analytics.js`, `supabase/analytics-queries.sql`: launch analytics, and the queries that read them
- `seed/`: the starting Quest Requests (`requests.json`)
- `../events/`: the importer, its sources and the imported events (see its README)
- `public/index.html`, `public/styles.css`: the phone shell, side panel and design tokens
- `public/js/ui.js`: icons, event images (or an "Image: N/A" box), and shared components
- `public/js/screens-attendee.js`, `public/js/screens-host.js`: every screen
- `public/js/actions.js`: what each button does
- `public/js/wallet.js`: the ticket wallet (importing, code reading and redrawing, its screens)
- `public/js/app.js`: navigation, rendering, and talking to the server
- `strategy.md`: the product strategy the AI is steered by (copied from Sketch 0)

## Known gaps

- Only four starting points for trip times (Union, Finch, Kennedy, Kipling), and the times are estimates.
- Listings are a snapshot: re-run the importer to refresh. Events are sent to the browser separately from the rest of the app's state, and only again when they change, so thousands of listings don't slow every tap. Vibes come from keywords in each listing, so some are off (a DJ night tagged only as live music, for example).
- Copying other platforms' listings is fine for a class prototype, not for a launched product. The research's advice still stands: real launch data should come from hosts and partner feeds.
- Claude Code can take 10 to 30 seconds per AI call. The app shows a loading state and caches results, but the API is much faster.
- Friends are sample profiles, not other people using the app, so party votes and chat replies are simulated.
- Out of scope, as in the wireframe: social sign-in, uploads other than posters, event screenshots and tickets (photos, venue maps), ticket scanning, scheduling, chat moderation, payouts.
- Not built from the spec's later list: Find my party with real locations, rideshare.
