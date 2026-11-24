# Sketch 2: Sidequest, as designed

**What it is:** the [Sidequest — App Screens](https://www.figma.com/design/7EVuAdMhiXva0GgXMH7897/Sidequest-%E2%80%94-App-Screens?node-id=283-5129) Figma page, coded. Every visible screen is here, with the design's fonts (Geist and Geist Mono), colours, spacing, radii and components. Hidden screens in the file were left out.

Sketch 2 is built on [Sketch 1](../sketch-1): the same server, database, AI, events and actions. Sketch 1's code was copied in once and then edited here, so nothing is written twice. The real events come straight from Sketch 1 (`../sketch-1/seed`), and so does its importer and duplicate checker. Sketch 1 itself isn't changed.

## Run it

```
cd sketch-2
node server.js            # http://localhost:3001, so it can run next to Sketch 1 on 3000
```

There's nothing to install. Copy `.env.example` to `.env` to turn on the AI (`ANTHROPIC_API_KEY`) and Supabase (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`). Anything Sketch 2's `.env` leaves out is read from `../sketch-1/.env`, so Sketch 1's keys work here too. The server's first lines say which database it's using. Without them the app runs on keyword matching and `data/db.json`. With Supabase, run `supabase/schema.sql` once, after Sketch 1's schema.

Where accounts show up in Supabase, once onboarding is finished (or a host is approved): the `sketch2_accounts` table has one row per account (email, username, name, phone, role, and the whole profile in `data`), and **Authentication > Users** gets the email. Each server only writes the accounts it changed, so two people running Sketch 2 against the same Supabase don't erase each other's sign-ups. Until `supabase/schema.sql` has made that table, accounts stay inside `app_state` row 2 and the server says so when it starts.

## Sidekick planning calls (in testing)

Open `/sk` to start a planning call. Pick your nights, share the link, and friends join with voice, text, or a quick form, with no app needed.

**How it works:**
- Sidekick fills in a live plan board as people talk.
- It asks one question at a time: the one that narrows the real listings the most.
- Budget and dealbreakers are collected privately.
- It suggests two picks once no answer left would change them. The crew votes, and the planner locks the plan.

**Requirements:**
- Voice captions use the browser's speech recognition (Chrome, Edge or Safari). Everyone can type instead.
- Set `ANTHROPIC_API_KEY` so Sidekick understands speech and talks in its persona. Without it, the call still works using keyword matching and fixed lines.

**Where things are:**
- Code: `lib/sidekick/` (engine, personas, call server) and `public/sidekick.html`, `public/sidekick.css`, `public/js/sidekick.js`.
- Design and rules: `reference/sidekick-conversation-design.md`.
- The two personas and the A/B test: `reference/sidekick-personas.md`.

**Places (Google):** with `GOOGLE_MAPS_API_KEY` set, Sidekick also suggests places that don't need tickets (bars, karaoke, arcades, galleries) and can ask "a ticketed event, or just somewhere good to go?". Every search is counted, and the app stops at 80% of Google's free monthly allowance and at a daily cap, then carries on with events only (`lib/sidekick/usage.js`). Also set quota caps in Google Cloud as a second stop. Details: `reference/sidekick-places-plan.md`.

**Voice agent (ElevenLabs):** with `ELEVENLABS_API_KEY` and the two agent IDs set, the planner sees "Turn on Sidekick's voice". The planner's phone then runs the ElevenLabs agent as Sidekick's voice, while our server still decides every move and sends it to the agent as a cue. Minutes are capped the same way. If ElevenLabs can't be reached, the call carries on with the built-in voice. Create the agents with `node tools/elevenlabs-agents.js --create`. Details: `reference/elevenlabs-agent-spec.md`.

**Several phones in one room:** every phone's mic hears everyone, so the server drops a line when another phone sent nearly the same words in the last 4 seconds (the first phone's speaker keeps it), and drops lines that repeat what Sidekick said in the last 12 seconds (another phone reading Sidekick aloud). Typed lines are never dropped.

