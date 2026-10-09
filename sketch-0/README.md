# Sketch 0: Sidequest

**One thing it does:** you (or your crew of up to 4) say what you're into, how much you'll spend and where you're starting from, and it gives back matching Toronto events, each with a one-line reason. When nothing fits, that gap goes to hosts.

This version brings Sketch 0 in line with [ProductSpecs.md](ProductSpecs.md), which merges the original Sidequest proposal with what Sketch 0 learned. Ideas from the proposal's [wireframe](../SideQuest%20Proposal/Version-1.0/sidequest-wireframe) (Quest Requests, upvotes, host claims, rating a quest) are now in the sketch.

This is a disposable sketch. Events are 23 made-up samples in `events.json`, all in Toronto and split across three scenes (music & nightlife, arts & making, active & social), not real listings. Their prices, reviews, organizers, attendees, "your friends" and transit times are fixed fake data too, and so are the five starting requests in `sample-requests.json`.

## What's in it

The interface is a mobile app (greyscale on purpose) with four tabs:

- **Discover:** interests, a budget and a starting point for each person, plus a max travel time for everyone. Add up to 3 friends for **Crew Blend**: picks that suit everyone, with a line per person on why and their own trip time. The group's budget is the lowest budget anyone set, and every pick has to be within the time limit for everyone. Limits are applied *before* matching, so nothing over budget or too far away can be picked. Each pick has **Share** and **Not for me** (for a crew, "Not for someone?" lets you say who). Interests nothing fit are listed with the reason, and **Request it** posts one to the Requests board. "You" is remembered between visits.
- **Quest Log:** quests you tapped "I'd go" on. That tap is intent only. Once the event is over (2 hours after it starts, or when you tap "Demo: skip to after the event"), it asks "Did you go?". A "yes" leads to a star rating and "What made it?", and the quest moves to **Completed**. Only confirmed attendance counts toward our north star.
- **Requests (Quest Requests):** post what you'd go to (what, near where, when, who's coming, budget) and upvote others. Asking for something that's already there counts as an upvote. When a host claims a request you posted or upvoted, you see it here first.
- **Hosts (Demand Insights):** pick which host you're viewing as. See Quest Requests and claim them ("We're on it"). See searches nothing fit, with similar wording merged ("vegan", "vegans" and "vegan food" are one row) and the reasons (nothing listed, over budget, too far). And see each event's "I'd go" taps next to confirmed attendance, average rating, and how many people said "not for me".

## Run it

Needs [Node.js](https://nodejs.org) 18 or newer. No `npm install` needed.

```
cd sketch-0
node server.js
```

Then open http://localhost:3000. On a laptop it shows inside a phone frame; on a phone (same Wi-Fi, your computer's IP and port 3000) it fills the screen.

## Turn on the AI

Matching uses, in order: the Anthropic API if `.env` has a key, otherwise Claude Code (`claude` on your PATH, using your Claude subscription), otherwise simple keyword matching (not AI). The page says which.

To use the API:

1. Copy `.env.example` to a new file called `.env` in this folder.
2. Paste your Anthropic API key into it.
3. Restart `node server.js`.

`.env` is listed in `.gitignore`, so your key is never committed. Never put a key anywhere else in the code.

## Files

- `server.js`: serves the page, applies budget and travel limits, sends interests plus eligible events to the AI, logs searches, "I'd go" taps, "did you go?" answers with ratings, and "not for me" feedback, and stores Quest Requests
- `public/index.html`, `public/styles.css`, `public/app.js`: the mobile interface
- `sample-requests.json`: the Quest Requests a fresh sketch starts with
- `ProductSpecs.md`: the combined Sidequest × Sketch 0 product spec
- `events.json`: sample event data, with scene, price (`0` = free), reviews, organizers, attendees, which attendees are "your friends", and the nearest stop plus transit minutes and transfers from four starting points
- `strategy.md`: the product strategy the AI is steered by, updated from the Week 2 strategy using `/Research` (crew-first positioning, budget, honest attendance). Edit freely; it's re-read on every search
- Local logs, created as you use it and not committed: `search-log.jsonl` (every search, with unmet interests), `going-log.jsonl` ("I'd go" taps), `attended-log.jsonl` ("did you go?" answers and ratings), `feedback-log.jsonl` ("not for me" taps) and `requests.json` (Quest Requests, upvotes and claims). Delete them to reset the Hosts and Requests tabs

## Known gaps (on purpose, for later weeks)

- Fake event data. Where real data comes from is a Week 5 feasibility question (the research says to rely on host-supplied listings and partners, not other platforms' APIs).
- Only four starting points (Union, Finch, Kennedy, Kipling).
- "Unmet" interests come from the AI (or from keywords without AI), so Demand Signals can still be noisy. Merging similar wording is a simple word match, so "techno" and "electronic" stay separate.
- The Quest Log, your requests and upvotes live in your browser only. Anyone can upvote again from another browser, and anyone can claim a request as any host (there are no accounts).
- "Not for me" hides a pick and is logged for hosts, but the AI doesn't learn from it yet. That's a human-control question for Weeks 4 and 8.
- No handling for when the AI picks badly or makes something up, beyond only accepting events from the eligible list. That's for Weeks 6 and 9.
- Later in the spec, not built: taste avatar, For You feed, saved crews and crew chat, Event Day Mode, host registration and publishing quests, notifications outside the app.
