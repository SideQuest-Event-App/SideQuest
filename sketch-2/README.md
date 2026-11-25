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

**Sidekick's voice (ElevenLabs agent):** with `ELEVENLABS_API_KEY` and the two agent IDs set, the planner's "Start the call" tap also starts Sidekick's natural voice: the ElevenLabs agent runs on the planner's phone (WebRTC, falling back to a websocket) and the mic permission comes from that same tap. No second button.
- **The agent leads**, turn by turn, like the agent on ElevenLabs' own page: it asks one short question, listens, and answers straight away. It doesn't wait for our server.
- **Client tools keep it on the plan.** The agent calls `get_next_move`, `record_facts`, `get_picks`, `show_private_card`, `accept_relax` and `get_plan_state`. They run in the planner's browser and call our API as the planner (`/api/sk/rooms/:id/agent-tool/<tool>`), so ElevenLabs never needs our web address or a shared secret. The engine stays the source of truth: the board, the cards, the picks. The tools only ever return public data: budget is the group label the crew sees anyway, and places to avoid and shared locations are never returned. `record_facts` refuses budget and dealbreakers.
- **One voice at a time.** While the agent is on, the server never speaks for itself, but it still updates the board, the cards and the picks. The agent is told only what it can't hear, as context: someone joined, a tap on a card (a private answer says "added their budget privately", never the value), picks on screen, the lock. Typed lines and friends on in-app audio reach it as messages, so it answers them.
- **The switch.** The dock shows "Natural voice on · Use the built-in voice". The choice is remembered on that phone. Study calls always use the built-in voice.
- **Falls back quietly.** If the session can't start, drops, or the minute cap is reached, the call carries on with the built-in voice (one short note if it drops mid-call, nothing otherwise) and the unused minutes are given back. Each session reserves `ELEVENLABS_MAX_CALL_MINUTES` up front.
- **The agents' settings live in code:** `node tools/elevenlabs-agents.js --update` updates both agents (prompt, client tools, a fast model with minimal reasoning, `normal` turn eagerness, speculative turns, interruptions on, privacy settings) and reads them back. It sets `eleven_flash_v2` on a new agent but keeps a voice and voice model you've since picked in the dashboard (set `ELEVENLABS_TTS_MODEL` to force one). `--check` only reads them back. `--create` makes new ones. Details: `reference/elevenlabs-agent-spec.md`.

**The built-in voice, quicker:** when someone says "Sidekick, …", Sidekick answers after a 0.4 s pause instead of 0.9 s, and skips the 5 s gap between its lines. Anyone who keeps talking pushes the answer back, so it still never cuts in. Replies are read sentence by sentence, so the first sentence starts straight away.

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
node test/sidekick-study.js             # the voice A/B study, end to end, with one browser tester (needs Playwright)
node test/sidekick-voice.js             # the ElevenLabs agent leading (fake SDK in Chromium), fallbacks, built-in voice timing, agent settings
node test/sidekick-thinking.js          # "Finding your two picks": live steps, progress lines, the 12 s fallback (fake slow AI; needs Playwright)
```

### How to test with friends

1. Deploy to Render (below) and open the Render link, `https://<your-app>.onrender.com/sk`, on your phone. On the free plan, open it a minute early: a sleeping app takes about 30 seconds to wake, and waking ends any call that was running.
2. One person starts the call, picks the nights and taps Start. Share the link from the invite panel (Share, WhatsApp, Messages...). Everyone else opens the link on their own phone and taps "Join with voice" (or "Join by text", or "Answer without calling").
3. **In the same room:** leave the captions mic on for everyone, but only the planner's phone reads Sidekick aloud (the speaker button). The app drops the duplicate captions. If it's noisy, mute all phones except one and let that phone hear the room.
4. **Not together:** everyone taps "Talk in the app" (headphones stop echo). Each phone then reads Sidekick aloud. If someone stays on "connecting", set up TURN (above). FaceTime or another call app works too: then leave in-app audio off.
5. Allow the microphone when asked. On iPhone, use Safari and tap the page once if Sidekick is silent.

## Running the A/B study

The class study (INF2573) compares Sidekick's two call voices. Testers try the app's main features and plan two short nights out, one with each voice. They only ever see "Voice 1" and "Voice 2". The full plan is in `reference/sidekick-ab-study-plan.md`.

**The link to send testers:** `https://<your-app>.onrender.com/study`

Each person who opens it and taps Start is a new crew. The page is a checklist: agree, look around Discover, open Plan, share the call link, call 1, try the form, call 2, and a last short survey. Testers can do the steps in order or jump around. The two calls and the form only open in the order that keeps the test fair. It takes about 15 minutes, and the questions take under a minute and a half.

