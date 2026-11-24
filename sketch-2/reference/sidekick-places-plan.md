# Suggesting places, not just ticketed events

**Product decision (Nov 2026):** Sidekick should also suggest places that don't need a ticket, for crews who don't want an event. That covers bars, karaoke, arcades and board-game cafés, restaurants and dessert spots, bowling, live-music bars, parks and galleries. Toronto comes first; other cities later.

## Does it need a maps API? Yes

Our listings come from event imports and only cover dated, ticketed things. To suggest places, Sidekick needs, for each one:

| Need | Why |
|---|---|
| Opening hours for the chosen night | So it never suggests a place that's closed |
| Price level | To respect the group's budget |
| Rating and review count | To say why a place fits |
| Categories | To match the vibe |
| Coordinates | To estimate each person's trip |

Only a places service gives all five. Free open data (OpenStreetMap, Foursquare's open dataset, Toronto Open Data) has locations and categories, but no ratings, almost no prices, and patchy hours.

## Options (researched Nov 2026; prices from search results, check the official pages)

| Source | Hours | Price | Rating | Free tier | Cost | Storage rules | Verdict |
|---|---|---|---|---|---|---|---|
| **Google Places API (New)** | Yes | Yes | Yes | Monthly free caps per tier: about 5,000 Pro and 1,000 Enterprise calls | About $32–35 per 1,000 searches above the cap | You may store place IDs; coordinates up to 30 days; nothing else. Show the Google logo and attributions | **Recommended.** The best data, and free at class scale. Needs a billing account with a card |
| **Google Routes API** (transit times) | – | – | – | About 10,000 calls a month | About $5 per 1,000 | – | Optional. A distance estimate works to start |
| Foursquare Places API | Paid fields | Paid fields | Paid fields | About 10,000 calls a month | About $15–19 per 1,000 | Can't store results | OK. Hours and ratings cost more |
| OpenStreetMap / Foursquare open data / Toronto Open Data | Patchy | No | No | Free | $0 | Can store, with attribution | Good free base list; can't say "why it fits" |
| Yelp | Yes | Yes | Yes | 30-day trial | From about $229 a month | Strict | Too expensive |

## How it fits the call (no change to the design)

1. **One new question, asked only when it matters:** "A ticketed event, or just somewhere good to go?" The answers are Events / Places / Either, shown as a question card like the others. The engine already asks only questions that change the picks, so if events alone already give two good picks, it won't ask.
2. **Places join the same pool as events.** Each place becomes one candidate with hours, price level, rating, category and coordinates. The filters stay the same: open that night at the chosen time, within budget, not in an avoided area, and a fair trip for everyone.
3. **Vibe maps to place categories:**

   | Vibe | Place categories |
   |---|---|
   | Live music | Live-music bars |
   | Games | Arcades, board-game cafés, bowling |
   | Dancing | Night clubs |
   | Art and film | Galleries, cinemas |
   | Food | Restaurants, dessert spots |

4. **Picks can mix both kinds.** Sidekick still offers two picks, each with a reason, for example "a karaoke bar in Koreatown, rated 4.5, about twenty bucks each". Places can also fill the empty slot in a two-stop night ("the gig, then dessert nearby").
5. **Privacy and governance stay the same.** No paid placements, and every pick explains why.

## How the search works, within Google's terms

- **When the crew's facts are known** (night, vibe, area), the server runs 2–3 Text Searches. For example: "karaoke bar near Queen West, Toronto", restricted to open places, with only the fields we need: id, name, location, types, price level, rating, rating count and opening hours.
- **We store only** the place ID and our own tags (vibe, neighbourhood). Ratings, hours and prices are fetched fresh for the 2–4 finalists.
- **Trip times** use straight-line distance from each starting station to the nearest subway stop, then walking. That's free and good enough to start; switch to the Routes API for exact transit times later.
- **On screen,** results show "Google Maps" attribution. A Terms of Use and Privacy Policy page is required before going public.
- **Cost:** about 500 plans a month × 4 searches ≈ $10–35 a month. The free caps cover a class test, so expect $0. Set a budget alert and a daily quota cap in Google Cloud, because a leaked key can be expensive.

## What's needed from the team

1. **Approve Google Places** as the data source. The alternative is a free, OpenStreetMap-only version with no ratings.
2. **Set up Google Cloud:** a project with a billing account, the **Places API (New)** enabled, and an API key restricted to that API. Add the key as `GOOGLE_MAPS_API_KEY` in `.env` and on Render.
3. **Allow network access:** this cloud session can't currently reach Google's servers (`places.googleapis.com`). The key is needed to test here, and the host has to be allowed.

## Build steps once approved

1. `lib/sidekick/places.js`: Text Search with a field mask, mapping each result to our candidate shape, with a short in-memory cache per call.
2. Add the "Events, places or either?" slot to `plan.js`, and filter places by opening hours, price level and trip time.
3. Show "Place" or "Event" on pick cards, with the opening hours and Google attribution.
4. Extend `test/sidekick-eval.js` with place-only and mixed scripts.
