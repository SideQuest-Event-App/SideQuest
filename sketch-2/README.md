# Sketch 2: Sidequest, as designed

**What it is:** the [Sidequest — App Screens](https://www.figma.com/design/7EVuAdMhiXva0GgXMH7897/Sidequest-%E2%80%94-App-Screens?node-id=283-5129) Figma page, coded. Every visible screen is here, with the design's fonts (Geist and Geist Mono), colours, spacing, radii and components. Hidden screens in the file were left out.

Sketch 2 is built on [Sketch 1](../sketch-1): the same server, database, AI, events and actions. Sketch 1's code was copied in once and then edited here, so nothing is written twice. The real events come straight from Sketch 1 (`../sketch-1/seed`), and so does its importer and duplicate checker. Sketch 1 itself isn't changed.

## Run it

```
cd sketch-2
node server.js            # http://localhost:3001, so it can run next to Sketch 1 on 3000
```

There's nothing to install. Copy `.env.example` to `.env` to turn on the AI (`ANTHROPIC_API_KEY`) and Supabase (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`). Anything Sketch 2's `.env` leaves out is read from `../sketch-1/.env`, so Sketch 1's keys work here too. The server's first lines say which database it's using. Without them the app runs on keyword matching and `data/db.json`. With Supabase, run `supabase/schema.sql` once, after Sketch 1's schema.

Where accounts show up in Supabase, once onboarding is finished (or a host is approved): **Authentication > Users** gets the email, with the username, name and role in its metadata, and the **Table Editor**'s `sketch2_accounts` view lists every account. The full profiles live in the `app_state` table, row 2 (`data.users` and `data.hosts`).

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
| Discover | Weekly Sidequests, Vibe Mixes, map with list sheet, search, filters |
| Sidequest | Details, 19+ age check, all-ages notice, tickets hand-off, ticket import, ticket wallet |
| Community | Friends, friends' highlights (what friends rated 4 stars and up), friend requests (Add sends one; they're a friend once they accept, and show in Notifications and on the Friends page), a friend's profile with their recent sidequests and Remove friend, parties, party (Crew Blend, podium vote), group plan, Sidequest Requests, new request |
| Sidequests log | Upcoming, Saved, Completed, calendar, event day, attendee chat, check-in, rating, memories, Wrapped |
| Profile | Profile, edit profile, getting around, switch account |
| Host onboarding | What you host, host account, verification, profile, ticketing, team, claim listings, review, demand map |
| Host tools | Demand insights (with a map), request detail, draft test, create a sidequest (2 steps), published, your sidequests (Live, Drafts, Past), event day tools, insights (Overview, Recap), audience, inbox, host profile |

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