**Accounts:** right after agreeing, testers make a quick account (first name, email, two or more interests) or sign in, so the events they add and the plans they make are their own and stay. The checklist's app links then open the app as that account. A tester can skip and use the shared demo account instead. The study keeps only which kind it was (`own` or `demo`) and, for their own account, its internal id: never a name or email.

**Testing with friends:** one person opens `/study` and taps Start. They copy the study link from the bottom of the checklist and send it to the others, who open it, agree, and join the call when it starts. Everyone on one call hears the same voice.

**Testing alone:** on the call's invite card, tap **Add 2 practice friends**. Two practice friends (Robin and Jules) join, vote and tap answers the way real friends would. They wait for you before they answer, and they come back for call 2. They're marked as practice and are never counted as testers.

**Fairness, handled for you:** crews are given an order in turns (Voice 1 is the Calm Concierge for one crew, then the Plugged-In Friend for the next, and so on), so both voices get the same number of crews. Call 1 is the main comparison. Call 2 is short and uses the other voice.

**Where the results are:**
- Open `https://<your-app>.onrender.com/study/results` and enter the study key. It shows the call 1 comparison, which voice people would keep (with a significance test) and an order check, plus download links.
- The downloads: one row per call (`/api/sk/study/export?key=<key>`), one row per tester for the voice preference (`&table=preferences`), and one row per tester with the account kind and internal id (`&table=testers`). They open in Excel or Google Sheets.
- No names, transcripts, voices or private answers (budget, places to avoid) are ever stored or exported.
- The raw data is `data/sidekick-study.json` on the server, also copied to Supabase Storage when Supabase is set up. Render wipes its disk on every deploy, so set up Supabase before the study starts.

**Settings on Render** (Environment):
- `SIDEKICK_STUDY_KEY`: any long password you choose. You need it to see the results. Without it, results stay locked.
- `SUPABASE_URL` and `SUPABASE_SECRET_KEY`: keep the study data safe across deploys (you probably have these already).
- Optional: `SIDEKICK_STUDY_FILE` stores the data somewhere other than `data/sidekick-study.json`.
- Don't redeploy while people are testing: a restart ends live calls. Data that's already saved is kept.

**Check it works:** `node test/sidekick-study.js` runs the whole study against a local server, including one tester in a real browser.

## Put it online (Render)

Sketch 2 runs on Render the same way as Sketch 1, as a second web service from this repo, on the same Supabase project.