**Talk in the app (in-app audio):** for friends who aren't together. Voice joiners tap "Talk in the app" and hear each other phone to phone (WebRTC, 2 to 6 people). The server only passes the connection messages along (`/api/sk/rooms/:id/signal`); audio never goes through it. The mute button mutes both the call and captions. A green dot on an avatar means you're connected to that person (yellow: connecting, grey: muted).
- Captions keep running alongside on Chrome and Android. iPhones can't caption while a call uses the mic, so captions pause there and the phone shows the text box.
- While anyone is in in-app audio, every phone in it reads Sidekick aloud with the browser voice, so remote friends hear it too. Their mic is muted for that moment so Sidekick isn't sent twice.
- The ElevenLabs voice agent still runs on the planner's phone only, and remote friends don't hear it through in-app audio; their phones read its words with the browser voice once it has said them, so they hear it a moment late.
- **TURN:** phones connect directly using Google's public STUN server. Some mobile networks and strict wifi block direct connections, and then audio says "connecting" and never connects. A TURN relay fixes that: create a free one (for example Metered's free tier at metered.ca, "Open Relay" / TURN server, about 20 GB a month) and set `SIDEKICK_TURN_URL` (comma-separated, e.g. `turn:global.relay.metered.ca:80,turns:global.relay.metered.ca:443?transport=tcp`), `SIDEKICK_TURN_USER` and `SIDEKICK_TURN_PASS`. They're sent only to phones that join audio.

**Invite links:** `/sk/<room>` has link-preview tags, so iMessage, WhatsApp, Instagram DMs, Messenger, Slack and Discord show a card: the "Who's in?" image (`public/og/invite.jpg`, 1200 x 630, and a 1200 x 1200 square), with "<crew>: help plan our next night" and the nights under it. Only the crew name and nights are used, never names or answers. The planner's invite has Share (the phone's share sheet), Copy, WhatsApp, Messages, Messenger, Telegram and "Instagram: copy link, then paste in your DM" (Instagram has no share link). To change the card, edit `public/og/invite.html` and run `node tools/render-og.js`. Apps cache previews, so a changed card can take a while to show for a link already shared.

**Reconnects:** if a phone locks or loses signal, it reconnects on its own and stays in the call; a small "Reconnecting…" shows only if it takes more than 2 seconds. Calls live in the server's memory, so when the app restarts (a deploy, or Render's free plan sleeping) every call ends, and phones say "This call ended when the app restarted. Start a new one".

All the settings are listed in `.env.example`.

**Test it:**

```
node test/sidekick-eval.js              # scripted calls, both personas, checked against everyone's limits
node test/sidekick-eval.js --keywords   # the same without AI calls for understanding speech
node test/sidekick-integrations.js      # spending caps, places and the voice agent, with Google and ElevenLabs faked
node test/sidekick-modes.js             # the opening check-in: lead or sit back
node test/sidekick-multiphone.js        # duplicate and echo lines from several phones, ICE settings
node test/sidekick-share.js             # link-preview tags, the card image, signalling (starts its own server)
node test/sidekick-audio.e2e.js         # three Chromium "phones" connect in-app audio (needs Playwright)
```

### How to test with friends

1. Deploy to Render (below) and open the Render link, `https://<your-app>.onrender.com/sk`, on your phone. On the free plan, open it a minute early: a sleeping app takes about 30 seconds to wake, and waking ends any call that was running.
2. One person starts the call, picks the nights and taps Start. Share the link from the invite panel (Share, WhatsApp, Messages...). Everyone else opens the link on their own phone and taps "Join with voice" (or "Join by text", or "Answer without calling").
3. **In the same room:** leave the captions mic on for everyone, but only the planner's phone reads Sidekick aloud (the speaker button). The app drops the duplicate captions. If it's noisy, mute all phones except one and let that phone hear the room.
4. **Not together:** everyone taps "Talk in the app" (headphones stop echo). Each phone then reads Sidekick aloud. If someone stays on "connecting", set up TURN (above). FaceTime or another call app works too: then leave in-app audio off.
5. Allow the microphone when asked. On iPhone, use Safari and tap the page once if Sidekick is silent.

## Put it online (Render)

Sketch 2 runs on Render the same way as Sketch 1, as a second web service from this repo, on the same Supabase project.