1. In Supabase's SQL Editor, run `supabase/schema.sql` once (after Sketch 1's). The tables are already there in our project.
2. On Render: **New > Web Service**, pick this repo, and copy Sketch 1's service settings with these changes:
   - **Root Directory:** leave it empty. Sketch 2 reads Sketch 1's events and importer (`../sketch-1/seed`, `../sketch-1/import`), so it needs the whole repo.
   - **Start Command:** `node sketch-2/server.js`. There's nothing to install, so the build command can be the same as Sketch 1's.
   - **Environment variables:** `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (the same values as Sketch 1's service) and `ANTHROPIC_API_KEY`. Render sets `PORT` itself. For in-app audio on mobile networks, also `SIDEKICK_TURN_URL`, `SIDEKICK_TURN_USER` and `SIDEKICK_TURN_PASS` (see "Talk in the app" above). For Sidekick's natural voice: `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_FRIEND` and `ELEVENLABS_AGENT_CONCIERGE` (nothing new is needed if these are already set; `SIDEKICK_TOOL_SECRET` is no longer needed for the voice). The agents themselves are updated from code with `node tools/elevenlabs-agents.js --update`, not on Render. If you turned on an allowlist in the agents' security settings, it must include your Render address.
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

Sketch 1's importer (`sketch-1/import/`) gathers the next three months of in-person GTA events. A GitHub Action (`.github/workflows/import-events.yml`) runs it on its own and puts the result in Supabase: one row per event in the `listings` table, and (during the switch) the whole import as a file in Storage. This server checks for a new import every hour, so you don't need to commit, redeploy or restart.

- **Every day except Monday, about 07:17 UTC:** the quick sources (Ticketmaster, City of Toronto, Toronto Public Library, Luma, DICE, Instagram); the others keep their last events. **Monday, about 06:23 UTC:** every source (Meetup alone takes about 35 minutes). GitHub often starts scheduled runs late, sometimes by hours.
- **Order** (the earlier source wins a tie between duplicates): Ticketmaster, Instagram, DICE, Meetup, Luma, City of Toronto, Toronto Public Library, Eventbrite.
- **Where this server reads them from,** in order: the `listings` table (only events that haven't ended), the Storage file, then `sketch-1/seed/events.json`. Its log says which, e.g. `Events: table (2319 upcoming, updated 2026-11-25T07:31:02.000Z)`. `/api/health` shows the same, plus how old the newest import is; over 36 hours, the log and `/api/health` carry a `WARNING: the newest event import is … old` line.
- **Instagram is automatic once its two secrets are added** (`INSTAGRAM_USER_ID`, `INSTAGRAM_ACCESS_TOKEN`; step by step: [`sketch-1/import/README-instagram.md`](../sketch-1/import/README-instagram.md)). Each day it reads the accounts' recent posts through Instagram's official Graph API, uses what the AI already read, and reads new captions with plain rules (no AI). Without the secrets it uses the events saved by the last by-hand `node import/instagram.js` (from `sketch-1/`, with Claude Code), which still gives the best results because the AI reads the posters too. To add or drop an account, edit `reference/instagram-accounts.md`.
- **Instagram accuracy check:** after a by-hand run, `node import/ig-sample.js` (from `sketch-1/`) adds 20 random events to `reference/instagram-accuracy.md`, each with a link to its post. Mark each one right or wrong and fill in the score. Do it again whenever the reader changes.
- **Eventbrite is blocked from GitHub's servers** (since 19 Oct 2026 every listing page answers 405, Eventbrite's CAPTCHA). The import now says so in one line and keeps last run's Eventbrite events, if any. To bring them back, run it from a home connection: from `sketch-1/` with the Supabase keys in `.env`, `UPLOAD=1 ONLY=Eventbrite MERGE=1 node import/run.js`.
- **Not imported:** NOW Toronto (it turns automated visitors away), Resident Advisor, Partiful and blogTO (their robots.txt or terms rule it out).

### One-time setup: the events table

Do this once, in the Supabase project the app uses. Until you do, everything keeps working from the Storage file.

1. Open [supabase.com](https://supabase.com), sign in, and open the SideQuest project.
2. In the left sidebar, click **SQL Editor**, then **New query**.
3. Open `sketch-2/supabase/schema.sql` from this repo, copy **all** of it, and paste it into the editor. (It's safe to run again: it only creates what's missing and doesn't touch `sketch2_events`, `sketch2_accounts` or `app_state`.)
4. Click **Run**. It should say "Success. No rows returned".
5. Check: in the left sidebar, click **Table Editor**. You should see two new tables, `listings` (empty for now) and `event_imports`.
6. On GitHub, open the **Actions** tab, click **Import events**, then **Run workflow** (leave "only" empty for every source, or type `Ticketmaster,City of Toronto` for a quick test of about a minute). When it's done, the run's summary should say `... to seed/events.json and Supabase Storage and the events table` and show an `Events table: N new, ...` line.
7. In the Table Editor, `listings` now has a row per event. In Render > sidequest-sidekick > Logs, within the hour (or right after a restart) you should see `Events: table (N upcoming, updated …)`.

Past events can be deleted every night with `supabase/cleanup-past-events.sql` (it explains how to schedule it with pg_cron). It isn't switched on: the server only ever asks for upcoming events, so it isn't needed yet.

One-time setup: on GitHub, go to Settings → Secrets and variables → Actions and add `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `TICKETMASTER_API_KEY` (the same values as in `sketch-1/.env`), and, for automatic Instagram, `INSTAGRAM_USER_ID` and `INSTAGRAM_ACCESS_TOKEN`. Then on the Actions tab, open "Import events" and click "Run workflow" for the first import. Until that first import exists, the server uses `sketch-1/seed/events.json`.

Guardrails:
- Every site is read within its robots.txt, including its Crawl-delay. A site that answers 403 or 429 (blocked or rate-limited) isn't asked again that run.
- If a source fails, or brings back under half of last run's events, it keeps last run's events.
- The scheduled runs never use the AI (`AI=off`). The by-hand Instagram run (or a run with `IG_AI=1`) makes at most `IG_MAX_CALLS` AI calls per run (default 40), reads 2 images per post, and reads each post only once. It pauses accounts with 20 posts read and no events, and deletes downloaded images once they're read. Once a month, the by-hand run reads a paused account's 3 newest unread posts, and an event among them unpauses it (`sketch-1/import/instagram-paused.json` keeps the dates).
- An Instagram event needs a title, a date, a stated start time and a venue it can put on the map. Posts that give no time are left out. Videos with no caption are skipped.
- Toronto Public Library shows the next 2 dates of a weekly program.
- **Alerts:** a run is marked failed, so GitHub emails you, when a source fails, comes back with under half of last run's events, Ticketmaster is skipped, or Instagram's automated read fails (usually an expired token) or its secrets are missing. Everything is still saved first, and the run's page lists the problems. Other skips (such as Eventbrite being blocked) and Instagram poster readings over 8 days old only show there as warnings. GitHub emails whoever last changed the workflow's schedule, so check Settings → Notifications → Actions on GitHub.
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