1. In Supabase's SQL Editor, run `supabase/schema.sql` once (after Sketch 1's). The tables are already there in our project.
2. On Render: **New > Web Service**, pick this repo, and copy Sketch 1's service settings with these changes:
   - **Root Directory:** leave it empty. Sketch 2 reads Sketch 1's events and importer (`../sketch-1/seed`, `../sketch-1/import`), so it needs the whole repo.
   - **Start Command:** `node sketch-2/server.js`. There's nothing to install, so the build command can be the same as Sketch 1's.
   - **Environment variables:** `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (the same values as Sketch 1's service) and `ANTHROPIC_API_KEY`. Render sets `PORT` itself. For in-app audio on mobile networks, also `SIDEKICK_TURN_URL`, `SIDEKICK_TURN_USER` and `SIDEKICK_TURN_PASS` (see "Talk in the app" above).
3. Deploy. The log's first lines should say `Database: Supabase` and `Matching with AI via the Anthropic API`.

Render has no Claude Code, so online the AI runs on the API key, and every feed, search page, Crew Blend and poster read is billed. Search asks for 10 picks at a time and only asks for the next 10 once you've scrolled through them. Without `ANTHROPIC_API_KEY` the online app falls back to keyword matching. On your own computer, leave the key out of `.env` to run the AI on your Claude subscription instead.

Run one Sketch 2 server per Supabase project at a time. Each server keeps the app's shared state (parties, requests, notifications) in memory and writes the whole thing to `app_state` row 2, so a local server and the Render one would overwrite each other's changes. Accounts and added events are safe either way: each account is its own row in `sketch2_accounts`, and before each request the server re-reads the account making it and any events added elsewhere, so Render's deploy overlap (old and new server both running for a moment) doesn't lose them.

## Log in and sign up

- **Log in:** enter your email. If an account (attendee or host) uses it, a 6-digit code is sent and you go to the code screen. The right code takes you into that account.
  - With Supabase, Supabase Auth emails the code. Its "Magic Link" email template needs `{{ .Token }}` so the code is in the email.
  - Without Supabase there's no email service, so the code is shown in the side panel.
- **Create an account:** pick "I'm going out" (attendee onboarding, 7 steps) or "I host events" (host onboarding, 8 steps). Usernames are unique. They're checked when you leave the field (at sign-up and in Edit profile), and a taken one gets three free suggestions.
- **Nothing is stored until onboarding is done.** An account still in onboarding lives only in the server's memory, so nothing is kept about people who give up partway. It's written to the database when the attendee finishes onboarding, or when a host's account is approved.

## What's in it

| Part | Screens |
|---|---|
| Start | Landing, going out or hosting, log in (email, code), make your account |
| Attendee onboarding | Vibes, been to any of these, when you go out, areas (map), assemble your party, taste avatar |
| Discover | For you (Weekly Sidequests, Vibe Mixes) and Map, with the same header: For you / Map, notifications, and the search bar with Filters. Search results come in 5 at a time as you scroll, and changing a filter searches again |
| Sidequest | Details, 19+ age check, all-ages notice, tickets hand-off, ticket import, ticket wallet |
| Community | Friends, friends' highlights (what friends rated 4 stars and up), friend requests (Add sends one; they're a friend once they accept, and show in Notifications and on the Friends page), a friend's profile with their recent sidequests and Remove friend, parties, party (Crew Blend, podium vote), group plan, Sidequest Requests, new request |
| Sidequests log | Upcoming, Saved, Completed, calendar, event day, attendee chat, check-in, rating, memories, Wrapped |
| Profile | Profile, edit profile, getting around, switch account |
| Host onboarding | What you host, host account, verification, profile, ticketing, team, claim listings, review, demand map |
| Host tools | Demand insights (with a map), request detail, draft test, create a sidequest (2 steps), published, your sidequests (Live, Drafts, Past), event day tools, insights (Overview, Recap), audience, inbox, host profile |

**Phone, tablet and desktop.** The app is full screen at every size, and its layout follows the window's width. Up to 760px it's the phone design as drawn. From 761px it's the tablet layout: the same screens filling the window with a margin that grows with it, and the tab bar at the bottom. From 1100px it's the desktop layout: the tab bar becomes a sidebar, the landing page splits into photos and pitch, and the map fills the space. The sketch controls (screen jump, role, reset, demo login codes) open from a button in the bottom-left corner on a tablet or desktop. On a phone they're hidden.

**Every map is a real, interactive map:** drag to pan, scroll or pinch to zoom, double-tap to zoom in, and use the zoom and home buttons. Pins open what they stand for, and the map stays where it is when you tap one. On a computer, the sideways rows on Discover scroll with the mouse wheel or by dragging.

- The maps use [MapLibre](https://maplibre.org) with OpenStreetMap data from [OpenFreeMap](https://openfreemap.org), which needs no API key. Both load from the internet, so the maps stay blank offline.
- The map style shows only land, parks, water and streets, in the design's map colours. It has no shops, restaurants, transit stops or place names.
- The only things on a map are Sidequest's own: event pins, the Home marker and the design's neighbourhood labels. The host demand map shows request pins, and the areas step of onboarding shows the neighbourhoods you can pick.

## Where the data comes from

Numbers on the host screens come from real activity: request asks and upvotes, sidequest views, accepts, saves, check-ins, ratings and follows. When there's no data yet, the screen says so instead of showing a made-up number.

The exceptions, each marked in the code with a `ponytail:` comment:

- **Draft test.** Attendees can't see drafts yet, so a test only fills in when the host taps "Simulate 3 days of interest", which the design includes. The simulated numbers depend on how well the draft fits its request (price, start time, vibes).
- **Saves have no timestamps**, so the 7, 30 and 90 day Overview windows all show current saves.
- **Review.** There's no review team in this sketch, so submitting for review approves the host straight away.
- **Scheduled announcements and sidequests** go out on the first app load after their time, not to the minute.

## Where the events come from (automatic import)

Sketch 1's importer (`sketch-1/import/`) gathers the next three months of in-person GTA events. A GitHub Action (`.github/workflows/import-events.yml`) runs it on its own and puts the result in Supabase Storage. This server checks for a new import every 6 hours, so you don't need to commit, redeploy or restart.

- **Monday:** every source. **Thursday:** Ticketmaster and Instagram only; the other sources keep Monday's events.
- **Order** (the earlier source wins a tie between duplicates): Ticketmaster, Instagram, DICE, Meetup, Luma, City of Toronto, Toronto Public Library, Eventbrite.
- **Instagram is read by hand,** with Claude Code (no extra cost): from `sketch-1/`, run `node import/instagram.js` once or twice a week, before Monday. It reads only posts it hasn't read yet, saves their events to Supabase, and updates the numbers in `reference/instagram-accounts.md`. To add or drop an account, edit that file. The scheduled runs never use the AI.
- **Not imported:** NOW Toronto (it turns automated visitors away), Resident Advisor, Partiful and blogTO (their robots.txt or terms rule it out).

One-time setup: on GitHub, go to Settings → Secrets and variables → Actions and add `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `TICKETMASTER_API_KEY` (the same values as in `sketch-1/.env`). Then on the Actions tab, open "Import events" and click "Run workflow" for the first import. Until that first import exists, the server uses `sketch-1/seed/events.json`.

Guardrails:
- Every site is read within its robots.txt, including its Crawl-delay. A site that answers 403 or 429 (blocked or rate-limited) isn't asked again that run.
- If a source fails, or brings back under half of last run's events, it keeps last run's events.
- Instagram makes at most `IG_MAX_CALLS` AI calls per run (default 40), reads 2 images per post, and reads each post only once. It pauses accounts with 20 posts read and no events, and deletes downloaded images once they're read.
- Only events in the next three months are kept. Neither the import nor its download cache is committed to git.

## Kept from Sketch 1 beyond the design

These Sketch 1 features have no screen in the Figma file. They were kept and restyled with the design's tokens:

- Party chat
- Adding an event from a poster (reached from Requests)
- Getting-around preferences
- The Dark and Light theme switch
- Sign out
- The demo shortcuts: "skip to after the event", "sign in as a host from the sample events", and the side panel

## Small additions the design doesn't show

- **Create a sidequest** has Venue and street address fields. A listing can't go on the map without them.
- **Inbox:** choosing "Schedule" shows a time picker.
- **Event day:** what the host fills in (entrances, step-free entry, re-entry, quiet room, payments, floor plan) shows on the attendee's event day screen.
